# AMORRI STUDIO VNext 2.0 — Migration Foundation (Beta)

**Next.js App Router + React + TypeScript + Tailwind v4, Firebase RTDB, Vercel, Vitest + Playwright tests.**

> **Trạng thái thực tế:** đây là bản chuyển đổi nền tảng với giao diện React mới, một luồng tạo lịch mới và workspace tương thích. KHÔNG phải bản viết lại toàn bộ 9.470 dòng nghiệp vụ cũ. Không thay thế website production trước khi chạy kiểm thử trên môi trường preview.

## Điều đã hoạt động trong mã nguồn

- **`/`**: React admin dashboard có đăng nhập Firebase, KPI, lịch tháng, tìm kiếm, nhân sự, lương tháng, thư viện bàn giao, nhật ký hoạt động. API `/api/dashboard` xác thực Firebase ID token và quyền admin **trên server**, truy vấn theo tháng.
- **Tạo lịch mới**: form React/TypeScript → `POST /api/events`, validate đầu vào và số tiền VND trên server, bảo vệ quyền, transaction tránh ghi đè/lặp ID, audit sau khi tạo.
- **`/studio`**: giữ nguyên workspace từ bản gốc: tạo/sửa/xoá lịch nâng cao, bố trí 2 nhà trai/gái, phân công thợ, báo bận, lương lũy kế, audit, gallery ảnh, chọn ảnh, copy danh sách, bình luận video theo timeline và giao diện khách hàng. **Legacy vẫn là JavaScript**.
- **`/?staff=...` và `/?client_gallery=...`**: tự chuyển sang `/studio?...`. Link `/studio?client_gallery=...&prod=...` và `/studio?staff=...` vẫn nhận nguyên tham số.
- **`/api/drive-video` và `/api/get-drive-images`**: kế thừa endpoint Google Drive xử lý range và danh sách media từ VNext Stage 1.
- **`/api/health`**: endpoint health không lộ dữ liệu.
- Bộ kiểm thử: `npm test` (Node built-in), `npm run test:unit` (Vitest), `npm run test:e2e` (Playwright), `npm run check:static` (kiểm tra mã nguồn).

## Cấu trúc dự án

```
app/                  Next.js route, layout, stylesheet, TypeScript API
components/           React dashboard, form tạo lịch
lib/domain/           Model, chuẩn hóa RTDB, logic và validation
lib/firebase/         Firebase Auth trên browser
lib/server/           Firebase Admin trên server
pages/api/            Endpoints Drive tương thích (CHƯA port hết sang TypeScript)
public/legacy/        HTML gốc đã tách assets, truy cập qua /studio
public/assets/        CSS/JS legacy + media stability
scripts/              Kiểm tra cấu trúc
tests/            Node tests, Vitest & Playwright smoke
```

## Cài đặt trên máy

Cần Node.js >= 20.9 (khuyên dùng Node.js 22 LTS), npm và internet để cài các gói.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Điền đầy đủ `.env.local` từ dự án của bạn; **không commit** khóa service account. Firebase public config `NEXT_PUBLIC_*` không phải secret. `DRIVE_SERVICE_ACCOUNT_JSON`, `DRIVE_VIDEO_SIGNING_SECRET`, `AMORRI_ADMIN_UIDS`, `FIREBASE_DATABASE_URL` là server-only.

Chạy kiểm tra khi đã cài dependency:

```bash
npm run typecheck
npm run test
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run build
```

> **Trong môi trường đóng gói:** `npm test` (28 tests) và `npm run check:static` đã chạy; việc cài package từ npm registry không khả dụng, do đó **chưa** có kết quả chạy Next.js build, Vitest, Playwright hoặc xác minh tích hợp Firebase/Drive. Các file kiểm thử mới có sẵn để chạy trong CI.

## Deploy lên Vercel (phân biệt với VNext Stage 1)

1. Backup database RTDB và trang production, tạo nhánh/staging trong Git.
2. Deploy thư mục này làm project riêng hoặc branch Preview trong Vercel.
3. Framework Preset = **Next.js**; Root Directory = thư mục chứa `package.json`; Build Command = `npm run build`; **Output Directory = automatic, không đặt `public`**. Tắt override của project Stage 1 nếu còn lưu `public`.
4. Environment Variables: lấy từ `.env.example` và hệ thống đang hoạt động. Kiểm tra `AMORRI_ADMIN_UIDS` trùng UID Firebase Auth admin thực tế hoặc dùng custom claim `admin: true`.
5. Sao chép tài nguyên riêng `logo.png`, `BG.png`, panda sprites (nếu muốn giữ) từ repo sản xuất vào `public/`; ba file gửi lần này không có các tài nguyên này.
6. Test `/api/health`, login, `/api/dashboard`, tạo lịch mẫu trong **database staging**, `/studio`, `/studio?staff=...`, `/studio?client_gallery=...`, API Drive, video tua 1080p, ảnh, comment timeline, xóa lịch và báo nghỉ. **Không dùng tạo/xóa lịch thử trên database production**.
7. Chỉ chuyển domain khi các bước QA đạt và có kế hoạch rollback.

## LƯU Ý bảo mật và phát video

- **Guest gallery & staff URL cũ sử dụng ID trong query**, không phải xác thực đủ mạnh. Không chia sẻ nội dung nhạy cảm cho tới khi thay bằng tài khoản nhân viên và mã chia sẻ có hạn dùng, đồng thời cập nhật RTDB Security Rules.
- Trang React mới dùng admin check trên backend; không mặc định suy ra rằng **toàn bộ** các thao tác trong `/studio` đều có cùng mức bảo vệ. Cần audit rules production trước khi go-live.
- API Range với Google Drive **không tự transcode video**. Video không tương thích codec, bitrate cao, yêu cầu tua mượt 1080p và large concurrent viewers cần encode 1080p H.264/AAC, progressive MP4 với moov đầu file hoặc HLS/CMAF với CDN, kèm monitoring.
- Không thay đổi node `studioPlanner_v1` hoặc dữ liệu production bằng migration tự động.

Xem thêm `docs/FEATURE_PARITY.md`, `docs/SECURITY.md`, `docs/RELEASE_CHECKLIST.md`, `docs/MIGRATION_PLAN.md`.
