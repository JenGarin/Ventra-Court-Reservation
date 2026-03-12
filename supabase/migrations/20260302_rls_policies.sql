-- Row Level Security (RLS) hardening for Ventra tables.
-- This migration adds helper auth functions and table policies.

create or replace function public.current_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.uid()::text, '');
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.app_users
  where id = auth.uid()::text
  limit 1;
$$;

create or replace function public.is_admin_or_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'staff'), false);
$$;

revoke all on function public.current_user_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.is_admin_or_staff() from public;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin_or_staff() to authenticated;

alter table public.app_users enable row level security;
alter table public.courts enable row level security;
alter table public.bookings enable row level security;
alter table public.membership_plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.coach_applications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.booking_holds enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.payment_transactions enable row level security;

drop policy if exists app_users_select on public.app_users;
create policy app_users_select
on public.app_users
for select
to authenticated
using (
  public.is_admin_or_staff()
  or id = public.current_user_id()
);

drop policy if exists app_users_update on public.app_users;
create policy app_users_update
on public.app_users
for update
to authenticated
using (
  public.is_admin_or_staff()
  or id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or id = public.current_user_id()
);

drop policy if exists courts_select on public.courts;
create policy courts_select
on public.courts
for select
to authenticated
using (true);

drop policy if exists courts_write on public.courts;
create policy courts_write
on public.courts
for all
to authenticated
using (public.is_admin_or_staff())
with check (public.is_admin_or_staff());

drop policy if exists bookings_select on public.bookings;
create policy bookings_select
on public.bookings
for select
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
  or coach_id = public.current_user_id()
);

drop policy if exists bookings_insert on public.bookings;
create policy bookings_insert
on public.bookings
for insert
to authenticated
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists bookings_update on public.bookings;
create policy bookings_update
on public.bookings
for update
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
  or coach_id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
  or coach_id = public.current_user_id()
);

drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete
on public.bookings
for delete
to authenticated
using (public.is_admin_or_staff());

drop policy if exists membership_plans_select on public.membership_plans;
create policy membership_plans_select
on public.membership_plans
for select
to authenticated
using (true);

drop policy if exists membership_plans_write on public.membership_plans;
create policy membership_plans_write
on public.membership_plans
for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select
on public.subscriptions
for select
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists subscriptions_insert on public.subscriptions;
create policy subscriptions_insert
on public.subscriptions
for insert
to authenticated
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists subscriptions_update on public.subscriptions;
create policy subscriptions_update
on public.subscriptions
for update
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists notifications_select on public.notifications;
create policy notifications_select
on public.notifications
for select
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert
on public.notifications
for insert
to authenticated
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update
on public.notifications
for update
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists coach_applications_select on public.coach_applications;
create policy coach_applications_select
on public.coach_applications
for select
to authenticated
using (
  public.is_admin_or_staff()
  or coach_id = public.current_user_id()
  or player_id = public.current_user_id()
);

drop policy if exists coach_applications_insert on public.coach_applications;
create policy coach_applications_insert
on public.coach_applications
for insert
to authenticated
with check (
  public.is_admin_or_staff()
  or player_id = public.current_user_id()
);

drop policy if exists coach_applications_update on public.coach_applications;
create policy coach_applications_update
on public.coach_applications
for update
to authenticated
using (
  public.is_admin_or_staff()
  or coach_id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or coach_id = public.current_user_id()
);

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select
on public.audit_logs
for select
to authenticated
using (public.is_admin_or_staff());

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert
on public.audit_logs
for insert
to authenticated
with check (public.is_admin_or_staff());

drop policy if exists booking_holds_select on public.booking_holds;
create policy booking_holds_select
on public.booking_holds
for select
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists booking_holds_insert on public.booking_holds;
create policy booking_holds_insert
on public.booking_holds
for insert
to authenticated
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists booking_holds_update on public.booking_holds;
create policy booking_holds_update
on public.booking_holds
for update
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists booking_holds_delete on public.booking_holds;
create policy booking_holds_delete
on public.booking_holds
for delete
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists idempotency_records_select on public.idempotency_records;
create policy idempotency_records_select
on public.idempotency_records
for select
to authenticated
using (public.is_admin_or_staff());

drop policy if exists idempotency_records_insert on public.idempotency_records;
create policy idempotency_records_insert
on public.idempotency_records
for insert
to authenticated
with check (public.is_admin_or_staff());

drop policy if exists payment_transactions_select on public.payment_transactions;
create policy payment_transactions_select
on public.payment_transactions
for select
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists payment_transactions_insert on public.payment_transactions;
create policy payment_transactions_insert
on public.payment_transactions
for insert
to authenticated
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);

drop policy if exists payment_transactions_update on public.payment_transactions;
create policy payment_transactions_update
on public.payment_transactions
for update
to authenticated
using (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
)
with check (
  public.is_admin_or_staff()
  or user_id = public.current_user_id()
);
