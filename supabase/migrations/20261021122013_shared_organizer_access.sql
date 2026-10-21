-- Organisers share all tournaments. Public accounts do not receive admin access.
insert into public.global_admins(user_id, role, status, approved_at)
select distinct user_id, 'admin', 'approved', now() from public.tournament_admins
on conflict (user_id) do nothing;

create or replace function public.is_tournament_admin(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select (select public.is_global_admin()); $$;
create or replace function public.is_tournament_owner(p_tournament_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select (select public.is_global_admin()); $$;
revoke all on function public.is_tournament_admin(uuid), public.is_tournament_owner(uuid) from public, anon;
grant execute on function public.is_tournament_admin(uuid), public.is_tournament_owner(uuid) to authenticated;

-- Keep validation and bracket creation intact, updating only the access gate.
do $$
declare v_function regprocedure; v_definition text;
begin
  foreach v_function in array array[
    'public.create_flexible_tournament(text,text,text,timestamptz,text,integer,text,integer,integer)'::regprocedure,
    'public.create_tournament_with_bracket(text,text,text,timestamptz,integer)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    if position('if not exists (select 1 from public.tournament_admins where user_id = v_user_id and role = ''owner'')' in v_definition) = 0 then
      raise exception 'Unexpected tournament creation definition';
    end if;
    v_definition := replace(v_definition,
      'if not exists (select 1 from public.tournament_admins where user_id = v_user_id and role = ''owner'')',
      'if not (select public.is_global_admin())');
    execute v_definition;
  end loop;
end;
$$;

create schema if not exists organizer_private;
revoke all on schema organizer_private from public, anon, authenticated;
create table organizer_private.logins (
  username text primary key check (username = lower(username)),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
create table organizer_private.login_attempts (
  id integer primary key check (id = 1),
  started_at timestamptz not null,
  attempts integer not null
);
alter table organizer_private.logins enable row level security;
alter table organizer_private.login_attempts enable row level security;
revoke all on organizer_private.logins, organizer_private.login_attempts from public, anon, authenticated;

-- An existing organiser identity retains its password and sessions.
-- The alias is server-only and does not expose its underlying Auth email.
insert into organizer_private.logins(username, user_id)
select 'kyngadmin', user_id from public.global_admins
where status = 'approved' and role = 'superadmin'
order by requested_at, user_id limit 1;

do $$ begin
  if not exists (select 1 from organizer_private.logins where username='kyngadmin') then
    raise exception 'An approved organiser is required';
  end if;
end; $$;

create function public.resolve_organizer_login(p_username text)
returns table(user_id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email::text from organizer_private.logins l
  join auth.users u on u.id=l.user_id
  join public.global_admins g on g.user_id=u.id and g.status='approved'
  where l.username=lower(trim(p_username));
$$;
create function public.consume_organizer_login_attempt()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_attempts integer;
begin
  insert into organizer_private.login_attempts as current_attempt (id, started_at, attempts)
  values (1, now(), 1)
  on conflict (id) do update set
    started_at=case when current_attempt.started_at <= now()-interval '1 minute' then now() else current_attempt.started_at end,
    attempts=case when current_attempt.started_at <= now()-interval '1 minute' then 1 else current_attempt.attempts+1 end
  returning attempts into v_attempts;
  return v_attempts <= 10;
end;
$$;
revoke all on function public.resolve_organizer_login(text), public.consume_organizer_login_attempt() from public, anon, authenticated;
grant execute on function public.resolve_organizer_login(text), public.consume_organizer_login_attempt() to service_role;
