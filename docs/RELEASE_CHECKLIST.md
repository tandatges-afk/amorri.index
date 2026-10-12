# QA / Release Gate — checklist (chưa chạy trên production)

- [ ] `npm ci`/`npm install`, `npm run typecheck`, `npm run build` chạy thành công với Node 22.
- [ ] `npm test` (Node), `npm run test:unit` (Vitest) và `npm run test:e2e` (Playwright) đạt trên Preview.
- [ ] Review Vercel logs, xác minh project Next.js không override Output Directory thành `public`.
- [ ] Firebase staging: admin đăng nhập, xem đúng theo tháng, staff, lương, audit.
- [ ] Tạo lịch mới: validation, 401/403 admin role, duplicate ID=409, audit, F5 không mất lịch.
- [ ] Chỉnh sửa lịch cũ, phân công, ngày nghỉ, xóa event và blackout; sau refresh không xuất hiện lại.
- [ ] Staff: lịch của tôi, hạn chế double click ngày không có lịch, đúng quyền, không lộ thông tin admin.
- [ ] Bàn giao: folder video/ảnh, shortcut Drive, đánh dấu ảnh, copy ảnh chọn, comment theo timestamp, đổi video, mobile landscape/portrait.
- [ ] Video: Chrome/Safari/iOS/Android, tua nhiều lần, video 1080p, slow 3G, file dài, số người xem đồng thời, timeout 429/502, buffering 1–2 giây, fallback.
- [ ] CSS video không thu nhỏ, panel góp ý tự mờ, header tối khi play, footer không cách thừa, không có panda ở trang bàn giao.
- [ ] Preview test bảo mật: user lạ, staff của người khác, link guest không tồn tại, quyền Drive / Firebase.
- [ ] Export dữ liệu và khôi phục DB staging; kế hoạch rollback có người phụ trách.
- [ ] Khi tất cả đạt mới chuyển domain production.
