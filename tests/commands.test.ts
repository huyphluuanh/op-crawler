import { describe, expect, it } from 'vitest';
import { COMMANDS, sinceDate } from '../supabase/functions/_shared/commands.ts';

describe('sinceDate', () => {
  it('lùi N ngày, định dạng YYYY-MM-DD', () => {
    expect(sinceDate(7, new Date('2026-10-13T10:00:00Z'))).toBe('2026-10-06');
    expect(sinceDate(30, new Date('2026-10-13T10:00:00Z'))).toBe('2026-09-13');
  });
});

describe('COMMANDS', () => {
  it('tên lệnh/option hợp lệ với Discord (chữ thường, ≤32 ký tự, mô tả ≤100)', () => {
    for (const c of COMMANDS) {
      if (c.type === 1) expect(c.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      if ('description' in c) expect(c.description?.length ?? 0).toBeLessThanOrEqual(100);
      for (const o of ('options' in c ? c.options ?? [] : [])) {
        expect(o.name).toMatch(/^[a-z0-9_-]{1,32}$/);
        expect(o.description.length).toBeLessThanOrEqual(100);
      }
    }
  });
  it('/crawl và /binhluan có ô so_ngay', () => {
    for (const name of ['crawl', 'binhluan']) {
      const c = COMMANDS.find((c) => c.name === name)!;
      expect('options' in c && c.options?.some((o) => o.name === 'so_ngay')).toBe(true);
    }
  });
});
