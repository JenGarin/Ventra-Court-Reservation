-- Incremental migration for backend operational tables used by API v1.
-- Safe to run on existing projects that already applied initial schema.

alter table if exists public.bookings
  add column if not exists payment_due_at timestamptz;

create table if not exists public.coach_applications (
  id text primary key,
  coach_id text not null references public.app_users(id) on delete cascade,
  player_id text not null references public.app_users(id) on delete cascade,
  sport text not null,
  message text,
  preferred_schedule text,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id text primary key,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  actor_id text not null references public.app_users(id) on delete cascade,
  actor_role text not null check (actor_role in ('admin', 'staff', 'coach', 'player')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.booking_holds (
  id text primary key,
  court_id text not null references public.courts(id) on delete cascade,
  user_id text not null references public.app_users(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create table if not exists public.idempotency_records (
  id text primary key,
  request_hash text not null,
  response jsonb not null,
  status integer not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payment_transactions (
  id text primary key,
  booking_id text not null references public.bookings(id) on delete cascade,
  user_id text not null references public.app_users(id) on delete cascade,
  provider text not null check (provider in ('mock', 'gateway')),
  method text not null check (method in ('maya', 'gcash')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'PHP',
  status text not null check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'cancelled')),
  checkout_url text,
  provider_reference text,
  provider_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz,
  paid_at timestamptz
);

create index if not exists idx_coach_applications_coach_status on public.coach_applications(coach_id, status);
create index if not exists idx_coach_applications_player_status on public.coach_applications(player_id, status);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_booking_holds_slot on public.booking_holds(court_id, date, start_time, end_time);
create index if not exists idx_booking_holds_expires_at on public.booking_holds(expires_at);
create index if not exists idx_payment_transactions_booking on public.payment_transactions(booking_id, created_at desc);
create index if not exists idx_payment_transactions_user on public.payment_transactions(user_id, created_at desc);
create index if not exists idx_payment_transactions_status on public.payment_transactions(status, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_coach_applications_updated_at on public.coach_applications;
create trigger trg_coach_applications_updated_at
before update on public.coach_applications
for each row execute function public.set_updated_at();
