-- Prevent overlapping active bookings on the same court/date at DB level.

create extension if not exists btree_gist;

alter table public.bookings
  drop constraint if exists bookings_no_overlap_active;

alter table public.bookings
  add constraint bookings_no_overlap_active
  exclude using gist (
    court_id with =,
    date with =,
    int4range(
      public.time_to_minutes_24h(start_time),
      public.time_to_minutes_24h(end_time),
      '[)'
    ) with &&
  )
  where (status in ('pending', 'confirmed'));
