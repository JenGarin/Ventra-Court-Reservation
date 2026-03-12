-- Enforce booking hold integrity with server-side checks.

create or replace function public.guard_booking_holds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_start_min integer;
  slot_end_min integer;
  has_active_booking boolean;
  has_conflicting_hold boolean;
begin
  slot_start_min := public.time_to_minutes_24h(new.start_time);
  slot_end_min := public.time_to_minutes_24h(new.end_time);

  if slot_end_min <= slot_start_min then
    raise exception 'Invalid hold window: end_time must be after start_time'
      using errcode = '22023';
  end if;

  if new.expires_at <= now() then
    raise exception 'Hold already expired'
      using errcode = '22023';
  end if;

  if new.expires_at > now() + interval '30 minutes' then
    raise exception 'Hold expiry cannot exceed 30 minutes from now'
      using errcode = '22023';
  end if;

  if (new.date::text || 'T' || new.end_time || ':00')::timestamptz <= now() then
    raise exception 'Cannot hold a past time slot'
      using errcode = '22023';
  end if;

  -- Remove stale holds so they never block fresh reservations.
  delete from public.booking_holds where expires_at <= now();

  select exists (
    select 1
    from public.bookings b
    where b.court_id = new.court_id
      and b.date = new.date
      and b.status in ('pending', 'confirmed')
      and int4range(public.time_to_minutes_24h(b.start_time), public.time_to_minutes_24h(b.end_time), '[)')
          && int4range(slot_start_min, slot_end_min, '[)')
  ) into has_active_booking;

  if has_active_booking then
    raise exception 'Hold conflicts with an active booking'
      using errcode = '23505';
  end if;

  select exists (
    select 1
    from public.booking_holds h
    where h.court_id = new.court_id
      and h.date = new.date
      and h.expires_at > now()
      and h.user_id <> new.user_id
      and int4range(public.time_to_minutes_24h(h.start_time), public.time_to_minutes_24h(h.end_time), '[)')
          && int4range(slot_start_min, slot_end_min, '[)')
      and (tg_op = 'INSERT' or h.id <> coalesce(new.id, ''))
  ) into has_conflicting_hold;

  if has_conflicting_hold then
    raise exception 'Hold conflicts with another active hold'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_booking_holds on public.booking_holds;
create trigger trg_guard_booking_holds
before insert or update on public.booking_holds
for each row execute function public.guard_booking_holds();
