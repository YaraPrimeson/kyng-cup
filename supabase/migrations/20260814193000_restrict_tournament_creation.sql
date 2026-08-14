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
    values (v_tournament_id, 'Pair ' || lpad(v_position::text, 2, '0'),
      'Player ' || ((v_position - 1) * 2 + 1)::text, 'Player ' || (v_position * 2)::text, v_position)
    returning id into v_pair_id;
    v_pair_ids := array_append(v_pair_ids, v_pair_id);
  end loop;

  v_rounds := case p_bracket_size when 8 then 3 when 16 then 4 when 32 then 5 end;
  for v_round in 1..v_rounds loop
    v_match_count := p_bracket_size / (2 ^ v_round);
    for v_position in 1..v_match_count loop
      insert into public.matches (tournament_id, round, position, pair_one_id, pair_two_id, status)
      values (v_tournament_id, v_round, v_position,
        case when v_round = 1 then v_pair_ids[v_position * 2 - 1] else null end,
        case when v_round = 1 then v_pair_ids[v_position * 2] else null end, 'scheduled');
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

revoke all on function public.create_tournament_with_bracket(text, text, text, timestamptz, integer) from public, anon;
grant execute on function public.create_tournament_with_bracket(text, text, text, timestamptz, integer) to authenticated;
