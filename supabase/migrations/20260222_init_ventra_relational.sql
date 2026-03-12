-- Ventra relational schema migration.
-- Same content as supabase_schema.sql for CLI-based migration workflows.

create extension if not exists pgcrypto;

create table if not exists public.kv_store_ce0562bb (
  key text primary key,
  value jsonb not null
);

create table if not exists public.app_users (
  id text primary key,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'staff', 'coach', 'player')),
  phone text,
  avatar text,
  skill_level text,
  coach_profile text,
  coach_expertise text[] default '{}',
  coach_verification_status text check (coach_verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  coach_verification_method text check (coach_verification_method in ('certification', 'license', 'experience', 'other')),
  coach_verification_document_name text,
  coach_verification_id text,
  coach_verification_notes text,
  coach_verification_submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.courts (
  id text primary key,
  name text not null,
  court_number text not null,
  type text not null check (type in ('indoor', 'outdoor')),
  surface_type text not null check (surface_type in ('hardcourt', 'clay', 'grass', 'synthetic', 'wood', 'concrete')),
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  peak_hour_rate numeric(12,2) check (peak_hour_rate is null or peak_hour_rate >= 0),
  status text not null default 'active' check (status in ('active', 'maintenance', 'disabled')),
  operating_hours jsonb not null default '{"start":"07:00","end":"22:00"}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.bookings (
  id text primary key,
  court_id text not null references public.courts(id) on delete cascade,
  user_id text not null references public.app_users(id) on delete cascade,
  type text not null check (type in ('open_play', 'private', 'training')),
  date date not null,
  start_time text not null,
  end_time text not null,
  duration integer not null check (duration > 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  players text[] default '{}',
  max_players integer default 4 check (max_players is null or max_players > 0),
  coach_id text references public.app_users(id) on delete set null,
  sport text,
  attendance jsonb not null default '{}'::jsonb,
  notes text,
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  rejection_reason text,
  payment_due_at timestamptz,
  receipt_token text unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.membership_plans (
  id text primary key,
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  interval text not null check (interval in ('month', 'year')),
  tier text not null check (tier in ('basic', 'premium', 'elite')),
  description text,
  features text[] default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  plan_id text not null references public.membership_plans(id) on delete restrict,
  payment_method text not null default 'card',
  status text not null check (status in ('active', 'cancelled', 'expired')),
  created_at timestamptz not null default timezone('utc', now()),
  cancelled_at timestamptz
);

create table if not exists public.notifications (
  id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null check (type in ('info', 'success', 'warning')),
  read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

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

create index if not exists idx_app_users_role on public.app_users(role);
create index if not exists idx_bookings_user_id on public.bookings(user_id);
create index if not exists idx_bookings_court_date on public.bookings(court_id, date);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index if not exists idx_subscriptions_user_status on public.subscriptions(user_id, status);
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

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists trg_courts_updated_at on public.courts;
create trigger trg_courts_updated_at
before update on public.courts
for each row execute function public.set_updated_at();

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

drop trigger if exists trg_membership_plans_updated_at on public.membership_plans;
create trigger trg_membership_plans_updated_at
before update on public.membership_plans
for each row execute function public.set_updated_at();

drop trigger if exists trg_coach_applications_updated_at on public.coach_applications;
create trigger trg_coach_applications_updated_at
before update on public.coach_applications
for each row execute function public.set_updated_at();

insert into public.app_users (id, email, name, role, phone, skill_level)
values
  ('admin-1', 'admin@court.com', 'Admin User', 'admin', '123-456-7890', 'expert'),
  ('staff-1', 'staff@court.com', 'Staff Member', 'staff', '123-456-7890', 'advanced'),
  ('coach-1', 'coach@court.com', 'Coach Mike', 'coach', '123-456-7890', 'expert'),
  ('player-1', 'player@court.com', 'Alex Johnson', 'player', '123-456-7890', 'intermediate')
on conflict (id) do update
set
  email = excluded.email,
  name = excluded.name,
  role = excluded.role;

update public.app_users
set
  coach_profile = 'Experienced development coach focused on fundamentals and game IQ.',
  coach_expertise = array['Basketball', 'Athlete Development'],
  coach_verification_status = 'verified',
  coach_verification_method = 'certification',
  coach_verification_document_name = 'National Coaching Certification',
  coach_verification_id = 'NCC-1024',
  coach_verification_notes = 'Validated by club management.',
  coach_verification_submitted_at = timezone('utc', now())
where id = 'coach-1';

insert into public.courts (
  id,
  name,
  court_number,
  type,
  surface_type,
  hourly_rate,
  peak_hour_rate,
  status,
  operating_hours
)
values
  ('c1', 'Downtown Basketball Court A', '1', 'indoor', 'hardcourt', 500, 700, 'active', '{"start":"06:00","end":"22:00"}'::jsonb),
  ('c2', 'Riverside Tennis Court 1', '2', 'indoor', 'synthetic', 500, 700, 'active', '{"start":"06:00","end":"22:00"}'::jsonb),
  ('c3', 'Pickle Ball Court 1', '3', 'outdoor', 'hardcourt', 300, 450, 'active', '{"start":"06:00","end":"18:00"}'::jsonb)
on conflict (id) do update
set
  name = excluded.name,
  court_number = excluded.court_number,
  type = excluded.type,
  surface_type = excluded.surface_type,
  hourly_rate = excluded.hourly_rate,
  peak_hour_rate = excluded.peak_hour_rate,
  status = excluded.status,
  operating_hours = excluded.operating_hours;

insert into public.membership_plans (id, name, price, interval, tier, description, features)
values
  ('m1', 'Basic', 1000, 'month', 'basic', 'Access to outdoor courts', array['Outdoor court access', '7 day advance booking']),
  ('m2', 'Pro', 2500, 'month', 'premium', 'All access pass', array['All courts access', '14 day advance booking', 'Priority support'])
on conflict (id) do update
set
  name = excluded.name,
  price = excluded.price,
  interval = excluded.interval,
  tier = excluded.tier,
  description = excluded.description,
  features = excluded.features;

