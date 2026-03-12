-- DB-level integrity checks for bookings/holds plus idempotency uniqueness.

create or replace function public.time_to_minutes_24h(value text)
returns integer
language plpgsql
immutable
strict
as $$
declare
  h integer;
  m integer;
begin
  if value is null or value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Invalid HH:MM time value: %', value
      using errcode = '22007';
  end if;

  h := split_part(value, ':', 1)::integer;
  m := split_part(value, ':', 2)::integer;
  return (h * 60) + m;
end;
$$;

create unique index if not exists uq_idempotency_records_request_hash
  on public.idempotency_records (request_hash);

alter table public.bookings
  drop constraint if exists bookings_start_time_format_chk,
  drop constraint if exists bookings_end_time_format_chk,
  drop constraint if exists bookings_time_order_chk,
  drop constraint if exists bookings_duration_matches_window_chk;

alter table public.bookings
  add constraint bookings_start_time_format_chk
    check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint bookings_end_time_format_chk
    check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint bookings_time_order_chk
    check (public.time_to_minutes_24h(end_time) > public.time_to_minutes_24h(start_time)),
  add constraint bookings_duration_matches_window_chk
    check (duration = public.time_to_minutes_24h(end_time) - public.time_to_minutes_24h(start_time));

alter table public.booking_holds
  drop constraint if exists booking_holds_start_time_format_chk,
  drop constraint if exists booking_holds_end_time_format_chk,
  drop constraint if exists booking_holds_time_order_chk;

alter table public.booking_holds
  add constraint booking_holds_start_time_format_chk
    check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint booking_holds_end_time_format_chk
    check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint booking_holds_time_order_chk
    check (public.time_to_minutes_24h(end_time) > public.time_to_minutes_24h(start_time));
