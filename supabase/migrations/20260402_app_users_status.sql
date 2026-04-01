-- Adds a persistent user status field used by coach approval gating.
-- Safe to run multiple times.

alter table if exists public.app_users
  add column if not exists status text not null default 'active'
  check (status in ('active', 'pending'));

-- Best-effort backfill: if a coach verification is pending, mark status pending.
update public.app_users
set status = 'pending'
where role = 'coach'
  and coalesce(coach_verification_status, '') = 'pending';

