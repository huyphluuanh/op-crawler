// Định dạng báo cáo cho Discord + file CSV. Thuần TypeScript để test được.

export interface ModelRow {
  brand: string;
  model: string;
  post_mentions: number;
  comment_mentions: number;
  total: number;
}

export interface Scope {
  pages: number;
  posts: number;
  comments: number;
}

const bar = (v: number, max: number, width = 12) => '█'.repeat(Math.max(1, Math.round((v / max) * width)));

export function brandShare(rows: ModelRow[]): Array<{ brand: string; total: number; pct: number }> {
  const sum = rows.reduce((a, r) => a + Number(r.total), 0) || 1;
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.brand, (by.get(r.brand) ?? 0) + Number(r.total));
  return [...by.entries()]
    .map(([brand, total]) => ({ brand, total, pct: Math.round((total / sum) * 1000) / 10 }))
    .sort((a, b) => b.total - a.total);
}

/** Nội dung embed Discord (description tối đa 4096 ký tự). */
export function formatReport(rows: ModelRow[], scope: Scope | null, top = 20): string {
  if (!rows.length) {
    return 'Chưa có dòng máy nào được nhắc tới trong dữ liệu đã crawl.\n' +
      'Thử `/crawl` thêm fanpage, hoặc tăng số bình luận mỗi bài.';
  }
  const lines: string[] = [];
  if (scope) {
    lines.push(`Dữ liệu: **${scope.pages}** fanpage · **${scope.posts}** bài · **${scope.comments}** bình luận\n`);
  }
  const max = Number(rows[0].total);
  lines.push('**Top dòng máy** — 💬 bình luận (khách hỏi/đặt) · 📝 bài viết (shop đăng)');
  rows.slice(0, top).forEach((r, i) => {
    lines.push(
      `\`${String(i + 1).padStart(2)}.\` **${r.model}** — ${r.total}  (💬 ${r.comment_mentions} · 📝 ${r.post_mentions})\n` +
        ` ${bar(Number(r.total), max)}`,
    );
  });
  if (rows.length > top) lines.push(`… và ${rows.length - top} dòng máy khác (xem file CSV).`);
  lines.push('\n**Theo hãng**');
  lines.push(brandShare(rows).map((b) => `${b.brand} ${b.pct}%`).join(' · '));

  let out = lines.join('\n');
  if (out.length > 4000) out = out.slice(0, 3990) + '\n…';
  return out;
}

export function toCsv(rows: ModelRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const body = rows.map((r) =>
    [esc(r.brand), esc(r.model), r.comment_mentions, r.post_mentions, r.total].join(',')
  );
  // BOM để Excel mở đúng tiếng Việt
  return '﻿' + ['Hãng,Dòng máy,Bình luận,Bài viết,Tổng', ...body].join('\n') + '\n';
}
