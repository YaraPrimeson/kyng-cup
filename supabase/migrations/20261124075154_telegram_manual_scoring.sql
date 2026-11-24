-- The administrator decides the length of each set and match in the Telegram pilot.
create function telegram_demo.flex_match_state(play jsonb, match_status text, pair_one text, pair_two text, winner text)
returns jsonb language sql immutable set search_path = '' as $$
  select telegram_demo.match_state(play,'f',match_status,pair_one,pair_two,winner)
    || jsonb_build_object('format','manual',
      'active',case when match_status='live' then jsonb_build_object(
        'number',jsonb_array_length(play->'sets')+1,
        'one',(play->>'one')::integer,'two',(play->>'two')::integer,'kind','manual') end);
$$;

create or replace function telegram_demo.next_match_play(play jsonb, is_group boolean, action text, score_one integer, score_two integer)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  sets jsonb := play->'sets';
  wins integer[] := telegram_demo.wins(sets);
  one_score integer := (play->>'one')::integer;
  two_score integer := (play->>'two')::integer;
  set_index integer;
  side integer;
begin
  if action='score' or action ~ '^edit[1-9][0-9]{0,2}$' or action='setsscore' then
    if score_one is null or score_two is null or score_one not between 0 and 99 or score_two not between 0 and 99 then
      return jsonb_build_object('error','Введите два целых числа от 0 до 99.');
    end if;
  end if;

  if action ~ '^edit[1-9][0-9]{0,2}$' then
    set_index:=substr(action,5)::integer-1;
    if set_index>=jsonb_array_length(sets) or score_one=score_two then
      return jsonb_build_object('error','В завершённом сете должна быть победившая пара.');
    end if;
    side:=case when score_one>score_two then 1 else 2 end;
    if (sets->set_index->>(side-1))::integer <= (sets->set_index->>(2-side))::integer and wins[side]=99 then
      return jsonb_build_object('error','Достигнут предел в 99 сетов для пары.');
    end if;
    sets:=jsonb_set(sets,array[set_index::text],jsonb_build_array(score_one,score_two));
  elsif action='setsscore' then
    -- Keep the earliest recorded sets of each pair, then award any missing sets without game scores.
    select coalesce(jsonb_agg(item order by position),'[]'::jsonb) into sets
    from (
      select item,position,by_side.scoring_side,row_number() over (partition by by_side.scoring_side order by position) as side_index
      from (
        select item,position,case when (item->>0)::integer>(item->>1)::integer then 1 else 2 end as scoring_side
        from jsonb_array_elements(sets) with ordinality as entry(item,position)
      ) by_side
    ) ranked
    where side_index <= case when ranked.scoring_side=1 then score_one else score_two end;
    for set_index in 1..greatest(0,score_one-wins[1]) loop
      sets:=sets||'[[1,0,true]]'::jsonb;
    end loop;
    for set_index in 1..greatest(0,score_two-wins[2]) loop
      sets:=sets||'[[0,1,true]]'::jsonb;
    end loop;
  elsif action in ('setplus1','setplus2','setminus1','setminus2') then
    side:=right(action,1)::integer;
    if action like 'setplus%' then
      if wins[side]=99 then return jsonb_build_object('error','Достигнут предел в 99 сетов для пары.'); end if;
      sets:=sets||case when side=1 then '[[1,0,true]]'::jsonb else '[[0,1,true]]'::jsonb end;
    else
      select max(position)::integer-1 into set_index
      from jsonb_array_elements(sets) with ordinality as entry(item,position)
      where (item->>(side-1))::integer>(item->>(2-side))::integer;
      if set_index is null then return jsonb_build_object('error','У этой пары пока нет выигранных сетов.'); end if;
      sets:=sets-set_index;
    end if;
  elsif action='set' then
    if one_score=two_score then
      return jsonb_build_object('error','Счёт геймов равный. Измените счёт или начислите сет победившей паре кнопкой «+1 сет».');
    end if;
    side:=case when one_score>two_score then 1 else 2 end;
    if wins[side]=99 then return jsonb_build_object('error','Достигнут предел в 99 сетов для пары.'); end if;
    sets:=sets||jsonb_build_array(jsonb_build_array(one_score,two_score));
    one_score:=0;
    two_score:=0;
  elsif action='score' then
    one_score:=score_one;
    two_score:=score_two;
  elsif action in ('plus1','plus2') then
    if action='plus1' then one_score:=one_score+1; else two_score:=two_score+1; end if;
    if greatest(one_score,two_score)>99 then return jsonb_build_object('error','Поддерживается до 99 геймов на пару за сет.'); end if;
  else
    return jsonb_build_object('error','Неизвестное действие.');
  end if;
  return jsonb_build_object('sets',sets,'one',one_score,'two',two_score);
end;
$$;

create or replace function telegram_demo.cup_board()
returns jsonb language sql stable set search_path = '' as $$
  with pool as (
    select c.slot,c.revision,c.play,c.undo_play,g.status,g.pair_one_id,g.pair_two_id,g.winner_id,g.court
    from telegram_demo.cup_match c join public.group_matches g on g.id=c.group_match_id
    join telegram_demo.cup cup on cup.tournament_id=g.tournament_id
    union all
    select c.slot,c.revision,c.play,c.undo_play,m.status,m.pair_one_id,m.pair_two_id,m.winner_id,m.court
    from telegram_demo.cup_match c join public.matches m on m.id=c.knockout_match_id
    join telegram_demo.cup cup on cup.tournament_id=m.tournament_id
  ), rooms as (
    select p.slot,p.revision,p.status,p.play,won.name as winner, one.name as name_one,two.name as name_two,p.court,p.undo_play
    from pool p join public.pairs one on one.id=p.pair_one_id join public.pairs two on two.id=p.pair_two_id
    left join public.pairs won on won.id=p.winner_id
  )
  select jsonb_build_object('tournament',t.name,'revision',coalesce(sum(r.revision),0),
    'matches',coalesce(jsonb_object_agg(r.slot,telegram_demo.flex_match_state(r.play,r.status,r.name_one,r.name_two,r.winner)
      || jsonb_build_object('revision',r.revision,'court',r.court,'can_undo',r.undo_play is not null)), '{}'::jsonb),
    'draw_ready',count(*) filter(where r.slot in ('a','b','c','d') and r.status='completed')=4 and count(*)=4)
  from telegram_demo.cup c join public.tournaments t on t.id=c.tournament_id
  join rooms r on true
  where t.slug='telegram-cup-eight' and t.status='draft'
  group by t.id;
$$;

create or replace function public.telegram_cup_control(
  p_user_id bigint,p_action text,p_stage text default null,p_revision integer default null,
  p_one integer default null,p_two integer default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  room telegram_demo.cup%rowtype;
  slot_state telegram_demo.cup_match%rowtype;
  match_row record;
  board jsonb;
  next_play jsonb;
  old_play jsonb;
  wins integer[];
  one_sets integer[];
  two_sets integer[];
  previous_sub text;
  organiser uuid;
  winner uuid;
  qualified uuid[];
begin
  select s.organiser_id into organiser from telegram_demo.session s
  join public.global_admins a on a.user_id=s.organiser_id and a.status='approved'
  where s.telegram_user_id=p_user_id;
  if organiser is null then return jsonb_build_object('error','Эта команда доступна организатору демо.'); end if;
  select * into room from telegram_demo.cup where singleton;
  board := telegram_demo.cup_board();
  if board is null then return jsonb_build_object('error','Демо пока недоступно.'); end if;
  if p_action='view' then return board; end if;

  if p_action='advance' then
    perform 1 from telegram_demo.cup where singleton for update;
    perform 1 from telegram_demo.cup_match where slot in ('a','b','c','d') order by slot for update;
    board := telegram_demo.cup_board();
    if p_revision is distinct from (board->>'revision')::integer or board->>'draw_ready' is distinct from 'true' then
      return board||jsonb_build_object('error','Состав можно подтвердить после четырёх групповых матчей. Обновите пульт.');
    end if;
    select array_agg(g.winner_id order by g.code) into qualified
    from (select m.winner_id,tg.code from public.group_matches m join public.tournament_groups tg on tg.id=m.group_id
      where m.tournament_id=room.tournament_id and m.status='completed') g;
    previous_sub:=current_setting('request.jwt.claim.sub',true);
    perform set_config('request.jwt.claim.sub',organiser::text,true);
    perform public.confirm_group_qualifiers(room.tournament_id,qualified);
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    update public.matches set court='Корт ' || (case
      when bracket_kind='playoffs' then position
      when round=2 then 3 else position+2 end)::text
    where tournament_id=room.tournament_id;
    insert into telegram_demo.cup_match(slot,knockout_match_id,revision)
    select case
      when bracket_kind='playoffs' and round=2 then 'p'
      when bracket_kind='basement' and round=2 then 'k'
      when bracket_kind='playoffs' and position=1 then 'm'
      when bracket_kind='playoffs' then 'n'
      when position=1 then 'x' else 'y'
    end,id,(select max(revision)+1 from telegram_demo.cup_match)
    from public.matches where tournament_id=room.tournament_id and round in (1,2);
    update public.tournaments set status='draft' where id=room.tournament_id;
    return telegram_demo.cup_board();
  end if;

  select * into slot_state from telegram_demo.cup_match where slot=p_stage for update;
  if not found then return board||jsonb_build_object('error','Матч пока недоступен.'); end if;
  if p_revision is distinct from slot_state.revision then
    return telegram_demo.cup_board()||jsonb_build_object('error','Счёт уже обновился. Откройте свежую карточку.');
  end if;
  if slot_state.group_match_id is not null then
    select id,status,pair_one_id,pair_two_id into match_row from public.group_matches
    where id=slot_state.group_match_id and tournament_id=room.tournament_id for update;
  else
    select id,status,pair_one_id,pair_two_id into match_row from public.matches
    where id=slot_state.knockout_match_id and tournament_id=room.tournament_id for update;
  end if;
  if match_row.id is null or match_row.pair_one_id is null or match_row.pair_two_id is null then
    return board||jsonb_build_object('error','Для матча нужны две пары.');
  end if;
  next_play:=slot_state.play;
  if p_action='start' then
    if match_row.status<>'scheduled' then return board||jsonb_build_object('error','Матч уже начат.'); end if;
    if slot_state.group_match_id is not null then
      update public.group_matches set status='live',updated_at=now() where id=match_row.id;
    else
      update public.matches set status='live',updated_at=now() where id=match_row.id;
    end if;
  elsif match_row.status<>'live' then
    return board||jsonb_build_object('error','Изменение счёта доступно во время матча.');
  elsif p_action='undo' then
    if slot_state.undo_play is null then return board||jsonb_build_object('error','Пока нечего отменять.'); end if;
    next_play:=slot_state.undo_play;
  elsif p_action in ('finish','finishwithset','finishsets') then
    if p_action='finishwithset' then
      next_play:=telegram_demo.next_match_play(next_play,slot_state.group_match_id is not null,'set',null,null);
      if next_play?'error' then return board||next_play; end if;
    elsif p_action='finishsets' then
      next_play:=jsonb_set(jsonb_set(next_play,'{one}','0'::jsonb),'{two}','0'::jsonb);
    elsif (next_play->>'one')::integer<>0 or (next_play->>'two')::integer<>0 then
      return board||jsonb_build_object('error','Выберите, учитывать ли текущий сет.');
    end if;
    wins:=telegram_demo.wins(next_play->'sets');
    if wins[1]=wins[2] then
      return board||jsonb_build_object('error','Для завершения матча одна пара должна вести по сетам. Добавьте решающий сет.');
    end if;
    winner:=case when wins[1]>wins[2] then match_row.pair_one_id else match_row.pair_two_id end;
    select array_agg((item->>0)::integer order by position),array_agg((item->>1)::integer order by position)
    into one_sets,two_sets from jsonb_array_elements(next_play->'sets') with ordinality as entry(item,position);
    previous_sub:=current_setting('request.jwt.claim.sub',true);
    perform set_config('request.jwt.claim.sub',organiser::text,true);
    if slot_state.group_match_id is not null then
      perform public.record_group_match_result(match_row.id,one_sets,two_sets,winner);
    else
      perform public.record_match_result(match_row.id,one_sets,two_sets,winner);
      if p_stage='p' then update public.tournaments set status='draft' where id=room.tournament_id; end if;
    end if;
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  else
    next_play:=telegram_demo.next_match_play(slot_state.play,slot_state.group_match_id is not null,p_action,p_one,p_two);
    if next_play?'error' then return board||next_play; end if;
    if next_play=slot_state.play then return board; end if;
    old_play:=slot_state.play;
  end if;
  update telegram_demo.cup_match set revision=revision+1,play=next_play,undo_play=old_play where slot=p_stage;
  return telegram_demo.cup_board();
end;
$$;
