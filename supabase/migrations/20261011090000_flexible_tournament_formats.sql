alter table public.tournaments
  add column if not exists playoff_participant_count integer;

update public.tournaments
set playoff_participant_count = bracket_size
where playoff_participant_count is null;

alter table public.tournaments
  alter column playoff_participant_count set not null;

alter table public.tournaments
  drop constraint if exists tournaments_playoff_participant_count_check;
alter table public.tournaments
  add constraint tournaments_playoff_participant_count_check
  check (playoff_participant_count between 2 and 64 and playoff_participant_count <= participant_count);

alter table public.tournament_groups
  drop constraint if exists tournament_groups_qualify_count_check;
alter table public.tournament_groups
  add constraint tournament_groups_qualify_count_check check (qualify_count between 0 and 64);

create or replace function public.next_bracket_size(p_count integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare v_size integer := 2;
begin
  if p_count < 2 or p_count > 64 then raise exception 'Pair count must be between 2 and 64'; end if;
  while v_size < p_count loop v_size := v_size * 2; end loop;
  return v_size;
end;
$$;

create or replace function public.rebuild_playoff_bracket(p_tournament_id uuid, p_pair_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := cardinality(p_pair_ids);
  v_size integer;
  v_rounds integer;
  v_round integer;
  v_position integer;
  v_match_count integer;
  v_match record;
  v_automatic_winner uuid;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only the shared tournament owner can rebuild the playoff bracket'; end if;
  if v_count < 2 or v_count > 64 then raise exception 'Select between 2 and 64 pairs'; end if;
  if (select count(distinct item) from unnest(p_pair_ids) item) <> v_count then raise exception 'Each pair can appear only once'; end if;
  if (select count(*) from public.pairs where tournament_id = p_tournament_id and id = any(p_pair_ids)) <> v_count then raise exception 'The draw contains an invalid pair'; end if;

  v_size := public.next_bracket_size(v_count);
  v_rounds := log(2, v_size)::integer;
  delete from public.matches where tournament_id = p_tournament_id;

  for v_round in 1..v_rounds loop
    v_match_count := v_size / (2 ^ v_round);
    for v_position in 1..v_match_count loop
      insert into public.matches (tournament_id, round, position, pair_one_id, pair_two_id, status)
      values (
        p_tournament_id,
        v_round,
        v_position,
        case when v_round = 1 and v_position * 2 - 1 <= v_count then p_pair_ids[v_position * 2 - 1] else null end,
        case when v_round = 1 and v_position * 2 <= v_count then p_pair_ids[v_position * 2] else null end,
        'scheduled'
      );
    end loop;
  end loop;

  update public.matches current_match
  set next_match_id = next_match.id,
      next_slot = case when current_match.position % 2 = 1 then 1 else 2 end
  from public.matches next_match
  where current_match.tournament_id = p_tournament_id
    and next_match.tournament_id = p_tournament_id
    and next_match.round = current_match.round + 1
    and next_match.position = ((current_match.position + 1) / 2)
    and current_match.round < v_rounds;

  for v_round in 1..v_rounds - 1 loop
    for v_match in
      select * from public.matches
      where tournament_id = p_tournament_id and round = v_round
      order by position
    loop
      v_automatic_winner := case
        when v_match.pair_one_id is not null and v_match.pair_two_id is null then v_match.pair_one_id
        when v_match.pair_one_id is null and v_match.pair_two_id is not null then v_match.pair_two_id
        else null
      end;
      if v_automatic_winner is not null then
        update public.matches set winner_id = v_automatic_winner, status = 'completed', completed_at = now(), updated_at = now() where id = v_match.id;
        if v_match.next_slot = 1 then update public.matches set pair_one_id = v_automatic_winner, updated_at = now() where id = v_match.next_match_id;
        else update public.matches set pair_two_id = v_automatic_winner, updated_at = now() where id = v_match.next_match_id;
        end if;
      end if;
    end loop;
  end loop;

  update public.tournaments
  set bracket_size = v_size, playoff_participant_count = v_count, updated_at = now()
  where id = p_tournament_id;
end;
$$;

create or replace function public.create_flexible_tournament(
  p_name text,
  p_slug text,
  p_location text,
  p_starts_at timestamptz,
  p_sport text,
  p_participant_count integer,
  p_format text,
  p_group_count integer,
  p_playoff_count integer
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
  v_group_ids uuid[] := '{}';
  v_group_id uuid;
  v_index integer;
  v_group_index integer;
  v_position integer;
  v_qualify_base integer;
  v_qualify_remainder integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.tournament_admins where user_id = v_user_id and role = 'owner') then raise exception 'Only the shared tournament owner can create tournaments'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Tournament name is required'; end if;
  if coalesce(trim(p_slug), '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Use a lowercase URL slug'; end if;
  if p_sport not in ('tennis', 'padel') then raise exception 'Invalid sport'; end if;
  if p_format not in ('knockout', 'group_knockout') then raise exception 'Invalid tournament format'; end if;
  if p_participant_count < 2 or p_participant_count > 64 then raise exception 'Pair count must be between 2 and 64'; end if;
  if p_playoff_count < 2 or p_playoff_count > p_participant_count then raise exception 'Invalid playoff pair count'; end if;
  if p_format = 'group_knockout' and (p_group_count < 1 or p_group_count > 26 or p_participant_count < p_group_count * 2) then raise exception 'Each group needs at least two pairs'; end if;

  insert into public.tournaments (name, slug, location, starts_at, bracket_size, participant_count, playoff_participant_count, format, sport, status)
  values (trim(p_name), trim(p_slug), nullif(trim(p_location), ''), p_starts_at, public.next_bracket_size(p_playoff_count), p_participant_count, p_playoff_count, p_format, p_sport, 'draft')
  returning id into v_tournament_id;
  insert into public.tournament_admins (tournament_id, user_id, role) values (v_tournament_id, v_user_id, 'owner');

  for v_index in 1..p_participant_count loop
    insert into public.pairs (tournament_id, name, player_one, player_two, seed)
    values (v_tournament_id, 'Pair ' || lpad(v_index::text, 2, '0'), 'Player ' || (v_index * 2 - 1)::text, 'Player ' || (v_index * 2)::text, v_index)
    returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;

  if p_format = 'knockout' then
    perform public.rebuild_playoff_bracket(v_tournament_id, v_pair_ids);
  else
    v_qualify_base := p_playoff_count / p_group_count;
    v_qualify_remainder := p_playoff_count % p_group_count;
    for v_group_index in 1..p_group_count loop
      insert into public.tournament_groups (tournament_id, code, qualify_count)
      values (v_tournament_id, chr(64 + v_group_index), v_qualify_base + case when v_group_index <= v_qualify_remainder then 1 else 0 end)
      returning id into v_group_id;
      v_group_ids := array_append(v_group_ids, v_group_id);
    end loop;
    for v_index in 1..p_participant_count loop
      v_group_index := ((v_index - 1) % p_group_count) + 1;
      select count(*) + 1 into v_position from public.group_members where group_id = v_group_ids[v_group_index];
      insert into public.group_members (group_id, pair_id, position) values (v_group_ids[v_group_index], v_pair_ids[v_index], v_position);
    end loop;
    perform public.rebuild_group_matches(v_tournament_id);
    perform public.rebuild_playoff_bracket(v_tournament_id, v_pair_ids[1:p_playoff_count]);
    update public.matches set pair_one_id = null, pair_two_id = null, winner_id = null, status = 'scheduled', completed_at = null where tournament_id = v_tournament_id;
  end if;

  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (v_tournament_id, 'tournament', v_tournament_id, 'created', v_user_id, jsonb_build_object('format', p_format, 'participant_count', p_participant_count, 'group_count', p_group_count, 'playoff_count', p_playoff_count));
  return v_tournament_id;
end;
$$;

create or replace function public.set_group_assignments(p_tournament_id uuid, p_pair_ids uuid[], p_group_codes text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_index integer; v_group_id uuid; v_position integer; v_pair_count integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only the shared tournament owner can change groups'; end if;
  select participant_count into v_pair_count from public.tournaments where id = p_tournament_id and format = 'group_knockout';
  if v_pair_count is null or cardinality(p_pair_ids) <> v_pair_count or cardinality(p_group_codes) <> v_pair_count then raise exception 'Assign every pair'; end if;
  if (select count(distinct item) from unnest(p_pair_ids) item) <> v_pair_count then raise exception 'Each pair can appear only once'; end if;
  if exists (select 1 from unnest(p_group_codes) code where not exists (select 1 from public.tournament_groups g where g.tournament_id = p_tournament_id and g.code = code)) then raise exception 'Invalid group code'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'scheduled') then raise exception 'Reset group results before changing assignments'; end if;
  if exists (select 1 from public.tournament_groups g where g.tournament_id = p_tournament_id and (select count(*) from unnest(p_group_codes) code where code = g.code) < 2) then raise exception 'Every group needs at least two pairs'; end if;
  delete from public.group_members where group_id in (select id from public.tournament_groups where tournament_id = p_tournament_id);
  for v_index in 1..v_pair_count loop
    select id into v_group_id from public.tournament_groups where tournament_id = p_tournament_id and code = p_group_codes[v_index];
    select count(*) + 1 into v_position from public.group_members where group_id = v_group_id;
    insert into public.group_members (group_id, pair_id, position) values (v_group_id, p_pair_ids[v_index], v_position);
  end loop;
  perform public.rebuild_group_matches(p_tournament_id);
end;
$$;

create or replace function public.confirm_group_qualifiers(p_tournament_id uuid, p_pair_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_required integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Only the shared tournament owner can confirm the playoff draw'; end if;
  select playoff_participant_count into v_required from public.tournaments where id = p_tournament_id and format = 'group_knockout';
  if cardinality(p_pair_ids) <> v_required or (select count(distinct item) from unnest(p_pair_ids) item) <> v_required then raise exception 'Select the configured number of distinct qualifiers'; end if;
  if exists (select 1 from public.group_matches where tournament_id = p_tournament_id and status <> 'completed') then raise exception 'Complete every group match first'; end if;
  if (select count(*) from public.group_members gm join public.tournament_groups g on g.id = gm.group_id where g.tournament_id = p_tournament_id and gm.pair_id = any(p_pair_ids)) <> v_required then raise exception 'A selected pair is not in this group stage'; end if;
  perform public.rebuild_playoff_bracket(p_tournament_id, p_pair_ids);
  update public.tournaments set status = 'live', updated_at = now() where id = p_tournament_id;
end;
$$;

revoke all on function public.next_bracket_size(integer) from public, anon, authenticated;
revoke all on function public.rebuild_playoff_bracket(uuid, uuid[]) from public, anon;
revoke all on function public.create_flexible_tournament(text, text, text, timestamptz, text, integer, text, integer, integer) from public, anon;
revoke all on function public.set_group_assignments(uuid, uuid[], text[]) from public, anon;
revoke all on function public.confirm_group_qualifiers(uuid, uuid[]) from public, anon;
grant execute on function public.rebuild_playoff_bracket(uuid, uuid[]) to authenticated;
grant execute on function public.create_flexible_tournament(text, text, text, timestamptz, text, integer, text, integer, integer) to authenticated;
grant execute on function public.set_group_assignments(uuid, uuid[], text[]) to authenticated;
grant execute on function public.confirm_group_qualifiers(uuid, uuid[]) to authenticated;
