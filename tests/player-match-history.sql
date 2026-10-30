-- LOCAL ONLY. Run as a database owner against a disposable migrated database.
-- No pgTAP dependency; every assertion raises on failure. All fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF; END;
$$;
CREATE FUNCTION pg_temp.rejects(command text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE EXCEPTION 'Wrong error for %: % %', command, SQLSTATE, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: command unexpectedly allowed: %', command;
END;
$$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
  (pg_temp.id(1),'organizer@example.test',now()),
  (pg_temp.id(2),'primary@example.test',now()),
  (pg_temp.id(3),'partner@example.test',now()),
  (pg_temp.id(4),'outsider@example.test',now()),
  (pg_temp.id(5),'unverified@example.test',null);
INSERT INTO public.global_admins(user_id,role,status) VALUES(pg_temp.id(1),'admin','approved');
INSERT INTO public.tournaments(id,slug,name,status,sport,starts_at,participant_count,playoff_participant_count)
VALUES (pg_temp.id(10),'history-fixture','History fixture','live','padel','2026-10-30T10:00:00Z',4,4),
       (pg_temp.id(11),'history-other','Other fixture','draft','tennis',null,4,4);
INSERT INTO public.pairs(id,tournament_id,name,player_one,player_two,seed) VALUES
  (pg_temp.id(20),pg_temp.id(10),'Our pair','Primary Public','Partner Public',1),
  (pg_temp.id(21),pg_temp.id(10),'Opponents','Opponent One','Opponent Two',2),
  (pg_temp.id(22),pg_temp.id(11),'Other pair','Other One','Other Two',1);
-- Fixture insertion must not send notifications, even in a local Supabase stack.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.tournament_registrations'::regclass
    AND tgname='send_telegram_registration_notification') THEN
    ALTER TABLE public.tournament_registrations DISABLE TRIGGER send_telegram_registration_notification;
  END IF;
END $$;
INSERT INTO public.tournament_registrations(id,tournament_id,status,player_one_first_name,player_one_last_name,
  player_one_email,player_one_phone,player_one_level,player_two_first_name,player_two_last_name,
  player_two_email,player_two_phone,player_two_level,admin_notes)
SELECT pg_temp.id(n),pg_temp.id(10),CASE WHEN n=32 THEN 'new' ELSE 'confirmed' END,
  'Primary','Public','primary@example.test','123456','beginner','Partner','Public',
  'partner@example.test','123456','beginner','SECRET_ADMIN_NOTES'
FROM generate_series(30,32) n;
UPDATE public.tournament_registrations SET status='confirmed',admin_notes='SECRET_ADMIN_NOTES' WHERE id IN (pg_temp.id(30),pg_temp.id(31));
UPDATE public.tournament_registrations SET submitted_by=pg_temp.id(2),partner_user_id=pg_temp.id(3) WHERE id=pg_temp.id(30);
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SET LOCAL ROLE authenticated;
SELECT public.link_registration_pair(pg_temp.id(30),pg_temp.id(20));
SELECT public.link_registration_pair(pg_temp.id(30),pg_temp.id(20)); -- idempotent
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.get_registration_pair_links(pg_temp.id(10))), 'organizer reads exact mapping');
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(30),pg_temp.id(21))','23505');
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(31),pg_temp.id(20))','23505');
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(31),pg_temp.id(22))','23514');
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(32),pg_temp.id(21))','23514');
SELECT pg_temp.rejects('SELECT * FROM player_private.registration_pair_links','42501');
SELECT pg_temp.rejects('DELETE FROM player_private.registration_pair_links','42501');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(30),null)','42501');
SELECT pg_temp.rejects('SELECT * FROM public.get_registration_pair_links(pg_temp.id(10))','42501');
RESET ROLE;
SELECT pg_temp.assert((SELECT relrowsecurity FROM pg_class WHERE oid='player_private.registration_pair_links'::regclass), 'mapping RLS enabled');
-- History reads through explicit ownership only, and projects an allowlist of fields.
INSERT INTO public.tournament_groups(id,tournament_id,code,qualify_count) VALUES(pg_temp.id(40),pg_temp.id(10),'A',2);
INSERT INTO public.group_matches(id,tournament_id,group_id,position,pair_one_id,pair_two_id,status,winner_id,pair_one_sets,pair_two_sets,completed_at,scheduled_at)
VALUES (pg_temp.id(50),pg_temp.id(10),pg_temp.id(40),1,pg_temp.id(20),pg_temp.id(21),'completed',pg_temp.id(20),'{6,6}','{2,3}',now(),now()),
       (pg_temp.id(51),pg_temp.id(10),pg_temp.id(40),2,pg_temp.id(21),pg_temp.id(20),'live',null,'{}','{}',null,now());
INSERT INTO public.matches(id,tournament_id,round,position,bracket_kind,pair_one_id,pair_two_id,status,winner_id,pair_one_sets,pair_two_sets,completed_at)
VALUES (pg_temp.id(60),pg_temp.id(10),0,1,'playoffs',pg_temp.id(20),pg_temp.id(21),'scheduled',null,'{}','{}',null),
       (pg_temp.id(61),pg_temp.id(10),1,1,'playoffs',pg_temp.id(21),pg_temp.id(20),'live',null,'{}','{}',null),
       (pg_temp.id(62),pg_temp.id(10),2,1,'playoffs',null,null,'scheduled',null,'{}','{}',null),
       (pg_temp.id(63),pg_temp.id(10),1,1,'basement',pg_temp.id(20),pg_temp.id(21),'completed',pg_temp.id(21),'{2,3}','{6,6}',now()),
       (pg_temp.id(64),pg_temp.id(10),1,2,'playoffs',pg_temp.id(20),null,'completed',pg_temp.id(20),'{}','{}',null);
UPDATE public.matches SET next_match_id=pg_temp.id(62),next_slot=1 WHERE id IN (pg_temp.id(60),pg_temp.id(61));
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(jsonb_array_length(public.get_my_match_history())=6, 'all linked scheduled/live/completed stages, no empty final');
SELECT pg_temp.assert((SELECT count(DISTINCT x->>'id')=6 FROM jsonb_array_elements(public.get_my_match_history()) x), 'history has no duplicate match IDs');
SELECT pg_temp.assert((SELECT bool_and(x->>'partner_user_id'=pg_temp.id(3)::text AND x->>'partner_name'='Partner Public'
  AND x->>'tournament_slug'='history-fixture' AND x->>'sport'='padel' AND x->>'pair_id'=pg_temp.id(20)::text)
  FROM jsonb_array_elements(public.get_my_match_history()) x), 'primary sees partner public identity and tournament metadata');
SELECT pg_temp.assert((SELECT x->>'opponent_name'='Opponents' AND x->>'stage'='group' AND x->'round'='null'::jsonb
  AND x->'final_round'='null'::jsonb AND x->>'is_final'='false' AND x->'pair_one_sets'='[6,6]'::jsonb
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='group:'||pg_temp.id(50)::text), 'group contract and scores');
SELECT pg_temp.assert((SELECT x->>'stage'='playoffs' AND (x->>'final_round')::int=2 AND (x->>'round')::int=1 AND x->>'is_final'='false'
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='knockout:'||pg_temp.id(61)::text), 'final_round includes unassigned final in same bracket');
SELECT pg_temp.assert((SELECT x->>'stage'='basement' AND (x->>'final_round')::int=1 AND x->>'is_final'='true'
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='knockout:'||pg_temp.id(63)::text), 'basement final_round is independent');
SELECT pg_temp.assert((SELECT (x->>'round')::int=1 AND (x->>'final_round')::int=2 AND x->>'is_final'='false'
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='knockout:'||pg_temp.id(64)::text),
  'disconnected earlier round with next_match_id NULL is not a final');
SAVEPOINT final_classification;
RESET ROLE;
UPDATE public.matches SET pair_one_id=pg_temp.id(20),pair_two_id=pg_temp.id(21) WHERE id=pg_temp.id(62);
UPDATE public.matches SET round=0 WHERE id=pg_temp.id(63);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT (x->>'round')::int=2 AND (x->>'final_round')::int=2 AND x->>'is_final'='true'
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='knockout:'||pg_temp.id(62)::text),
  'positive maximum round with next_match_id NULL is a final');
SELECT pg_temp.assert((SELECT (x->>'round')::int=0 AND (x->>'final_round')::int=0 AND x->>'is_final'='false'
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='knockout:'||pg_temp.id(63)::text),
  'round zero is not a final even when it is the bracket maximum and next_match_id is NULL');
ROLLBACK TO SAVEPOINT final_classification;
SELECT pg_temp.assert((SELECT array_agg(k ORDER BY k)=ARRAY['completed_at','final_round','id','is_final','opponent_name','pair_id','pair_one_id','pair_one_sets','pair_two_id','pair_two_sets','partner_name','partner_user_id','round','scheduled_at','sport','stage','status','tournament_date','tournament_id','tournament_name','tournament_slug','tournament_status','winner_id']::text[]
  FROM jsonb_object_keys(public.get_my_match_history()->0) k), 'exact allowlist: no email, phones, admin_notes or other private fields');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
SELECT pg_temp.assert((SELECT bool_and(x->>'partner_user_id'=pg_temp.id(2)::text AND x->>'partner_name'='Primary Public')
  FROM jsonb_array_elements(public.get_my_match_history()) x), 'partner sees primary identity by registration role');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
SELECT pg_temp.assert(public.get_my_match_history()='[]'::jsonb, 'unlinked outsider receives empty array');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(5)::text,true);
SELECT pg_temp.rejects('SELECT public.get_my_match_history()','42501');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.rejects('SELECT public.get_my_match_history()','42501');
RESET ROLE;
-- RPC/ACL invariants are tested independently of row-level policies.
SELECT pg_temp.assert((SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc
  WHERE oid IN ('public.link_registration_pair(uuid,uuid)'::regprocedure,
    'public.get_registration_pair_links(uuid)'::regprocedure,'public.get_my_match_history()'::regprocedure)), 'definers have an empty search_path');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','player_private.registration_pair_links','SELECT')
  AND NOT has_table_privilege('authenticated','player_private.registration_pair_links','INSERT')
  AND NOT has_table_privilege('authenticated','player_private.registration_pair_links','UPDATE')
  AND NOT has_table_privilege('authenticated','player_private.registration_pair_links','DELETE')
  AND NOT has_table_privilege('anon','player_private.registration_pair_links','SELECT'), 'mapping has no direct API grants');
SAVEPOINT mapping_rls;
-- Prove RLS is a second barrier even if table privileges are accidentally granted.
GRANT SELECT,INSERT,UPDATE,DELETE ON player_private.registration_pair_links TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert((SELECT count(*)=0 FROM player_private.registration_pair_links), 'RLS hides every mapping row');
SELECT pg_temp.rejects('INSERT INTO player_private.registration_pair_links VALUES(pg_temp.id(31),pg_temp.id(21),pg_temp.id(10))','42501');
WITH changed AS (UPDATE player_private.registration_pair_links SET pair_id=pg_temp.id(21) RETURNING *)
SELECT pg_temp.assert((SELECT count(*)=0 FROM changed), 'RLS blocks direct updates');
WITH changed AS (DELETE FROM player_private.registration_pair_links RETURNING *)
SELECT pg_temp.assert((SELECT count(*)=0 FROM changed), 'RLS blocks direct deletes');
RESET ROLE;
ROLLBACK TO SAVEPOINT mapping_rls;
SET LOCAL ROLE anon;
SELECT pg_temp.rejects('SELECT public.get_my_match_history()','42501');
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(30),null)','42501');
SELECT pg_temp.rejects('SELECT * FROM public.get_registration_pair_links(pg_temp.id(10))','42501');
RESET ROLE;
SELECT pg_temp.rejects('INSERT INTO player_private.registration_pair_links VALUES(pg_temp.id(31),pg_temp.id(22),pg_temp.id(10))','23503');
SELECT pg_temp.rejects('UPDATE public.tournament_registrations SET tournament_id=pg_temp.id(11) WHERE id=pg_temp.id(30)','23503');
SELECT pg_temp.rejects('UPDATE public.pairs SET tournament_id=pg_temp.id(11),seed=3 WHERE id=pg_temp.id(20)','23503');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
UPDATE public.tournaments SET status='draft' WHERE id=pg_temp.id(10);
SELECT pg_temp.assert(public.get_my_match_history()='[]'::jsonb, 'draft tournament never leaks');
UPDATE public.tournaments SET status='live' WHERE id=pg_temp.id(10);
UPDATE public.tournament_registrations SET status='rejected' WHERE id=pg_temp.id(30);
SELECT pg_temp.assert(public.get_my_match_history()='[]'::jsonb, 'cancelled registration no longer grants history');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SET LOCAL ROLE authenticated;
SELECT public.link_registration_pair(pg_temp.id(30),null); -- stale cancelled link is removable
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.get_registration_pair_links(pg_temp.id(10))), 'unlink really removes private row');
RESET ROLE;
UPDATE public.tournament_registrations SET status='confirmed' WHERE id=pg_temp.id(30);
SET LOCAL ROLE authenticated;
SELECT public.link_registration_pair(pg_temp.id(30),pg_temp.id(21)); -- explicit unlink permits reassignment
SELECT public.link_registration_pair(pg_temp.id(30),null);
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
SELECT pg_temp.assert(public.get_my_match_history()='[]'::jsonb, 'unlink immediately revokes history');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SELECT public.link_registration_pair(pg_temp.id(30),pg_temp.id(20));
RESET ROLE;
UPDATE public.tournament_registrations SET partner_user_id=pg_temp.id(2) WHERE id=pg_temp.id(30);
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
SELECT pg_temp.assert(jsonb_array_length(public.get_my_match_history())=6, 'same account in both roles does not duplicate matches');
SELECT pg_temp.assert((SELECT bool_and(x->'partner_user_id'='null'::jsonb) FROM jsonb_array_elements(public.get_my_match_history()) x), 'partner account never points to self');
UPDATE public.tournament_registrations SET partner_user_id=pg_temp.id(3) WHERE id=pg_temp.id(30);
SAVEPOINT ambiguous_ownership;
UPDATE public.tournament_registrations SET submitted_by=pg_temp.id(2) WHERE id=pg_temp.id(31);
INSERT INTO public.pairs(id,tournament_id,name,player_one,player_two,seed)
VALUES(pg_temp.id(23),pg_temp.id(10),'Independent opponents','Third One','Third Two',3);
INSERT INTO public.group_matches(id,tournament_id,group_id,position,pair_one_id,pair_two_id,status,winner_id,pair_one_sets,pair_two_sets,completed_at)
VALUES (pg_temp.id(52),pg_temp.id(10),pg_temp.id(40),3,pg_temp.id(20),pg_temp.id(23),'completed',pg_temp.id(20),'{6,6}','{2,3}',now()),
       (pg_temp.id(53),pg_temp.id(10),pg_temp.id(40),4,pg_temp.id(21),pg_temp.id(23),'completed',pg_temp.id(21),'{6,6}','{2,3}',now());
SELECT pg_temp.assert((SELECT count(*)=1 AND bool_and(x->>'pair_id'=pg_temp.id(20)::text)
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='group:'||pg_temp.id(50)::text),
  'unambiguous match is present before opposing ownership is linked');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SELECT public.link_registration_pair(pg_temp.id(31),pg_temp.id(21));
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
DO $$
DECLARE reversed boolean; winner integer; pair_one integer; pair_two integer; history jsonb;
BEGIN
  FOREACH reversed IN ARRAY ARRAY[false,true] LOOP
    pair_one := CASE WHEN reversed THEN 21 ELSE 20 END;
    pair_two := CASE WHEN reversed THEN 20 ELSE 21 END;
    FOREACH winner IN ARRAY ARRAY[pair_one,pair_two] LOOP
      UPDATE public.group_matches SET pair_one_id=pg_temp.id(pair_one),pair_two_id=pg_temp.id(pair_two),
        winner_id=pg_temp.id(winner),
        pair_one_sets=CASE WHEN winner=pair_one THEN ARRAY[6,6] ELSE ARRAY[2,3] END,
        pair_two_sets=CASE WHEN winner=pair_two THEN ARRAY[6,6] ELSE ARRAY[2,3] END
        WHERE id=pg_temp.id(50);
      history := public.get_my_match_history();
      PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(history) x
        WHERE x->>'id'='group:'||pg_temp.id(50)::text),
        format('both-owned match excluded: reversed UUID order=%s, winner pair%s',reversed,
          CASE WHEN winner=pair_one THEN 'One' ELSE 'Two' END));
      PERFORM pg_temp.assert((SELECT array_agg(x->>'id' ORDER BY x->>'id')=ARRAY[
        'group:'||pg_temp.id(52)::text,'group:'||pg_temp.id(53)::text,'knockout:'||pg_temp.id(64)::text]
        FROM jsonb_array_elements(history) x),
        'all ambiguous group/knockout matches excluded; distinct owned pairs keep matches against outsiders');
      PERFORM pg_temp.assert((SELECT bool_and(x->>'pair_id'=CASE WHEN x->>'id'='group:'||pg_temp.id(53)::text
        THEN pg_temp.id(21)::text ELSE pg_temp.id(20)::text END) FROM jsonb_array_elements(history) x),
        'remaining matches retain their actual owned pair');
      PERFORM pg_temp.assert(history=public.get_my_match_history(), 'one stable row and ID per actual match');
    END LOOP;
  END LOOP;
END;
$$;
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SELECT public.link_registration_pair(pg_temp.id(31),null);
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
SELECT pg_temp.assert((SELECT count(*)=1 AND bool_and(x->>'pair_id'=pg_temp.id(20)::text)
  FROM jsonb_array_elements(public.get_my_match_history()) x WHERE x->>'id'='group:'||pg_temp.id(50)::text),
  'unlinking opposing registration restores one unambiguous match with original stable ID');
ROLLBACK TO SAVEPOINT ambiguous_ownership;
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SAVEPOINT pair_delete;
-- Existing group-match FKs deliberately restrict deleting a participating pair.
DELETE FROM public.group_matches WHERE tournament_id=pg_temp.id(10);
DELETE FROM public.matches WHERE tournament_id=pg_temp.id(10);
DELETE FROM public.pairs WHERE id=pg_temp.id(20);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM player_private.registration_pair_links), 'pair deletion cascades links');
ROLLBACK TO SAVEPOINT pair_delete;
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=pg_temp.id(2);
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
SELECT pg_temp.rejects('SELECT public.get_my_match_history()','42501');
UPDATE auth.users SET banned_until=null,is_anonymous=true WHERE id=pg_temp.id(2);
SELECT pg_temp.rejects('SELECT public.get_my_match_history()','42501');
UPDATE auth.users SET is_anonymous=false WHERE id=pg_temp.id(2);
SELECT set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
SET LOCAL ROLE authenticated;
SELECT public.reset_tournament_data(pg_temp.id(10));
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.get_registration_pair_links(pg_temp.id(10))), 'tournament reset cascades every registration link');
SELECT pg_temp.rejects('SELECT public.link_registration_pair(pg_temp.id(30),pg_temp.id(20))','42501');
SELECT set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
SELECT pg_temp.assert(public.get_my_match_history()='[]'::jsonb, 'reset does not preserve ownership of reused pair slots');
RESET ROLE;
ROLLBACK;
