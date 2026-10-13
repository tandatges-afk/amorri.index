# Amorri Studio VNext 2.8.1 — TypeScript HTTP Status Fix

Bản vá **đầy đủ** trên nền VNext 2.8. Chỉ chỉnh kiểu lỗi HTTP cho API thumbnail, cập nhật mã release để nhận diện deployment, và thêm kiểm thử hồi quy. Không đổi Firebase, Google Drive, gallery, lịch hay quyền Admin.

**Nguyên nhân:** Trong `lib/server/delivery-access.ts`, kiểu `DeliveryError.status` thiếu các mã `413`, `502`, `504` đang được `lib/server/delivery-media.ts` sử dụng, làm `next build` dừng ở TypeScript checking.

**Sửa chữa:** Khai báo `DeliveryHttpStatus` theo union tường minh gồm `400 | 401 | 403 | 404 | 409 | 410 | 413 | 429 | 502 | 503 | 504`, giữ nguyên mã HTTP chính xác trong response.

**Kiểm tra deploy:** `GET /api/health` có `release: visual-thumbnails-20261013-r2`.

**Trước Production:** cập nhật source GitHub lên Vercel Preview, chạy `npm ci` (nếu có lockfile) hoặc `npm install`, `npm run typecheck`, `npm run build`, `npm run check:static`. Giữ nguyên Environment Variables, không cần cấu hình mới. Lưu ý bài test Node không thay thế cho Next.js build hoàn chỉnh.

## Các thay đổi khác

# Amorri Studio VNext 2.8 — Visual Experience & Drive Thumbnails

Nâng cấp từ **VNext 2.7.1 Workflow Stability**. Bản này chỉnh lại trải nghiệm giao diện và cung cấp thumbnail thật cho mục **Bàn giao sản phẩm** trên Dashboard Admin. Không xóa hoặc chuyển đổi dữ liệu Firebase.

## Tính năng mới

- Thẻ bàn giao lớn hơn (hai cột desktop, một cột mobile), khung ảnh chuẩn 16:9, nội dung và trạng thái rõ ràng, giao diện đồng nhất hơn.
- **Video:** lấy thumbnail đã được Google Drive tạo cho clip (không tải toàn bộ MP4, không trích frame trên Vercel).
- **Bộ ảnh:** ưu tiên ảnh mà Drive báo `imageMediaMetadata.width > height`; nếu thiếu metadata hướng ảnh, dùng ảnh hợp lệ đầu tiên làm phương án dự phòng.
- **Nhiều sản phẩm/lịch:** cover xuất hiện ở đầu thẻ; mở "Kiểm tra ảnh / clip & ảnh đã chọn" để thấy thumbnail riêng từng sản phẩm.
- **Thư mục ảnh riêng tư:** thumbnail đi qua `GET /api/delivery/[eventId]/thumbnail?productId=...&mediaId=...` có xác thực Admin, xác minh media thuộc đúng sản phẩm Drive, chỉ trả ảnh nhỏ đã tạo sẵn, giới hạn 2 MB.
- Tải khi card vào viewport, khống chế **tối đa 2** tác vụ phát hiện media đồng thời trong một tab, tự thu hồi Blob URL sau khi unmount.
- Nếu Drive chưa tạo thumbnail hoặc không cấp quyền: dùng placeholder an toàn; không hiển thị hình bịa đặt và không làm vỡ layout.
- Giữ lưới ảnh trên trang **khách** 4 cột ở desktop; không thay đổi phần chọn ảnh, bình luận timeline, link chia sẻ và các API lịch/lương/nhân sự.

## Cài đặt và triển khai

1. Sao lưu mã nguồn, triển khai VNext 2.8 trên Vercel **Preview**.
2. Giữ nguyên các biến Firebase/Google Drive. **Không cần** Cloudflare Stream hoặc biến mới.
3. Kiểm tra `GET /api/health` có `release: visual-thumbnails-20261013-r1`.
4. Đăng nhập Admin → **Bàn giao sản phẩm** → cuộn đến một thẻ có video hoặc thư mục ảnh ngang → đợi phân loại và thumbnail tải. Thử mở panel để xem thumbnail từng sản phẩm.
5. Kiểm tra ít nhất một folder riêng tư, video chưa có thumbnail và folder toàn ảnh dọc; kiểm tra trang khách trên điện thoại.
6. Trước Production, chạy `npm install`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e` và thử với Google Drive thật.

## Giới hạn cần biết

- Google Drive không cam kết tạo `thumbnailLink` cho mọi file/định dạng hoặc cấp quyền tải thumbnail ở mọi trường hợp. Ảnh dọc/ngang được chọn theo metadata Google Drive, không dùng phân tích pixel hay AI. Video chưa có thumbnail do Drive cung cấp sẽ hiện placeholder.
- API thumbnail đi qua Vercel để **lấy ảnh nhỏ**, không phải để phát video. Việc này vẫn phát sinh chút lưu lượng nhưng có giới hạn dung lượng và lazy loading.
- `npm run build`, typecheck đầy đủ và Playwright **chưa xác nhận trong môi trường tạo bản này** do thiếu dependencies npm. Các bài test Node và kiểm tra cú pháp chỉ bảo đảm logic ở phạm vi tương ứng.
- `/studio` cũ và các luồng nghiệp vụ từ VNext 2.7.1 được giữ nguyên để tương thích.

Đọc thêm: [`docs/UX_VISUAL_2_8.md`](docs/UX_VISUAL_2_8.md) và [`docs/WORKFLOW_STABILITY_2_7_1.md`](docs/WORKFLOW_STABILITY_2_7_1.md).
