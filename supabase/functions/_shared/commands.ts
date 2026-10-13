// Định nghĩa lệnh Discord. Dùng chung cho script đăng ký lệnh và Edge Function.
// Loại option: 3 = chữ, 4 = số nguyên. Loại lệnh: 1 = slash, 3 = chuột phải vào tin nhắn.

export const MESSAGE_COMMAND = 'Crawl link này';

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
