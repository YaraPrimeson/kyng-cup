alter table public.tournament_admins
  add column if not exists role text not null default 'admin';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tournament_admins_role_check'
      and conrelid = 'public.tournament_admins'::regclass
  ) then
    alter table public.tournament_admins
      add constraint tournament_admins_role_check check (role in ('owner', 'admin'));
  end if;
end $$;

with ranked as (
  select tournament_id, user_id,
    row_number() over (partition by tournament_id order by created_at, user_id) as position
  from public.tournament_admins
)
update public.tournament_admins ta
set role = 'owner'
from ranked r
where ta.tournament_id = r.tournament_id
  and ta.user_id = r.user_id
  and r.position = 1
  and not exists (
    select 1 from public.tournament_admins existing
    where existing.tournament_id = ta.tournament_id and existing.role = 'owner'
  );

alter table public.pairs
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.activity_log (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  entity_type text not null check (entity_type in ('tournament', 'pair', 'match', 'admin')),
  entity_id uuid,
  action text not null,
  changed_by uuid references auth.users(id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_tournament_created_idx
  on public.activity_log (tournament_id, created_at desc);
create unique index if not exists pairs_tournament_seed_unique
  on public.pairs (tournament_id, seed) where seed is not null;

alter table public.activity_log enable row level security;

create or replace function public.is_tournament_admin(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tournament_admins
    where tournament_id = p_tournament_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_tournament_owner(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tournament_admins
    where tournament_id = p_tournament_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function public.is_tournament_admin(uuid) from public;
revoke all on function public.is_tournament_owner(uuid) from public;
grant execute on function public.is_tournament_admin(uuid) to authenticated;
grant execute on function public.is_tournament_owner(uuid) to authenticated;

do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('tournaments', 'tournament_admins', 'pairs', 'matches', 'match_result_history', 'activity_log')
  loop
    execute format('drop policy if exists %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy "Public tournaments are readable"
on public.tournaments for select to anon
using (status <> 'draft');

create policy "Authenticated users see public or managed tournaments"
on public.tournaments for select to authenticated
using (status <> 'draft' or (select public.is_tournament_admin(id)));

create policy "Tournament admins update tournaments"
on public.tournaments for update to authenticated
using ((select public.is_tournament_admin(id)))
with check ((select public.is_tournament_admin(id)));

create policy "Users read own tournament memberships"
on public.tournament_admins for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_tournament_owner(tournament_id)));

create policy "Public pairs are readable"
on public.pairs for select to anon
using (exists (
  select 1 from public.tournaments t
  where t.id = tournament_id and t.status <> 'draft'
));

create policy "Authenticated users see public or managed pairs"
on public.pairs for select to authenticated
using (
  (select public.is_tournament_admin(tournament_id))
  or exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft')
);

create policy "Tournament admins update pairs"
on public.pairs for update to authenticated
using ((select public.is_tournament_admin(tournament_id)))
with check ((select public.is_tournament_admin(tournament_id)));

create policy "Public matches are readable"
on public.matches for select to anon
using (exists (
  select 1 from public.tournaments t
  where t.id = tournament_id and t.status <> 'draft'
));

create policy "Authenticated users see public or managed matches"
on public.matches for select to authenticated
using (
  (select public.is_tournament_admin(tournament_id))
  or exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft')
);

create policy "Tournament admins update matches"
on public.matches for update to authenticated
using ((select public.is_tournament_admin(tournament_id)))
with check ((select public.is_tournament_admin(tournament_id)));

create policy "Tournament admins read result history"
on public.match_result_history for select to authenticated
using ((select public.is_tournament_admin(tournament_id)));

create policy "Tournament admins read activity"
on public.activity_log for select to authenticated
using ((select public.is_tournament_admin(tournament_id)));

grant select on public.tournaments, public.pairs, public.matches to anon, authenticated;
grant update on public.tournaments, public.pairs, public.matches to authenticated;
grant select on public.tournament_admins, public.match_result_history, public.activity_log to authenticated;
revoke insert, update, delete on public.activity_log from anon, authenticated;

create or replace function public.audit_tournament_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_entity_id uuid;
  v_entity_type text;
begin
  if tg_table_name = 'tournaments' then
    v_tournament_id := new.id;
    v_entity_id := new.id;
    v_entity_type := 'tournament';
  elsif tg_table_name = 'pairs' then
    v_tournament_id := new.tournament_id;
    v_entity_id := new.id;
    v_entity_type := 'pair';
  else
    v_tournament_id := new.tournament_id;
    v_entity_id := new.id;
    v_entity_type := 'match';
  end if;

  insert into public.activity_log (
    tournament_id, entity_type, entity_id, action, changed_by, before_state, after_state
  ) values (
    v_tournament_id, v_entity_type, v_entity_id, 'updated', (select auth.uid()), to_jsonb(old), to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function public.audit_tournament_change() from public, anon, authenticated;

drop trigger if exists audit_tournament_update on public.tournaments;
create trigger audit_tournament_update after update on public.tournaments
for each row when (old is distinct from new) execute function public.audit_tournament_change();

drop trigger if exists audit_pair_update on public.pairs;
create trigger audit_pair_update after update on public.pairs
for each row when (old is distinct from new) execute function public.audit_tournament_change();

drop trigger if exists audit_match_update on public.matches;
create trigger audit_match_update after update on public.matches
for each row when (old is distinct from new) execute function public.audit_tournament_change();

create or replace function public.touch_pair_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_pairs_updated_at on public.pairs;
create trigger touch_pairs_updated_at before update on public.pairs
for each row execute function public.touch_pair_updated_at();

create or replace function public.create_tournament_with_bracket(
  p_name text,
  p_slug text,
  p_location text,
  p_starts_at timestamptz,
  p_bracket_size integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_tournament_id uuid;
  v_pair_ids uuid[] := '{}';
  v_pair_id uuid;
  v_rounds integer;
  v_round integer;
  v_position integer;
  v_match_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.tournament_admins where user_id = v_user_id and role = 'owner') then
    raise exception 'Only an existing tournament owner can create another tournament';
  end if;
  if p_bracket_size not in (8, 16, 32) then raise exception 'Bracket size must be 8, 16 or 32'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Tournament name is required'; end if;
  if coalesce(trim(p_slug), '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Use a lowercase URL slug'; end if;

  insert into public.tournaments (name, slug, location, starts_at, bracket_size, status)
  values (trim(p_name), trim(p_slug), nullif(trim(p_location), ''), p_starts_at, p_bracket_size, 'draft')
  returning id into v_tournament_id;

  insert into public.tournament_admins (tournament_id, user_id, role)
  values (v_tournament_id, v_user_id, 'owner');

  for v_position in 1..p_bracket_size loop
    insert into public.pairs (tournament_id, name, player_one, player_two, seed)
    values (
      v_tournament_id,
      'Pair ' || lpad(v_position::text, 2, '0'),
      'Player ' || ((v_position - 1) * 2 + 1)::text,
      'Player ' || (v_position * 2)::text,
      v_position
    ) returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;

  v_rounds := case p_bracket_size when 8 then 3 when 16 then 4 when 32 then 5 end;
  for v_round in 1..v_rounds loop
    v_match_count := p_bracket_size / (2 ^ v_round);
    for v_position in 1..v_match_count loop
      insert into public.matches (
        tournament_id, round, position, pair_one_id, pair_two_id, status
      ) values (
        v_tournament_id,
        v_round,
        v_position,
        case when v_round = 1 then v_pair_ids[v_position * 2 - 1] else null end,
        case when v_round = 1 then v_pair_ids[v_position * 2] else null end,
        'scheduled'
      );
    end loop;
  end loop;

  update public.matches current_match
  set next_match_id = next_match.id,
      next_slot = case when current_match.position % 2 = 1 then 1 else 2 end
  from public.matches next_match
  where current_match.tournament_id = v_tournament_id
    and next_match.tournament_id = v_tournament_id
    and next_match.round = current_match.round + 1
    and next_match.position = ((current_match.position + 1) / 2)
    and current_match.round < v_rounds;

  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (v_tournament_id, 'tournament', v_tournament_id, 'created', v_user_id,
    jsonb_build_object('name', trim(p_name), 'bracket_size', p_bracket_size));

  return v_tournament_id;
end;
$$;

create or replace function public.set_manual_draw(p_tournament_id uuid, p_pair_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_size integer;
  v_count integer;
  v_pair_id uuid;
  v_position integer := 0;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then
    raise exception 'Only a tournament owner can change the draw';
  end if;
  select bracket_size into v_size from public.tournaments where id = p_tournament_id;
  if cardinality(p_pair_ids) <> v_size then raise exception 'Every draw position must contain one pair'; end if;
  select count(distinct item) into v_count from unnest(p_pair_ids) item;
  if v_count <> v_size then raise exception 'Each pair can appear only once'; end if;
  select count(*) into v_count from public.pairs where tournament_id = p_tournament_id and id = any(p_pair_ids);
  if v_count <> v_size then raise exception 'The draw contains an invalid pair'; end if;
  if exists (
    select 1 from public.matches
    where tournament_id = p_tournament_id
      and (winner_id is not null or status <> 'scheduled')
  ) then raise exception 'Reset active and completed matches before changing the draw'; end if;

  update public.pairs set seed = null where tournament_id = p_tournament_id;
  foreach v_pair_id in array p_pair_ids loop
    v_position := v_position + 1;
    update public.pairs set seed = v_position where id = v_pair_id and tournament_id = p_tournament_id;
  end loop;

  update public.matches m
  set pair_one_id = p_pair_ids[m.position * 2 - 1],
      pair_two_id = p_pair_ids[m.position * 2]
  where m.tournament_id = p_tournament_id and m.round = 1;
end;
$$;

drop function if exists public.record_match_result(uuid, integer[], integer[], uuid);

create function public.record_match_result(
  p_match_id uuid,
  p_pair_one_sets integer[],
  p_pair_two_sets integer[],
  p_winner_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_next public.matches%rowtype;
  v_previous jsonb;
  v_new jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if v_match.pair_one_id is null or v_match.pair_two_id is null then raise exception 'Both participants are required'; end if;
  if p_winner_id not in (v_match.pair_one_id, v_match.pair_two_id) then raise exception 'Winner must be one of the participants'; end if;
  if cardinality(p_pair_one_sets) = 0 or cardinality(p_pair_one_sets) <> cardinality(p_pair_two_sets) then raise exception 'Enter a valid score'; end if;

  if v_match.next_match_id is not null then
    select * into v_next from public.matches where id = v_match.next_match_id for update;
    if v_match.winner_id is distinct from p_winner_id
      and (v_next.winner_id is not null or v_next.status in ('live', 'completed')) then
      raise exception 'Reset the following match before changing this winner';
    end if;
  end if;

  v_previous := jsonb_build_object(
    'pair_one_sets', v_match.pair_one_sets,
    'pair_two_sets', v_match.pair_two_sets,
    'winner_id', v_match.winner_id,
    'status', v_match.status
  );

  update public.matches
  set pair_one_sets = p_pair_one_sets,
      pair_two_sets = p_pair_two_sets,
      winner_id = p_winner_id,
      status = 'completed',
      completed_at = now(),
      updated_at = now()
  where id = p_match_id;

  if v_match.next_match_id is not null then
    if v_match.next_slot = 1 then
      update public.matches set pair_one_id = p_winner_id, updated_at = now() where id = v_match.next_match_id;
    else
      update public.matches set pair_two_id = p_winner_id, updated_at = now() where id = v_match.next_match_id;
    end if;
  else
    update public.tournaments set status = 'completed', updated_at = now() where id = v_match.tournament_id;
  end if;

  v_new := jsonb_build_object(
    'pair_one_sets', p_pair_one_sets,
    'pair_two_sets', p_pair_two_sets,
    'winner_id', p_winner_id,
    'status', 'completed'
  );
  insert into public.match_result_history (match_id, tournament_id, changed_by, previous_state, new_state)
  values (p_match_id, v_match.tournament_id, (select auth.uid()), v_previous, v_new);
end;
$$;

create or replace function public.reset_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_next public.matches%rowtype;
  v_previous jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if v_match.winner_id is null then raise exception 'This match has no saved result'; end if;

  if v_match.next_match_id is not null then
    select * into v_next from public.matches where id = v_match.next_match_id for update;
    if v_next.winner_id is not null or v_next.status in ('live', 'completed') then
      raise exception 'Reset the following match first';
    end if;
  end if;

  v_previous := jsonb_build_object(
    'pair_one_sets', v_match.pair_one_sets,
    'pair_two_sets', v_match.pair_two_sets,
    'winner_id', v_match.winner_id,
    'status', v_match.status
  );

  if v_match.next_match_id is not null then
    if v_match.next_slot = 1 then
      update public.matches set pair_one_id = null, updated_at = now() where id = v_match.next_match_id;
    else
      update public.matches set pair_two_id = null, updated_at = now() where id = v_match.next_match_id;
    end if;
  else
    update public.tournaments set status = 'live', updated_at = now() where id = v_match.tournament_id;
  end if;

  update public.matches
  set pair_one_sets = '{}',
      pair_two_sets = '{}',
      winner_id = null,
      status = 'scheduled',
      completed_at = null,
      updated_at = now()
  where id = p_match_id;

  insert into public.match_result_history (match_id, tournament_id, changed_by, previous_state, new_state)
  values (
    p_match_id, v_match.tournament_id, (select auth.uid()), v_previous,
    jsonb_build_object('pair_one_sets', '[]'::jsonb, 'pair_two_sets', '[]'::jsonb, 'winner_id', null, 'status', 'scheduled')
  );
end;
$$;

create or replace function public.list_tournament_admins(p_tournament_id uuid)
returns table(user_id uuid, email text, role text, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select ta.user_id, u.email::text, ta.role, ta.created_at
  from public.tournament_admins ta
  join auth.users u on u.id = ta.user_id
  where ta.tournament_id = p_tournament_id
    and (select public.is_tournament_admin(p_tournament_id))
  order by case ta.role when 'owner' then 0 else 1 end, ta.created_at;
$$;

create or replace function public.add_tournament_admin_by_email(
  p_tournament_id uuid,
  p_email text,
  p_role text default 'admin'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only an owner can manage the team'; end if;
  if p_role not in ('owner', 'admin') then raise exception 'Invalid role'; end if;
  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user_id is null then raise exception 'This user must create an account first'; end if;
  insert into public.tournament_admins (tournament_id, user_id, role)
  values (p_tournament_id, v_user_id, p_role)
  on conflict (tournament_id, user_id) do update set role = excluded.role;
  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (p_tournament_id, 'admin', v_user_id, 'admin_added', (select auth.uid()), jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.remove_tournament_admin(p_tournament_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only an owner can manage the team'; end if;
  select role into v_role from public.tournament_admins where tournament_id = p_tournament_id and user_id = p_user_id;
  if v_role is null then raise exception 'Administrator not found'; end if;
  if v_role = 'owner' then raise exception 'An owner cannot be removed here'; end if;
  delete from public.tournament_admins where tournament_id = p_tournament_id and user_id = p_user_id;
  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, before_state)
  values (p_tournament_id, 'admin', p_user_id, 'admin_removed', (select auth.uid()), jsonb_build_object('role', v_role));
end;
$$;

revoke all on function public.create_tournament_with_bracket(text, text, text, timestamptz, integer) from public, anon;
revoke all on function public.set_manual_draw(uuid, uuid[]) from public, anon;
revoke all on function public.record_match_result(uuid, integer[], integer[], uuid) from public, anon;
revoke all on function public.reset_match_result(uuid) from public, anon;
revoke all on function public.list_tournament_admins(uuid) from public, anon;
revoke all on function public.add_tournament_admin_by_email(uuid, text, text) from public, anon;
revoke all on function public.remove_tournament_admin(uuid, uuid) from public, anon;

grant execute on function public.create_tournament_with_bracket(text, text, text, timestamptz, integer) to authenticated;
grant execute on function public.set_manual_draw(uuid, uuid[]) to authenticated;
grant execute on function public.record_match_result(uuid, integer[], integer[], uuid) to authenticated;
grant execute on function public.reset_match_result(uuid) to authenticated;
grant execute on function public.list_tournament_admins(uuid) to authenticated;
grant execute on function public.add_tournament_admin_by_email(uuid, text, text) to authenticated;
grant execute on function public.remove_tournament_admin(uuid, uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.tournaments;
  exception when duplicate_object then null;
  end;
end $$;
