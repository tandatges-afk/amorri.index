# Feature parity: old app to VNext 2.0

**Source:** user-supplied index(20261012-131916).html and the two accompanying Drive APIs. The old logic is retained through Stage 1 extracted assets, not reimplemented wholesale in React.

| Existing feature | Next.js TypeScript screen | Preserved operational path | State |
|---|---|---|---|
| Calendar month, type/status filter | React read-only calendar, search | `/studio` calendar & advanced filters | Usable legacy; React read-only |
| Create/edit/delete event, multiple locations, assignment | Read-only detail + React form tạo lịch cơ bản | `/studio` booking modal | Native create; edit/delete advanced in legacy |
| Staff roster and staff-specific URL | React team listing | `/studio` staff screen | Legacy retained; staff URL is NOT secure authentication |
| Blackout / leave reporting | -- | `/studio?staff=...` | Legacy retained |
| Upcoming staff schedule | -- | `/studio?staff=...` | Legacy retained |
| Payroll, advances, paid and carried balance | React *current-month* total | `/studio` advanced payroll | Legacy retained |
| Gallery / Google Drive folder shortcuts | React linked delivery list | `/studio?client_gallery=...` | Legacy retained |
| Client photo selection, favorite, copying selected file names | -- | `/studio?client_gallery=...` | Legacy retained |
| Video timeline review comments, playback, seeking, dark panels | -- | `/studio?client_gallery=...` | Legacy retained |
| System audit / staff activity | React recent activity | `/studio` audit | Legacy retained |
| Download/video Range API | Existing Node Vercel API (Pages API) | `/api/drive-video` | Preserved |
| Drive photo/image API | Existing Node Vercel API (Pages API) | `/api/get-drive-images` | Preserved |
| Firebase RTDB | Admin-side Node TypeScript reads + legacy compat SDK | `studioPlanner_v1` | Preserved schema |

## Important limitations

- This is a **migration foundation**, not an honest claim that all 9,000+ lines are rewritten in React. The original operational flows are still JavaScript, available through a Next.js rewrite.
- New `/api/dashboard` checks Firebase ID tokens and admin claims/UID allowlist on the **server**. Legacy staff and gallery links remain ID-based and cannot be considered safe for private client content without a security migration and Firebase RTDB rules audit.
- Existing Firebase RTDB key names/record shapes are not modified. No automatic migration, data deletion or production mutation is performed.
- Monthly payroll in React excludes carried debts from earlier months; for authoritative balances use legacy payroll view until the service is ported with reconciliation tests.
- Actual assets `logo.png`, `BG.png`, panda sprites are missing from the submitted three files. Copy from the original repository into `/public` before deployment.
- Google Drive Range streaming is retained for compatibility; it is not a 1080p transcoding or CDN service.
