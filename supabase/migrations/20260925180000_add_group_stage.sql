alter table public.tournaments
  add column if not exists format text not null default 'knockout',
  add column if not exists participant_count integer;

update public.tournaments
set participant_count = bracket_size
where participant_count is null;

alter table public.tournaments
  alter column participant_count set not null;

alter table public.tournaments
  drop constraint if exists tournaments_format_check;
alter table public.tournaments
  add constraint tournaments_format_check check (format in ('knockout', 'group_knockout'));
alter table public.tournaments
  drop constraint if exists tournaments_participant_count_check;
alter table public.tournaments
  add constraint tournaments_participant_count_check check (participant_count between 2 and 64);

create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  code text not null check (code ~ '^[A-Z]$'),
  qualify_count integer not null check (qualify_count between 1 and 8),
  created_at timestamptz not null default now(),
  unique (tournament_id, code)
);

create table if not exists public.group_members (
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  pair_id uuid not null references public.pairs(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (group_id, pair_id),
  unique (group_id, position),
  unique (pair_id)
);

create table if not exists public.group_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid not null references public.tournament_groups(id) on delete cascade,
  position integer not null check (position > 0),
  pair_one_id uuid not null references public.pairs(id) on delete restrict,
  pair_two_id uuid not null references public.pairs(id) on delete restrict,
  pair_one_sets integer[] not null default '{}',
  pair_two_sets integer[] not null default '{}',
  winner_id uuid references public.pairs(id) on delete restrict,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'completed')),
  court text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (group_id, position),
  check (pair_one_id <> pair_two_id),
  check (winner_id is null or winner_id in (pair_one_id, pair_two_id))
);

create index if not exists tournament_groups_tournament_idx on public.tournament_groups (tournament_id, code);
create index if not exists group_members_group_idx on public.group_members (group_id, position);
create index if not exists group_matches_tournament_idx on public.group_matches (tournament_id, group_id, position);

alter table public.tournament_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_matches enable row level security;

create policy "Public tournament groups are readable"
on public.tournament_groups for select to anon
using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft'));
create policy "Authenticated users see public or managed tournament groups"
on public.tournament_groups for select to authenticated
using ((select public.is_tournament_admin(tournament_id)) or exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft'));

create policy "Public group members are readable"
on public.group_members for select to anon
using (exists (
  select 1 from public.tournament_groups g join public.tournaments t on t.id = g.tournament_id
  where g.id = group_id and t.status <> 'draft'
));
create policy "Authenticated users see public or managed group members"
on public.group_members for select to authenticated
using (exists (
  select 1 from public.tournament_groups g join public.tournaments t on t.id = g.tournament_id
  where g.id = group_id and ((select public.is_tournament_admin(g.tournament_id)) or t.status <> 'draft')
));

create policy "Public group matches are readable"
on public.group_matches for select to anon
using (exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft'));
create policy "Authenticated users see public or managed group matches"
on public.group_matches for select to authenticated
using ((select public.is_tournament_admin(tournament_id)) or exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'draft'));
create policy "Tournament admins update group matches"
on public.group_matches for update to authenticated
using ((select public.is_tournament_admin(tournament_id)))
with check ((select public.is_tournament_admin(tournament_id)));

grant select on public.tournament_groups, public.group_members, public.group_matches to anon, authenticated;
grant update on public.group_matches to authenticated;
revoke insert, update, delete on public.tournament_groups, public.group_members from anon, authenticated;
revoke insert, delete on public.group_matches from anon, authenticated;

create or replace function public.rebuild_group_matches(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group record;
  v_one record;
  v_two record;
  v_position integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can rebuild groups'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then
    raise exception 'Reset group results before changing assignments';
  end if;
  delete from public.group_matches where tournament_id = p_tournament_id;
  for v_group in select id from public.tournament_groups where tournament_id = p_tournament_id order by code loop
    v_position := 0;
    for v_one in select pair_id, position from public.group_members where group_id = v_group.id order by position loop
      for v_two in select pair_id, position from public.group_members where group_id = v_group.id and position > v_one.position order by position loop
        v_position := v_position + 1;
        insert into public.group_matches (tournament_id, group_id, position, pair_one_id, pair_two_id)
        values (p_tournament_id, v_group.id, v_position, v_one.pair_id, v_two.pair_id);
      end loop;
    end loop;
  end loop;
end;
$$;

create or replace function public.configure_group_stage(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pair_ids uuid[];
  v_pair_id uuid;
  v_group_id uuid;
  v_index integer;
  v_code text;
  v_position integer;
  v_round integer;
  v_match_position integer;
  v_match_count integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can configure the group stage'; end if;
  if exists (select 1 from public.matches where tournament_id = p_tournament_id and (winner_id is not null or status <> 'scheduled'))
     or exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then
    raise exception 'Reset all active and completed matches before changing the format';
  end if;

  delete from public.matches where tournament_id = p_tournament_id;
  delete from public.tournament_groups where tournament_id = p_tournament_id;

  select coalesce(array_agg(id order by seed nulls last, updated_at, id), '{}') into v_pair_ids
  from public.pairs where tournament_id = p_tournament_id;
  while cardinality(v_pair_ids) < 18 loop
    v_index := cardinality(v_pair_ids) + 1;
    insert into public.pairs (tournament_id, name, player_one, player_two, seed)
    values (p_tournament_id, 'Pair ' || lpad(v_index::text, 2, '0'), 'Player ' || (v_index * 2 - 1)::text, 'Player ' || (v_index * 2)::text, v_index)
    returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;
  if cardinality(v_pair_ids) > 18 then raise exception 'Group format requires exactly 18 pairs'; end if;

  update public.tournaments set format = 'group_knockout', participant_count = 18, bracket_size = 8, updated_at = now() where id = p_tournament_id;
  for v_index in 1..5 loop
    v_code := chr(64 + v_index);
    insert into public.tournament_groups (tournament_id, code, qualify_count)
    values (p_tournament_id, v_code, case when v_index <= 3 then 2 else 1 end)
    returning id into v_group_id;
    for v_position in 1..case when v_index <= 3 then 4 else 3 end loop
      insert into public.group_members (group_id, pair_id, position)
      values (v_group_id, v_pair_ids[case when v_index <= 3 then (v_index - 1) * 4 + v_position else 12 + (v_index - 4) * 3 + v_position end], v_position);
    end loop;
  end loop;
  perform public.rebuild_group_matches(p_tournament_id);

  for v_round in 1..3 loop
    v_match_count := 8 / (2 ^ v_round);
    for v_match_position in 1..v_match_count loop
      insert into public.matches (tournament_id, round, position, status)
      values (p_tournament_id, v_round, v_match_position, 'scheduled');
    end loop;
  end loop;
  update public.matches current_match
  set next_match_id = next_match.id, next_slot = case when current_match.position % 2 = 1 then 1 else 2 end
  from public.matches next_match
  where current_match.tournament_id = p_tournament_id and next_match.tournament_id = p_tournament_id
    and next_match.round = current_match.round + 1 and next_match.position = ((current_match.position + 1) / 2)
    and current_match.round < 3;
end;
$$;

create or replace function public.set_group_assignments(p_tournament_id uuid, p_pair_ids uuid[], p_group_codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_index integer;
  v_group_id uuid;
  v_position integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can change groups'; end if;
  if cardinality(p_pair_ids) <> 18 or cardinality(p_group_codes) <> 18 then raise exception 'Assign all 18 pairs'; end if;
  if (select count(distinct item) from unnest(p_pair_ids) item) <> 18 then raise exception 'Each pair can appear only once'; end if;
  if exists (select 1 from unnest(p_group_codes) code where code not in ('A','B','C','D','E')) then raise exception 'Invalid group code'; end if;
  if exists (select 1 from (select code, count(*) amount from unnest(p_group_codes) code group by code) x where (code in ('A','B','C') and amount <> 4) or (code in ('D','E') and amount <> 3)) then raise exception 'Groups A-C need 4 pairs and D-E need 3 pairs'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then raise exception 'Reset group results before changing assignments'; end if;
  if (select count(*) from public.pairs where tournament_id = p_tournament_id and id = any(p_pair_ids)) <> 18 then raise exception 'Invalid pair assignment'; end if;
  delete from public.group_members where group_id in (select id from public.tournament_groups where tournament_id = p_tournament_id);
  for v_index in 1..18 loop
    select id into v_group_id from public.tournament_groups where tournament_id = p_tournament_id and code = p_group_codes[v_index];
    select count(*) + 1 into v_position from public.group_members where group_id = v_group_id;
    insert into public.group_members (group_id, pair_id, position) values (v_group_id, p_pair_ids[v_index], v_position);
  end loop;
  perform public.rebuild_group_matches(p_tournament_id);
end;
$$;

create or replace function public.record_group_match_result(p_match_id uuid, p_pair_one_sets integer[], p_pair_two_sets integer[], p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_match public.group_matches%rowtype;
begin
  select * into v_match from public.group_matches where id = p_match_id for update;
  if not found then raise exception 'Group match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if p_winner_id not in (v_match.pair_one_id, v_match.pair_two_id) then raise exception 'Winner must be one of the participants'; end if;
  if cardinality(p_pair_one_sets) = 0 or cardinality(p_pair_one_sets) <> cardinality(p_pair_two_sets) then raise exception 'Enter a valid score'; end if;
  update public.group_matches set pair_one_sets = p_pair_one_sets, pair_two_sets = p_pair_two_sets, winner_id = p_winner_id,
    status = 'completed', completed_at = now(), updated_at = now() where id = p_match_id;
end;
$$;

create or replace function public.reset_group_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_match public.group_matches%rowtype;
begin
  select * into v_match from public.group_matches where id = p_match_id for update;
  if not found then raise exception 'Group match not found'; end if;
  if not (select public.is_tournament_admin(v_match.tournament_id)) then raise exception 'Admin access required'; end if;
  if exists (select 1 from public.matches where tournament_id = v_match.tournament_id and (winner_id is not null or status <> 'scheduled')) then raise exception 'Reset the knockout bracket before changing group results'; end if;
  update public.group_matches set pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null, status = 'scheduled', completed_at = null, updated_at = now() where id = p_match_id;
end;
$$;

create or replace function public.confirm_group_qualifiers(p_tournament_id uuid, p_pair_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can confirm the knockout draw'; end if;
  if cardinality(p_pair_ids) <> 8 or (select count(distinct item) from unnest(p_pair_ids) item) <> 8 then raise exception 'Select eight distinct qualifiers'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'completed') then raise exception 'Complete every group match first'; end if;
  if (select count(*) from public.group_members gm join public.tournament_groups g on g.id = gm.group_id where g.tournament_id = p_tournament_id and gm.pair_id = any(p_pair_ids)) <> 8 then raise exception 'A selected pair is not in this group stage'; end if;
  if exists (
    select 1
    from public.tournament_groups g
    left join public.group_members gm on gm.group_id = g.id and gm.pair_id = any(p_pair_ids)
    where g.tournament_id = p_tournament_id
    group by g.id, g.qualify_count
    having count(gm.pair_id) <> g.qualify_count
  ) then raise exception 'Select the required number of qualifiers from every group'; end if;
  if exists (select 1 from public.matches where tournament_id = p_tournament_id and (winner_id is not null or status <> 'scheduled')) then raise exception 'Reset the knockout bracket before replacing qualifiers'; end if;
  update public.matches set pair_one_id = null, pair_two_id = null, pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null, status = 'scheduled', updated_at = now() where tournament_id = p_tournament_id;
  update public.matches m set pair_one_id = p_pair_ids[m.position * 2 - 1], pair_two_id = p_pair_ids[m.position * 2], updated_at = now()
  where m.tournament_id = p_tournament_id and m.round = 1;
  update public.tournaments set status = 'live', updated_at = now() where id = p_tournament_id;
end;
$$;

revoke all on function public.rebuild_group_matches(uuid) from public, anon;
revoke all on function public.configure_group_stage(uuid) from public, anon;
revoke all on function public.set_group_assignments(uuid, uuid[], text[]) from public, anon;
revoke all on function public.record_group_match_result(uuid, integer[], integer[], uuid) from public, anon;
revoke all on function public.reset_group_match_result(uuid) from public, anon;
revoke all on function public.confirm_group_qualifiers(uuid, uuid[]) from public, anon;
grant execute on function public.configure_group_stage(uuid) to authenticated;
grant execute on function public.set_group_assignments(uuid, uuid[], text[]) to authenticated;
grant execute on function public.record_group_match_result(uuid, integer[], integer[], uuid) to authenticated;
grant execute on function public.reset_group_match_result(uuid) to authenticated;
grant execute on function public.confirm_group_qualifiers(uuid, uuid[]) to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.tournament_groups; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.group_matches; exception when duplicate_object then null; end;
end $$;

create or replace function public.reset_tournament_data(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_pair record;
  v_is_group_stage boolean;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only a tournament owner can reset tournament data'; end if;
  select format = 'group_knockout' into v_is_group_stage from public.tournaments where id = p_tournament_id;

  update public.matches set pair_one_id = null, pair_two_id = null, pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null,
    status = 'scheduled', court = null, scheduled_at = null, completed_at = null, updated_at = now()
  where tournament_id = p_tournament_id;
  update public.group_matches set pair_one_sets = '{}', pair_two_sets = '{}', winner_id = null, status = 'scheduled',
    court = null, scheduled_at = null, completed_at = null, updated_at = now()
  where tournament_id = p_tournament_id;

  for v_pair in select id, row_number() over (order by seed nulls last, id) as number from public.pairs where tournament_id = p_tournament_id loop
    update public.pairs set name = 'Pair ' || lpad(v_pair.number::text, 2, '0'), player_one = 'Player ' || (v_pair.number * 2 - 1)::text,
      player_two = 'Player ' || (v_pair.number * 2)::text, updated_at = now() where id = v_pair.id;
  end loop;

  if not v_is_group_stage then
    update public.matches m set pair_one_id = first_pair.id, pair_two_id = second_pair.id, updated_at = now()
    from public.pairs first_pair join public.pairs second_pair on second_pair.tournament_id = first_pair.tournament_id and second_pair.seed = first_pair.seed + 1
    where m.tournament_id = p_tournament_id and m.round = 1 and first_pair.tournament_id = p_tournament_id and first_pair.seed = m.position * 2 - 1;
  end if;
  delete from public.match_result_history where tournament_id = p_tournament_id;
  delete from public.tournament_registrations where tournament_id = p_tournament_id;
  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (p_tournament_id, 'tournament', p_tournament_id, 'reset', v_user_id, jsonb_build_object('reset_at', now(), 'registrations_deleted', true));
end;
$$;
