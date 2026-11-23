create table telegram_demo.cup (
  singleton boolean primary key default true check (singleton),
  tournament_id uuid not null unique references public.tournaments(id) on delete cascade
);

create table telegram_demo.cup_match (
  slot text primary key check (slot in ('a','b','p','k')),
  group_match_id uuid unique references public.group_matches(id) on delete cascade,
  knockout_match_id uuid unique references public.matches(id) on delete cascade,
  revision integer not null default 0,
  play jsonb not null default '{"sets":[],"one":0,"two":0}',
  undo_play jsonb,
  check (num_nonnulls(group_match_id,knockout_match_id) = 1),
  check ((slot in ('a','b')) = (group_match_id is not null))
);

grant select on telegram_demo.cup to service_role;
grant select,insert,update on telegram_demo.cup_match to service_role;

do $$
declare
  demo uuid;
  code text;
  group_id uuid;
  first_pair uuid;
  second_pair uuid;
  game uuid;
begin
  if not exists(select 1 from telegram_demo.session) then return; end if;
  insert into public.tournaments(slug,name,sport,status,registration_status,format,
    bracket_size,participant_count,playoff_participant_count,location)
  values ('telegram-cup-four','KYNG CUP · Демо на четыре пары','padel','draft','closed','group_knockout',
    2,4,2,'Тестовые корты') returning id into demo;
  insert into telegram_demo.cup(tournament_id) values(demo);
  foreach code in array array['A','B'] loop
    insert into public.tournament_groups(tournament_id,code,qualify_count)
    values (demo,code,1) returning id into group_id;
    insert into public.pairs(tournament_id,name,player_one,player_two,seed)
    values(demo,case when code='A' then 'Пара Север' else 'Пара Восток' end,'Демо 1 '||code,'Демо 2 '||code,case when code='A' then 1 else 3 end)
    returning id into first_pair;
    insert into public.pairs(tournament_id,name,player_one,player_two,seed)
    values(demo,case when code='A' then 'Пара Юг' else 'Пара Запад' end,'Демо 3 '||code,'Демо 4 '||code,case when code='A' then 2 else 4 end)
    returning id into second_pair;
    insert into public.group_members(group_id,pair_id,position)
    values(group_id,first_pair,1),(group_id,second_pair,2);
    insert into public.group_matches(tournament_id,group_id,position,pair_one_id,pair_two_id,court)
    values(demo,group_id,1,first_pair,second_pair,case when code='A' then 'Корт 1' else 'Корт 2' end) returning id into game;
    insert into telegram_demo.cup_match(slot,group_match_id) values(lower(code),game);
  end loop;
end;
$$;

create function telegram_demo.cup_board()
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
    'matches',coalesce(jsonb_object_agg(r.slot,telegram_demo.match_state(r.play,
      case when r.slot in ('a','b') then 'g' else 'f' end,r.status,r.name_one,r.name_two,r.winner)
      || jsonb_build_object('revision',r.revision,'court',r.court,'can_undo',r.undo_play is not null)), '{}'::jsonb),
    'draw_ready',count(*) filter(where r.slot in ('a','b') and r.status='completed')=2 and count(*)=2)
  from telegram_demo.cup c join public.tournaments t on t.id=c.tournament_id
  join rooms r on true
  where t.slug='telegram-cup-four' and t.status='draft'
  group by t.id;
$$;

create function public.telegram_cup_scoreboard()
returns jsonb language sql stable security definer set search_path = '' as $$
  select telegram_demo.cup_board();
$$;
revoke all on function public.telegram_cup_scoreboard() from public;
grant execute on function public.telegram_cup_scoreboard() to anon,authenticated;

create function telegram_demo.next_match_play(play jsonb, is_group boolean, action text, score_one integer, score_two integer)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  sets jsonb := play->'sets';
  wins integer[] := telegram_demo.wins(sets);
  current_set integer := jsonb_array_length(sets)+1;
  kind text := case when is_group then 'short' when current_set=3 then 'super' else 'standard' end;
  one_score integer := (play->>'one')::integer;
  two_score integer := (play->>'two')::integer;
  edit_set integer;
begin
  if action ~ '^edit[1-3]$' then
    edit_set := right(action,1)::integer;
    kind := case when is_group then 'short' when edit_set=3 then 'super' else 'standard' end;
    if edit_set >= current_set or not telegram_demo.segment_valid(kind,score_one,score_two)
      or not telegram_demo.segment_done(kind,score_one,score_two) then
      return jsonb_build_object('error','Укажите допустимый итог завершённого сета.');
    end if;
    sets := jsonb_set(sets,array[(edit_set-1)::text],jsonb_build_array(score_one,score_two));
    if not is_group and jsonb_array_length(sets)>=2
      and ((sets->0->>0)::integer > (sets->0->>1)::integer) = ((sets->1->>0)::integer > (sets->1->>1)::integer)
      and (jsonb_array_length(sets)>2 or one_score<>0 or two_score<>0) then
      return jsonb_build_object('error','Эта правка отменяет решающий тай-брейк. Сначала отмените или обнулите его счёт.');
    end if;
    return jsonb_set(play,'{sets}',sets);
  end if;
  if greatest(wins[1],wins[2]) >= (case when is_group then 1 else 2 end) then
    return jsonb_build_object('error','Нужные сеты сыграны. Подтвердите итог матча.');
  end if;
  if action='set' then
    if not telegram_demo.segment_done(kind,one_score,two_score) then
      return jsonb_build_object('error','Сначала внесите итоговый счёт этого сета.');
    end if;
    return jsonb_build_object('sets',sets||jsonb_build_array(jsonb_build_array(one_score,two_score)),'one',0,'two',0);
  end if;
  if action='score' then
    one_score := score_one;
    two_score := score_two;
  elsif action in ('plus1','plus2') then
    if telegram_demo.segment_done(kind,one_score,two_score) then
      return jsonb_build_object('error','Сет сыгран. Подтвердите или исправьте его счёт.');
    end if;
    if action='plus1' then one_score:=one_score+1; else two_score:=two_score+1; end if;
  else
    return jsonb_build_object('error','Неизвестное действие.');
  end if;
  if not telegram_demo.segment_valid(kind,one_score,two_score) then
    return jsonb_build_object('error','Счёт не соответствует правилам этого сета.');
  end if;
  return jsonb_build_object('sets',sets,'one',one_score,'two',two_score);
end;
$$;

create function public.telegram_cup_control(
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
    perform 1 from telegram_demo.cup_match where slot in ('a','b') order by slot for update;
    board := telegram_demo.cup_board();
    if p_revision is distinct from (board->>'revision')::integer or board->>'draw_ready' is distinct from 'true' then
      return board||jsonb_build_object('error','Состав можно подтвердить после двух групповых матчей. Обновите пульт.');
    end if;
    select array_agg(g.winner_id order by g.code) into qualified
    from (select m.winner_id,tg.code from public.group_matches m join public.tournament_groups tg on tg.id=m.group_id
      where m.tournament_id=room.tournament_id and m.status='completed') g;
    previous_sub:=current_setting('request.jwt.claim.sub',true);
    perform set_config('request.jwt.claim.sub',organiser::text,true);
    perform public.confirm_group_qualifiers(room.tournament_id,qualified);
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    update public.matches set court=case when bracket_kind='playoffs' then 'Корт 1' else 'Корт 2' end
    where tournament_id=room.tournament_id;
    insert into telegram_demo.cup_match(slot,knockout_match_id)
    select case when bracket_kind='playoffs' then 'p' else 'k' end,id
    from public.matches where tournament_id=room.tournament_id and round=1 and position=1;
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
  elsif p_action='finish' then
    wins:=telegram_demo.wins(next_play->'sets');
    if greatest(wins[1],wins[2])<(case when slot_state.group_match_id is not null then 1 else 2 end) then
      return board||jsonb_build_object('error','Сначала подтвердите завершение нужного количества сетов.');
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
revoke all on function public.telegram_cup_control(bigint,text,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.telegram_cup_control(bigint,text,text,integer,integer,integer) to service_role;
