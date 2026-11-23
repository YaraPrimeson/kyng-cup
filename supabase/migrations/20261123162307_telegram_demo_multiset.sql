alter table telegram_demo.session
  add column group_play jsonb not null default '{"sets":[],"one":0,"two":0}',
  add column final_play jsonb not null default '{"sets":[],"one":0,"two":0}',
  add column undo_play jsonb;

-- Keep the previous test and its results. The existing Telegram link now opens the new draw.
do $$
declare
  s telegram_demo.session%rowtype;
  previous_id uuid;
  demo_id uuid;
  group_id uuid;
  pair_ids uuid[];
begin
  select * into s from telegram_demo.session where singleton for update;
  if not found then return; end if;

  update public.tournaments set slug = 'telegram-mini-demo-v1',
    name = name || ' · Первый тест'
  where id = s.tournament_id and slug = 'telegram-mini-demo' and status = 'draft'
  returning id into previous_id;
  if previous_id is null then raise exception 'The previous demo must be a draft'; end if;

  insert into public.tournaments(slug,name,sport,status,registration_status,format,
    bracket_size,participant_count,playoff_participant_count,location)
  select 'telegram-mini-demo','KYNG CUP · Telegram-демо',sport,'draft','closed',
    'group_knockout',2,2,2,location
  from public.tournaments where id = previous_id returning id into demo_id;

  with copied as (
    insert into public.pairs(tournament_id,name,player_one,player_two,seed,country_code)
    select demo_id,name,player_one,player_two,seed,country_code
    from public.pairs where tournament_id = previous_id returning id,seed
  )
  select array_agg(id order by seed,id) into pair_ids from copied;
  if cardinality(pair_ids) is distinct from 2 then raise exception 'The demo needs two pairs'; end if;

  insert into public.tournament_groups(tournament_id,code,qualify_count)
  values (demo_id,'A',2) returning id into group_id;
  insert into public.group_members(group_id,pair_id,position)
  values (group_id,pair_ids[1],1),(group_id,pair_ids[2],2);
  insert into public.group_matches(tournament_id,group_id,position,pair_one_id,pair_two_id,court)
  values (demo_id,group_id,1,pair_ids[1],pair_ids[2],'Корт 1');

  update telegram_demo.session set tournament_id = demo_id,
    group_target = 3, final_target = 6, revision = revision + 1,
    undo_stage = null, undo_one = null, undo_two = null where singleton;
end;
$$;

create function telegram_demo.segment_done(kind text, one_score integer, two_score integer)
returns boolean language sql immutable set search_path = '' as $$
  select case kind
    when 'short' then greatest(one_score,two_score) = 3 and least(one_score,two_score) < 3
    when 'super' then greatest(one_score,two_score) = 10 and least(one_score,two_score) <= 8
      or greatest(one_score,two_score) > 10 and abs(one_score-two_score) = 2
    else greatest(one_score,two_score) = 6 and least(one_score,two_score) <= 4
      or greatest(one_score,two_score) = 7 and least(one_score,two_score) in (5,6)
  end;
$$;

create function telegram_demo.segment_valid(kind text, one_score integer, two_score integer)
returns boolean language sql immutable set search_path = '' as $$
  select one_score is not null and two_score is not null and least(one_score,two_score) >= 0
    and case kind
      when 'short' then greatest(one_score,two_score) < 3 or telegram_demo.segment_done(kind,one_score,two_score)
      when 'super' then greatest(one_score,two_score) <= 99
        and (greatest(one_score,two_score) < 10 or abs(one_score-two_score) < 2
          or telegram_demo.segment_done(kind,one_score,two_score))
      else greatest(one_score,two_score) <= 6 or telegram_demo.segment_done(kind,one_score,two_score)
    end;
$$;

create function telegram_demo.wins(sets jsonb)
returns integer[] language sql immutable set search_path = '' as $$
  select array[count(*) filter (where (result->>0)::integer > (result->>1)::integer)::integer,
    count(*) filter (where (result->>0)::integer < (result->>1)::integer)::integer]
  from jsonb_array_elements(sets) result;
$$;

create function telegram_demo.match_state(play jsonb, stage text, match_status text,
  pair_one text, pair_two text, winner text)
returns jsonb language sql immutable set search_path = '' as $$
  with state as (
    select play->'sets' as sets, telegram_demo.wins(play->'sets') as wins,
      (play->>'one')::integer as one_score, (play->>'two')::integer as two_score
  )
  select jsonb_build_object(
    'status',match_status,'one',pair_one,'two',pair_two,'winner',winner,
    'format',case when stage = 'g' then 'short' else 'best_of_three' end,
    'sets',sets, 'sets_one',wins[1], 'sets_two',wins[2],
    'score_one',coalesce(case when match_status = 'live' then one_score end,(sets->-1->>0)::integer),
    'score_two',coalesce(case when match_status = 'live' then two_score end,(sets->-1->>1)::integer),
    'active',case when match_status = 'live' and greatest(wins[1],wins[2]) < case when stage = 'g' then 1 else 2 end
      then jsonb_build_object('number',jsonb_array_length(sets)+1,'one',one_score,'two',two_score,
        'kind',case when stage = 'g' then 'short' when jsonb_array_length(sets) = 2 then 'super' else 'standard' end) end
  ) from state;
$$;

create or replace view telegram_demo.scoreboard as
select t.id as tournament_id, t.name as tournament, s.revision, s.undo_stage,
  (select telegram_demo.match_state(s.group_play,'g',m.status,p1.name,p2.name,w.name)
    from public.group_matches m
    join public.pairs p1 on p1.id = m.pair_one_id
    join public.pairs p2 on p2.id = m.pair_two_id
    left join public.pairs w on w.id = m.winner_id
    where m.tournament_id = t.id order by m.position limit 1) as group_match,
  (select telegram_demo.match_state(s.final_play,'f',m.status,p1.name,p2.name,w.name)
    from public.matches m
    join public.pairs p1 on p1.id = m.pair_one_id
    join public.pairs p2 on p2.id = m.pair_two_id
    left join public.pairs w on w.id = m.winner_id
    where m.tournament_id = t.id and m.bracket_kind = 'playoffs'
      and m.round = 1 and m.position = 1) as final_match,
  s.group_target,s.final_target
from telegram_demo.session s
join public.tournaments t on t.id = s.tournament_id
where t.slug = 'telegram-mini-demo' and t.status = 'draft';

create or replace function public.telegram_demo_control(
  p_user_id bigint, p_action text, p_stage text default null,
  p_revision integer default null, p_one integer default null,
  p_two integer default null, p_invite text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s telegram_demo.session%rowtype;
  m record;
  group_match public.group_matches%rowtype;
  board jsonb;
  play jsonb;
  previous_play jsonb;
  sets jsonb;
  wins integer[];
  goals integer;
  current_set integer;
  edit_set integer;
  kind text;
  one_score integer;
  two_score integer;
  winner uuid;
  one_sets integer[];
  two_sets integer[];
  previous_sub text;
  empty_play constant jsonb := '{"sets":[],"one":0,"two":0}';
begin
  select * into s from telegram_demo.session where singleton for update;
  select to_jsonb(b) - 'tournament_id' into board from telegram_demo.scoreboard b;
  if board is null or p_user_id is null or p_user_id <= 0 then
    return jsonb_build_object('error','Демо пока недоступно.');
  end if;
  perform 1 from public.tournaments
    where id = s.tournament_id and slug = 'telegram-mini-demo' and status = 'draft' for update;
  if not found or not exists (
    select 1 from public.global_admins where user_id = s.organiser_id and status = 'approved'
  ) then return jsonb_build_object('error','Демо пока недоступно.'); end if;

  if p_action = 'claim' and s.telegram_user_id is null
    and s.invite_expires_at > now() and p_invite ~ '^[a-f0-9]{48}$'
    and s.invite_hash = sha256(convert_to(p_invite,'UTF8')) then
    update telegram_demo.session set telegram_user_id = p_user_id,
      invite_hash = null, invite_expires_at = null where singleton;
    s.telegram_user_id := p_user_id;
  end if;
  if s.telegram_user_id is distinct from p_user_id then
    return jsonb_build_object('error','Откройте личную ссылку-приглашение для демо.');
  end if;
  if p_action in ('claim','view') then return board; end if;
  if p_revision is distinct from s.revision then
    return board || jsonb_build_object('error','Счёт уже обновился. Откройте свежую карточку.');
  end if;

  if p_action = 'advance' then
    select * into group_match from public.group_matches where tournament_id = s.tournament_id for update;
    if not found or group_match.status <> 'completed' or group_match.winner_id is null or exists (
      select 1 from public.matches where tournament_id = s.tournament_id
    ) then return board || jsonb_build_object('error','Финал доступен после завершения группы.'); end if;

    previous_sub := current_setting('request.jwt.claim.sub',true);
    perform set_config('request.jwt.claim.sub',s.organiser_id::text,true);
    perform public.confirm_group_qualifiers(s.tournament_id,array[
      group_match.winner_id,
      case when group_match.winner_id = group_match.pair_one_id then group_match.pair_two_id else group_match.pair_one_id end
    ]);
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    update public.matches set court = 'Корт 1' where tournament_id = s.tournament_id;
    update public.tournaments set status = 'draft' where id = s.tournament_id;
    p_stage := 'f';
    play := empty_play;
  else
    if p_stage = 'g' then
      select id,status,pair_one_id,pair_two_id into m
      from public.group_matches where tournament_id = s.tournament_id for update;
      play := s.group_play;
      goals := 1;
    elsif p_stage = 'f' then
      select id,status,pair_one_id,pair_two_id into m
      from public.matches where tournament_id = s.tournament_id
        and bracket_kind = 'playoffs' and round = 1 and position = 1 for update;
      play := s.final_play;
      goals := 2;
    else return board || jsonb_build_object('error','Выберите матч.'); end if;

    if m.id is null or m.pair_one_id is null or m.pair_two_id is null then
      return board || jsonb_build_object('error','В матче ещё нет двух пар.');
    end if;
    if p_action = 'start' then
      if m.status <> 'scheduled' then return board || jsonb_build_object('error','Матч уже был начат.'); end if;
      play := empty_play;
      if p_stage = 'g' then
        update public.group_matches set status = 'live',updated_at = now() where id = m.id;
      else
        update public.matches set status = 'live',updated_at = now() where id = m.id;
      end if;
    elsif m.status <> 'live' then
      return board || jsonb_build_object('error','Изменение счёта доступно во время матча.');
    elsif p_action = 'undo' then
      if s.undo_stage is distinct from p_stage or s.undo_play is null then
        return board || jsonb_build_object('error','Пока нечего отменять.');
      end if;
      play := s.undo_play;
    else
      sets := play->'sets';
      wins := telegram_demo.wins(sets);
      current_set := jsonb_array_length(sets)+1;
      kind := case when p_stage = 'g' then 'short' when current_set = 3 then 'super' else 'standard' end;
      one_score := (play->>'one')::integer;
      two_score := (play->>'two')::integer;

      if p_action = 'finish' then
        if greatest(wins[1],wins[2]) < goals then
          return board || jsonb_build_object('error','Сначала подтвердите завершение нужного количества сетов.');
        end if;
        winner := case when wins[1] > wins[2] then m.pair_one_id else m.pair_two_id end;
        select array_agg((item->>0)::integer order by position),array_agg((item->>1)::integer order by position)
        into one_sets,two_sets from jsonb_array_elements(sets) with ordinality as entry(item,position);
        previous_sub := current_setting('request.jwt.claim.sub',true);
        perform set_config('request.jwt.claim.sub',s.organiser_id::text,true);
        if p_stage = 'g' then
          perform public.record_group_match_result(m.id,one_sets,two_sets,winner);
        else
          perform public.record_match_result(m.id,one_sets,two_sets,winner);
          update public.tournaments set status = 'draft' where id = s.tournament_id;
        end if;
        perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
      elsif p_action ~ '^edit[1-3]$' then
        edit_set := right(p_action,1)::integer;
        kind := case when p_stage = 'g' then 'short' when edit_set = 3 then 'super' else 'standard' end;
        if edit_set >= current_set or not telegram_demo.segment_valid(kind,p_one,p_two)
          or not telegram_demo.segment_done(kind,p_one,p_two) then
          return board || jsonb_build_object('error','Укажите допустимый итог завершённого сета.');
        end if;
        sets := jsonb_set(sets,array[(edit_set-1)::text],jsonb_build_array(p_one,p_two));
        wins := telegram_demo.wins(sets);
        if p_stage = 'f' and jsonb_array_length(sets) >= 2
          and ((sets->0->>0)::integer > (sets->0->>1)::integer)
            = ((sets->1->>0)::integer > (sets->1->>1)::integer)
          and (jsonb_array_length(sets) > 2 or one_score <> 0 or two_score <> 0) then
          return board || jsonb_build_object('error','Эта правка отменяет решающий тай-брейк. Сначала отмените или обнулите его счёт.');
        end if;
        previous_play := play;
        play := jsonb_set(play,'{sets}',sets);
      else
        if greatest(wins[1],wins[2]) >= goals then
          return board || jsonb_build_object('error','Нужные сеты сыграны. Подтвердите итог матча.');
        end if;
        previous_play := play;
        if p_action = 'set' then
          if not telegram_demo.segment_done(kind,one_score,two_score) then
            return board || jsonb_build_object('error','Сначала внесите итоговый счёт этого сета.');
          end if;
          play := jsonb_build_object('sets',sets || jsonb_build_array(jsonb_build_array(one_score,two_score)),
            'one',0,'two',0);
        elsif p_action in ('plus1','plus2','score') then
          if p_action = 'score' then
            one_score := p_one;
            two_score := p_two;
          else
            if telegram_demo.segment_done(kind,one_score,two_score) then
              return board || jsonb_build_object('error','Сет сыгран. Подтвердите или исправьте его счёт.');
            end if;
            if p_action = 'plus1' then one_score := one_score + 1; else two_score := two_score + 1; end if;
          end if;
          if not telegram_demo.segment_valid(kind,one_score,two_score) then
            return board || jsonb_build_object('error','Счёт не соответствует правилам этого сета.');
          end if;
          play := jsonb_build_object('sets',sets,'one',one_score,'two',two_score);
        else return board || jsonb_build_object('error','Неизвестное действие.');
        end if;
      end if;
    end if;
  end if;

  if previous_play = play then return board; end if;
  update telegram_demo.session set revision = revision + 1,
    group_play = case when p_stage = 'g' then play else group_play end,
    final_play = case when p_stage = 'f' then play else final_play end,
    undo_stage = case when previous_play is not null then p_stage end, undo_play = previous_play
  where singleton;
  return (select to_jsonb(b) - 'tournament_id' from telegram_demo.scoreboard b);
end;
$$;
