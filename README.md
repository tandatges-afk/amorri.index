# AMORRI STUDIO VNext 2.6.2 — Google Drive Only (Preview)

**Next.js App Router + React + TypeScript + Tailwind v4, Firebase RTDB, Vercel, Vitest + Playwright tests.**

> **Trạng thái thực tế:** đây là bản chuyển đổi nền tảng với giao diện React mới, tạo lịch và quản lý lịch cơ bản (chỉnh sửa/hủy/xóa/phân công) và workspace tương thích. KHÔNG phải bản viết lại toàn bộ 9.470 dòng nghiệp vụ cũ. Không thay thế website production trước khi chạy kiểm thử trên môi trường preview.

## Bản vá VNext 2.6.2 — Tạm gỡ Cloudflare HLS/CDN

- Loại bỏ nút **HLS / CDN 2.6**, form nhập Stream UID, các API Cloudflare và dependency `hls.js` khỏi frontend/backend. Không phải cấu hình `CF_STREAM_*` hoặc `AMORRI_STREAM_TOKEN_TTL_SECONDS`.
- **Trang `/delivery` sử dụng Google Drive Range Proxy** (`/api/drive-video`) và tự chuyển sang khung xem Drive khi trình duyệt không phát được MP4. Chọn ảnh, quyền link riêng tư và bình luận timeline vẫn giữ.
- **Giữ nguyên dữ liệu Firebase**, kể cả `amorriVideoStreams_v1` từng liên kết để sau này có thể khôi phục; không xóa hay sửa Security Rules trên production. Các API Stream quản lý UID đã bị gỡ.
- Truy cập `/api/health`: `drive-only-20261013-r1`, `streamingApi=google-drive-only`.
- Vì video đi qua Vercel Functions, **Fast Origin Transfer vẫn có thể tăng**; đây là bản tắt Cloudflare theo yêu cầu, không phải bản tối ưu streaming 1080p.
- Hướng dẫn chi tiết: [`docs/DRIVE_ONLY_2_6_2.md`](docs/DRIVE_ONLY_2_6_2.md).

## Bước mới — VNext 2.5: Bàn giao riêng tư, bình luận video và chọn ảnh qua API TypeScript

- **Admin:** Trong **Bàn giao sản phẩm**, mở “Link an toàn 2.5” để tạo link có hạn dùng / thu hồi / giới hạn quyền khách. Token 256-bit chỉ được lưu trên Firebase dưới dạng hash; không còn phải coi event ID là mật khẩu.
- **Khách:** Trang React mới `/delivery/<eventId>#token=...`, xem ảnh/video của đúng lịch, chọn ảnh và gửi góp ý theo timeline; API xác thực token phía server, kiểm tra file thực sự thuộc thư mục Drive trước khi ghi.
- **Tương thích:** Mọi màn hình lịch, lương, nhân sự, `/staff`, `/studio`, ảnh đã chọn cũ và `videoReviews_v1` vẫn giữ. Link cũ chưa bị ngắt, nhưng vẫn phải siết Rules sau khi staging thành công.
- **Không tuyên bố tối ưu video/CDN xong:** luồng phát vẫn đi qua Google Drive / Vercel Function. Chưa chuyển HLS, chưa bảo đảm 1080p mượt, chưa giải quyết quota Fast Origin Transfer.
- **Không tự áp dụng Security Rules** và không bật strict trên production.
- Release marker: `GET /api/health` → `private-delivery-20261013-r1`.
- Hướng dẫn chi tiết, các giới hạn bảo mật, QA staging: [`docs/PRIVATE_DELIVERY_2_5.md`](docs/PRIVATE_DELIVERY_2_5.md).

## Bước mới — 2.4: Xác thực workspace cũ, xóa bằng API, migration diagnostics

- **Không đổi dữ liệu** `studioPlanner_v1`, giữ nguyên `VNext 2.3 Payroll Manager` và tất cả đường dẫn `/studio` bàn giao ảnh/video.
- `/studio` chỉ cấp quyền Admin/nhân sự khi server xác minh Firebase ID token + UID cho đúng vai trò, không coi bất kỳ Firebase login hoặc URL `?staff` là quyền sửa/xóa.
- Xóa lịch từ legacy qua **GET+DELETE `/api/events/[id]`**, kiểm tra phiên bản và sao lưu mã hóa; xóa ngày nghỉ qua `/api/blackouts/[id]` kiểm tra ownership. Không còn xóa trực tiếp Firebase qua helper legacy.
- Trang `/migration` (Admin) hiển thị thống kê khóa numeric legacy, ID trùng/thiếu, nhân sự chưa liên kết UID; không tiết lộ thông tin khách hàng.
- `AMORRI_LEGACY_ADMIN_WRITES=compat` (mặc định) giữ các form studio nâng cao; `read-only` có thể bật trên **staging** để thử chuyển admin/staff sang React, nhưng không thay thế Security Rules.
- Script `scripts/prepare-rtdb-rules.mjs` tạo bản đề xuất rules **từ bản export thật** và chỉ để review, không có deploy tự động. Rules deny browser writes chưa an toàn để triển khai cho Production vì gallery chọn ảnh vẫn ghi trực tiếp SDK; phản hồi video còn ở `videoReviews_v1`.
- **Không tự động bổ sung/xóa dữ liệu hay thay đổi rules.** Nghiệp vụ customer delivery và review chưa được chuyển hoàn toàn sang server.
- Release: `/api/health` → `security-cutover-20261013-r1`. Tài liệu triển khai/rủi ro tại [`docs/SECURITY_CUTOVER_2_4.md`](docs/SECURITY_CUTOVER_2_4.md).

## Bước mới: Bảng lương lũy kế TypeScript — VNext 2.3

- **Admin / Lương thợ**: dùng `components/PayrollManager.tsx` thay cho bảng chỉ đọc, hiển thị nợ cũ, công tháng, tổng đã ứng/trả, số dư cuối kỳ, cập nhật tiền theo VND và xuất CSV.
- **Nhân sự /staff**: xem **chỉ bảng lương của chính mình**, qua token Firebase đã xác minh và UID đã liên kết; không lộ lương nhân sự khác qua API mới.
- **API** `GET /api/payroll`, `PUT /api/payroll/[staffId]`, `GET /api/staff/payroll`; ghi nhận audit `PAYROLL_UPDATED`, kiểm tra quyền và khóa xung đột bằng Firebase RTDB transaction (`409 PAYROLL_CONFLICT`).
- **Tương thích Firebase**: giữ nguyên `studioPlanner_v1/payroll/YYYY-MM/staffId` và công thức nợ cũ từ web gốc. Không cần biến môi trường mới.
- **Điều kiện quan trọng**: web `/studio` cũ vẫn có quyền ghi trực tiếp, nên chưa được bảo đảm chống ghi đè giữa mọi giao diện. Chỉ thử trên Vercel Preview với Firebase staging trước khi chuyển production.
- Tài liệu kế toán, bảo mật, checklist đối chiếu: [`docs/PAYROLL_MANAGER_2_3.md`](docs/PAYROLL_MANAGER_2_3.md).
- Endpoint xác định deploy: `/api/health` → `payroll-manager-20261013-r1`.

## Bản vá 2.2.1 — Sửa lỗi kiểm tra kiểu TypeScript khi deploy Vercel

- `components/EventEditor.tsx`: sau guard `if (!id) return null`, dùng `const eventId: string = id` để hai callback async PATCH/DELETE đưa `string` vào `encodeURIComponent` (không ép kiểu).
- `lib/server/event-storage.ts`: suy ra kiểu reference từ `adminDatabase().ref()` để tương thích với kiểu Firebase Admin SDK; bỏ import `DatabaseReference` không tồn tại.
- Không thay đổi logic đọc/ghi Firebase, quyền admin hoặc dữ liệu `studioPlanner_v1`.
- Chạy `npm run typecheck` và `npm run build` trên Vercel Preview. Trong môi trường đóng gói không truy cập được npm registry nên chưa xác nhận full Next.js build.

## Bước mới: Nhân sự / ngày nghỉ / lịch sắp tới của thợ — VNext 2.2

- Admin → **Đội ngũ**: tạo/chỉnh sửa/ngưng hoạt động staff, gắn Firebase Auth UID; quản lý ngày nghỉ; xem lịch sắp tới theo thợ.
- **`/staff`**: thợ đăng nhập với Firebase Auth, xem lịch 90 ngày chỉ được phân công cho mình, báo nghỉ/xóa nghỉ. Không dùng query `?staff=...` làm cơ chế phân quyền mới.
- **Backend**: `/api/staff`, `/api/staff/[id]`, `/api/staff/me`, `/api/staff/agenda`, `/api/blackouts`, `/api/blackouts/[id]`. Trả 403 nếu xem hoặc sửa dữ liệu nhân sự khác.
- **Booking PATCH**: kiểm tra trùng giờ/ngày nghỉ phía server (409 `SCHEDULE_CONFLICT`), phối hợp khóa ghi giữa các API VNext.
- **Không bổ sung biến môi trường mới** so với VNext 2.1. Cần tạo Firebase Authentication User cho từng nhân sự và liên kết UID.
- **Giới hạn**: `/studio` JavaScript cũ vẫn ghi trực tiếp RTDB; cần tiếp tục di trú và siết Firebase Rules để loại bỏ hoàn toàn nguy cơ ghi đua và lộ dữ liệu.
- Chi tiết và QA: [`docs/STAFF_SCHEDULING_2_2.md`](docs/STAFF_SCHEDULING_2_2.md).

## Bước trước: Booking Manager 2.1

- **React/TypeScript**: mở chi tiết → chỉnh sửa trạng thái, lịch, thông tin, chi phí và phân công nhân sự; hủy giữ lịch; xóa có mã hóa bản lưu dự phòng.
- **API** `GET/PATCH/DELETE /api/events/[id]` xác minh admin phía server, tìm record theo `id` để tương thích key số, transaction chống đè cập nhật.
- **Không yêu cầu đổi 13 biến hiện tại**; chỉ xóa lịch cần thêm khóa mã hóa `AMORRI_ARCHIVE_ENCRYPTION_KEY` (Secret).
- **Chưa xác nhận production**; xem [`docs/BOOKING_MANAGER_2_1.md`](docs/BOOKING_MANAGER_2_1.md) về các hạn chế quan trọng và QA.

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

Nếu gặp **401 / Không thể xác thực Firebase Admin**, đọc [`docs/FIX_AUTH_401.md`](docs/FIX_AUTH_401.md).

Điền đầy đủ `.env.local` từ dự án của bạn; **không commit** khóa service account. Firebase public config `NEXT_PUBLIC_*` không phải secret. `FIREBASE_SERVICE_ACCOUNT_JSON`, `DRIVE_SERVICE_ACCOUNT_JSON`, `DRIVE_VIDEO_SIGNING_SECRET`, `AMORRI_ADMIN_UIDS`, `FIREBASE_DATABASE_URL` là server-only.

Chạy kiểm tra khi đã cài dependency:

```bash
npm run typecheck
npm run test
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run build
```

> **Trong môi trường đóng gói:** `npm test` (số lượng in trong kết quả chạy) và `npm run check:static` đã chạy; việc cài package từ npm registry không khả dụng, do đó **chưa** có kết quả chạy Next.js build, Vitest, Playwright hoặc xác minh tích hợp Firebase/Drive. Các file kiểm thử mới có sẵn để chạy trong CI.

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


## VNext 2.6.1: UI hotfix

Sửa nhãn `Link an toàn` hiển thị markup HTML nguyên văn trên React, đồng bộ nhãn phiên bản Dashboard; xem `docs/DISPLAY_FIX_2_6_1.md`. Không thay đổi Firebase/API.
