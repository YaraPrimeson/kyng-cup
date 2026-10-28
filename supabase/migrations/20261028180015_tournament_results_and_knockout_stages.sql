set local lock_timeout = '2s';

alter table public.matches add column bracket_kind text not null default 'playoffs'
  check (bracket_kind in ('playoffs','basement'));
alter table public.matches drop constraint matches_tournament_id_round_position_key;
alter table public.matches add constraint matches_tournament_stage_round_position_key unique(tournament_id,bracket_kind,round,position);
alter table public.matches drop constraint matches_round_check;
alter table public.matches add constraint matches_round_check check(round between 0 and 6);

-- Pure validation is also called by triggers: direct updates cannot bypass the RPC checks.
create function public.assert_result_score(p_one uuid,p_two uuid,p_winner uuid,p_scores_one integer[],p_scores_two integer[])
returns void language plpgsql immutable set search_path='' as $$
declare v_one integer; v_two integer;
begin
  if p_one is null or p_two is null or p_one=p_two then raise exception 'Обе пары должны быть определены'; end if;
  if p_winner is null or p_winner not in(p_one,p_two) then raise exception 'Выберите победителя из участников матча'; end if;
  if coalesce(cardinality(p_scores_one),0)=0 or cardinality(p_scores_one) is distinct from cardinality(p_scores_two)
    or array_ndims(p_scores_one)<>1 or array_ndims(p_scores_two)<>1
    or array_lower(p_scores_one,1)<>1 or array_lower(p_scores_two,1)<>1 then raise exception 'Укажите корректный счёт обеих пар'; end if;
  if exists(select 1 from unnest(p_scores_one||p_scores_two) score where score is null or score<0 or score>99) then raise exception 'Счёт должен состоять из целых чисел от 0 до 99'; end if;
  if exists(select 1 from generate_subscripts(p_scores_one,1) i where p_scores_one[i]=p_scores_two[i]) then raise exception 'В итоговом счёте не может быть ничейного сета'; end if;
  select count(*) filter(where p_scores_one[i]>p_scores_two[i]),count(*) filter(where p_scores_two[i]>p_scores_one[i]) into v_one,v_two from generate_subscripts(p_scores_one,1) i;
  if v_one=v_two then raise exception 'По счёту ничья по сетам: укажите решающий сет'; end if;
  if (v_one>v_two and p_winner<>p_one) or (v_two>v_one and p_winner<>p_two) then raise exception 'Выбранный победитель не соответствует счёту. Счёт записывается в порядке пар сверху вниз'; end if;
end;
$$;
revoke all on function public.assert_result_score(uuid,uuid,uuid,integer[],integer[]) from public,anon;
grant execute on function public.assert_result_score(uuid,uuid,uuid,integer[],integer[]) to authenticated;

create function public.enforce_recorded_score() returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='completed' and new.pair_one_id is not null and new.pair_two_id is not null then
    perform public.assert_result_score(new.pair_one_id,new.pair_two_id,new.winner_id,new.pair_one_sets,new.pair_two_sets);
  end if;
  return new;
end; $$;
create trigger validate_completed_match before insert or update of status,winner_id,pair_one_sets,pair_two_sets on public.matches for each row execute function public.enforce_recorded_score();
create trigger validate_completed_group_match before insert or update of status,winner_id,pair_one_sets,pair_two_sets on public.group_matches for each row execute function public.enforce_recorded_score();

-- Preserve existing authorization, audit history, next-match locks and reset protections.
do $$
declare v_function regprocedure; v_definition text; v_old text := 'if cardinality(p_pair_one_sets) = 0 or cardinality(p_pair_one_sets) <> cardinality(p_pair_two_sets) then raise exception ''Enter a valid score''; end if;';
begin
  foreach v_function in array array[
    'public.record_match_result(uuid,integer[],integer[],uuid)'::regprocedure,
    'public.record_group_match_result(uuid,integer[],integer[],uuid)'::regprocedure,
    'public.telegram_record_match_result(bigint,uuid,integer[],integer[],uuid)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    if position(v_old in v_definition)=0 then raise exception 'Unexpected result function definition'; end if;
    v_definition := replace(v_definition,v_old,'perform public.assert_result_score(v_match.pair_one_id,v_match.pair_two_id,p_winner_id,p_pair_one_sets,p_pair_two_sets);');
    v_definition := replace(v_definition,E'else\n    update public.tournaments set status = ''completed''',E'elsif v_match.bracket_kind = ''playoffs'' then\n    update public.tournaments set status = ''completed''');
    execute v_definition;
  end loop;
  v_definition := pg_get_functiondef('public.reset_match_result(uuid)'::regprocedure);
  if position(E'else\n    update public.tournaments set status = ''live''' in v_definition)=0 then raise exception 'Unexpected reset definition'; end if;
  execute replace(v_definition,E'else\n    update public.tournaments set status = ''live''',E'elsif v_match.bracket_kind = ''playoffs'' then\n    update public.tournaments set status = ''live''');
  v_definition := pg_get_functiondef('public.telegram_reset_match_result(bigint,uuid)'::regprocedure);
  execute replace(v_definition,E'else\n    update public.tournaments set status = ''live''',E'elsif v_match.bracket_kind = ''playoffs'' then\n    update public.tournaments set status = ''live''');
end; $$;

-- Shared builder. Missing power-of-two places become real preliminary games, never fake wins.
create function public.build_knockout_stage(p_tournament_id uuid,p_pair_ids uuid[],p_kind text)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_count integer := cardinality(p_pair_ids); v_size integer:=2; v_extra integer; v_rounds integer;
  v_round integer; v_position integer; v_slot integer; v_seed integer; v_i integer; v_order integer[]:=array[1,2]; v_new_order integer[];
  v_seeds uuid[]; v_next uuid; v_index integer;
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  perform 1 from public.tournaments where id=p_tournament_id for update;
  if not found then raise exception 'Tournament not found'; end if;
  if p_kind not in('playoffs','basement') or p_kind is null then raise exception 'Invalid stage'; end if;
  if v_count is null or v_count<2 or v_count>64 or array_ndims(p_pair_ids)<>1 or array_lower(p_pair_ids,1)<>1 then raise exception 'Select between 2 and 64 pairs'; end if;
  if (select count(distinct id) from unnest(p_pair_ids) id)<>v_count
    or (select count(*) from public.pairs where tournament_id=p_tournament_id and id=any(p_pair_ids))<>v_count then raise exception 'Select distinct pairs from this tournament'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind=p_kind
    and (status='live' or cardinality(pair_one_sets)>0 or cardinality(pair_two_sets)>0 or (status='completed' and pair_one_id is not null and pair_two_id is not null))) then raise exception 'Сначала сбросьте результаты этой сетки перед изменением жеребьёвки'; end if;
  while v_size*2<=v_count loop v_size:=v_size*2; end loop;
  v_extra:=v_count-v_size; v_rounds:=log(2,v_size)::integer;
  while cardinality(v_order)<v_size loop
    v_new_order:='{}';
    foreach v_seed in array v_order loop v_new_order:=array_append(v_new_order,v_seed); v_new_order:=array_append(v_new_order,cardinality(v_order)*2+1-v_seed); end loop;
    v_order:=v_new_order;
  end loop;
  delete from public.matches where tournament_id=p_tournament_id and bracket_kind=p_kind;
  for v_round in 1..v_rounds loop
    for v_position in 1..v_size/(2^v_round) loop
      v_seeds:=array[null::uuid,null::uuid];
      if v_round=1 then
        for v_slot in 1..2 loop
          v_seed:=v_order[(v_position-1)*2+v_slot];
          if v_seed<=v_size-v_extra then v_seeds[v_slot]:=p_pair_ids[v_seed]; end if;
        end loop;
      end if;
      insert into public.matches(tournament_id,bracket_kind,round,position,pair_one_id,pair_two_id)
      values(p_tournament_id,p_kind,v_round,v_position,v_seeds[1],v_seeds[2]);
    end loop;
  end loop;
  update public.matches m set next_match_id=n.id,next_slot=case when m.position%2=1 then 1 else 2 end
    from public.matches n where m.tournament_id=p_tournament_id and n.tournament_id=p_tournament_id
    and m.bracket_kind=p_kind and n.bracket_kind=p_kind and n.round=m.round+1 and n.position=(m.position+1)/2;
  for v_i in 1..v_extra loop
    v_seed:=v_size-v_extra+v_i;
    v_index:=array_position(v_order,v_seed);
    select id into v_next from public.matches where tournament_id=p_tournament_id and bracket_kind=p_kind and round=1 and position=(v_index+1)/2;
    insert into public.matches(tournament_id,bracket_kind,round,position,pair_one_id,pair_two_id,next_match_id,next_slot)
    values(p_tournament_id,p_kind,0,v_i,p_pair_ids[v_seed],p_pair_ids[v_count-v_i+1],v_next,case when v_index%2=1 then 1 else 2 end);
  end loop;
  if p_kind='playoffs' then update public.tournaments set bracket_size=v_size,playoff_participant_count=v_count,updated_at=now() where id=p_tournament_id; end if;
end; $$;
revoke all on function public.build_knockout_stage(uuid,uuid[],text) from public,anon,authenticated;

create or replace function public.rebuild_playoff_bracket(p_tournament_id uuid,p_pair_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin perform public.build_knockout_stage(p_tournament_id,p_pair_ids,'playoffs'); end; $$;

create or replace function public.confirm_group_qualifiers(p_tournament_id uuid,p_pair_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare v_required integer; v_basement uuid[];
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  select playoff_participant_count into v_required from public.tournaments where id=p_tournament_id and format='group_knockout' for update;
  if v_required is null or cardinality(p_pair_ids) is distinct from v_required or (select count(distinct id) from unnest(p_pair_ids) id)<>v_required then raise exception 'Select the configured number of distinct qualifiers'; end if;
  if not exists(select 1 from public.group_matches where tournament_id=p_tournament_id)
    or exists(select 1 from public.group_matches where tournament_id=p_tournament_id and status<>'completed') then raise exception 'Complete every group match first'; end if;
  if (select count(*) from public.group_members gm join public.tournament_groups g on g.id=gm.group_id where g.tournament_id=p_tournament_id and gm.pair_id=any(p_pair_ids))<>v_required then raise exception 'A selected pair is not in this group stage'; end if;
  select array_agg(p.id order by p.seed,p.id) into v_basement from public.pairs p where p.tournament_id=p_tournament_id and not(p.id=any(p_pair_ids));
  perform public.build_knockout_stage(p_tournament_id,p_pair_ids,'playoffs');
  if cardinality(v_basement)>=2 then perform public.build_knockout_stage(p_tournament_id,v_basement,'basement');
  else
    if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind='basement' and (status<>'scheduled' or cardinality(pair_one_sets)>0)) then raise exception 'Сначала сбросьте результаты Короля подвала'; end if;
    delete from public.matches where tournament_id=p_tournament_id and bracket_kind='basement';
  end if;
  update public.tournaments set status='live',updated_at=now() where id=p_tournament_id;
end; $$;

-- Also supports an existing confirmed draw whose consolation bracket was not created yet.
create function public.create_basement_bracket(p_tournament_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_ids uuid[];
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  perform 1 from public.tournaments where id=p_tournament_id and format='group_knockout' for update;
  if not found then raise exception 'Group tournament required'; end if;
  if exists(select 1 from public.group_matches where tournament_id=p_tournament_id and status<>'completed') then raise exception 'Complete every group match first'; end if;
  if not exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind='playoffs' and (pair_one_id is not null or pair_two_id is not null)) then raise exception 'Сначала подтвердите участников плей-офф'; end if;
  if exists(select 1 from public.matches where tournament_id=p_tournament_id and bracket_kind='basement') then raise exception 'Сетка Короля подвала уже существует'; end if;
  select array_agg(p.id order by p.seed,p.id) into v_ids from public.pairs p where p.tournament_id=p_tournament_id
    and not exists(select 1 from public.matches m where m.tournament_id=p_tournament_id and m.bracket_kind='playoffs' and (m.pair_one_id=p.id or m.pair_two_id=p.id));
  if coalesce(cardinality(v_ids),0)<2 then raise exception 'Для Короля подвала нужны минимум две пары вне плей-офф'; end if;
  perform public.build_knockout_stage(p_tournament_id,v_ids,'basement');
end; $$;
revoke all on function public.create_basement_bracket(uuid) from public,anon;
grant execute on function public.create_basement_bracket(uuid) to authenticated;

-- Legacy draw API delegates to the same protected builder and cannot overwrite consolation games.
create or replace function public.set_manual_draw(p_tournament_id uuid,p_pair_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not (select public.is_tournament_owner(p_tournament_id)) then raise exception 'Organiser access required'; end if;
  if cardinality(p_pair_ids) is distinct from (select playoff_participant_count from public.tournaments where id=p_tournament_id) then raise exception 'Select every playoff participant'; end if;
  perform public.rebuild_playoff_bracket(p_tournament_id,p_pair_ids);
end; $$;
