// Chuyển dữ liệu thô từ Apify thành dòng database + danh sách dòng máy được nhắc tới.
// Thuần TypeScript (không gọi mạng) để test được trên Node.
import { extractPhoneModels } from './phone-models.ts';

// deno-lint-ignore no-explicit-any
type Item = Record<string, any>;

export interface PostRow {
  post_key: string;
  url: string | null;
  page_url: string | null;
  page_name: string | null;
  text: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  job_id: number;
}

export interface CommentRow {
  comment_key: string;
  post_key: string | null;
  text: string | null;
  author: string | null;
  commented_at: string | null;
  likes: number | null;
  job_id: number;
}

export interface MentionRow {
  source: 'post' | 'comment';
  source_key: string;
  post_key: string | null;
  page_name: string | null;
  page_url: string | null;
  brand: string;
  model: string;
  matched: string;
  mentioned_at: string | null;
  job_id: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function isoDate(v: unknown): string | null {
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === 'string' && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Item lỗi Apify trả về (vd link không truy cập được) có dạng { error, url }. */
export const isErrorItem = (it: Item) => typeof it.error === 'string' || typeof it.errorDescription === 'string';

/** Đoạn đầu đường dẫn kiểu "reel", "watch", "share"… không phải tên fanpage. */
const pageSlug = (u: string | null) => {
  const seg = urlKey(u).split('/')[1] ?? '';
  return seg && !NOT_PAGE.has(seg) ? seg : null;
};
const realName = (v: unknown) => {
  const s = str(v);
  return s && !NOT_PAGE.has(s.toLowerCase()) ? s : null;
};

export function mapPost(it: Item, jobId: number): PostRow | null {
  if (isErrorItem(it)) return null;
  const url = str(it.url) ?? str(it.topLevelUrl) ?? str(it.postUrl);
  const key = str(String(it.postId ?? '')) ?? str(it.facebookId) ?? url;
  if (!key) return null;
  const pageUrlRaw = str(it.facebookUrl) ?? str(it.inputUrl) ?? str(it.pageUrl);
  const slug = pageSlug(pageUrlRaw) ?? pageSlug(url);
  return {
    post_key: key,
    url,
    page_url: slug ? `https://www.facebook.com/${slug}` : pageUrlRaw && !isPostUrl(pageUrlRaw) ? pageUrlRaw : null,
    page_name: realName(it.user?.name) ?? realName(it.pageName) ?? slug,
    text: str(it.text) ?? str(it.message) ?? str(it.postText),
    posted_at: isoDate(it.time) ?? isoDate(it.timestamp),
    likes: num(it.likes),
    comments: num(it.comments),
    shares: num(it.shares),
    job_id: jobId,
  };
}

/** Rút gọn URL bài để so khớp (bỏ query, dấu / cuối, www/m/web). */
export function urlKey(u: string | null | undefined): string {
  if (!u) return '';
  return u
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^(www|m|web|mbasic)\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

/** Tìm bài viết mà bình luận thuộc về (Apify trả lại URL bài đã đưa vào). */
export function findPostFor(it: Item, posts: Pick<PostRow, 'post_key' | 'url'>[]): string | null {
  const candidates = [it.inputUrl, it.facebookUrl, it.postUrl].map(urlKey).filter(Boolean);
  for (const c of candidates) {
    const p = posts.find((p) => urlKey(p.url) === c || c.includes(p.post_key));
    if (p) return p.post_key;
  }
  return null;
}

export function mapComment(
  it: Item,
  jobId: number,
  posts: Pick<PostRow, 'post_key' | 'url'>[],
): CommentRow | null {
  if (isErrorItem(it)) return null;
  const key = str(it.commentId) ?? str(it.id) ?? str(it.commentUrl);
  if (!key) return null;
  return {
    comment_key: key,
    post_key: findPostFor(it, posts),
    text: str(it.text),
    author: str(it.profileName),
    commented_at: isoDate(it.date),
    likes: num(it.likesCount) ?? (typeof it.likesCount === 'string' ? parseInt(it.likesCount, 10) || null : null),
    job_id: jobId,
  };
}

export function mentionsFor(
  source: 'post' | 'comment',
  sourceKey: string,
  text: string | null,
  ctx: { post_key: string | null; page_name: string | null; page_url: string | null; at: string | null; job_id: number },
): MentionRow[] {
  return extractPhoneModels(text).map((m) => ({
    source,
    source_key: sourceKey,
    post_key: ctx.post_key,
    page_name: ctx.page_name,
    page_url: ctx.page_url,
    brand: m.brand,
    model: m.model,
    matched: m.matched,
    mentioned_at: ctx.at,
    job_id: ctx.job_id,
  }));
}

/** Link trỏ tới một bài cụ thể (bài, ảnh, video, reel, link chia sẻ) chứ không phải trang fanpage. */
export function isPostUrl(u: string): boolean {
  return /\/(posts|permalink|videos|reel|reels|photos?|watch|story\.php|permalink\.php|photo\.php)\b|\/share\/[prv]\/|[?&](story_fbid|fbid|v)=|fb\.watch\//i
    .test(u);
}

const NOT_PAGE = new Set([
  'permalink.php', 'story.php', 'photo.php', 'photo', 'photos', 'share', 'watch', 'reel', 'reels', 'videos',
  'groups', 'profile.php', 'posts', 'events', 'stories',
]);

/**
 * Bài viết "tạm" khi chỉ lấy bình luận (không chạy actor lấy bài): khóa theo URL,
 * caption lấy từ postTitle của bình luận, tên fanpage đoán từ đoạn đầu đường dẫn.
 */
export function stubPostFromUrl(url: string, jobId: number, caption: string | null): PostRow {
  const seg = urlKey(url).split('/')[1] ?? '';
  const page = seg && !NOT_PAGE.has(seg) ? seg : null;
  return {
    post_key: `url:${urlKey(url)}`,
    url,
    page_url: page ? `https://www.facebook.com/${page}` : null,
    page_name: page,
    text: caption,
    posted_at: null,
    likes: null,
    comments: null,
    shares: null,
    job_id: jobId,
  };
}

const FB_URL =/https?:\/\/(?:[a-z0-9-]+\.)?(?:facebook\.com|fb\.com|fb\.watch|fb\.me)\/[^\s<>"')\]]+/gi;

/** Lấy các link Facebook trong một đoạn chữ (người dùng có thể dán nhiều link một lúc). */
export function findFacebookUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(FB_URL)) out.add(m[0].replace(/[.,;!?]+$/, ''));
  return [...out];
}
