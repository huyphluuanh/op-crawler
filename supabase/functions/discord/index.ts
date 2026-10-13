// Discord Interactions endpoint: nhận lệnh /crawl, /baocao, /kiemtra, /lichsu và "Crawl link này".
// Discord bắt trả lời trong 3 giây → trả "đang xử lý" (deferred) rồi làm tiếp ở nền.
import { DEFAULT_COMMENTS, DEFAULT_COMMENTS_ONLY, DEFAULT_POSTS, MESSAGE_COMMAND, sinceDate } from '../_shared/commands.ts';
import { COLOR, editOriginal, type MessageBody, verifySignature } from '../_shared/discord.ts';
import { background, db, type Job } from '../_shared/db.ts';
import { COMMENTS_ACTOR, estimateCost, POSTS_ACTOR, startActor, webhookUrl } from '../_shared/apify.ts';
import { findFacebookUrls, isPostUrl } from '../_shared/ingest.ts';
import { extractPhoneModels } from '../_shared/phone-models.ts';
import { formatReport, type ModelRow, type Scope, toCsv } from '../_shared/report.ts';

// deno-lint-ignore no-explicit-any
type Interaction = any;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const option = <T,>(i: Interaction, name: string): T | undefined =>
  i.data?.options?.find((o: { name: string }) => o.name === name)?.value;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Project bot Discord: OK', { status: 200 });
  const body = await req.text();
  if (!verifySignature(body, req.headers.get('x-signature-ed25519'), req.headers.get('x-signature-timestamp'))) {
    return new Response('invalid signature', { status: 401 });
  }
  const i: Interaction = JSON.parse(body);

  if (i.type === 1) return json({ type: 1 }); // PING khi Discord kiểm tra endpoint

  if (i.type === 2) {
    const name: string = i.data.name;

    if (name === 'kiemtra') {
      const text = option<string>(i, 'noidung') ?? '';
      const found = extractPhoneModels(text);
      return json({
        type: 4,
        data: {
          flags: 64, // chỉ người gõ lệnh thấy
          content: found.length
            ? `Nhận diện được **${found.length}** dòng máy:\n` +
              found.map((f) => `• **${f.model}** (${f.brand}) ← \`${f.matched}\``).join('\n')
            : 'Không nhận diện được dòng máy nào trong đoạn này.',
        },
      });
    }

    const handlers: Record<string, (i: Interaction) => Promise<MessageBody | [MessageBody, string]>> = {
      crawl: handleCrawl,
      [MESSAGE_COMMAND]: handleCrawl,
      binhluan: handleCommentsOnly,
      baocao: handleReport,
      lichsu: handleHistory,
    };
    const handler = handlers[name];
    if (!handler) return json({ type: 4, data: { content: `Lệnh lạ: ${name}`, flags: 64 } });

    background((async () => {
      try {
        const out = await handler(i);
        if (Array.isArray(out)) {
          await editOriginal(i.application_id, i.token, out[0], [{ name: 'bao-cao-dong-may.csv', data: out[1], type: 'text/csv' }]);
        } else {
          await editOriginal(i.application_id, i.token, out);
        }
      } catch (e) {
        console.error(e);
        await editOriginal(i.application_id, i.token, {
          embeds: [{ color: COLOR.err, title: 'Lỗi', description: String((e as Error).message ?? e).slice(0, 3000) }],
        }).catch(console.error);
      }
    })());
    return json({ type: 5 }); // "Bot đang suy nghĩ…"
  }

  return json({ type: 4, data: { content: 'Không hỗ trợ thao tác này.', flags: 64 } });
});

// ---------------- /crawl ----------------
async function handleCrawl(i: Interaction): Promise<MessageBody> {
  const isMessageCmd = i.data.type === 3;
  const source: string = isMessageCmd
    ? i.data.resolved?.messages?.[i.data.target_id]?.content ?? ''
    : option<string>(i, 'link') ?? '';
  const urls = findFacebookUrls(source).slice(0, 20);
  if (!urls.length) {
    return {
      embeds: [{
        color: COLOR.warn,
        title: 'Không thấy link Facebook',
        description: 'Hãy dán link bài viết hoặc fanpage, ví dụ `https://www.facebook.com/tenfanpage`.',
      }],
    };
  }
  const postsLimit = option<number>(i, 'so_bai') ?? DEFAULT_POSTS;
  const commentsPerPost = option<number>(i, 'binh_luan') ?? DEFAULT_COMMENTS;
  const days = option<number>(i, 'so_ngay');
  const user = i.member?.user ?? i.user;

  const { data: job, error } = await db.from('jobs').insert({
    input_urls: urls,
    posts_limit: postsLimit,
    comments_per_post: commentsPerPost,
    status: 'crawling_posts',
    discord_app_id: i.application_id,
    discord_token: i.token,
    discord_channel_id: i.channel_id ?? i.channel?.id ?? null,
    discord_user: user?.id ?? null,
  }).select().single<Job>();
  if (error) throw new Error(`Không tạo được job: ${error.message}`);

  try {
    const runId = await startActor(POSTS_ACTOR, {
      startUrls: urls.map((url) => ({ url })),
      resultsLimit: postsLimit,
      captionText: false,
      ...(days ? { onlyPostsNewerThan: sinceDate(days) } : {}),
    }, webhookUrl(job.id, 'posts'));
    await db.from('jobs').update({ apify_posts_run: runId }).eq('id', job.id);
  } catch (e) {
    await db.from('jobs').update({ status: 'failed', error: String(e), finished_at: new Date().toISOString() }).eq('id', job.id);
    throw e;
  }

  const maxPosts = postsLimit * urls.length;
  const cost = estimateCost(maxPosts, maxPosts * commentsPerPost);
  return {
    embeds: [{
      color: COLOR.info,
      title: `⏳ Đang crawl (job #${job.id})`,
      description:
        urls.map((u) => `• ${u}`).join('\n') +
        `\n\nTối đa **${postsLimit}** bài/fanpage` +
        (days ? ` đăng trong **${days} ngày** gần nhất (từ ${sinceDate(days)})` : '') +
        `, **${commentsPerPost}** bình luận/bài.` +
        (days ? `\nMuốn lấy hết bài trong ${days} ngày mà fanpage đăng nhiều thì tăng \`so_bai\`.` : '') +
        `\nChi phí Apify ước tính tối đa ~$${cost.toFixed(2)}.` +
        `\nThường mất 1–10 phút. Xong bot sẽ báo kết quả ở đây.`,
    }],
  };
}

// ---------------- /binhluan ----------------
async function handleCommentsOnly(i: Interaction): Promise<MessageBody> {
  const all = findFacebookUrls(option<string>(i, 'link') ?? '').slice(0, 50);
  const urls = all.filter(isPostUrl);
  const skipped = all.filter((u) => !isPostUrl(u));
  if (!urls.length) {
    return {
      embeds: [{
        color: COLOR.warn,
        title: 'Không thấy link bài viết',
        description: (skipped.length ? `Đây là link fanpage, không phải link bài:\n${skipped.map((u) => `• ${u}`).join('\n')}\n\n` : '') +
          'Lấy link bài: trên Facebook bấm vào **giờ đăng** của bài (vd "3 giờ", "12 tháng 10") rồi copy địa chỉ trên trình duyệt, ' +
          'hoặc bấm **Chia sẻ → Sao chép liên kết**. Muốn lấy cả fanpage thì dùng `/crawl`.',
      }],
    };
  }
  const perPost = option<number>(i, 'so_luong') ?? DEFAULT_COMMENTS_ONLY;
  const days = option<number>(i, 'so_ngay');
  const user = i.member?.user ?? i.user;

  const { data: job, error } = await db.from('jobs').insert({
    input_urls: urls,
    posts_limit: 0, // 0 = chế độ chỉ lấy bình luận
    comments_per_post: perPost,
    status: 'crawling_comments',
    discord_app_id: i.application_id,
    discord_token: i.token,
    discord_channel_id: i.channel_id ?? i.channel?.id ?? null,
    discord_user: user?.id ?? null,
  }).select().single<Job>();
  if (error) throw new Error(`Không tạo được job: ${error.message}`);

  try {
    const runId = await startActor(COMMENTS_ACTOR, {
      startUrls: urls.map((url) => ({ url })),
      resultsLimit: perPost,
      includeNestedComments: false,
      // Lọc theo ngày cần sắp xếp mới nhất trước
      viewOption: days ? 'RECENT_ACTIVITY' : 'RANKED_UNFILTERED',
      ...(days ? { onlyCommentsNewerThan: sinceDate(days) } : {}),
    }, webhookUrl(job.id, 'comments'));
    await db.from('jobs').update({ apify_comments_run: runId }).eq('id', job.id);
  } catch (e) {
    await db.from('jobs').update({ status: 'failed', error: String(e), finished_at: new Date().toISOString() }).eq('id', job.id);
    throw e;
  }

  return {
    embeds: [{
      color: COLOR.info,
      title: `⏳ Đang lấy bình luận (job #${job.id})`,
      description:
        urls.map((u) => `• ${u}`).join('\n') +
        (skipped.length ? `\n\nBỏ qua (link fanpage, không phải bài): ${skipped.join(' ')}` : '') +
        `\n\nTối đa **${perPost}** bình luận/bài` +
        (days ? ` viết trong **${days} ngày** gần nhất (từ ${sinceDate(days)})` : '') +
        `. Chi phí Apify ước tính tối đa ~$${estimateCost(0, urls.length * perPost).toFixed(2)}.` +
        `\nThường mất 1–5 phút. Xong bot sẽ báo kết quả ở đây.`,
    }],
  };
}

// ---------------- /baocao ----------------
async function handleReport(i: Interaction): Promise<MessageBody | [MessageBody, string]> {
  const page = option<string>(i, 'fanpage')?.trim() || null;
  const days = option<number>(i, 'so_ngay') ?? null;
  const top = option<number>(i, 'top') ?? 20;

  const [models, scope] = await Promise.all([
    db.rpc('report_models', { p_page: page, p_days: days, p_job: null }),
    db.rpc('report_scope', { p_page: page, p_days: days }),
  ]);
  if (models.error) throw new Error(models.error.message);
  const rows = (models.data ?? []) as ModelRow[];
  const sc = ((scope.data ?? [])[0] ?? null) as Scope | null;

  const filters = [page && `fanpage "${page}"`, days && `${days} ngày gần đây`].filter(Boolean).join(', ');
  const msg: MessageBody = {
    embeds: [{
      color: COLOR.ok,
      title: `📊 Báo cáo dòng máy${filters ? ` — ${filters}` : ''}`,
      description: formatReport(rows, sc, top),
      footer: { text: 'Số lần nhắc: mỗi bài/bình luận tính tối đa 1 lần cho mỗi dòng máy' },
    }],
  };
  return rows.length ? [msg, toCsv(rows)] : msg;
}

// ---------------- /lichsu ----------------
const STATUS: Record<string, string> = {
  queued: '🕓 chờ', crawling_posts: '⏳ lấy bài', processing_posts: '⚙️ xử lý bài',
  crawling_comments: '⏳ lấy bình luận', processing_comments: '⚙️ xử lý bình luận', done: '✅ xong', failed: '❌ lỗi',
};

async function handleHistory(): Promise<MessageBody> {
  const { data, error } = await db.from('jobs')
    .select('id, created_at, input_urls, status, post_count, comment_count, error')
    .order('id', { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  if (!data?.length) return { content: 'Chưa có lần crawl nào. Dùng `/crawl` để bắt đầu.' };
  const lines = data.map((j) => {
    const when = new Date(j.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const url = j.input_urls[0] + (j.input_urls.length > 1 ? ` (+${j.input_urls.length - 1})` : '');
    const err = j.status === 'failed' && j.error ? `\n\u2003↳ ${String(j.error).slice(0, 150)}` : '';
    return `**#${j.id}** ${STATUS[j.status] ?? j.status} · ${when} · ${j.post_count} bài, ${j.comment_count} bl\n\u2003<${url}>${err}`;
  });
  return { embeds: [{ color: COLOR.info, title: '🗂️ Lịch sử crawl', description: lines.join('\n') }] };
}
