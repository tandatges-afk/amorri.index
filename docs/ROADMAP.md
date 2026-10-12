# Roadmap kiến trúc Amorri Studio

**Quy tắc:** Không đổi schema `studioPlanner_v1` hay biến tài khoản/đường dẫn chia sẻ trong production trước khi backup, migration script và staging QA.

### P0 — Trước khi cam kết bảo mật dữ liệu khách hàng

- Tạo tài khoản Firebase Authentication cho từng admin/staff; custom claims `role` hoặc mapping UID đã kiểm tra server.
- Tách data public delivery (`client_delivery/<id>`) khỏi booking có giá, lương, số điện thoại, note nội bộ. Khách chỉ được API trả projection tối thiểu.
- Tạo token chia sẻ gallery ngẫu nhiên có TTL/quyền thu hồi, hash lưu ở server; tuyệt đối không lưu bản rõ token trong nhánh Firebase RTDB được anonymous read.
- Lock `.read`/`.write` trong RTDB Rules theo auth UID và permission; loại bỏ mọi write anonymous đến booking/payroll/blackouts; kiểm tra firebase emulator.
- Staff chỉ xem events/assignments/payroll của mình; không nhận quyền bằng `?staff=` đơn thuần.
- Toàn bộ mutation admin delete + audit thành backend transaction/idempotent operation với soft-delete/tombstone (không hồi sinh từ pending queue).

### P1 — Thiết kế lại frontend với React + TypeScript

- Vite + React + TypeScript: route dashboard/calendar/team/payroll/admin/settings/gallery/review; UI theo component riêng.
- Feature modules `bookings`, `staff`, `payroll`, `gallery`, `video-review`, `audit` cùng data repository typed.
- Giữ nguyên URLs khách cũ qua router redirect và cách đọc `studioPlanner_v1` trong một giai đoạn.
- Calendar subscription theo tháng/nhân sự bằng index; tránh `.on('value')` toàn bộ database.
- Virtualized image gallery, `loading=lazy`, ảnh preview tối ưu, download source riêng biệt; không resize ảnh RAW gốc.
- Comment video lưu `{videoId,timeSeconds,author,content,status,createdAt,revision}`; playback time chỉ đổi khi nhấn vào comment. Editor đóng/ mở lại issue với audit.

### P2 — Video production-grade

- Video nguồn trong Drive vẫn lưu RAW/original nhưng phát preview qua Mux/Cloudflare Stream hoặc Object Storage + CDN + HLS encode 1080p.
- Cho người dùng chọn chất lượng; nếu yêu cầu tuyệt đối không phát dưới 1080p thì chỉ cung cấp 1080p renditions ở bitrate khác nhau, chấp nhận load lâu khi mạng yếu.
- Signed playback URL theo link gallery, không expose service account, không phát từ Vercel cho từng request media liên tục.
- Theo dõi startup time, rebuffer count/seconds, bitrate/rendition, dropped frames và load error.

### P3 — QA và vận hành

- Unit: date/time, booking overlap, payroll, photo favorites, comment timeline.
- Integration: Firebase emulator + RTDB rules test + Drive mocked Range/shortcut.
- E2E: Playwright Chrome/Firefox/WebKit desktop/mobile, admin/staff/client.
- Observability: Sentry frontend, structured logs API, performance metrics, media QoE, backup/restore.
- CI: build/lint/typecheck/tests -> Vercel Preview -> QA -> promote production; deployment có rollback.
