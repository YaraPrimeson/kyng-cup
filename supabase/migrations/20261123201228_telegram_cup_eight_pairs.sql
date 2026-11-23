alter table telegram_demo.cup_match
  drop constraint cup_match_slot_check,
  drop constraint cup_match_check1,
  add constraint cup_match_slot_check check (slot in ('a','b','c','d','m','n','p','x','y','k')),
  add constraint cup_match_group_slot_check check ((slot in ('a','b','c','d')) = (group_match_id is not null));

create table telegram_demo.retired_tournaments (
  slug text primary key,
  retired_at timestamptz not null default now(),
  snapshot jsonb not null
);
revoke all on telegram_demo.retired_tournaments from public, anon, authenticated, service_role;

do $$
declare
  duo uuid;
  cup uuid;
  demo uuid;
  old record;
  group_index integer;
  code text;
  group_id uuid;
  one_id uuid;
  two_id uuid;
  game uuid;
  first_revision integer;
  names constant text[] := array['Север','Юг','Восток','Запад','Альфа','Бета','Омега','Сигма'];
begin
  select tournament_id into duo from telegram_demo.session where singleton for update;
  select tournament_id into cup from telegram_demo.cup where singleton for update;
  if duo is null and cup is null then return; end if;
  if duo is null or cup is null or duo=cup
    or not exists(select 1 from public.tournaments where id=duo and slug='telegram-mini-demo' and status='draft')
    or not exists(select 1 from public.tournaments where id=cup and slug='telegram-cup-four' and status='draft')
    or exists(select 1 from public.tournament_registrations where tournament_id in (duo,cup)) then
    raise exception 'Only the two draft Telegram demos without registrations can be replaced';
  end if;

  select greatest(coalesce(sum(revision),0),coalesce((select revision from telegram_demo.session where singleton),0),1000)::integer+1
  into first_revision from telegram_demo.cup_match;
  for old in select * from public.tournaments where id in (duo,cup) for update loop
    insert into telegram_demo.retired_tournaments(slug,snapshot)
    select old.slug,jsonb_build_object('tournament',to_jsonb(old),
      'pairs',(select jsonb_agg(p) from public.pairs p where p.tournament_id=old.id),
      'groups',(select jsonb_agg(g) from public.tournament_groups g where g.tournament_id=old.id),
      'members',(select jsonb_agg(m) from public.group_members m join public.tournament_groups g on g.id=m.group_id where g.tournament_id=old.id),
      'group_matches',(select jsonb_agg(m) from public.group_matches m where m.tournament_id=old.id),
      'matches',(select jsonb_agg(m) from public.matches m where m.tournament_id=old.id),
      'result_history',(select jsonb_agg(h) from public.match_result_history h where h.tournament_id=old.id),
      'live_score',case when old.id=duo then
        (select jsonb_build_object('group',s.group_play,'final',s.final_play) from telegram_demo.session s where singleton)
        else (select jsonb_agg(m) from telegram_demo.cup_match m) end);
  end loop;

  insert into public.tournaments(slug,name,sport,status,registration_status,format,
    bracket_size,participant_count,playoff_participant_count,location)
  values ('telegram-cup-eight','KYNG CUP · Демо на восемь пар','padel','draft','closed','group_knockout',
    4,8,4,'Тестовые корты') returning id into demo;
  update telegram_demo.session set tournament_id=demo,revision=first_revision,undo_stage=null,undo_play=null where singleton;
  update telegram_demo.cup set tournament_id=demo where singleton;
  delete from telegram_demo.cup_match;
  delete from public.group_matches where tournament_id in (duo,cup);
  delete from public.matches where tournament_id in (duo,cup);
  delete from public.tournaments where id in (duo,cup);

  for group_index in 1..4 loop
    code:=substr('ABCD',group_index,1);
    insert into public.tournament_groups(tournament_id,code,qualify_count)
    values(demo,code,1) returning id into group_id;
    insert into public.pairs(tournament_id,name,player_one,player_two,seed)
    values(demo,'Пара '||names[group_index*2-1],'Демо 1 '||code,'Демо 2 '||code,group_index*2-1) returning id into one_id;
    insert into public.pairs(tournament_id,name,player_one,player_two,seed)
    values(demo,'Пара '||names[group_index*2],'Демо 3 '||code,'Демо 4 '||code,group_index*2) returning id into two_id;
    insert into public.group_members(group_id,pair_id,position)
    values(group_id,one_id,1),(group_id,two_id,2);
    insert into public.group_matches(tournament_id,group_id,position,pair_one_id,pair_two_id,court)
    values(demo,group_id,1,one_id,two_id,'Корт '||group_index) returning id into game;
    insert into telegram_demo.cup_match(slot,group_match_id,revision)
    values(lower(code),game,first_revision);
  end loop;
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
    'matches',coalesce(jsonb_object_agg(r.slot,telegram_demo.match_state(r.play,
      case when r.slot in ('a','b','c','d') then 'g' else 'f' end,r.status,r.name_one,r.name_two,r.winner)
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
