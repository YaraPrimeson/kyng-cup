-- Telegram operator state is private. The public match rows remain the source of final results.
create schema telegram_ops;
revoke all on schema telegram_ops from public, anon, authenticated;
create table telegram_ops.links (
  telegram_id bigint primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade
);
create table telegram_ops.link_requests (
  telegram_id bigint primary key check (telegram_id > 0),
  digest bytea not null unique,
  telegram_label text not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create table telegram_ops.panels (
  telegram_id bigint primary key references telegram_ops.links on delete cascade,
  panel_key text not null check (panel_key ~ '^[0-9a-f]{24}$'),
  buttons jsonb not null,
  input jsonb,
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create table telegram_ops.live_scores (
  match_id uuid primary key,
  group_match boolean not null,
  match_version timestamptz not null,
  play jsonb not null,
  undo jsonb
);
alter table telegram_ops.links enable row level security;
alter table telegram_ops.link_requests enable row level security;
alter table telegram_ops.panels enable row level security;
alter table telegram_ops.live_scores enable row level security;
alter table public.matches add column awarded_sets integer[] not null default '{}';
alter table public.group_matches add column awarded_sets integer[] not null default '{}';

-- Keep the compatibility score arrays for existing score/winner validation.
-- Ordinary web edits clear the marker when the recorded score changes.
create function telegram_ops.clear_awarded_sets() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.pair_one_sets is distinct from old.pair_one_sets
      or new.pair_two_sets is distinct from old.pair_two_sets
      or new.status is distinct from old.status
      or new.winner_id is distinct from old.winner_id then
    new.awarded_sets := '{}';
  end if;
  return new;
end;
$$;
create trigger clear_telegram_awards before update of pair_one_sets,pair_two_sets,status,winner_id
on public.matches for each row execute function telegram_ops.clear_awarded_sets();
create trigger clear_telegram_awards before update of pair_one_sets,pair_two_sets,status,winner_id
on public.group_matches for each row execute function telegram_ops.clear_awarded_sets();

create function public.telegram_link_info(p_code text) returns text
language sql stable security definer set search_path='' as $$
  select r.telegram_label from telegram_ops.link_requests r
  where (select public.is_global_admin()) and p_code ~ '^[0-9a-f]{48}$'
    and r.digest=sha256(convert_to(p_code,'UTF8')) and r.expires_at>now();
$$;
create function public.telegram_confirm_link(p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare telegram_user bigint; organiser uuid := (select auth.uid());
begin
  if organiser is null or not (select public.is_global_admin()) or p_code is null or p_code !~ '^[0-9a-f]{48}$' then
    return false;
  end if;
  delete from telegram_ops.link_requests
    where digest=sha256(convert_to(p_code,'UTF8')) and expires_at>now()
    returning telegram_id into telegram_user;
  if not found then return false; end if;
  -- Explicit confirmation authorises relinking this organiser, never taking another organiser's account.
  perform 1 from public.global_admins where user_id=organiser and status='approved' for update;
  if not found then return false; end if;
  if exists(select 1 from telegram_ops.links where telegram_id=telegram_user and user_id<>organiser) then return false; end if;
  delete from telegram_ops.links where user_id=organiser and telegram_id<>telegram_user;
  insert into telegram_ops.links values(telegram_user,organiser) on conflict (telegram_id) do nothing;
  return exists(select 1 from telegram_ops.links where telegram_id=telegram_user and user_id=organiser);
end;
$$;
revoke all on function public.telegram_link_info(text),public.telegram_confirm_link(text) from public,anon,authenticated;
grant execute on function public.telegram_link_info(text),public.telegram_confirm_link(text) to authenticated;

create function telegram_ops.play(
  p_match uuid, p_group boolean, p_version timestamptz, p_one integer[], p_two integer[], p_awarded integer[]
) returns jsonb language sql stable set search_path='' as $$
  select coalesce(
    (select live.play from telegram_ops.live_scores live
     where live.match_id=p_match and live.group_match=p_group and live.match_version=p_version),
    jsonb_build_object('one',0,'two',0,'sets',coalesce((
      select jsonb_agg(
        case when i=any(p_awarded) then jsonb_build_array(p_one[i],p_two[i],true)
          else jsonb_build_array(p_one[i],p_two[i]) end order by i)
      from generate_subscripts(p_one,1) i
      where p_one[i]<>p_two[i]),'[]'::jsonb))
  );
$$;

create view telegram_ops.match_rows as
  select id,tournament_id,group_id,position,status,court,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,
    updated_at,awarded_sets,null::text as bracket_kind,null::integer as round,null::uuid as next_match_id
  from public.group_matches
  union all
  select id,tournament_id,null,position,status,court,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,
    updated_at,awarded_sets,bracket_kind,round,next_match_id from public.matches;

create function telegram_ops.board(p_tournament uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'tournament',jsonb_build_object('id',t.id,'name',t.name,'status',t.status,'format',t.format,'version',t.updated_at),
    'pairs',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'player_one',p.player_one,
      'player_two',p.player_two,'version',p.updated_at,
      'linked',exists(select 1 from player_private.registration_pair_links l where l.pair_id=p.id))
      order by p.seed nulls last,p.id) from public.pairs p where p.tournament_id=t.id),'[]'::jsonb),
    'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'qualify_count',g.qualify_count,
      'members',coalesce((select jsonb_agg(to_jsonb(gm) order by gm.position) from public.group_members gm where gm.group_id=g.id),'[]'::jsonb))
      order by g.code) from public.tournament_groups g where g.tournament_id=t.id),'[]'::jsonb),
    'matches',coalesce((select jsonb_agg((to_jsonb(m)-'tournament_id')
      ||jsonb_build_object('play',telegram_ops.play(m.id,m.group_id is not null,m.updated_at,m.pair_one_sets,m.pair_two_sets,m.awarded_sets),
       'can_undo',exists(select 1 from telegram_ops.live_scores l where l.match_id=m.id and l.group_match=(m.group_id is not null)
         and l.match_version=m.updated_at and l.undo is not null),
       'entry_one',not exists(select 1 from public.matches prior where prior.next_match_id=m.id and prior.next_slot=1),
       'entry_two',not exists(select 1 from public.matches prior where prior.next_match_id=m.id and prior.next_slot=2))
      order by m.group_id,m.bracket_kind,m.round,m.position,m.id)
      from telegram_ops.match_rows m where m.tournament_id=t.id),'[]'::jsonb)
  ) from public.tournaments t where t.id=p_tournament;
$$;

create function telegram_ops.match_action(p_tournament uuid,p_match uuid,p_group boolean,p_action text,p jsonb)
returns text language plpgsql set search_path='' as $$
declare
  target telegram_ops.match_rows%rowtype;
  before_play jsonb;
  after_play jsonb;
  previous_undo jsonb;
  stamp timestamptz := clock_timestamp();
  final_sets jsonb;
  one_sets integer[];
  two_sets integer[];
  awards integer[];
  wins integer[];
  winner uuid;
  tournament_status text;
begin
  if p_group then
    perform 1 from public.group_matches where id=p_match and tournament_id=p_tournament for update;
  else
    perform 1 from public.matches where id=p_match and tournament_id=p_tournament for update;
  end if;
  select * into target from telegram_ops.match_rows where id=p_match and tournament_id=p_tournament
    and (group_id is not null)=p_group;
  if not found or target.pair_one_id is null or target.pair_two_id is null then return 'Для матча нужны две пары.'; end if;
  if target.updated_at is distinct from (p->>'version')::timestamptz then return 'Матч уже обновился. Открыты свежие данные.'; end if;
  select status into tournament_status from public.tournaments where id=p_tournament;
  if tournament_status='completed' and p_action<>'correct' then return 'Турнир завершён.'; end if;
  if p_action='start' and target.status<> 'scheduled' then return 'Матч уже начат.'; end if;
  if p_action='correct' and target.status<>'completed' then return 'Матч ещё не завершён.'; end if;
  if p_action not in ('start','correct') and target.status<>'live' then return 'Начните матч, чтобы вести счёт.'; end if;
  before_play:=telegram_ops.play(p_match,p_group,target.updated_at,target.pair_one_sets,target.pair_two_sets,target.awarded_sets);
  after_play:=before_play;
  if p_action='undo' then
    select undo into after_play from telegram_ops.live_scores where match_id=p_match and group_match=p_group and match_version=target.updated_at;
    if after_play is null then return 'Действие уже отменено или счёт изменился.'; end if;
  elsif p_action in ('finish','finishwithset','finishsets','correct') then
    if p_action='correct' then
      if nullif(btrim(p->>'reason'),'') is null or length(p->>'reason')>300 then return 'Укажите причину правки до 300 символов.'; end if;
      final_sets:=p->'sets';
      if jsonb_typeof(final_sets) is distinct from 'array' or jsonb_array_length(final_sets)>198 then return 'Проверьте счёт сетов.'; end if;
      -- Preserve markers for unchanged manually awarded sets.
      select jsonb_agg(
        case when (before_play->'sets'->(i-1)->>2)='true'
          and (before_play->'sets'->(i-1))-2=item then item||'true'::jsonb else item end order by i)
      into final_sets from jsonb_array_elements(final_sets) with ordinality v(item,i1)
      cross join lateral (select i1::integer as i) idx;
    else
      if p_action='finishwithset' then
        after_play:=telegram_demo.next_match_play(before_play,p_group,'set',null,null);
        if after_play?'error' then return after_play->>'error'; end if;
      elsif p_action='finish' and ((before_play->>'one')::integer<>0 or (before_play->>'two')::integer<>0) then
        return 'Выберите, учитывать ли текущий сет.';
      end if;
      final_sets:=after_play->'sets';
    end if;
    select array_agg((item->>0)::integer order by i),array_agg((item->>1)::integer order by i),
      coalesce(array_agg(i::integer order by i) filter(where item->>2='true'),'{}')
      into one_sets,two_sets,awards from jsonb_array_elements(final_sets) with ordinality v(item,i);
    wins:=telegram_demo.wins(final_sets);
    if wins[1]=wins[2] then return 'Укажите решающий сет. Для завершения нужна победившая пара.'; end if;
    winner:=case when wins[1]>wins[2] then target.pair_one_id else target.pair_two_id end;
    -- Group score changes can change qualification even with the same winner.
    if p_action='correct' and p_group and exists(
      select 1 from public.matches where tournament_id=p_tournament and (pair_one_id is not null or pair_two_id is not null)
    ) then return 'Сетки уже подтверждены. Измените групповой результат в админке и проверьте состав сеток.'; end if;
    if p_group then
      perform public.record_group_match_result(p_match,one_sets,two_sets,winner);
      update public.group_matches set awarded_sets=awards,updated_at=stamp where id=p_match;
    else
      perform public.record_match_result(p_match,one_sets,two_sets,winner);
      update public.matches set awarded_sets=awards,updated_at=stamp where id=p_match;
      -- The shared web RPC closes the tournament at the main final. The Telegram
      -- workflow closes it explicitly after both brackets are complete.
      update public.tournaments set status=tournament_status,updated_at=stamp
        where id=p_tournament and status is distinct from tournament_status;
    end if;
    delete from telegram_ops.live_scores where match_id=p_match and group_match=p_group;
    insert into public.activity_log(tournament_id,entity_type,entity_id,action,changed_by,before_state,after_state)
    values(p_tournament,'match',p_match,case when p_action='correct' then 'telegram_correct' else 'telegram_finish' end,
      (select auth.uid()),before_play,jsonb_build_object('sets',final_sets,'winner_id',winner,'reason',p->>'reason'));
    return null;
  elsif p_action<>'start' then
    after_play:=telegram_demo.next_match_play(before_play,p_group,p_action,(p->>'one')::integer,(p->>'two')::integer);
    if after_play?'error' then return after_play->>'error'; end if;
    if after_play=before_play then return null; end if;
    previous_undo:=before_play;
  end if;
  if p_group then update public.group_matches set status='live',updated_at=stamp where id=p_match;
  else update public.matches set status='live',updated_at=stamp where id=p_match; end if;
  insert into telegram_ops.live_scores values(p_match,p_group,stamp,after_play,previous_undo)
    on conflict(match_id) do update set group_match=excluded.group_match,match_version=stamp,play=after_play,undo=previous_undo;
  if p_action='undo' then
    insert into public.activity_log(tournament_id,entity_type,entity_id,action,changed_by,before_state,after_state)
    values(p_tournament,'match',p_match,'telegram_undo',(select auth.uid()),before_play,after_play);
  end if;
  return null;
end;
$$;

create function telegram_ops.draw_version(p_tournament uuid) returns text
language sql stable set search_path='' as $$
  select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(g) order by g.id) from public.tournament_groups g where g.tournament_id=p_tournament),
    (select jsonb_agg(to_jsonb(m) order by m.group_id,m.position) from public.group_members m
      join public.tournament_groups g on g.id=m.group_id where g.tournament_id=p_tournament),
    (select jsonb_agg(to_jsonb(m) order by m.id) from public.group_matches m where m.tournament_id=p_tournament)
  )::text);
$$;

create function telegram_ops.swap_pairs(p_tournament uuid,p jsonb) returns text
language plpgsql set search_path='' as $$
declare
  first_match public.matches%rowtype;
  second_match public.matches%rowtype;
  first_id uuid := (p->>'match_id')::uuid;
  second_id uuid := (p->>'other_id')::uuid;
  first_side integer := (p->>'side')::integer;
  second_side integer := (p->>'other_side')::integer;
  first_pair uuid;
  second_pair uuid;
  stamp timestamptz := clock_timestamp();
begin
  if first_id is null or second_id is null or first_id=second_id
    or first_side is null or second_side is null or first_side not in (1,2) or second_side not in (1,2) then
    return 'Выберите пары из двух разных матчей.';
  end if;
  perform 1 from public.matches where id in(first_id,second_id) and tournament_id=p_tournament order by id for update;
  select * into first_match from public.matches where id=first_id and tournament_id=p_tournament;
  select * into second_match from public.matches where id=second_id and tournament_id=p_tournament;
  if first_match.id is null or second_match.id is null or first_match.bracket_kind<>second_match.bracket_kind
    or first_match.status<>'scheduled' or second_match.status<>'scheduled'
    or first_match.updated_at is distinct from (p->>'version')::timestamptz
    or second_match.updated_at is distinct from (p->>'other_version')::timestamptz
    or cardinality(first_match.pair_one_sets)+cardinality(first_match.pair_two_sets)>0
    or cardinality(second_match.pair_one_sets)+cardinality(second_match.pair_two_sets)>0
    or exists(select 1 from public.matches where (next_match_id=first_id and next_slot=first_side)
      or (next_match_id=second_id and next_slot=second_side)) then
    return 'Матчи уже изменились. Выберите два свободных места в одной сетке.';
  end if;
  first_pair:=case first_side when 1 then first_match.pair_one_id else first_match.pair_two_id end;
  second_pair:=case second_side when 1 then second_match.pair_one_id else second_match.pair_two_id end;
  if first_pair is null or second_pair is null or first_pair=second_pair
    or second_pair=(case first_side when 1 then first_match.pair_two_id else first_match.pair_one_id end)
    or first_pair=(case second_side when 1 then second_match.pair_two_id else second_match.pair_one_id end) then
    return 'В этих местах нельзя поменять пары.';
  end if;
  update public.matches set
    pair_one_id=case when id=first_id and first_side=1 then second_pair when id=second_id and second_side=1 then first_pair else pair_one_id end,
    pair_two_id=case when id=first_id and first_side=2 then second_pair when id=second_id and second_side=2 then first_pair else pair_two_id end,
    updated_at=stamp where id in(first_id,second_id) and tournament_id=p_tournament;
  insert into public.activity_log(tournament_id,entity_type,entity_id,action,changed_by,before_state,after_state)
  values(p_tournament,'match',first_id,'telegram_swap',(select auth.uid()),
    jsonb_build_object('matches',array[first_id,second_id],'slots',array[first_side,second_side],'pairs',array[first_pair,second_pair]),
    jsonb_build_object('matches',array[first_id,second_id],'slots',array[first_side,second_side],'pairs',array[second_pair,first_pair]));
  return null;
end;
$$;

create function telegram_ops.edit_player(p_tournament uuid,p jsonb) returns text
language plpgsql set search_path='' as $$
declare
  pair_row public.pairs%rowtype;
  pair_id_input uuid := (p->>'pair_id')::uuid;
  side integer := (p->>'side')::integer;
  name_input text := btrim(p->>'name');
  previous_name text;
  replacement boolean := p->>'mode'='replace';
begin
  if side is null or side not in (1,2) or name_input is null or length(name_input) not between 1 and 75 then
    return 'Введите имя игрока до 75 символов.';
  end if;
  select * into pair_row from public.pairs where id=pair_id_input and tournament_id=p_tournament for update;
  if not found or pair_row.updated_at is distinct from (p->>'version')::timestamptz then
    return 'Состав изменился. Откройте пару заново.';
  end if;
  previous_name:=case side when 1 then pair_row.player_one else pair_row.player_two end;
  if name_input=previous_name then return null; end if;
  if lower(name_input)=lower(case side when 1 then pair_row.player_two else pair_row.player_one end) then
    return 'В паре уже указан игрок с таким именем.';
  end if;
  if replacement then
    -- Registration links represent verified ownership of results and are managed
    -- through the web registration workflow when a different player joins.
    if exists(select 1 from player_private.registration_pair_links l where l.pair_id=pair_id_input) then
      return 'Пара связана с заявкой. Замените участника через админку, чтобы сохранить привязку результатов.';
    end if;
    perform 1 from public.group_matches where tournament_id=p_tournament and pair_id_input in (pair_one_id,pair_two_id) order by id for update;
    perform 1 from public.matches where tournament_id=p_tournament and pair_id_input in (pair_one_id,pair_two_id) order by id for update;
    if exists(select 1 from telegram_ops.match_rows m where m.tournament_id=p_tournament
      and pair_id_input in (m.pair_one_id,m.pair_two_id) and (m.status<>'scheduled' or m.bracket_kind is not null)) then
      return 'Матч пары уже начался или подтверждена её сетка. Откройте админку.';
    end if;
    if exists(select 1 from public.pairs p2 where p2.tournament_id=p_tournament and p2.id<>pair_id_input
      and lower(name_input) in(lower(p2.player_one),lower(p2.player_two))) then
      return 'Игрок с таким именем уже заявлен. Проверьте состав через админку.';
    end if;
  end if;
  update public.pairs set player_one=case when side=1 then name_input else player_one end,
    player_two=case when side=2 then name_input else player_two end,updated_at=clock_timestamp() where id=pair_id_input;
  insert into public.activity_log(tournament_id,entity_type,entity_id,action,changed_by,before_state,after_state)
  values(p_tournament,'pair',pair_id_input,case when replacement then 'telegram_replace_player' else 'telegram_correct_name' end,
    (select auth.uid()),jsonb_build_object('slot',side,'name',previous_name),jsonb_build_object('slot',side,'name',name_input));
  return null;
end;
$$;

create function public.telegram_organiser(p_telegram_id bigint,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  organiser uuid;
  tournament_id_input uuid;
  panel telegram_ops.panels%rowtype;
  selected public.tournaments%rowtype;
  error_text text;
  last_sub text;
  result jsonb;
  p jsonb := p_payload;
  action text := p_action;
  stamp timestamptz := clock_timestamp();
begin
  if p_telegram_id is null or p_telegram_id<=0 then return '{}'::jsonb; end if;
  select l.user_id into organiser from telegram_ops.links l join public.global_admins a on a.user_id=l.user_id
    where l.telegram_id=p_telegram_id and a.status='approved';
  if organiser is null then
    if action='link' and p->>'code' ~ '^[0-9a-f]{48}$' then
      delete from telegram_ops.link_requests where expires_at<=now();
      insert into telegram_ops.link_requests(telegram_id,digest,telegram_label)
      values(p_telegram_id,sha256(convert_to(p->>'code','UTF8')),
        left(coalesce(nullif(p->>'label',''),'Telegram') ,100)||' · ID '||p_telegram_id)
      on conflict(telegram_id) do update set digest=excluded.digest,telegram_label=excluded.telegram_label,expires_at=excluded.expires_at;
    end if;
    return '{"linked":false}'::jsonb;
  end if;
  if action in ('link','list') then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'sport',t.sport,'status',t.status)
      order by (t.status='completed'),t.starts_at desc nulls last,t.name),'[]'::jsonb) into result
      from public.tournaments t;
    return jsonb_build_object('linked',true,'tournaments',result);
  end if;
  if action='save_panel' then
    if p->>'key' !~ '^[0-9a-f]{24}$' or jsonb_typeof(p->'buttons') is distinct from 'array'
      or jsonb_array_length(p->'buttons')>100 then return '{"error":"Invalid panel"}'::jsonb; end if;
    insert into telegram_ops.panels(telegram_id,panel_key,buttons,input)
    values(p_telegram_id,p->>'key',p->'buttons',nullif(p->'input','null'::jsonb))
    on conflict(telegram_id) do update set panel_key=excluded.panel_key,buttons=excluded.buttons,
      input=excluded.input,expires_at=excluded.expires_at;
    return '{"ok":true}'::jsonb;
  end if;
  if action in ('button','input') then
    select * into panel from telegram_ops.panels where telegram_id=p_telegram_id and expires_at>now() for update;
    if not found or panel.panel_key is distinct from p->>'key' then return '{"error":"Карточка устарела. Откройте /admin."}'::jsonb; end if;
    result:=case when action='button' then panel.buttons->((p->>'index')::integer) else panel.input end;
    if result is null then return '{"error":"Карточка устарела. Откройте /admin."}'::jsonb; end if;
    -- Consume once. Old buttons and duplicate updates cannot write twice.
    delete from telegram_ops.panels where telegram_id=p_telegram_id;
    return jsonb_build_object('command',result);
  end if;
  tournament_id_input:=(p->>'tournament_id')::uuid;
  if tournament_id_input is null then return '{"error":"Выберите турнир."}'::jsonb; end if;
  last_sub:=current_setting('request.jwt.claim.sub',true);
  perform set_config('request.jwt.claim.sub',organiser::text,true);
  if not coalesce(public.is_tournament_admin(tournament_id_input),false) then
    perform set_config('request.jwt.claim.sub',coalesce(last_sub,''),true);
    return '{"error":"Нет доступа к турниру."}'::jsonb;
  end if;
  if action='log' then
    select coalesce(jsonb_agg(to_jsonb(entry) order by entry.created_at desc,entry.id desc),'[]'::jsonb) into result
    from (select log.id,log.created_at,log.action,log.before_state,log.after_state from public.activity_log log
      where log.tournament_id=tournament_id_input and log.action in ('telegram_correct','telegram_finish','telegram_undo',
        'telegram_replace_player','telegram_correct_name','telegram_swap','telegram_close','telegram_draw')
      order by created_at desc,id desc limit 12) entry;
    perform set_config('request.jwt.claim.sub',coalesce(last_sub,''),true);
    return jsonb_build_object('log',result);
  elsif action='board' then
    result:=telegram_ops.board(tournament_id_input);
  else
    -- Consistent lock order for bot mutations and shared draw rebuilds.
    select * into selected from public.tournaments where id=tournament_id_input for update;
    perform 1 from public.global_admins a join telegram_ops.links l on l.user_id=a.user_id
      where a.user_id=organiser and a.status='approved' and l.telegram_id=p_telegram_id for share of a,l;
    if selected.id is null or not found then
      perform set_config('request.jwt.claim.sub',coalesce(last_sub,''),true);
      return '{"error":"Турнир недоступен."}'::jsonb;
    end if;
    begin
      if action='match' then
        error_text:=telegram_ops.match_action(tournament_id_input,(p->>'match_id')::uuid,(p->>'group')::boolean,p->>'move',p);
      elsif action='player' then
        error_text:=telegram_ops.edit_player(tournament_id_input,p);
      elsif action='swap' and selected.status<>'completed' then
        error_text:=telegram_ops.swap_pairs(tournament_id_input,p);
      elsif action='draw' and selected.status<>'completed' and (select public.is_tournament_owner(tournament_id_input)) then
        perform 1 from public.group_matches where tournament_id=tournament_id_input order by id for update;
        if telegram_ops.draw_version(tournament_id_input) is distinct from p->>'version'
          or exists(select 1 from public.matches where tournament_id=tournament_id_input
            and (pair_one_id is not null or pair_two_id is not null)) then
          error_text:='Группы или сетка изменились. Откройте турнир заново.';
        else
          perform public.confirm_group_qualifiers(tournament_id_input,array(select value::uuid from jsonb_array_elements_text(p->'qualified')));
          insert into public.activity_log(tournament_id,entity_type,entity_id,action,changed_by,after_state)
          values(tournament_id_input,'tournament',tournament_id_input,'telegram_draw',organiser,jsonb_build_object('qualified',p->'qualified'));
          if selected.status='draft' then
            update public.tournaments set status='draft' where id=tournament_id_input;
          end if;
        end if;
      elsif action='close' and (select public.is_tournament_owner(tournament_id_input)) then
        perform 1 from public.group_matches where tournament_id=tournament_id_input order by id for update;
        perform 1 from public.matches where tournament_id=tournament_id_input order by id for update;
        if not exists(select 1 from public.matches where tournament_id=tournament_id_input and bracket_kind='playoffs' and winner_id is not null)
          or exists(select 1 from telegram_ops.match_rows where tournament_id=tournament_id_input and status<>'completed') then
          error_text:='Сначала завершите все матчи обеих сеток.';
        elsif selected.status<>'completed' then
          update public.tournaments set status='completed',updated_at=stamp where id=tournament_id_input;
          insert into public.activity_log(tournament_id,entity_type,entity_id,action,changed_by)
          values(tournament_id_input,'tournament',tournament_id_input,'telegram_close',organiser);
        end if;
      else
        error_text:='Действие недоступно для этого турнира.';
      end if;
    exception when raise_exception or check_violation or invalid_text_representation or invalid_parameter_value then
      -- A rejected shared RPC rolls back any partial write in this subtransaction.
      error_text:=case when sqlerrm='Reset the following match before changing this winner'
        then 'Следующий матч уже начался. Согласуйте изменение победителя в админке.'
        else 'Изменение отклонено. Проверьте счёт, состав и состояние матчей.' end;
    end;
    result:=telegram_ops.board(tournament_id_input);
  end if;
  perform set_config('request.jwt.claim.sub',coalesce(last_sub,''),true);
  if result is null then return '{"error":"Турнир недоступен."}'::jsonb; end if;
  return result||jsonb_build_object('draw_version',telegram_ops.draw_version(tournament_id_input),'error',error_text);
end;
$$;
revoke all on function public.telegram_organiser(bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.telegram_organiser(bigint,text,jsonb) to service_role;

-- Pass awarded-set metadata through the existing authorised history projection.
do $$
declare
  definition text := pg_get_functiondef('public.get_my_match_history()'::regprocedure);
  updated text;
begin
  updated := replace(replace(replace(definition,
    'g.pair_two_sets,g.completed_at', 'g.pair_two_sets,g.awarded_sets,g.completed_at'),
    'm.pair_two_sets,m.completed_at','m.pair_two_sets,m.awarded_sets,m.completed_at'),
    '''pair_two_sets'',m.pair_two_sets,','''pair_two_sets'',m.pair_two_sets,''awarded_sets'',m.awarded_sets,');
  if position('g.awarded_sets' in updated)=0 or position('m.awarded_sets' in updated)=0
    or position('''awarded_sets'',m.awarded_sets' in updated)=0 then
    raise exception 'Unexpected player history projection';
  end if;
  execute updated;
end;
$$;
