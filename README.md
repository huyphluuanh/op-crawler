# Bot crawl ốp lưng — tìm dòng máy khách hay in

Bot Discord crawl bài viết / fanpage Facebook của đối thủ ngành **in ốp theo yêu cầu** (qua Apify),
tự nhận diện **dòng điện thoại** trong bài và bình luận (vd "ip 15 prm", "ss s24u", "reno10 pro+"),
lưu vào Supabase, rồi báo cáo dòng máy nào được khách chọn nhiều nhất.

## Dùng trên Discord

| Lệnh | Việc |
|---|---|
| `/crawl link:<link>` | Crawl 1 bài viết hoặc cả fanpage (dán nhiều link cách nhau dấu cách). Tùy chọn `so_bai` (mặc định 20 bài/fanpage), `binh_luan` (mặc định 30 bình luận/bài, 0 = bỏ qua), `so_ngay` (chỉ bài đăng trong N ngày gần nhất) |
| `/binhluan link:<link bài>` | **Chỉ** lấy bình luận của đúng các bài bạn dán (không lấy cả fanpage). Tùy chọn `so_luong` (mặc định 100 bình luận/bài), `so_ngay` (chỉ bình luận viết trong N ngày gần nhất). Link fanpage sẽ bị bỏ qua |
| Chuột phải tin nhắn → **Ứng dụng → Crawl link này** | Dán link vào kênh chat như bình thường, rồi crawl luôn link trong tin nhắn đó |
| `/baocao` | Xếp hạng dòng máy + tỉ lệ theo hãng, kèm file CSV mở bằng Excel. Lọc `fanpage:<tên/link>`, `so_ngay:<N>` |
| `/kiemtra noidung:<chữ>` | Thử nhận diện dòng máy trong một đoạn chữ (miễn phí, không gọi Apify) |
| `/lichsu` | 10 lần crawl gần nhất và trạng thái |

Đọc báo cáo: **💬 bình luận** = khách hỏi/đặt (nhu cầu thật), **📝 bài viết** = shop đăng mẫu (cái đối thủ đẩy).
Mỗi bài/bình luận tính tối đa 1 lần cho mỗi dòng máy.

**Giới hạn:** chỉ đọc được chữ. Dòng máy chỉ nằm trong ảnh (không ghi trong caption/bình luận) sẽ không đếm được.
Dòng "A54", "A15"… không ghi hãng được xếp vào "Chưa rõ hãng" vì Samsung và OPPO trùng tên.

## Chi phí (Apify, giá 10/2026)

~$5 / 1.000 bài + ~$1,5 / 1.000 bình luận. Gói Free của Apify cho $5/tháng.
Ví dụ 1 fanpage × 20 bài × 30 bình luận ≈ $0,1 + $0,9 = **~$1**. Bot báo ước tính trước mỗi lần crawl.

## Cách hoạt động

```
Discord /crawl ──► Edge Function "discord" ──► Apify: facebook-posts-scraper
                                                    │ (xong → webhook)
                      Supabase DB ◄── Edge Function "apify-webhook" ──► Apify: facebook-comments-scraper
                       (posts, comments,                │ (xong → webhook)
                        mentions)                       ▼
                                          nhận diện dòng máy → báo kết quả lên Discord
```

Không cần máy chủ riêng: mọi thứ chạy trên Supabase Edge Functions (gói Free).

| Thứ | Ở đâu |
|---|---|
| Nhận diện dòng máy | `supabase/functions/_shared/phone-models.ts` (+ test `tests/phone-models.test.ts`) |
| Bot Discord | `supabase/functions/discord/` |
| Nhận kết quả Apify | `supabase/functions/apify-webhook/` |
| Database | `supabase/migrations/` — bảng `jobs`, `posts`, `comments`, `mentions`; hàm `report_models`, `report_scope` |
| Cài đặt | `CAI-DAT.cmd` → `scripts/setup.ts` |
| Supabase project | `xphjrfuogetlvgxvclzp` ("Crawl fanpage inop") |

## Cài đặt lần đầu

1. **Discord:** https://discord.com/developers/applications → *New Application* → đặt tên → tab **Bot** →
   *Reset Token* → copy.
2. **Apify:** đăng ký https://console.apify.com → *Settings → API & Integrations* → copy *Personal API token*.
3. **GitHub:** tạo repo trống tên `op-crawler` tại https://github.com/new (Private, không tick thêm gì).
4. Bấm đúp **`CAI-DAT.cmd`** → Notepad mở ra → dán 2 token sau dấu `=` → Ctrl+S → đóng Notepad.
   Script tự tạo bảng, deploy, cấu hình Discord, đăng ký lệnh, đẩy code lên GitHub.
5. Mở link trong `invite-link.txt` → chọn server Discord → *Authorize*.

Sửa code xong muốn cập nhật: bấm đúp `CAI-DAT.cmd` lần nữa (chạy lại an toàn).

## Phát triển

```bash
npm test            # test nhận diện dòng máy + định dạng báo cáo
npm run typecheck   # kiểm tra kiểu cả code Node lẫn Edge Function
npm run deploy      # chỉ deploy lại 2 Edge Function
```

Thêm cách viết tắt mới: sửa luật trong `phone-models.ts`, thêm ví dụ vào test, `npm test`.
Thay đổi database: thêm file SQL mới trong `supabase/migrations/` (viết kiểu chạy lại được: `if not exists`).
