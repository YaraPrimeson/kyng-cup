create schema if not exists telegram_demo;
revoke all on schema telegram_demo from public, anon, authenticated;

create table telegram_demo.session (
  singleton boolean primary key default true check (singleton),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  organiser_id uuid not null references auth.users(id) on delete cascade,
  invite_hash bytea,
  invite_expires_at timestamptz,
  telegram_user_id bigint,
  revision integer not null default 0,
  undo_stage text,
  undo_one integer[],
  undo_two integer[]
);

create view telegram_demo.scoreboard as
select t.id as tournament_id, t.name as tournament, s.revision,
  s.undo_stage,
  (select jsonb_build_object('status', m.status, 'one', p1.name, 'two', p2.name,
    'score_one', m.pair_one_sets[1], 'score_two', m.pair_two_sets[1], 'winner', w.name)
    from public.group_matches m
    join public.pairs p1 on p1.id = m.pair_one_id
    join public.pairs p2 on p2.id = m.pair_two_id
    left join public.pairs w on w.id = m.winner_id
    where m.tournament_id = t.id order by m.position limit 1) as group_match,
  (select jsonb_build_object('status', m.status, 'one', p1.name, 'two', p2.name,
    'score_one', m.pair_one_sets[1], 'score_two', m.pair_two_sets[1], 'winner', w.name)
    from public.matches m
    join public.pairs p1 on p1.id = m.pair_one_id
    join public.pairs p2 on p2.id = m.pair_two_id
    left join public.pairs w on w.id = m.winner_id
    where m.tournament_id = t.id and m.bracket_kind = 'playoffs'
      and m.round = 1 and m.position = 1) as final_match
from telegram_demo.session s
join public.tournaments t on t.id = s.tournament_id
where t.slug = 'telegram-mini-demo' and t.status = 'draft';

create function public.telegram_demo_scoreboard()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) - 'tournament_id' - 'undo_stage' from telegram_demo.scoreboard s;
$$;
revoke all on function public.telegram_demo_scoreboard() from public;
grant execute on function public.telegram_demo_scoreboard() to anon, authenticated;

create function public.telegram_demo_control(
  p_user_id bigint, p_action text, p_stage text default null,
  p_revision integer default null, p_one integer default null,
  p_two integer default null, p_invite text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s telegram_demo.session%rowtype;
  m record;
  g public.group_matches%rowtype;
  board jsonb;
  one_games integer;
  two_games integer;
  winner uuid;
  previous_sub text;
  score_is_final boolean;
  previous_one integer[];
  previous_two integer[];
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
  ) then
    return jsonb_build_object('error','Демо пока недоступно.');
  end if;

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
    select * into g from public.group_matches where tournament_id = s.tournament_id for update;
    if not found or g.status <> 'completed' or g.winner_id is null or exists (
      select 1 from public.matches where tournament_id = s.tournament_id
    ) then
      return board || jsonb_build_object('error','Финал доступен после завершения группы.');
    end if;
    previous_sub := current_setting('request.jwt.claim.sub',true);
    perform set_config('request.jwt.claim.sub',s.organiser_id::text,true);
    perform public.confirm_group_qualifiers(s.tournament_id, array[
      g.winner_id, case when g.winner_id = g.pair_one_id then g.pair_two_id else g.pair_one_id end
    ]);
    perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    update public.matches set court = 'Корт 1' where tournament_id = s.tournament_id;
    update public.tournaments set status = 'draft' where id = s.tournament_id;
  else
    if p_stage = 'g' then
      select id,status,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets into m
        from public.group_matches where tournament_id = s.tournament_id for update;
    elsif p_stage = 'f' then
      select id,status,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets into m
        from public.matches where tournament_id = s.tournament_id
          and bracket_kind = 'playoffs' and round = 1 and position = 1 for update;
    else
      return board || jsonb_build_object('error','Выберите матч.');
    end if;
    if not found or m.pair_one_id is null or m.pair_two_id is null then
      return board || jsonb_build_object('error','В матче ещё нет двух пар.');
    end if;
    if (p_action = 'start' and m.status <> 'scheduled')
      or (p_action <> 'start' and m.status <> 'live') then
      return board || jsonb_build_object('error','Действие недоступно для текущего статуса матча.');
    end if;

    one_games := coalesce(m.pair_one_sets[1],0);
    two_games := coalesce(m.pair_two_sets[1],0);
    score_is_final := (greatest(one_games,two_games) = 6 and least(one_games,two_games) <= 4)
      or (greatest(one_games,two_games) = 7 and least(one_games,two_games) in (5,6));

    if p_action = 'start' then
      one_games := 0; two_games := 0;
    elsif p_action in ('plus1','plus2','score') then
      if p_action <> 'score' and score_is_final then
        return board || jsonb_build_object('error','Сет сыгран. Подтвердите итог или исправьте счёт.');
      end if;
      if p_action = 'score' then
        one_games := p_one; two_games := p_two;
      elsif p_action = 'plus1' then one_games := one_games + 1;
      else two_games := two_games + 1;
      end if;
      if one_games is null or two_games is null or least(one_games,two_games) < 0
        or greatest(one_games,two_games) > 7
        or (greatest(one_games,two_games) = 7 and least(one_games,two_games) not in (5,6)) then
        return board || jsonb_build_object('error','Введите счёт одного сета. Например, 3:2 или 7:5.');
      end if;
      if array[one_games] is not distinct from m.pair_one_sets
         and array[two_games] is not distinct from m.pair_two_sets then return board; end if;
      previous_one := m.pair_one_sets;
      previous_two := m.pair_two_sets;
    elsif p_action = 'undo' then
      if s.undo_stage is distinct from p_stage then
        return board || jsonb_build_object('error','Пока нечего отменять.');
      end if;
      one_games := s.undo_one[1]; two_games := s.undo_two[1];
    elsif p_action = 'finish' then
      if not score_is_final then
        return board || jsonb_build_object('error','Сначала введите итоговый счёт сета.');
      end if;
      winner := case when one_games > two_games then m.pair_one_id else m.pair_two_id end;
      previous_sub := current_setting('request.jwt.claim.sub',true);
      perform set_config('request.jwt.claim.sub',s.organiser_id::text,true);
      if p_stage = 'g' then
        perform public.record_group_match_result(m.id,array[one_games],array[two_games],winner);
      else
        perform public.record_match_result(m.id,array[one_games],array[two_games],winner);
        update public.tournaments set status = 'draft' where id = s.tournament_id;
      end if;
      perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
    else
      return board || jsonb_build_object('error','Неизвестное действие.');
    end if;

    if p_action <> 'finish' then
      if p_stage = 'g' then
        update public.group_matches set status = 'live', pair_one_sets = array[one_games],
          pair_two_sets = array[two_games], updated_at = now() where id = m.id;
      else
        update public.matches set status = 'live', pair_one_sets = array[one_games],
          pair_two_sets = array[two_games], updated_at = now() where id = m.id;
      end if;
    end if;
  end if;

  update telegram_demo.session
    set revision = revision + 1,
      undo_stage = case when p_action in ('plus1','plus2','score') then p_stage end,
      undo_one = previous_one,
      undo_two = previous_two
    where singleton;
  return (select to_jsonb(b) - 'tournament_id' from telegram_demo.scoreboard b);
end;
$$;

revoke all on function public.telegram_demo_control(bigint,text,text,integer,integer,integer,text)
  from public, anon, authenticated;
grant usage on schema telegram_demo to service_role;
grant select, update on telegram_demo.session to service_role;
grant select on telegram_demo.scoreboard to service_role;
grant execute on function public.telegram_demo_control(bigint,text,text,integer,integer,integer,text)
  to service_role;
