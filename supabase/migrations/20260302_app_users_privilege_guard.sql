-- Prevent authenticated non-admin users from escalating privileges via direct SQL updates.

create or replace function public.guard_app_users_sensitive_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow service/seed operations where auth context is not set.
  if auth.uid() is null then
    return new;
  end if;

  -- Admin/staff can manage user records.
  if public.is_admin_or_staff() then
    return new;
  end if;

  -- Non-admin users can only update their own row.
  if old.id <> auth.uid()::text then
    raise exception 'FORBIDDEN: cannot update another user profile'
      using errcode = '42501';
  end if;

  -- Block direct privilege and identity escalation fields.
  if new.id is distinct from old.id then
    raise exception 'FORBIDDEN: id is immutable'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    raise exception 'FORBIDDEN: role cannot be changed by non-admin users'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'FORBIDDEN: email cannot be changed by non-admin users'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'FORBIDDEN: created_at is immutable'
      using errcode = '42501';
  end if;

  -- Coaches can submit verification details, but only admin/staff can mark verified/rejected.
  if new.coach_verification_status is distinct from old.coach_verification_status
     and new.coach_verification_status in ('verified', 'rejected') then
    raise exception 'FORBIDDEN: verification approval status is admin/staff only'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_app_users_sensitive_updates on public.app_users;
create trigger trg_guard_app_users_sensitive_updates
before update on public.app_users
for each row execute function public.guard_app_users_sensitive_updates();
