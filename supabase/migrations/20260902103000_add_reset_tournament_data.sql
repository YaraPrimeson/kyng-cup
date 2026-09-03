create or replace function public.reset_tournament_data(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_pair record;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (select public.is_tournament_owner(p_tournament_id)) then
    raise exception 'Only a tournament owner can reset tournament data';
  end if;

  -- Clear downstream match references first, then restore the initial draw.
  update public.matches
  set pair_one_id = null,
      pair_two_id = null,
      pair_one_sets = '{}'::integer[],
      pair_two_sets = '{}'::integer[],
      winner_id = null,
      status = 'scheduled',
      court = null,
      scheduled_at = null,
      updated_at = now()
  where tournament_id = p_tournament_id;

  for v_pair in
    select id, seed
    from public.pairs
    where tournament_id = p_tournament_id
    order by seed nulls last, id
  loop
    update public.pairs
    set name = 'Pair ' || lpad(coalesce(v_pair.seed, 0)::text, 2, '0'),
        player_one = 'Player ' || ((coalesce(v_pair.seed, 1) - 1) * 2 + 1)::text,
        player_two = 'Player ' || (coalesce(v_pair.seed, 1) * 2)::text,
        updated_at = now()
    where id = v_pair.id;
  end loop;

  update public.matches m
  set pair_one_id = first_pair.id,
      pair_two_id = second_pair.id,
      updated_at = now()
  from public.pairs first_pair
  join public.pairs second_pair
    on second_pair.tournament_id = first_pair.tournament_id
   and second_pair.seed = first_pair.seed + 1
  where m.tournament_id = p_tournament_id
    and m.round = 1
    and first_pair.tournament_id = p_tournament_id
    and first_pair.seed = m.position * 2 - 1;

  delete from public.match_result_history where tournament_id = p_tournament_id;
  delete from public.tournament_registrations where tournament_id = p_tournament_id;

  insert into public.activity_log (tournament_id, entity_type, entity_id, action, changed_by, after_state)
  values (
    p_tournament_id,
    'tournament',
    p_tournament_id,
    'reset',
    v_user_id,
    jsonb_build_object('reset_at', now(), 'registrations_deleted', true)
  );
end;
$$;

revoke all on function public.reset_tournament_data(uuid) from public, anon;
grant execute on function public.reset_tournament_data(uuid) to authenticated;
