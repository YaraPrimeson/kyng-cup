-- Telegram writes are only available to the service role used by the Edge
-- Function. The Telegram user ID is checked again here as defence in depth.
create or replace function public.telegram_record_match_result(
  p_telegram_user_id bigint,
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
  if p_telegram_user_id <> 169658777 then
    raise exception 'Telegram access denied';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
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
    'status', 'completed',
    'source', 'telegram',
    'telegram_user_id', p_telegram_user_id
  );
  insert into public.match_result_history (match_id, tournament_id, changed_by, previous_state, new_state)
  values (p_match_id, v_match.tournament_id, null, v_previous, v_new);
end;
$$;

create or replace function public.telegram_reset_match_result(
  p_telegram_user_id bigint,
  p_match_id uuid
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
begin
  if p_telegram_user_id <> 169658777 then
    raise exception 'Telegram access denied';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'Match not found'; end if;
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
    'status', v_match.status,
    'source', 'telegram',
    'telegram_user_id', p_telegram_user_id
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
    p_match_id,
    v_match.tournament_id,
    null,
    v_previous,
    jsonb_build_object(
      'pair_one_sets', '[]'::jsonb,
      'pair_two_sets', '[]'::jsonb,
      'winner_id', null,
      'status', 'scheduled',
      'source', 'telegram',
      'telegram_user_id', p_telegram_user_id
    )
  );
end;
$$;

revoke all on function public.telegram_record_match_result(bigint, uuid, integer[], integer[], uuid) from public, anon, authenticated;
revoke all on function public.telegram_reset_match_result(bigint, uuid) from public, anon, authenticated;
grant execute on function public.telegram_record_match_result(bigint, uuid, integer[], integer[], uuid) to service_role;
grant execute on function public.telegram_reset_match_result(bigint, uuid) to service_role;
