# Ventra

Ventra is a court reservation web app with a React frontend, a Supabase-backed API, and optional social login.

## Deployment Mode

This repository is now documented as backend-first:

- Real deployments should use the backend API and Supabase.
- The frontend no longer falls back to local demo data.
- The backend no longer auto-seeds demo users, courts, plans, or bookings.

## Frontend Environment

Copy [`.env.example`](./.env.example) to `.env` and configure:

- `VITE_USE_BACKEND_API=true`
- `VITE_SUPABASE_URL=<your-project-url>`
- `VITE_SUPABASE_ANON_KEY=<your-anon-key>`
- `VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1/server/api/v1`
- `VITE_ENABLE_SUPABASE_AUTH=true` if you want Google/Facebook OAuth
- `VITE_SITE_URL=https://<your-public-site>` for auth callback links

If you deploy the frontend on Vercel and want to keep `VITE_API_BASE_URL=/api/v1`, make sure `vercel.json` rewrites `/api/v1/*` to the Supabase function URL. This repo includes that rewrite for the current project.

## Backend Environment

Copy [`supabase/functions/server/.env.example`](./supabase/functions/server/.env.example) to `supabase/functions/server/.env` and configure:

- `AUTH_MODE=supabase`
- `SUPABASE_URL=<your-project-url>`
- `SUPABASE_ANON_KEY=<your-anon-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
- `ADMIN_SIGNUP_CODE=<strong-secret>`
- `AUTH_ALLOW_PRIVILEGED_SIGNUP=false` by default

Recommended hardening:

- `AUTH_REQUIRE_BEARER=true`
- set rate-limit env vars for auth, bookings, payments, and webhooks

## Database Setup

Run one of:

- [`supabase_schema.sql`](./supabase_schema.sql)
- [`supabase/migrations/20260222_init_ventra_relational.sql`](./supabase/migrations/20260222_init_ventra_relational.sql)

Then apply the incremental migrations in order:

1. `supabase/migrations/20260223_backend_operational_tables.sql`
2. `supabase/migrations/20260302_rls_policies.sql`
3. `supabase/migrations/20260302_app_users_privilege_guard.sql`
4. `supabase/migrations/20260302_booking_integrity_constraints.sql`
5. `supabase/migrations/20260302_booking_overlap_exclusion.sql`
6. `supabase/migrations/20260302_booking_holds_guard.sql`
7. `supabase/migrations/20260402_app_users_status.sql`

The schema no longer inserts demo rows automatically. Create real courts, plans, and admin accounts intentionally after setup.

## First Admin Account

You have two safe options:

1. Temporarily set `AUTH_ALLOW_PRIVILEGED_SIGNUP=true`, keep `ADMIN_SIGNUP_CODE` set in the backend env, create the first admin account from the app, then turn `AUTH_ALLOW_PRIVILEGED_SIGNUP` back to `false`.
2. Insert the first admin account through your controlled setup process and keep public privileged signup disabled.

## Local Development

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Run Supabase locally:

```bash
supabase start
supabase functions serve server --env-file supabase/functions/server/.env
```

## Health Check

The API health endpoint is:

```text
GET /api/v1/health
```

It reports storage mode, database health, auth mode, and password policy details.

## Production Notes

- Keep secrets only in backend environment variables, never in `VITE_` variables.
- Use Supabase Auth for OAuth and bearer-token verification.
- Do not rely on localStorage as the source of truth for bookings, users, courts, plans, payments, or notifications.
- Verify all auth redirect URLs in Supabase, Google Cloud Console, and Meta for Developers before launch.
