# Ventra

Ventra is a standalone web app for court reservations, coach hiring, sessions, and check-in workflows.

## Run Locally (Standalone)

1. Install dependencies:
   - `npm install`
   - Recommended: use Node.js 20.x (LTS). See `.nvmrc`.
2. Start the app:
   - `npm run dev`
3. Open:
   - `http://localhost:5173`
   - `http://<your-local-ip>:5173` (from other devices on same Wi-Fi)

This works as a standalone website using local app storage (no backend required for core flows).

## Access From Any Device (LAN)

To open the website on phones/tablets in the same Wi-Fi network:

1. Start the app:
   - `npm run dev`
2. Find your computer IP (example `192.168.1.20`).
3. Open from another device browser:
   - `http://192.168.1.20:5173`
4. Set QR public URL so scanned QR opens correctly on other devices:
   - `VITE_PUBLIC_BASE_URL=http://192.168.1.20:5173`

Note: Make sure Windows Firewall allows Node.js on Private networks for LAN access.

## Build and Preview

1. Create a production build:
   - `npm run build`
2. Preview the built site:
   - `npm run preview`

## Optional: Enable Supabase Social Login

By default, social login is disabled for standalone mode.

To enable it, set:
- `VITE_ENABLE_SUPABASE_AUTH=true`
- `VITE_SUPABASE_URL=<your-supabase-url>`
- `VITE_SUPABASE_ANON_KEY=<your-anon-key>`

Note: if `VITE_ENABLE_SUPABASE_AUTH=true` and the Supabase env vars are missing, the app will fail fast at startup.

For web OAuth, configure these URLs as well:

1. In Supabase `Authentication -> URL Configuration`
   - `Site URL`: `http://localhost:5173`
   - Additional Redirect URL: `http://localhost:5173/auth/callback`

2. In Google Cloud Console for your OAuth client
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`

3. In Meta for Developers for Facebook Login
   - Valid OAuth Redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`

Important:
- Google/Facebook must be enabled in `Supabase -> Authentication -> Providers`.
- The provider callback in Google/Meta is the Supabase callback, not your local Vite URL.
- Your browser app redirect stays `http://localhost:5173/auth/callback`.
- If your deploy URL differs from the current browser origin, set `VITE_SITE_URL` so auth redirects use the correct public origin.

## Optional: Use Backend API

Frontend can run in API-backed mode (for requests, notifications, and subscriptions) by setting:
- `VITE_USE_BACKEND_API=true`
- `VITE_API_BASE_URL=<your-api-base-url>`

Production note:
- If `VITE_API_BASE_URL` is not set in a production build and `VITE_SUPABASE_URL` is set, the frontend defaults to calling
  `https://<project-ref>.supabase.co/functions/v1/server/api/v1` automatically.

Local dev options:
- Direct mode (no proxy): `VITE_API_BASE_URL=http://localhost:54321/functions/v1/server/api/v1`
- Proxy mode (recommended): keep `VITE_API_BASE_URL=/api/v1` and set `VITE_API_PROXY_TARGET=http://localhost:54321`

To run the backend locally with Supabase CLI:
- `supabase start`
- Copy `supabase/functions/server/.env.example` to `supabase/functions/server/.env` and fill values
- `supabase functions serve server --env-file supabase/functions/server/.env`

When API mode is enabled, the app now uses backend endpoints for:
- login/signup/logout
- loading users/courts/bookings/plans/notifications
- create/update/approve/cancel/check-in booking flows
- join session and mark-all-notifications-read

For true multi-device shared bookings/data, enable backend API mode so all devices read/write the same data source.

Important: backend persistence depends on Supabase server env vars. If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are not set for the `server` edge function, it falls back to an in-memory store (data resets when the function restarts).
Check `GET /api/v1/health` for the current `storage` mode and `db.missingTables` (indicates migrations not yet applied).

Optional: switch backend auth from mock tokens to Supabase Auth by setting `AUTH_MODE=supabase` and providing
`SUPABASE_ANON_KEY` (plus `SUPABASE_SERVICE_ROLE_KEY` for bearer token verification and password changes).

Notes:
- In `AUTH_MODE=mock`, passwords are stored as hashed credentials (PBKDF2) for better safety during local dev.
- In `AUTH_MODE=supabase`, approving a coach registration creates a Supabase Auth user (service role) and triggers a password reset email (SMTP must be configured in Supabase).

## Backend Completion Notes

The backend now includes:
- full role-based booking lifecycle (`pending -> confirmed/cancelled/completed/no_show`)
- coach profile + verification workflow
- notifications with unread count and mark-read endpoints
- training session join/leave flows
- receipt endpoint per booking: `GET /api/v1/bookings/:id/receipt`
- public QR receipt endpoint: `GET /api/v1/public/receipts/:token`
- payment status workflow endpoint: `POST /api/v1/bookings/:id/payment`
- payment checkout endpoint (player/admin/staff):
  - `POST /api/v1/payments/checkout` with `{ "bookingId": "...", "method": "maya|gcash" }`
- payment transaction query endpoints:
  - `GET /api/v1/payments` (own payments; admin/staff can query all)
  - `GET /api/v1/payments/:id` (own payment detail; admin/staff can query any)
  - `POST /api/v1/payments/:id/retry` (owner/admin/staff; retries failed/expired/cancelled transaction)
- payment webhook endpoint:
  - `POST /api/v1/payments/webhook` (provider callback)
  - webhook event dedupe supported via `eventId` / `id` / `data.id` to avoid duplicate side effects
- stale payment session operations endpoint (admin/staff):
  - `POST /api/v1/admin/payments/expire-stale`
  - body: `{"dryRun":true|false,"olderThanMinutes":180,"referenceNow":"<iso-optional>"}`
- payment health metrics endpoint (admin/staff):
  - `GET /api/v1/admin/payments/health?days=7`
  - returns status distribution, retry/stale-expired counts, rates, and mismatch counters
- payment deadline management endpoint (admin/staff):
  - `POST /api/v1/bookings/:id/payment-deadline`
  - modes: `{"clear": true}` or `{"ttlMinutes": 45}` or `{"dueAt":"<iso>"}` (exactly one)
- unpaid payment-deadline monitoring endpoint (admin/staff):
  - `GET /api/v1/admin/bookings/unpaid-monitor?status=all|overdue|at_risk&windowMinutes=120&referenceNow=<iso>`
- payment reconciliation endpoint (admin/staff):
  - `GET /api/v1/admin/payments/reconciliation?issueType=paid_tx_booking_unpaid|booking_paid_without_paid_tx|confirmed_unpaid_without_tx|orphan_tx_booking_missing&page=1&limit=20`
  - `GET /api/v1/admin/payments/reconciliation/export?format=json|csv&issueType=...`
  - `POST /api/v1/admin/payments/reconciliation/resolve` with body:
    - `{"issueType":"paid_tx_booking_unpaid","bookingId":"...","dryRun":true|false}`
    - `{"issueType":"booking_paid_without_paid_tx","bookingId":"...","dryRun":true|false}`
    - `{"issueType":"confirmed_unpaid_without_tx","bookingId":"...","dryRun":true|false}`
    - `{"issueType":"orphan_tx_booking_missing","txId":"...","dryRun":true|false}`
  - `POST /api/v1/admin/payments/reconciliation/resolve/bulk` with body:
    - `{"dryRun":true|false,"items":[{"issueType":"...","bookingId":"..."},{"issueType":"...","txId":"..."}]}`
  - `POST /api/v1/admin/payments/reconciliation/resolve/by-filter` with body:
    - `{"issueType":"paid_tx_booking_unpaid|booking_paid_without_paid_tx|confirmed_unpaid_without_tx|orphan_tx_booking_missing","maxItems":20,"dryRun":true|false}`
- unified booking status transition endpoint (admin/staff):
  - `PATCH /api/v1/bookings/:id/status`
  - allowed transitions: `pending -> confirmed|cancelled`, `confirmed -> cancelled|completed|no_show`
- booking timeline endpoint:
  - `GET /api/v1/bookings/:id/timeline?order=asc|desc`
  - returns synthetic `booking_created` event + all booking audit actions with actor details
- temporary slot holds (to reduce reservation race conflicts):
  - `POST /api/v1/bookings/holds` (create 1-30 min hold; default 10)
  - `GET /api/v1/bookings/holds/me` (list current user's active holds)
  - `DELETE /api/v1/bookings/holds/:id` (release hold)
  - booking create now rejects slots held by another user and consumes your own overlapping hold
- reservation history endpoint with active/past split + counters:
  - `GET /api/v1/bookings/history?view=active|past|all`
  - defaults to done-only past history (`completed`), with optional `includeNoShow=true` and `includeCancelled=true`
- coach application pipeline:
  - `POST /api/v1/coach/applications` (player applies)
  - `GET /api/v1/coach/applications/me` (player status tracking)
  - `GET /api/v1/coach/applications` (coach inbox)
  - `POST /api/v1/coach/applications/:id/approve`
  - `POST /api/v1/coach/applications/:id/reject`
  - `GET /api/v1/coach/students` (approved students list)
- session auto-enrollment support by sport:
  - `GET /api/v1/coach/sessions/eligible-students?sport=...` or `?courtId=...`
  - `POST /api/v1/coach/sessions` auto-adds approved students matching session sport
- coach attendance tracking and reporting:
  - `GET /api/v1/coach/sessions/:id/attendance`
  - `POST /api/v1/coach/sessions/:id/attendance`
  - `GET /api/v1/coach/reports/attendance`
- admin/staff attendance analytics:
  - `GET /api/v1/analytics/attendance/overview`
  - `GET /api/v1/analytics/coaches/:coachId/attendance`
  - `GET /api/v1/analytics/courts/:courtId/attendance`
- audit logs:
  - `GET /api/v1/admin/audit-logs` (admin/staff, filter + pagination)
  - `GET /api/v1/admin/audit-logs/export` (admin/staff, `format=json|csv`)
  - `POST /api/v1/admin/audit-logs/purge` (admin only, supports dry-run)

For absolute QR/receipt targets across devices, set:
- `PUBLIC_APP_BASE_URL=http://<your-ip-or-domain>`
- optional strict auth hardening:
  - `AUTH_REQUIRE_BEARER=true` (rejects header-only `x-user-id` auth and requires `Authorization: Bearer ...`)
  - default behavior: if `AUTH_MODE=supabase` and `AUTH_REQUIRE_BEARER` is unset, bearer auth is required
- optional rate limiting hardening:
  - `RATE_LIMIT_AUTH_LOGIN_MAX`, `RATE_LIMIT_AUTH_LOGIN_WINDOW_SEC`
  - `RATE_LIMIT_AUTH_SIGNUP_MAX`, `RATE_LIMIT_AUTH_SIGNUP_WINDOW_SEC`
  - `RATE_LIMIT_AUTH_OAUTH_START_MAX`, `RATE_LIMIT_AUTH_OAUTH_START_WINDOW_SEC`
  - `RATE_LIMIT_BOOKING_CREATE_MAX`, `RATE_LIMIT_BOOKING_CREATE_WINDOW_SEC`
  - `RATE_LIMIT_PAYMENT_CHECKOUT_MAX`, `RATE_LIMIT_PAYMENT_CHECKOUT_WINDOW_SEC`
  - `RATE_LIMIT_PAYMENT_WEBHOOK_MAX`, `RATE_LIMIT_PAYMENT_WEBHOOK_WINDOW_SEC`

## Database Setup (Supabase)

This project now includes a relational schema for users, courts, bookings, plans, subscriptions, and notifications.

Use one of these:
- `supabase_schema.sql` (run directly in Supabase SQL Editor)
- `supabase/migrations/20260222_init_ventra_relational.sql` (for migration workflow)

Then apply incremental migrations in order:
1. `supabase/migrations/20260223_backend_operational_tables.sql`
2. `supabase/migrations/20260302_rls_policies.sql`
3. `supabase/migrations/20260302_app_users_privilege_guard.sql`
4. `supabase/migrations/20260302_booking_integrity_constraints.sql`
5. `supabase/migrations/20260302_booking_overlap_exclusion.sql`
6. `supabase/migrations/20260302_booking_holds_guard.sql`

These migrations add:
- RLS policies for core + operational tables
- self-privilege escalation guards for `app_users`
- DB constraints for booking time/duration consistency
- exclusion-based overlap protection for active bookings
- hold conflict/expiry validation trigger

After running schema SQL, your DB will include seeded records:
- Users: `admin-1`, `staff-1`, `coach-1`, `player-1`
- Courts: `c1`, `c2`, `c3`
- Plans: `m1`, `m2`
#   V e n t r a - C o u r t - R e s e r v a t i o n  
 
