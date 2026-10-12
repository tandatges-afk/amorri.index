# Test matrix trước khi public

| Test case | Expected | Trạng thái |
|---|---|---|
| Build TypeScript + 11 unit tests | Không type/build lỗi | PASS local |
| API syntax JS files | `node --check` OK | PASS local |
| Màn admin tháng, xem/thêm/sửa lịch, lọc | UI/DB nhất quán sau F5 | Chưa test production |
| Xóa lịch lưu Firebase | Không xuất hiện lại sau F5, đa thiết bị | Chưa test production |
| Xóa ngày nghỉ | Không xuất hiện lại sau F5 | Chưa test production |
| Staff link xem đúng lịch/lương | Không lộ lịch người khác qua thay ID | SECURITY BLOCKER cần redesign |
| Khách không xem event nội bộ | Rules chỉ cấp projection tối thiểu | SECURITY BLOCKER cần redesign |
| Drive folder 1000+ ảnh | Trả đầy đủ, đúng natural ordering, không timeout | Chưa test với Drive thật |
| Shortcut video target ở folder khác | Cấp video ticket sau kiểm chứng shortcut | Static logic added; integration pending |
| Video 1080p dài 10–60 phút | Không đơ, không lặp 1–3 giây rồi buffering | Chưa test media thật |
| Seek nhiều lần / quay lại tab | Trả HTTP 206 đúng range; phát tiếp đúng time | Unit parser PASS; E2E pending |
| Timeline comment | Bình luận gắn thời điểm, nhấn vào nhảy đúng giây | Core timecode PASS; E2E pending |
| Giao diện desktop/mobile | Không co player, Footer không trống, VR panel mờ lúc Play | CSS added; E2E pending |
| Chọn ảnh | Tên file / favorite / copy đúng, không mất sau reload | Chưa test production |
| Quyền admin / guest | Không lộ dữ liệu qua URL, không thao tác trái phép | Chưa đạt P0 |
| Backup / rollback | Có bản backup RTDB + deploy cũ | Cần thao tác môi trường của bạn |

## Cách đo video tối thiểu

1. Chọn clip khách báo lag, mở Chrome DevTools > Network, bật Preserve log; tìm `/api/drive-video` các request 206.
2. Ghi `Content-Range`, `Content-Length`, response time, `Server-Timing`, status 206 / 401 / 403 / 429 / 502 / 504.
3. Đo startup time, play 30–60 giây, seek 3 lần, test Wi‑Fi/4G, Chrome/Safari, desktop/mobile.
4. Nếu chỉ 1–3 giây rồi dừng với response lỗi hoặc canceled, đối chiếu log Vercel/Drive và nguyên nhân. Không thử random tăng preload cho tất cả media.
5. Chỉ pass khi clip thật chạy trơn với đúng cấu hình 1080p, không suy từ unit tests.
