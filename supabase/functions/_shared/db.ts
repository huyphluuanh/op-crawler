import { createClient } from 'npm:@supabase/supabase-js@2';

export const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

export interface Job {
  id: number;
  created_at: string;
  input_urls: string[];
  posts_limit: number;
  comments_per_post: number;
  comments_sort: string;
  include_replies: boolean;
  status: string;
  apify_posts_run: string | null;
  apify_comments_run: string | null;
  post_count: number;
  comment_count: number;
  discord_app_id: string | null;
  discord_token: string | null;
  discord_channel_id: string | null;
  discord_user: string | null;
}

/** Ghi theo lô (upsert) để không vượt giới hạn kích thước request. */
export async function upsertChunks(table: string, rows: object[], onConflict: string, ignoreDuplicates = false) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict, ignoreDuplicates });
    if (error) throw new Error(`Lưu ${table} lỗi: ${error.message}`);
  }
}

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<any>): void };
/** Chạy tiếp việc nặng sau khi đã trả lời request (Discord yêu cầu trả lời trong 3 giây). */
export function background(p: Promise<unknown>) {
  const guarded = p.catch((e) => console.error('background task failed', e));
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(guarded);
}
