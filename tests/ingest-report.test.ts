import { describe, expect, it } from 'vitest';
import { findFacebookUrls, findPostFor, mapComment, mapPost, mentionsFor } from '../supabase/functions/_shared/ingest.ts';
import { brandShare, formatReport, toCsv } from '../supabase/functions/_shared/report.ts';

const postItem = {
  facebookUrl: 'https://www.facebook.com/opinhinh',
  postId: '1315686150601111',
  pageName: 'opinhinh',
  user: { name: 'Ốp In Hình Theo Yêu Cầu' },
  url: 'https://www.facebook.com/opinhinh/posts/pfbid02tC',
  time: '2026-10-01T13:00:05.000Z',
  timestamp: 1759323605,
  text: 'Mẫu mới cho ip 15 prm và ss s24 ultra',
  likes: 146, comments: 3, shares: 27,
};

describe('mapPost', () => {
  it('lấy đúng các trường', () => {
    expect(mapPost(postItem, 7)).toEqual({
      post_key: '1315686150601111',
      url: 'https://www.facebook.com/opinhinh/posts/pfbid02tC',
      page_url: 'https://www.facebook.com/opinhinh',
      page_name: 'Ốp In Hình Theo Yêu Cầu',
      text: 'Mẫu mới cho ip 15 prm và ss s24 ultra',
      posted_at: '2026-10-01T13:00:05.000Z',
      likes: 146, comments: 3, shares: 27,
      job_id: 7,
    });
  });
  it('bỏ item lỗi của Apify', () => {
    expect(mapPost({ error: 'not found', url: 'x' }, 1)).toBeNull();
  });
});

describe('mapComment', () => {
  const posts = [{ post_key: '1315686150601111', url: 'https://www.facebook.com/opinhinh/posts/pfbid02tC' }];
  it('gắn bình luận vào đúng bài (URL khác www/m, có query)', () => {
    const c = mapComment({
      commentId: 'c1', text: 'in cho e 14 pro max', profileName: 'Lan', date: '2026-10-02T01:00:00.000Z',
      likesCount: '3', inputUrl: 'https://m.facebook.com/opinhinh/posts/pfbid02tC/?ref=share',
    }, 7, posts);
    expect(c).toMatchObject({ comment_key: 'c1', post_key: '1315686150601111', author: 'Lan', likes: 3 });
  });
  it('không tìm thấy bài thì post_key = null', () => {
    expect(findPostFor({ facebookUrl: 'https://facebook.com/khac/posts/1' }, posts)).toBeNull();
  });
});

describe('mentionsFor', () => {
  it('tạo dòng mention cho từng model', () => {
    const rows = mentionsFor('post', 'p1', postItem.text, { post_key: 'p1', page_name: 'A', page_url: 'u', at: null, job_id: 1 });
    expect(rows.map((r) => r.model).sort()).toEqual(['Galaxy S24 Ultra', 'iPhone 15 Pro Max']);
  });
});

describe('findFacebookUrls', () => {
  it('tìm nhiều link, bỏ dấu câu cuối, bỏ link không phải Facebook', () => {
    expect(findFacebookUrls('xem https://www.facebook.com/abc, và https://fb.com/xyz/posts/1. https://google.com')).toEqual([
      'https://www.facebook.com/abc', 'https://fb.com/xyz/posts/1',
    ]);
  });
});

describe('report', () => {
  const rows = [
    { brand: 'Apple', model: 'iPhone 15 Pro Max', post_mentions: 2, comment_mentions: 8, total: 10 },
    { brand: 'Samsung', model: 'Galaxy S24 Ultra', post_mentions: 1, comment_mentions: 4, total: 5 },
    { brand: 'Apple', model: 'iPhone 13', post_mentions: 0, comment_mentions: 5, total: 5 },
  ];
  it('tỉ lệ theo hãng', () => {
    expect(brandShare(rows)).toEqual([
      { brand: 'Apple', total: 15, pct: 75 },
      { brand: 'Samsung', total: 5, pct: 25 },
    ]);
  });
  it('báo cáo có thứ hạng và tỉ lệ hãng', () => {
    const t = formatReport(rows, { pages: 1, posts: 10, comments: 200 }, 2);
    expect(t).toContain('**iPhone 15 Pro Max** — 10');
    expect(t).toContain('và 1 dòng máy khác');
    expect(t).toContain('Apple 75%');
  });
  it('CSV có BOM và tiêu đề tiếng Việt', () => {
    const csv = toCsv(rows);
    expect(csv.startsWith('﻿Hãng,Dòng máy')).toBe(true);
    expect(csv).toContain('Apple,iPhone 15 Pro Max,8,2,10');
  });
  it('báo cáo rỗng', () => {
    expect(formatReport([], null)).toContain('Chưa có dòng máy');
  });
});
