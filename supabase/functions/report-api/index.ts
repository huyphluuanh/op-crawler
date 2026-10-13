// API cho web báo cáo (GitHub Pages). Chỉ đọc; cần khóa REPORT_KEY (header x-report-key).
// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&page=<tên fanpage>   (ngày theo giờ Việt Nam, "to" tính cả ngày đó)
import { db } from '../_shared/db.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-report-key, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-01" (giờ VN) → mốc thời gian; nextDay = true lấy 0h ngày hôm sau (cận trên, không gồm). */
export function vnDay(d: string, nextDay = false): string {
  const t = new Date(`${d}T00:00:00+07:00`).getTime() + (nextDay ? 86_400_000 : 0);
  return new Date(t).toISOString();
}

function sameKey(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const expected = Deno.env.get('REPORT_KEY');
  if (!expected) return json({ error: 'Chưa cấu hình REPORT_KEY — chạy lại CAI-DAT.cmd' }, 500);
  if (!sameKey(req.headers.get('x-report-key') ?? '', expected)) return json({ error: 'Sai khóa xem báo cáo' }, 401);

  const u = new URL(req.url);
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  const page = u.searchParams.get('page');
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return json({ error: 'Ngày phải dạng YYYY-MM-DD' }, 400);

  const { data, error } = await db.rpc('report_range', {
    p_from: from ? vnDay(from) : null,
    p_to: to ? vnDay(to, true) : null,
    p_page: page || null,
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
});
