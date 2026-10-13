// Apify gọi vào đây khi một lần chạy actor kết thúc.
//   stage=posts    → lưu bài viết + dòng máy trong bài, rồi chạy actor lấy bình luận
//   stage=comments → lưu bình luận + dòng máy, báo kết quả lên Discord
// Apify có thể gọi lại (retry) → mỗi bước "giành" job bằng cách đổi trạng thái có điều kiện.
import { COMMENTS_ACTOR, datasetItems, startActor, webhookUrl } from '../_shared/apify.ts';
import { background, db, type Job, upsertChunks } from '../_shared/db.ts';
import { COLOR, notifyJob } from '../_shared/discord.ts';
import {
  findPostFor, isErrorItem, mapComment, mapPost, mentionsFor, type MentionRow, type PostRow, stubPostFromUrl,
} from '../_shared/ingest.ts';
import { formatReport, type ModelRow, toCsv } from '../_shared/report.ts';

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.searchParams.get('key') !== Deno.env.get('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 });
  const jobId = Number(u.searchParams.get('job'));
  const stage = u.searchParams.get('stage');
  // deno-lint-ignore no-explicit-any
  const payload: any = await req.json().catch(() => null);
  const run = payload?.resource;
  if (!jobId || !run?.id || (stage !== 'posts' && stage !== 'comments')) {
    return new Response('bad request', { status: 400 });
  }

  const from = stage === 'posts' ? 'crawling_posts' : 'crawling_comments';
  const to = stage === 'posts' ? 'processing_posts' : 'processing_comments';
  const runCol = stage === 'posts' ? 'apify_posts_run' : 'apify_comments_run';
  const { data: job } = await db.from('jobs').update({ status: to })
    .eq('id', jobId).eq('status', from).eq(runCol, run.id)
    .select().maybeSingle<Job>();
  if (!job) return new Response('already handled', { status: 200 });

  background((stage === 'posts' ? onPosts(job, run) : onComments(job, run)).catch((e) => fail(job, e)));
  return new Response('ok');
});

// deno-lint-ignore no-explicit-any
type Run = { id: string; status: string; defaultDatasetId: string; [k: string]: any };

function ensureSucceeded(run: Run, what: string) {
  if (run.status !== 'SUCCEEDED') {
    throw new Error(`Apify ${what} kết thúc với trạng thái ${run.status}. Xem chi tiết: https://console.apify.com/actors/runs/${run.id}`);
  }
}

async function onPosts(job: Job, run: Run) {
  ensureSucceeded(run, 'lấy bài viết');
  const items = await datasetItems(run.defaultDatasetId);
  const errors = items.filter(isErrorItem);
  const posts = items.map((it) => mapPost(it, job.id)).filter((p): p is PostRow => !!p);

  if (!posts.length) {
    const why = errors[0] ? `\nApify báo: ${errors[0].error ?? errors[0].errorDescription}` : '';
    throw new Error(`Không lấy được bài viết nào (fanpage riêng tư, link sai, hoặc Facebook chặn).${why}`);
  }

  await upsertChunks('posts', dedupe(posts, (p) => p.post_key), 'post_key');
  const mentions = posts.flatMap((p) =>
    mentionsFor('post', p.post_key, p.text, {
      post_key: p.post_key, page_name: p.page_name, page_url: p.page_url, at: p.posted_at, job_id: job.id,
    })
  );
  await saveMentions(mentions);

  const withComments = posts.filter((p) => p.url && (p.comments === null || p.comments > 0));
  if (job.comments_per_post > 0 && withComments.length) {
    const runId = await startActor(COMMENTS_ACTOR, {
      startUrls: withComments.map((p) => ({ url: p.url })),
      resultsLimit: job.comments_per_post,
      includeNestedComments: false,
      viewOption: 'RANKED_UNFILTERED',
    }, webhookUrl(job.id, 'comments'));
    await db.from('jobs').update({
      status: 'crawling_comments', apify_comments_run: runId, post_count: posts.length,
    }).eq('id', job.id);
    await notifyJob(job, {
      embeds: [{
        color: COLOR.info,
        title: `⏳ Job #${job.id}: đã lấy ${posts.length} bài, đang lấy bình luận…`,
        description: `Lấy tối đa ${job.comments_per_post} bình luận cho ${withComments.length} bài có bình luận.`,
      }],
    });
    return;
  }

  await db.from('jobs').update({ post_count: posts.length }).eq('id', job.id);
  await finish({ ...job, post_count: posts.length });
}

async function onComments(job: Job, run: Run) {
  ensureSucceeded(run, 'lấy bình luận');
  const items = await datasetItems(run.defaultDatasetId);
  const { data: posts } = await db.from('posts').select('post_key, url, page_name, page_url').eq('job_id', job.id);
  const postList = (posts ?? []) as Pick<PostRow, 'post_key' | 'url' | 'page_name' | 'page_url'>[];

  // Lệnh /binhluan không chạy bước lấy bài → tạo bài "tạm" từ link đã dán (caption = postTitle)
  const stubs: PostRow[] = [];
  const commentsOnly = job.posts_limit === 0;
  for (const it of commentsOnly ? items : []) {
    if (isErrorItem(it) || findPostFor(it, [...postList, ...stubs])) continue;
    const url = typeof it.inputUrl === 'string' ? it.inputUrl : typeof it.facebookUrl === 'string' ? it.facebookUrl : null;
    if (url) stubs.push(stubPostFromUrl(url, job.id, typeof it.postTitle === 'string' ? it.postTitle : null));
  }
  if (stubs.length) {
    await upsertChunks('posts', stubs, 'post_key');
    await saveMentions(stubs.flatMap((p) =>
      mentionsFor('post', p.post_key, p.text, {
        post_key: p.post_key, page_name: p.page_name, page_url: p.page_url, at: null, job_id: job.id,
      })
    ));
    postList.push(...stubs);
  }
  const byKey = new Map(postList.map((p) => [p.post_key, p]));

  const comments = dedupe(
    items.map((it) => mapComment(it, job.id, postList)).filter((c) => !!c),
    (c) => c!.comment_key,
  ).map((c) => c!);
  if (!comments.length && items.some(isErrorItem)) {
    const e = items.find(isErrorItem)!;
    throw new Error(`Không lấy được bình luận (bài riêng tư, link sai, hoặc Facebook chặn).\nApify báo: ${e.error ?? e.errorDescription}`);
  }
  await upsertChunks('comments', comments, 'comment_key');

  const mentions = comments.flatMap((c) => {
    const p = c.post_key ? byKey.get(c.post_key) : undefined;
    return mentionsFor('comment', c.comment_key, c.text, {
      post_key: c.post_key, page_name: p?.page_name ?? null, page_url: p?.page_url ?? null, at: c.commented_at, job_id: job.id,
    });
  });
  await saveMentions(mentions);
  await finish({ ...job, post_count: job.post_count + stubs.length, comment_count: comments.length });
}

async function saveMentions(rows: MentionRow[]) {
  await upsertChunks('mentions', dedupe(rows, (m) => `${m.source}|${m.source_key}|${m.model}`), 'source,source_key,model', true);
}

async function finish(job: Job) {
  await db.from('jobs').update({
    status: 'done', finished_at: new Date().toISOString(), post_count: job.post_count, comment_count: job.comment_count,
  }).eq('id', job.id);

  const { data } = await db.rpc('report_models', { p_page: null, p_days: null, p_job: job.id });
  const rows = (data ?? []) as ModelRow[];
  const mention = job.discord_user ? `<@${job.discord_user}> ` : '';
  await notifyJob(job, {
    content: `${mention}✅ Crawl xong job #${job.id}`,
    allowed_mentions: { users: job.discord_user ? [job.discord_user] : [] },
    embeds: [{
      color: COLOR.ok,
      title: `Kết quả job #${job.id}: ${job.post_count} bài · ${job.comment_count} bình luận`,
      description: formatReport(rows, null, 15) +
        '\n\nDùng `/baocao` để xem tổng hợp mọi lần crawl, lọc theo fanpage hoặc số ngày.',
    }],
  }, rows.length ? [{ name: `job-${job.id}-dong-may.csv`, data: toCsv(rows), type: 'text/csv' }] : undefined);
}

async function fail(job: Job, e: unknown) {
  console.error(`job ${job.id} failed`, e);
  const message = String((e as Error)?.message ?? e);
  await db.from('jobs').update({ status: 'failed', error: message, finished_at: new Date().toISOString() }).eq('id', job.id);
  await notifyJob(job, {
    content: job.discord_user ? `<@${job.discord_user}>` : undefined,
    allowed_mentions: { users: job.discord_user ? [job.discord_user] : [] },
    embeds: [{ color: COLOR.err, title: `❌ Job #${job.id} lỗi`, description: message.slice(0, 3000) }],
  }).catch(console.error);
}

function dedupe<T>(rows: T[], key: (r: T) => string): T[] {
  const m = new Map<string, T>();
  for (const r of rows) m.set(key(r), r);
  return [...m.values()];
}
