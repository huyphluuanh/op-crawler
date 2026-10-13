// Gọi Apify: chạy actor (bất đồng bộ, Apify gọi lại webhook khi xong) và đọc dataset kết quả.

const API = 'https://api.apify.com/v2';
export const POSTS_ACTOR = 'apify~facebook-posts-scraper';
export const COMMENTS_ACTOR = 'apify~facebook-comments-scraper';

const auth = () => ({ Authorization: `Bearer ${Deno.env.get('APIFY_TOKEN')}` });

export function webhookUrl(jobId: number, stage: 'posts' | 'comments') {
  const base = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('WEBHOOK_SECRET');
  return `${base}/functions/v1/apify-webhook?job=${jobId}&stage=${stage}&key=${encodeURIComponent(key ?? '')}`;
}

/** Chạy actor, trả về run id. Apify sẽ POST tới webhook khi run kết thúc (thành công hay lỗi). */
export async function startActor(actor: string, input: unknown, callbackUrl: string): Promise<string> {
  const webhooks = btoa(JSON.stringify([{
    eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'],
    requestUrl: callbackUrl,
  }]));
  const res = await fetch(`${API}/acts/${actor}/runs?webhooks=${encodeURIComponent(webhooks)}`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? res.statusText;
    throw new Error(`Apify từ chối chạy ${actor}: ${msg}`);
  }
  return json.data.id as string;
}

// deno-lint-ignore no-explicit-any
export async function datasetItems(datasetId: string): Promise<any[]> {
  const out = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const res = await fetch(`${API}/datasets/${datasetId}/items?clean=true&format=json&offset=${offset}&limit=${limit}`, {
      headers: auth(),
    });
    if (!res.ok) throw new Error(`Không đọc được dataset Apify: ${res.status}`);
    const page = await res.json();
    out.push(...page);
    if (page.length < limit) return out;
  }
}

/** Ước tính chi phí Apify (USD) để báo trước cho người dùng. Giá công bố 10/2026. */
export function estimateCost(posts: number, comments: number) {
  return posts * 0.005 + comments * 0.0015;
}
