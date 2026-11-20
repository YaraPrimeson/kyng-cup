create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('20000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
create function pg_temp.check_result(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end;
$$;

insert into auth.users(id, email, email_confirmed_at) values
  (pg_temp.id(1), 'primary@example.invalid', now()),
  (pg_temp.id(2), 'partner@example.invalid', now()),
  (pg_temp.id(3), 'opponent@example.invalid', now()),
  (pg_temp.id(4), 'outsider@example.invalid', now());
insert into public.tournaments(id, slug, name, status, sport, starts_at, participant_count, playoff_participant_count)
  values (pg_temp.id(10), 'workflow-fixture', 'Workflow fixture', 'published', 'padel', now() + interval '1 day', 4, 4);
insert into public.pairs(id, tournament_id, name, player_one, player_two) values
  (pg_temp.id(20), pg_temp.id(10), 'Our Pair', 'One', 'Two'),
  (pg_temp.id(21), pg_temp.id(10), 'Away Pair', 'Three', 'Another');
insert into public.tournament_registrations(id, tournament_id, status, pair_name, submitted_by, partner_user_id,
  player_one_first_name, player_one_last_name, player_one_email, player_one_phone, player_one_level,
  player_two_first_name, player_two_last_name, player_two_email, player_two_level, admin_notes, comment)
values
  (pg_temp.id(30), pg_temp.id(10), 'new', 'Our Pair', pg_temp.id(1), pg_temp.id(2), 'One', 'Player',
   'primary@example.invalid', '1234567', 'intermediate', 'Two', 'Player', 'partner@example.invalid', 'advanced', 'Restricted', 'Private'),
  (pg_temp.id(31), pg_temp.id(10), 'new', 'Away Pair', pg_temp.id(3), null, 'Three', 'Player',
   'opponent@example.invalid', '1234568', 'advanced', 'Another', 'Player', null, 'advanced', null, null);
update public.tournament_registrations set status = 'confirmed' where id in (pg_temp.id(30), pg_temp.id(31));
update public.tournament_registrations set status = 'confirmed' where id = pg_temp.id(30);
insert into player_private.registration_pair_links(registration_id, pair_id, tournament_id) values
  (pg_temp.id(30), pg_temp.id(20), pg_temp.id(10)), (pg_temp.id(31), pg_temp.id(21), pg_temp.id(10));
insert into public.matches(id, tournament_id, round, position, pair_one_id, pair_two_id)
  values (pg_temp.id(50), pg_temp.id(10), 1, 1, pg_temp.id(20), pg_temp.id(21));
insert into public.tournament_groups(id,tournament_id,code,qualify_count)
  values (pg_temp.id(40), pg_temp.id(10), 'A', 2);
insert into public.group_matches(id,tournament_id,group_id,position,pair_one_id,pair_two_id)
  values (pg_temp.id(51), pg_temp.id(10), pg_temp.id(40), 1, pg_temp.id(21), pg_temp.id(20));
update public.matches set scheduled_at = now() + interval '1 day', court = 'Court A' where id = pg_temp.id(50);
update public.matches set court = 'Court B' where id = pg_temp.id(50);
update public.matches set court = 'Court B' where id = pg_temp.id(50);
update public.group_matches set scheduled_at = now() + interval '3 days', court = 'Court C' where id = pg_temp.id(51);

set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, false);
select pg_temp.check_result((select count(*) = 2 from public.get_my_upcoming_matches()), 'Both stages are visible to the applicant');
select pg_temp.check_result((select court = 'Court B' and opponent_name = 'Away Pair'
  from public.get_my_upcoming_matches() limit 1), 'First match includes the current court and opponent');
select pg_temp.check_result((select count(*) = 4 from public.player_notifications), 'Only real changes generate alerts for this account');
update public.player_notifications set read_at = now() where read_at is null;
select pg_temp.check_result((select count(*) = 4 from public.player_notifications where read_at is not null), 'Owner can mark read');
select pg_temp.check_result(public.get_my_repeat_registration(pg_temp.id(30))->>'player_two_email' = 'partner@example.invalid',
  'Applicant can load approved prefill fields');
select pg_temp.check_result(not (public.get_my_repeat_registration(pg_temp.id(30)) ?| array['comment','admin_notes','player_one_email']),
  'Prefill excludes internal notes, old comment and old primary email');
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, false);
select pg_temp.check_result((select count(*) = 2 from public.get_my_upcoming_matches()), 'Linked partner sees the same matches');
select pg_temp.check_result(public.get_my_repeat_registration(pg_temp.id(30)) is null, 'Partner cannot read applicant contact data');
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, false);
select pg_temp.check_result((select count(*) = 0 from public.get_my_upcoming_matches()), 'Outsider sees no private matches');
select pg_temp.check_result((select count(*) = 0 from public.player_notifications), 'Outsider sees no notices');
update public.player_notifications set read_at = now();
select pg_temp.check_result(not has_function_privilege('public.claim_player_notification_emails()', 'EXECUTE'),
  'Players cannot claim email payloads');
reset role;

set role service_role;
select pg_temp.check_result((select count(*) = 6 from public.claim_player_notification_emails()), 'Only a bounded batch is leased');
select pg_temp.check_result((select count(*) = 6 from public.claim_player_notification_emails()), 'Active leases are skipped');
select pg_temp.check_result((select count(*) = 0 from public.claim_player_notification_emails()), 'No available messages after claiming');
reset role;
select public.finish_player_notification_email((select notification_id from player_private.notification_email_deliveries limit 1), 0, 'sent');
select pg_temp.check_result((select count(*) = 0 from player_private.notification_email_deliveries where sent_at is not null), 'Stale attempt cannot mark an email sent');
select public.finish_player_notification_email((select notification_id from player_private.notification_email_deliveries limit 1), 1, 'sent');
select pg_temp.check_result((select count(*) = 1 from player_private.notification_email_deliveries where sent_at is not null), 'Current attempt marks delivery sent');

update public.matches set status = 'completed', winner_id = pg_temp.id(20), pair_one_sets = '{6,6}', pair_two_sets = '{2,3}' where id = pg_temp.id(50);
update public.tournaments set status = 'completed' where id = pg_temp.id(10);
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, false);
select pg_temp.check_result((select place = 1 and points = 100 and tournaments = 1 from public.get_my_season_ranking()),
  'Both members of the champion pair earn points once');
select pg_temp.check_result((select count(*) = 0 from public.get_my_upcoming_matches()), 'Completed event no longer shows in schedule');
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, false);
select pg_temp.check_result((select place = 3 and points = 60 from public.get_my_season_ranking()), 'Runner-up ranks behind tied champions');
reset role;
update public.matches set winner_id = pg_temp.id(21) where id = pg_temp.id(50);
set role authenticated;
select pg_temp.check_result((select count(*) = 0 from public.get_my_season_ranking()), 'Contradictory finals do not award points');
reset role;
