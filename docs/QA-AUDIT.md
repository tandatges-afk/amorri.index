# Báo cáo audit tĩnh mã nguồn được gửi, 12/10/2026

Nguồn: `index(20261012-131916).html`, `drive-video(4).js`, `get-drive-images(4).js`.

| Vấn đề | Bằng chứng trong nguồn | Đánh giá |
|---|---|---|
| HTML gộp giao diện + business logic | 9.469 dòng, 39 khối style, 7 script inline ứng dụng (script chính ~228K ký tự) | Độ rủi ro hồi quy cao, khó review/diff |
| CSS delivery cascade | Nhiều selector `.vr-panel`, `.studio-credit`, `.client-video-frame` lặp lại cùng với `!important` qua nhiều block | Có thể làm mờ không nhất quán, thay đổi chiều cao/ngắt dòng theo breakpoint |
| Theo dõi RTDB | Dashboard `.on('value')` trên cả `studioPlanner_v1` rồi `render()` cập nhật các khu vực | Khi nhiều events/payroll/audit tăng, gây parse/DOM render dư thừa; client gallery đã scoped 1 event |
| URL xác định staff role | `resolveCurrentUserRole()` kiểm tra `staffViewId` có trong `data.staff` | Không tương đương server authorization. Không nên coi link staff là thông tin đăng nhập. |
| Link client gallery | Dữ liệu đọc trực tiếp `studioPlanner_v1/events/<clientGallery>` bằng client SDK | Phải xem security rules thực tế để xác nhận ai có thể đọc được thông tin event riêng tư. |
| Danh sách Google Drive | API gốc trả ảnh/video với `folderUrl` không liên kết với gallery hay admin | Có thể bị dùng để duyệt thư mục ngoài phạm vi nghiệp vụ nếu Drive/API key có quyền |
| Streaming Google Drive | Bounded Range mặc định 8 MiB, Vercel -> Drive trên mỗi yêu cầu Range | Tạo nhiều lần gọi upstream; không có transcoding, ABR hoặc CDN phân phối chuyên dụng |
| Shortcut video Drive | API ảnh trả target ID của shortcut; video authorization cũ chỉ kiểm tra target `parents` | Target ở ngoài folder nhưng shortcut ở trong folder có thể bị từ chối phát; đã bổ sung kiểm tra shortcut trong folder |
| Xóa sự kiện và blackout | Có hàm `amorriDeleteRecordPersistently` đọc collection, xóa theo child key / `id` và kiểm tra lại | Là cơ chế sửa lỗi bản ghi array key cũ; chưa có integration test vì thiếu DB môi trường |
| Đồng bộ offline | Local `PENDING_SYNC_KEY`, hàng đợi ghi và replay khi có snapshot | Cần chính sách idempotency/phiên bản ghi + kiểm thử xung đột nhiều client, tránh tái tạo dữ liệu đã xóa |
| Kiểm soát hiển thị nhạy cảm | `.admin-only`/`.staff-only` dựa vào CSS và role trong trình duyệt | CSS không phải ranh giới bảo mật; RTDB Rules/backend phải áp dụng quyền |

### Đã thử

- `tsc -p tsconfig.json` — pass.
- `node --test tests/*.test.mjs` — 11/11 pass (unit).
- `node --check` cho JS mới — pass.
- Kiểm tra mọi link asset nội bộ mới tồn tại — pass.
- Đã thử chạy browser smoke với Chromium nhưng môi trường chặn điều hướng localhost/file (`ERR_BLOCKED_BY_ADMINISTRATOR`), nên **không được coi là E2E pass**.

### Chưa thể kết luận từ file nguồn

- Không có Firebase Database Rules, dữ liệu thật, credentials/permissions thật hay log Vercel runtime.
- Không có tệp video cụ thể với codec/bitrate/file duration, tốc độ mạng, HAR/Chrome Media diagnostics.
- Vì vậy không thể khẳng định “đã hết lag 1080p”, “admin delete production OK” hoặc “dữ liệu riêng tư đã được bảo vệ tuyệt đối”.
