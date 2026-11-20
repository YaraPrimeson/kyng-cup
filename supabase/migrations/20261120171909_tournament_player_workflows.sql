create view player_private.day_matches as
select id, tournament_id, 'group'::text as kind, status, court, scheduled_at,
       pair_one_id, pair_two_id, winner_id, pair_one_sets, pair_two_sets, false as main_final
from public.group_matches
union all
select id, tournament_id, bracket_kind, status, court, scheduled_at,
       pair_one_id, pair_two_id, winner_id, pair_one_sets, pair_two_sets,
       bracket_kind = 'playoffs' and next_match_id is null and round > 0
from public.matches;
revoke all on player_private.day_matches from public, anon, authenticated;

create function public.get_my_upcoming_matches()
returns table(id uuid, kind text, sport text, tournament_name text, tournament_slug text, location text,
              scheduled_at timestamptz, court text, status text, opponent_name text)
language sql stable security definer set search_path = '' as $$
  with own_pairs as (
    select l.pair_id from player_private.registration_pair_links l
    join public.tournament_registrations r on r.id = l.registration_id
    where r.status = 'confirmed' and (select player_private.is_verified_user())
      and (r.submitted_by = (select auth.uid()) or r.partner_user_id = (select auth.uid()))
  )
  select m.id, m.kind, t.sport, t.name, t.slug, t.location, m.scheduled_at, m.court, m.status, opponent.name
  from player_private.day_matches m
  join public.tournaments t on t.id = m.tournament_id
  left join own_pairs a on a.pair_id = m.pair_one_id
  left join own_pairs b on b.pair_id = m.pair_two_id
  left join public.pairs opponent on opponent.id = case when a.pair_id is not null then m.pair_two_id else m.pair_one_id end
  where (a.pair_id is null) <> (b.pair_id is null)
    and t.status in ('published', 'live')
    and ((m.status = 'live' and coalesce(m.scheduled_at, t.ends_at, t.starts_at, now()) >= now() - interval '12 hours')
      or (m.status = 'scheduled' and m.scheduled_at >= now()))
  order by (m.status = 'live') desc, m.scheduled_at nulls last, m.id;
$$;
revoke all on function public.get_my_upcoming_matches() from public, anon, authenticated;
grant execute on function public.get_my_upcoming_matches() to authenticated;

create table public.player_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sport text not null,
  tournament_name text not null,
  tournament_slug text not null,
  kind text not null check (kind in ('registration_confirmed', 'match_scheduled', 'match_changed')),
  scheduled_at timestamptz,
  court text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index player_notifications_recent on public.player_notifications(user_id, created_at desc);
alter table public.player_notifications enable row level security;
revoke all on public.player_notifications from public, anon, authenticated;
grant select, update(read_at) on public.player_notifications to authenticated;
create policy "Players read their notifications" on public.player_notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Players mark their notifications read" on public.player_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function player_private.notify_registration_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and old.status is distinct from new.status then
    insert into public.player_notifications(user_id, tournament_id, sport, tournament_name, tournament_slug, kind)
    select distinct recipient.id, t.id, t.sport, t.name, t.slug, 'registration_confirmed'
    from public.tournaments t cross join lateral unnest(array[new.submitted_by, new.partner_user_id]) recipient(id)
    where t.id = new.tournament_id and t.status in ('published', 'live') and recipient.id is not null;
  end if;
  return new;
end;
$$;
revoke all on function player_private.notify_registration_confirmation() from public, anon, authenticated;
create trigger notify_registration_confirmation after update of status on public.tournament_registrations
for each row execute function player_private.notify_registration_confirmation();

create function player_private.notify_match_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('scheduled', 'live')
    or (new.scheduled_at is null and old.scheduled_at is null)
    or (new.scheduled_at is not distinct from old.scheduled_at and new.court is not distinct from old.court) then
    return new;
  end if;
  insert into public.player_notifications(user_id, tournament_id, sport, tournament_name, tournament_slug, kind, scheduled_at, court)
  select distinct recipient.id, t.id, t.sport, t.name, t.slug,
    case when old.scheduled_at is null then 'match_scheduled' else 'match_changed' end, new.scheduled_at, new.court
  from player_private.registration_pair_links l
  join public.tournament_registrations r on r.id = l.registration_id and r.status = 'confirmed'
  join public.tournaments t on t.id = l.tournament_id and t.status in ('published', 'live')
  cross join lateral unnest(array[r.submitted_by, r.partner_user_id]) recipient(id)
  where l.tournament_id = new.tournament_id and l.pair_id in (new.pair_one_id, new.pair_two_id) and recipient.id is not null;
  return new;
end;
$$;
revoke all on function player_private.notify_match_schedule() from public, anon, authenticated;
create trigger notify_knockout_schedule after update of scheduled_at, court on public.matches
for each row execute function player_private.notify_match_schedule();
create trigger notify_group_schedule after update of scheduled_at, court on public.group_matches
for each row execute function player_private.notify_match_schedule();

create function public.get_my_repeat_registration(p_registration_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sport', t.sport, 'tournament_id', t.id, 'pair_name', r.pair_name,
    'player_one_phone', r.player_one_phone, 'player_one_level', r.player_one_level,
    'player_one_rating_system', r.player_one_rating_system, 'player_one_rating_value', r.player_one_rating_value,
    'player_two_first_name', r.player_two_first_name, 'player_two_last_name', r.player_two_last_name,
    'player_two_email', r.player_two_email, 'player_two_level', r.player_two_level,
    'player_two_rating_system', r.player_two_rating_system, 'player_two_rating_value', r.player_two_rating_value)
  from public.tournament_registrations r join public.tournaments t on t.id = r.tournament_id
  where r.id = p_registration_id and r.submitted_by = (select auth.uid())
    and (select player_private.is_verified_user());
$$;
revoke all on function public.get_my_repeat_registration(uuid) from public, anon, authenticated;
grant execute on function public.get_my_repeat_registration(uuid) to authenticated;

create function public.get_my_season_ranking()
returns table(season integer, sport text, place bigint, points bigint, tournaments bigint)
language sql stable security definer set search_path = '' as $$
  with played as (
    select m.* from player_private.day_matches m
    where m.status = 'completed' and m.pair_one_id is not null and m.pair_two_id is not null
      and m.winner_id in (m.pair_one_id, m.pair_two_id)
      and cardinality(m.pair_one_sets) > 0 and cardinality(m.pair_one_sets) = cardinality(m.pair_two_sets)
      and m.winner_id = (select case when count(*) filter (where a > b) > count(*) filter (where a < b) then m.pair_one_id
        when count(*) filter (where a < b) > count(*) filter (where a > b) then m.pair_two_id end
        from unnest(m.pair_one_sets, m.pair_two_sets) scores(a,b))
  ), event_points as (
    select recipient.id as user_id, t.id as tournament_id, t.sport, extract(year from t.starts_at at time zone 'Europe/Vienna')::integer as season,
      max(case when m.main_final and m.winner_id = l.pair_id then 100 when m.main_final then 60 else 20 end) as points
    from player_private.registration_pair_links l
    join public.tournament_registrations r on r.id = l.registration_id and r.status = 'confirmed'
    join public.tournaments t on t.id = l.tournament_id and t.status = 'completed' and t.starts_at is not null
    join played m on m.tournament_id = t.id and l.pair_id in (m.pair_one_id, m.pair_two_id)
    cross join lateral unnest(array[r.submitted_by, r.partner_user_id]) recipient(id)
    where recipient.id is not null
      and exists (select 1 from played f where f.tournament_id = t.id and f.main_final)
    group by recipient.id, t.id, t.sport, extract(year from t.starts_at at time zone 'Europe/Vienna')
  ), totals as (
    select e.user_id, e.season, e.sport, sum(e.points) as points, count(*) as tournaments
    from event_points e group by e.user_id, e.season, e.sport
  ), ranked as (
    select totals.*, rank() over (partition by totals.season, totals.sport order by totals.points desc) as place from totals
  )
  select r.season, r.sport, r.place, r.points, r.tournaments from ranked r
  where r.user_id = (select auth.uid()) and (select player_private.is_verified_user())
  order by r.season desc, r.sport;
$$;
revoke all on function public.get_my_season_ranking() from public, anon, authenticated;
grant execute on function public.get_my_season_ranking() to authenticated;

-- Service-only delivery state. The player inbox never depends on an email provider.
create table player_private.notification_email_deliveries (
  notification_id uuid primary key references public.player_notifications(id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz
);
alter table player_private.notification_email_deliveries enable row level security;
revoke all on player_private.notification_email_deliveries from public, anon, authenticated;

create function public.claim_player_notification_emails()
returns table(id uuid, email text, locale text, kind text, tournament_name text,
              scheduled_at timestamptz, court text, attempt integer)
language sql security definer set search_path = '' as $$
  insert into player_private.notification_email_deliveries(notification_id)
  select n.id from public.player_notifications n
  where n.created_at > now() - interval '1 day'
  on conflict do nothing;

  with queued as (
    select d.notification_id
    from player_private.notification_email_deliveries d
    join public.player_notifications n on n.id = d.notification_id
    join public.tournaments t on t.id = n.tournament_id and t.status <> 'draft'
    join auth.users u on u.id = n.user_id and u.email_confirmed_at is not null
    where d.available_at <= now() and d.attempts < 8 and d.sent_at is null and d.failed_at is null
      and n.created_at > now() - interval '1 day' and u.email is not null and not coalesce(u.is_anonymous, false)
    order by n.created_at, d.notification_id
    limit 6 for update of d skip locked
  ), leased as (
    update player_private.notification_email_deliveries d
    set attempts = d.attempts + 1, available_at = now() + interval '5 minutes'
    from queued q where d.notification_id = q.notification_id
    returning d.notification_id, d.attempts
  )
  select n.id, u.email::text,
    coalesce((select r.locale from public.tournament_registrations r
      where r.tournament_id = n.tournament_id and (r.submitted_by = n.user_id or r.partner_user_id = n.user_id)
      order by r.created_at desc limit 1), 'en'),
    n.kind, n.tournament_name, n.scheduled_at, n.court, l.attempts
  from leased l join public.player_notifications n on n.id = l.notification_id
  join auth.users u on u.id = n.user_id;
$$;
revoke all on function public.claim_player_notification_emails() from public, anon, authenticated;
grant execute on function public.claim_player_notification_emails() to service_role;

create function public.finish_player_notification_email(p_id uuid, p_attempt integer, p_result text)
returns void language sql security definer set search_path = '' as $$
  update player_private.notification_email_deliveries
  set sent_at = case when p_result = 'sent' then now() end,
      failed_at = case when p_result = 'failed' or (p_result = 'retry' and attempts >= 8) then now() end,
      available_at = now() + (power(2, least(attempts, 5)) * interval '1 minute')
  where notification_id = p_id and attempts = p_attempt and sent_at is null and failed_at is null
    and p_result in ('sent', 'failed', 'retry');
$$;
revoke all on function public.finish_player_notification_email(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.finish_player_notification_email(uuid, integer, text) to service_role;
