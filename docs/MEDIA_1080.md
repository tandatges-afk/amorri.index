# Kế hoạch phát video 1080p mượt, không ép xuống 720p

## Hiện tại

Frontend dùng native `<video>`, xin ticket qua `/api/drive-video`, sau đó Google Drive API đọc từng HTTP Range qua Vercel Function. Cách này không tạo bitrate adaptive hay encode H.264/HLS. Nếu file gốc bitrate quá cao, codec không tương thích, hoặc đường truyền Drive/Vercel thất thường, trình phát vẫn giật mặc dù giao diện ổn định.

Stage 1 tăng chunk mặc định 8 -> 16 MiB và cho phép qua `DRIVE_VIDEO_CHUNK_BYTES`, xử lý đúng shortcut media membership, không reset video.src khi đang chạy nếu không cần. **Không cam kết 1080p mượt khi chưa đo trên clip thật.**

## Định dạng preview tối thiểu (MP4)

Khi muốn giữ bản gốc trên Drive nhưng tạo một bản phát dễ decode hơn, có thể dùng FFmpeg (cài riêng trên máy editor). Ví dụ dùng codec H.264, AAC, profile phổ biến, faststart, giới hạn khung hình 1920×1080 **mà không phóng to nguồn nhỏ hơn**:

```bash
ffmpeg -i "source.mov" -vf "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2" -c:v libx264 -preset slow -crf 19 -maxrate 8M -bufsize 16M -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k "preview-1080.mp4"
```

Lưu ý: filter giới hạn kích thước tối đa 1920×1080 nhưng không upscale nếu nguồn nhỏ hơn. Không thay bản RAW bằng preview.

## Phương án production (khuyến nghị)

- Giữ file gốc trong Drive và cho editor tải RAW khi cần.
- Tải preview sang dịch vụ encoding/CDN chuyên phát streaming (ví dụ Mux hoặc Cloudflare Stream), bật signed playback.
- Tạo tối thiểu bản 1080p; nếu studio yêu cầu video *luôn* 1080p, giữ cùng kích thước hình ở nhiều bitrate thay vì tự động xuống 720p (dịch vụ cần hỗ trợ cấu hình rendition phù hợp).
- Có metadata videoId -> source Drive ID -> playback asset ID, status `processing/ready/failed`, không ép tất cả khách phải mở file nguồn đang upload/transcode.
- Thu QoE trong trình duyệt: tỉ lệ tải lại, số lần gián đoạn, TTFB, watch time. Điều chỉnh bitrate/video codec dựa trên đo đạc thực tế.

**Ghi chú:** Nếu bắt buộc stream 1080p ngay cả mạng thấp, không hệ thống frontend nào bảo đảm không buffer. Cần đánh đổi giữa bitrate/chất lượng/độ ổn định chứ không chỉ thiết lập độ phân giải.
