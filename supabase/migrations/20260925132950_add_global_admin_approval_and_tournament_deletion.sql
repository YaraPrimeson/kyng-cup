create table public.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('superadmin', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

alter table public.global_admins enable row level security;
revoke all on public.global_admins from public, anon, authenticated;

-- Existing tournament owners become the initial super administrators. This
-- bootstraps the approval flow without relying on editable JWT metadata.
insert into public.global_admins (user_id, role, status, approved_at)
select distinct user_id, 'superadmin', 'approved', now()
from public.tournament_admins
where role = 'owner'
on conflict (user_id) do update
set role = 'superadmin', status = 'approved', approved_at = coalesce(public.global_admins.approved_at, now());

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.global_admins
    where user_id = (select auth.uid()) and status = 'approved'
  );
$$;

create or replace function public.is_global_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.global_admins
    where user_id = (select auth.uid()) and status = 'approved' and role = 'superadmin'
  );
$$;

create or replace function public.is_tournament_admin(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_global_admin()) or exists (
    select 1 from public.tournament_admins
    where tournament_id = p_tournament_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_tournament_owner(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_global_superadmin()) or exists (
    select 1 from public.tournament_admins
    where tournament_id = p_tournament_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

create or replace function public.request_global_admin_access()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status text;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  insert into public.global_admins (user_id, role, status)
  values (v_user_id, 'admin', 'pending')
  on conflict (user_id) do nothing;
  select status into v_status from public.global_admins where user_id = v_user_id;
  return v_status;
end;
$$;

create or replace function public.get_global_admin_access()
returns table(role text, status text, requested_at timestamptz, approved_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select ga.role, ga.status, ga.requested_at, ga.approved_at
  from public.global_admins ga
  where ga.user_id = (select auth.uid());
$$;

create or replace function public.list_global_admin_requests()
returns table(user_id uuid, email text, requested_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_global_superadmin()) then raise exception 'Super administrator access required'; end if;
  return query
  select ga.user_id, u.email::text, ga.requested_at
  from public.global_admins ga
  join auth.users u on u.id = ga.user_id
  where ga.status = 'pending'
  order by ga.requested_at;
end;
$$;

create or replace function public.approve_global_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_global_superadmin()) then raise exception 'Super administrator access required'; end if;
  update public.global_admins
  set status = 'approved', role = 'admin', approved_at = now(), approved_by = (select auth.uid())
  where user_id = p_user_id and status = 'pending';
  if not found then raise exception 'Pending administrator request not found'; end if;
end;
$$;

create or replace function public.list_managed_tournaments()
returns table(
  id uuid, slug text, name text, sport text, location text,
  starts_at timestamptz, ends_at timestamptz, bracket_size integer,
  status text, registration_status text, updated_at timestamptz, role text
)
language sql
security definer
set search_path = ''
as $$
  select
    t.id, t.slug, t.name, t.sport, t.location, t.starts_at, t.ends_at,
    t.bracket_size, t.status, t.registration_status, t.updated_at,
    case
      when (select public.is_global_superadmin()) then 'owner'
      when (select public.is_global_admin()) then 'admin'
      else ta.role
    end as role
  from public.tournaments t
  left join public.tournament_admins ta
    on ta.tournament_id = t.id and ta.user_id = (select auth.uid())
  where (select public.is_global_admin()) or ta.user_id is not null
  order by t.created_at desc;
$$;

create or replace function public.delete_tournament(p_tournament_id uuid, p_confirmation_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not (select public.is_global_admin()) then raise exception 'Global administrator access required'; end if;
  select name into v_name from public.tournaments where id = p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if p_confirmation_name is distinct from v_name then raise exception 'Tournament name confirmation does not match'; end if;
  delete from public.tournaments where id = p_tournament_id;
end;
$$;

revoke all on function public.is_global_admin() from public, anon;
revoke all on function public.is_global_superadmin() from public, anon;
revoke all on function public.request_global_admin_access() from public, anon;
revoke all on function public.get_global_admin_access() from public, anon;
revoke all on function public.list_global_admin_requests() from public, anon;
revoke all on function public.approve_global_admin(uuid) from public, anon;
revoke all on function public.list_managed_tournaments() from public, anon;
revoke all on function public.delete_tournament(uuid, text) from public, anon;
revoke all on function public.is_tournament_admin(uuid) from public, anon;
revoke all on function public.is_tournament_owner(uuid) from public, anon;

grant execute on function public.is_global_admin() to authenticated;
grant execute on function public.is_global_superadmin() to authenticated;
grant execute on function public.request_global_admin_access() to authenticated;
grant execute on function public.get_global_admin_access() to authenticated;
grant execute on function public.list_global_admin_requests() to authenticated;
grant execute on function public.approve_global_admin(uuid) to authenticated;
grant execute on function public.list_managed_tournaments() to authenticated;
grant execute on function public.delete_tournament(uuid, text) to authenticated;
grant execute on function public.is_tournament_admin(uuid) to authenticated;
grant execute on function public.is_tournament_owner(uuid) to authenticated;
