# Bot crawl ốp lưng — hướng dẫn cho Claude

Bot Discord crawl fanpage Facebook đối thủ ngành in ốp (Apify) → nhận diện dòng điện thoại → Supabase → báo cáo.
Chủ dự án: GitHub `huyphluuanh`, không chuyên kỹ thuật, trao đổi **tiếng Việt**. Tự làm mọi thứ có thể;
việc cần đăng nhập thì gom vào một danh sách ngắn hoặc vào `CAI-DAT.cmd`. Xem `README.md` để biết kiến trúc.

- Supabase project ref `xphjrfuogetlvgxvclzp` (Tokyo). Edge Functions `discord`, `apify-webhook` (verify_jwt = false,
  tự xác thực bằng chữ ký Discord / `WEBHOOK_SECRET`). Secrets: DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY,
  DISCORD_APP_ID, APIFY_TOKEN, WEBHOOK_SECRET — đưa lên bởi `scripts/setup.ts` từ `secrets.local.env` (gitignore).
- Kiểm tra trước khi giao: `npm run typecheck` (gồm `tsconfig.functions.json` với shim Deno) và `npm test`.
  Máy không có Deno; code functions phải chạy được trên Deno (import `npm:` cho thư viện ngoài).
- Trong phiên Claude Code, lệnh dùng đăng nhập đã lưu (Supabase CLI với project thật, git push) bị chặn bởi
  auto mode → nhờ người dùng bấm đúp `CAI-DAT.cmd` (chạy lại an toàn: migration viết kiểu `if not exists`).
- Web báo cáo `web/index.html` (tĩnh, không build) → GitHub Pages; đọc `report-api` với header `x-report-key`.
  Xem thử local: preview "op-report" (cấu hình nằm trong `D:\Claude\App\.claude\launch.json` vì công cụ preview
  đọc launch.json của thư mục gốc phiên) rồi mở `/?demo`. `setup.ts` tự tạo repo Public, bật Pages, push.
- PowerShell 5.1 hiển thị file UTF-8 không BOM sai dấu — file vẫn đúng, đừng "sửa".
- Actor Apify: `apify~facebook-posts-scraper`, `apify~facebook-comments-scraper`; chạy bất đồng bộ với
  webhook ad-hoc → `apify-webhook?job=&stage=posts|comments&key=`. Mapping trường dữ liệu ở `_shared/ingest.ts`.
