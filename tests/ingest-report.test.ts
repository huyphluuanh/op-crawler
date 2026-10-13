import { describe, expect, it } from 'vitest';
import {
  findFacebookUrls, findPostFor, isPostUrl, mapComment, mapPost, mentionsFor, stubPostFromUrl,
} from '../supabase/functions/_shared/ingest.ts';
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
  it('link reel / watch không bị lấy làm tên fanpage', () => {
    const p = mapPost({ postId: '9', url: 'https://www.facebook.com/reel/123', facebookUrl: 'https://www.facebook.com/reel/123', pageName: 'reel' }, 1)!;
    expect(p.page_name).toBeNull();
    expect(p.page_url).toBeNull();
    const q = mapPost({ postId: '9', url: 'https://www.facebook.com/reel/123', facebookUrl: 'https://www.facebook.com/opinhinh', pageName: 'reel', user: { name: 'Ốp Xinh' } }, 1)!;
    expect(q.page_name).toBe('Ốp Xinh');
    expect(q.page_url).toBe('https://www.facebook.com/opinhinh');
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

describe('isPostUrl / stubPostFromUrl', () => {
  it.each([
    ['https://www.facebook.com/opinhinh/posts/pfbid02tC', true],
    ['https://www.facebook.com/permalink.php?story_fbid=123&id=456', true],
    ['https://www.facebook.com/share/p/1AbCdE/', true],
    ['https://www.facebook.com/opinhinh/videos/123456/', true],
    ['https://www.facebook.com/reel/123456', true],
    ['https://www.facebook.com/photo/?fbid=123', true],
    ['https://www.facebook.com/watch?v=123', true],
    ['https://fb.watch/abc/', true],
    ['https://www.facebook.com/opinhinh', false],
    ['https://www.facebook.com/profile.php?id=1000', false],
  ])('%s → %s', (u, expected) => {
    expect(isPostUrl(u)).toBe(expected);
  });

  it('bài tạm đoán tên fanpage từ link', () => {
    const p = stubPostFromUrl('https://m.facebook.com/opinhinh/posts/pfbid02tC/?ref=share', 3, 'Mẫu ip 16');
    expect(p).toMatchObject({
      post_key: 'url:facebook.com/opinhinh/posts/pfbid02tc',
      page_name: 'opinhinh',
      page_url: 'https://www.facebook.com/opinhinh',
      text: 'Mẫu ip 16',
    });
    expect(stubPostFromUrl('https://www.facebook.com/share/p/1AbC/', 3, null).page_name).toBeNull();
  });

  it('bình luận gắn được vào bài tạm', () => {
    const p = stubPostFromUrl('https://www.facebook.com/opinhinh/posts/pfbid02tC', 3, null);
    expect(findPostFor({ inputUrl: 'https://www.facebook.com/opinhinh/posts/pfbid02tC' }, [p])).toBe(p.post_key);
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
