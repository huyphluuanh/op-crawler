// Định nghĩa lệnh Discord. Dùng chung cho script đăng ký lệnh và Edge Function.
// Loại option: 3 = chữ, 4 = số nguyên, 5 = có/không. Loại lệnh: 1 = slash, 3 = chuột phải vào tin nhắn.

export const MESSAGE_COMMAND = 'Crawl link này';

/** Thứ tự bình luận = giá trị viewOption của Apify facebook-comments-scraper. */
export const SORTS = {
  RECENT_ACTIVITY: 'Mới nhất',
  RANKED_THREADED: 'Phù hợp nhất',
  RANKED_UNFILTERED: 'Tất cả (thứ tự Facebook)',
} as const;
export type Sort = keyof typeof SORTS;
export const DEFAULT_SORT: Sort = 'RECENT_ACTIVITY';
export const isSort = (v: unknown): v is Sort => typeof v === 'string' && v in SORTS;

const COMMENT_OPTIONS = [
  {
    type: 3, name: 'sap_xep', description: 'Thứ tự lấy bình luận (mặc định: Mới nhất)',
    choices: Object.entries(SORTS).map(([value, name]) => ({ name, value })),
  },
  { type: 5, name: 'tra_loi', description: 'Lấy cả bình luận trả lời bên dưới (mặc định: Không, tốn thêm Apify)' },
];

export const COMMANDS = [
  {
    name: 'crawl',
    type: 1,
    description: 'Crawl bài viết / fanpage Facebook và trích dòng điện thoại',
    options: [
      { type: 3, name: 'link', description: 'Link bài viết hoặc fanpage (dán nhiều link cách nhau dấu cách)', required: true },
      { type: 4, name: 'so_bai', description: 'Số bài mới nhất lấy từ mỗi fanpage (mặc định 20)', min_value: 1, max_value: 200 },
      { type: 4, name: 'binh_luan', description: 'Số bình luận lấy mỗi bài (mặc định 30, 0 = không lấy)', min_value: 0, max_value: 500 },
      { type: 4, name: 'so_ngay', description: 'Chỉ lấy bài đăng trong N ngày gần nhất (vd 7, 30)', min_value: 1, max_value: 3650 },
      ...COMMENT_OPTIONS,
    ],
  },
  {
    name: 'binhluan',
    type: 1,
    description: 'Chỉ lấy bình luận của các bài viết bạn dán link (không lấy cả fanpage)',
    options: [
      { type: 3, name: 'link', description: 'Link bài viết (dán nhiều link cách nhau dấu cách)', required: true },
      { type: 4, name: 'so_luong', description: 'Số bình luận tối đa mỗi bài (mặc định 100)', min_value: 1, max_value: 5000 },
      { type: 4, name: 'so_ngay', description: 'Chỉ lấy bình luận viết trong N ngày gần nhất (vd 7, 30)', min_value: 1, max_value: 3650 },
      ...COMMENT_OPTIONS,
    ],
  },
  {
    name: 'baocao',
    type: 1,
    description: 'Báo cáo dòng máy khách hay chọn in ốp',
    options: [
      { type: 3, name: 'fanpage', description: 'Lọc theo tên hoặc link fanpage (bỏ trống = tất cả)' },
      { type: 4, name: 'so_ngay', description: 'Chỉ tính bài/bình luận trong N ngày gần đây', min_value: 1, max_value: 3650 },
      { type: 4, name: 'top', description: 'Số dòng máy hiển thị (mặc định 20)', min_value: 5, max_value: 50 },
    ],
  },
  {
    name: 'kiemtra',
    type: 1,
    description: 'Thử nhận diện dòng máy trong một đoạn chữ (không tốn tiền Apify)',
    options: [{ type: 3, name: 'noidung', description: 'Dán bình luận / nội dung bài vào đây', required: true }],
  },
  { name: 'lichsu', type: 1, description: 'Xem 10 lần crawl gần nhất' },
  { name: MESSAGE_COMMAND, type: 3 },
];

export const DEFAULT_POSTS = 20;
export const DEFAULT_COMMENTS = 30;
export const DEFAULT_COMMENTS_ONLY = 100;

/** Ngày bắt đầu (YYYY-MM-DD, giờ UTC) cho bộ lọc "N ngày gần nhất" của Apify. */
export function sinceDate(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}
