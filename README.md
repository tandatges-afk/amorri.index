# Amorri Studio VNext — Stage 1 (bản sửa lỗi Vercel Output Directory)

Đây là **mã nguồn có thể triển khai thử trên Vercel**, chuyển dần từ HTML/JS nguyên khối sang cấu trúc dễ bảo trì. Đây **chưa phải** bản rewrite React hoàn chỉnh, và **chưa xác minh** hoạt động với Firebase/Google Drive của bạn trên production. Ba file gốc được đóng riêng thành `Amorri_Studio_Originals_Backup.zip`, không đặt trong thư mục deploy để tránh xuất bản nhầm bản cũ.

## Đã triển khai trong gói

- Chia 39 `<style>` thành `assets/css/legacy.css`, giữ thứ tự cascade chính xác; CSS bổ sung nằm riêng trong `stability.css`.
- Tách 7 script ứng dụng thành `assets/js/*.js`. HTML từ hơn 500 KB giảm còn khoảng 40 KB; nội dung JS vẫn tải riêng và có thể được browser cache.
- Chuyển các hàm core mới sang **TypeScript** (`src/`), biên dịch ra `assets/vnext/`; có hiển thị trạng thái tải video không đụng tới `video.src`, `currentTime` hoặc độ phân giải.
- Video API vẫn hỗ trợ xác thực sản phẩm và HTTP Range, tăng chunk mặc định từ 8 lên 16 MiB (có thể tùy chỉnh), xử lý video qua Google Drive shortcut thực sự nằm trong thư mục khách hàng.
- API danh sách ảnh: kiểm tra thư mục Drive thuộc sản phẩm của bộ bàn giao; admin preview yêu cầu Firebase ID token được xác minh; load shortcut song song có giới hạn, phân trang, timeout và cache ngắn.
- CSS tương thích mobile/desktop, không khóa thao tác zoom, có `focus-visible`, `prefers-reduced-motion`; không hiện mascot khi vào bàn giao.
- Có unit tests TypeScript business logic và Range parser.

## Cấu trúc

```text
index.html                  # Markup giữ nguyên để tương thích dữ liệu/luồng đang dùng
assets/css/legacy.css       # CSS theo đúng thứ tự nguồn cũ
assets/css/stability.css    # Vá layout, video player, panel, accessibility
assets/js/main.js           # Logic legacy tách ra, cập nhật lệnh gọi API folder
assets/js/enhancement-*.js  # Các enhancement đã có, giữ thứ tự thực thi
src/                        # Source TypeScript mới
assets/vnext/               # JS build từ TypeScript
api/drive-video.js          # Streaming proxy + signed ticket + HTTP 206
api/get-drive-images.js     # Drive listing có kiểm tra quyền/ngữ cảnh
api/_lib/range.js           # Parser HTTP Range độc lập, có test
tests/                      # Node built-in test runner
/docs/                      # Audit, test matrix, lộ trình, chiến lược 1080p
```

## Cài đặt / chạy thử

**Cần Node.js từ 20 trở lên.** Trước khi triển khai, sao lưu database Firebase Realtime Database và toàn bộ file hiện có trên Vercel/Git.

1. Copy `logo.png`, `BG.png`, `panda-directions.webp` từ website hiện tại vào thư mục gốc. Những ảnh này **không có trong 3 file đã gửi**, nên gói không thể tự tạo giống bản thật.
2. Chạy `npm install` trong thư mục này.
3. Chạy `npm run check` để biên dịch TypeScript, tự tạo thư mục `public/` và thực hiện unit tests.
4. Khai báo biến môi trường theo `.env.example` ở **Vercel**. KHÔNG commit JSON service account lên Git; đặt `DRIVE_VIDEO_SIGNING_SECRET` đủ mạnh. Giá trị Firebase config trong HTML là config public của browser, **không phải** secret server.
5. Chạy `npx vercel dev` để thử giao diện kèm `/api/` hoặc deploy lên một **Vercel Preview Environment** riêng, không thay thế production trước khi đạt QA.
6. Nếu chưa gán custom claim `admin` trong Firebase Authentication, đặt `AMORRI_ADMIN_UIDS` bằng UID thật của tài khoản admin. Nếu không, admin sẽ không được dùng API preview thư mục Drive. Tránh allowlist mọi UID.

### Lưu ý tương thích khi deploy

- Không thay `studioPlanner_v1`, không tự ý xóa/sửa khóa Firebase hiện có. File `index.html` vẫn dùng Firebase `compat` SDK phiên bản cũ để không mất tính năng.
- Kết nối phát video yêu cầu **Google Drive service account có quyền đọc file/shortcut/parent**. API hình ảnh có thể sử dụng `GOOGLE_DRIVE_API_KEY` hoặc service account được chia sẻ đúng thư mục.
- Endpoint `/api/get-drive-images` giờ yêu cầu `clientGallery` và `productId` hợp lệ với khách, hoặc Firebase Bearer token admin. Hai lệnh gọi frontend tương ứng đã được cập nhật.
- Chỉ cấp quyền truy cập video/ảnh mà dịch vụ có thể đọc được; video blob dạng MOV codec không được browser hỗ trợ vẫn cần encode chuẩn web.
- Vercel Function thời gian chạy phải nằm trong giới hạn plan đã chọn; bản sửa Vercel dùng tối đa 60 giây cho video (để tương thích Hobby). Nếu dùng Pro và cần thời gian lâu hơn, có thể điều chỉnh trong `vercel.json` theo giới hạn plan.
- `npm run start:static` chỉ chạy frontend, **không** chạy `/api/`.

## Phạm vi chưa hoàn thành (quan trọng)

1. **Bảo mật khách hàng & nhân sự**: bản cũ suy ra `staff` từ `?staff=ID` và client gallery từ `?client_gallery=ID`. Phải chuyển sang Firebase Auth cho nhân sự, token chia sẻ có thể thu hồi + API chuyên dụng trả dữ liệu khách hàng tối thiểu, sau đó khóa Firebase RTDB Security Rules. Phiên bản này không giả vờ rằng chỉ thêm guard API là bảo vệ toàn bộ dữ liệu.
2. **Video 1080p mượt tuyệt đối**: cải thiện xử lý HTTP Range không thay thế việc chuyển mã/cấp phát HLS theo bitrate và CDN. Giải pháp lâu dài mô tả trong `docs/MEDIA_1080.md`.
3. **Full React rewrite**: chưa làm để tránh phá hỏng giao diện tính lương, event form, chọn ảnh, timeline comment và các link cũ trong một lần. Roadmap nêu ở `docs/ROADMAP.md`.
4. Unit tests đã chạy cục bộ nhưng chưa có quyền đăng nhập Firebase và Drive thực tế; chưa có E2E / tải đồng thời production. Không triển khai thẳng production khi chưa đạt checklist `docs/TEST_MATRIX.md`.

## Quay lại phiên bản cũ

Có thể giải nén ba file từ `Amorri_Studio_Originals_Backup.zip` (được gửi riêng) để khôi phục giao diện/API cũ nếu preview có lỗi. **Không rollback database bằng file**; dùng backup Realtime Database độc lập nếu đã thực hiện thay đổi cấu trúc database (gói Stage 1 không tự di trú database).

## Sửa lỗi Vercel: `No Output Directory named "public"`

Bản gói cũ chỉ chạy `tsc` ra `assets/vnext/`, không tạo `public/`, dẫn tới build thành công nhưng Vercel không tìm thấy output. Bản này đã sửa:

- `package.json` → `npm run build` = `tsc ... && node scripts/build-public.mjs`.
- `vercel.json` → `framework: null`, `buildCommand: npm run build`, `outputDirectory: public`.
- `scripts/build-public.mjs` chỉ copy `index.html`, `assets/` và file media public; **không đưa `api/`, `.env`, `src/`, hoặc thư mục tests lên web**.
- API `/api/drive-video` và `/api/get-drive-images` vẫn phải ở **`api/` cấp gốc** trong repository; Vercel xử lý chúng như Functions.
- Giá trị `maxDuration` tạm đặt 60 giây để phù hợp cả Hobby; trên Pro có thể nâng lại video lên 300 giây sau khi xác minh giới hạn plan.

### Cấu hình Vercel

Project Settings → Build and Deployment:

- **Framework Preset**: `Other` (tự động tương ứng `framework: null`).
- **Root Directory**: thư mục có `package.json`, `vercel.json`, `index.html`, `api/` (nếu repo có 1 tầng folder, trỏ đến folder đó).
- **Build Command**: `npm run build`.
- **Output Directory**: `public`.
- **Install Command**: mặc định `npm install` (hoặc `npm ci` nếu có lockfile).

Không upload `public/` bằng tay; thư mục được tạo mỗi khi build. Nếu thiếu ảnh, copy các tệp `logo.png`, `BG.png`, `panda-directions.webp`, `panda-reactions.webp` vào `static/` trong repository, script tự đưa sang `public/`. Vì các asset này không có trong 3 file gốc đính kèm, chúng không có trong gói fix.

Sau khi deploy, thử `/` và hai route `/api/drive-video` / `/api/get-drive-images`. API trả `400/401/405` do thiếu tham số hoặc auth nghĩa là function đã nhận request (không phải 404); để hoạt động thực sự phải thiết lập đầy đủ môi trường Firebase và Google Drive.
