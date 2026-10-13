# Amorri Studio VNext 2.6 — HLS / CDN video (Cloudflare Stream, opt-in)

## What changed

- New Admin module **Bàn giao sản phẩm → 🎞️ HLS / CDN 2.6** lists Drive video files associated with an event/product; attach one already-uploaded Cloudflare Stream **Video UID** to a Drive file. Mapping path: `amorriVideoStreams_v1/<eventId>/<productId>/<driveMediaId>`.
- API `GET/PUT/DELETE /api/video-streams/<eventId>` requires a Firebase Admin ID token (never relies on URL IDs as proof of permission). On PUT, server verifies **Drive video membership** and queries Cloudflare for `readyToStream=true` and `requireSignedURLs=true` before saving. No original media are edited/deleted.
- API `POST /api/delivery/<eventId>/playback`, using `x-amorri-delivery-token`, checks link expiration/revocation, booking product, Drive membership and mapping before issuing short-lived **signed HLS URL** (max default 3600 seconds, never beyond delivery-grant expiry). The Cloudflare **API token remains server-only**.
- Customer `ClientDelivery.tsx`: HLS.js where Media Source Extensions are supported; native HLS on Safari. 1080p is preferred if Cloudflare offers an exact 1080 rendition; uncheck to use auto quality. When no mapping exists or Stream fails, the existing Drive Range Proxy/iframe remains usable.
- Video segments and manifests come **directly from Cloudflare Stream**, not a Vercel Function, when mapped and configured. Only metadata/auth/ticket calls go to Vercel. Drive still stores the original file.

## Mandatory setup to enable HLS (not required for Drive fallback)

1. In Cloudflare Dashboard open **Stream** (separately billed service). Upload or import an authorized **1080p source** for each clip you want to accelerate. Wait until `Ready`.
2. Enable **Require signed URLs** for the video. Without this, 2.6 refuses linking because the Cloudflare video ID would be publicly playable.
3. From the Stream dashboard, copy **Cloudflare account ID**, API Token with scoped **Stream Read + Stream Write** permissions sufficient to view metadata and create signed viewing tokens, and the customer playback code from its Stream HLS URL (`customer-<CODE>.cloudflarestream.com`). Confirm exact permission names in your Cloudflare dashboard.
4. Vercel → Settings → Environment Variables: `CF_STREAM_ACCOUNT_ID` (Config), `CF_STREAM_API_TOKEN` (**Secret**), `CF_STREAM_CUSTOMER_CODE` (Config), optional `AMORRI_STREAM_TOKEN_TTL_SECONDS=3600`. Apply to Preview only first, then redeploy. **Do not** prefix them `NEXT_PUBLIC_`.
5. Amorri Studio Admin → **Bàn giao sản phẩm** → select event → **HLS / CDN 2.6**, paste **Video UID** (32 hexadecimal characters) matching the corresponding Google Drive clip, then **Lưu liên kết**. Do not paste the entire HLS URL or Google Drive ID.
6. Make a 2.5 private link, open it from a separate browser and test play/seek/comments at several timestamps. In browser Network, `.m3u8` and video segments should load from `cloudflarestream.com`, not `/api/drive-video`; if no mapping or failure, Drive is used.

### Additional configuration and operational constraints

- **Cloudflare Stream is a paid third-party service**, not bundled with the GitHub/Vercel project. This release does not automatically transfer files from Google Drive or generate/transcode videos. Storage/encoding must finish in Cloudflare first. No claimed measured savings until usage is observed.
- 1080p depends on the source, encoding pipeline, user bandwidth and device. The quality preference does **not guarantee** uninterrupted 1080p. Native Safari lets the platform choose HLS quality; forcing level may cause buffering on a slow network. Recording/export settings should be checked independently.
- HLS signed URLs are bearer tokens exposed to authorized client browsers. **Revoking a delivery link prevents issuing new playback tokens**, but an already-issued Stream token remains valid until its `exp`, up to the configured TTL (default up to one hour). Long-running playback may rebuffer when renewed; rotate grant on expired links. Previously shared Google Drive URLs retain their own access rules.
- Do **not** cache/store HLS manifests or proxy HLS segments in Vercel. Use direct Cloudflare Stream endpoints. The existing Google Drive Range Proxy still contributes traffic when used as fallback or by the old `/studio` page.
- Cloudflare allowed origins/CORS and authentication must be configured for your deployed domains. Because signed HLS is customer-bound, do not share these links without the grant. For greater scale, use your own Stream signing key to avoid token API rate limits.
- The rules proposal script will recommend `.read:false`, `.write:false` for `amorriVideoStreams_v1` (**staging only**); new mapping is accessed by Admin SDK and does not require browser RTDB access. The existing legacy security warning remains unchanged; do not apply a wholesale rules replacement on Production.

## QA required before Production

- `npm install`, `npm run typecheck`, `npm test`, `npm run build`, Playwright smoke tests on GitHub Actions.
- Test a private **Ready** Stream video in a staging event, link rotation, revoked/expired grants, cross-event/cross-product IDs, invalid video IDs, admin/non-admin access, missing Cloudflare env vars, no mapping fallback, Safari native HLS and desktop HLS.js.
- Confirm video media metadata and required resolution in Stream dashboard; use browser DevTools to measure playback rebuffer ratio at 1080p before committing rollout.
- Compare Vercel **Fast Origin Transfer** and Cloudflare Stream traffic; neither costs nor throughput are guaranteed by this source release alone.

## How to add a Firebase ID for staff

1. Firebase Console → project `ammori-c4905` → **Authentication → Users** → **Add user**. Create a distinct account (email and password) for each staff member.
2. Copy its **User UID** exactly (not Project ID, email, service-account identifier or Staff ID).
3. VNext Dashboard Admin → **Đội ngũ** → **Sửa** the pre-existing staff profile → paste into **Firebase Auth UID** → **Lưu cập nhật**. For a new staff profile: **Thêm nhân sự**, then fill Firebase Auth UID.
4. Staff member logs into `/staff` using that email/password. Confirm upcoming assignments and payroll show **only their own data**. Duplicate UID and nonexistent Firebase user are rejected server-side.
5. Do not link Admin UID to staff and do not share the Admin account. The original Staff ID remains unchanged; do not duplicate profiles just to add login access.
