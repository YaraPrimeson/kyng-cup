-- Run against an environment with the claim migration; always roll back QA rows.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
CREATE TEMP TABLE qa_claim_state (owner_id uuid, partner_id uuid, stranger_id uuid, organiser_id uuid, application_id uuid) ON COMMIT DROP;
SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  partner_id uuid := gen_random_uuid();
  stranger_id uuid := gen_random_uuid();
  organiser_id uuid;
  application_id uuid;
BEGIN
  INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  VALUES(owner_id,'qa-owner-'||owner_id||'@example.invalid',now(),'{}'),
    (partner_id,'qa-partner-'||partner_id||'@example.invalid',now(),'{}'),
    (stranger_id,'qa-stranger-'||stranger_id||'@example.invalid',now(),'{}');
  SELECT user_id INTO organiser_id FROM public.global_admins WHERE status='approved' LIMIT 1;
  IF organiser_id IS NULL THEN RAISE EXCEPTION 'QA needs an organiser'; END IF;
  INSERT INTO public.tournament_registrations(tournament_id,status,admin_notes,player_one_first_name,player_one_last_name,player_one_email,player_one_phone,player_one_level,player_two_first_name,player_two_last_name,player_two_email,player_two_phone,player_two_level)
  SELECT id,'confirmed','QA private','QA','Owner','qa-owner-'||owner_id||'@example.invalid','+430000000000','beginner','QA','Partner','qa-partner-'||partner_id||'@example.invalid','+430000000001','beginner'
  FROM public.tournaments LIMIT 1 RETURNING id INTO application_id;
  IF application_id IS NULL THEN RAISE EXCEPTION 'QA needs a tournament'; END IF;
  INSERT INTO qa_claim_state VALUES (owner_id,partner_id,stranger_id,organiser_id,application_id);
END $$;
SET LOCAL session_replication_role = origin;
DO $$
DECLARE
  owner_id uuid;
  partner_id uuid;
  stranger_id uuid;
  organiser_id uuid;
  application_id uuid;
  v_tournament_id uuid;
  owner_code text;
  partner_code text;
  old_code text;
BEGIN
  SELECT q.owner_id,q.partner_id,q.stranger_id,q.organiser_id,q.application_id
    INTO owner_id,partner_id,stranger_id,organiser_id,application_id FROM qa_claim_state q;
  IF has_column_privilege('authenticated','public.tournament_registrations','admin_notes','SELECT') THEN
    RAISE EXCEPTION 'Private organiser notes readable by player';
  END IF;
  SELECT tournament_id INTO v_tournament_id FROM public.tournament_registrations WHERE id=application_id;

  PERFORM set_config('request.jwt.claim.sub',stranger_id::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.issue_registration_claim_code(application_id,'primary');
    RAISE EXCEPTION 'Non-organiser issued a code';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM id FROM public.list_tournament_registrations(v_tournament_id);
    RAISE EXCEPTION 'Non-organiser read private application through admin function';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',organiser_id::text,true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (SELECT 1 FROM public.list_tournament_registrations(v_tournament_id)
    WHERE id=application_id AND admin_notes='QA private') THEN
    RAISE EXCEPTION 'Organiser lost private application details';
  END IF;
  UPDATE public.tournament_registrations SET admin_notes='QA updated',status='confirmed'
    WHERE id=application_id RETURNING id INTO application_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.list_tournament_registrations(v_tournament_id)
    WHERE id=application_id AND admin_notes='QA updated') THEN
    RAISE EXCEPTION 'Organiser cannot save or reload private notes';
  END IF;
  owner_code := public.issue_registration_claim_code(application_id,'primary');
  partner_code := public.issue_registration_claim_code(application_id,'partner');
  IF length(owner_code) < 48 OR length(partner_code) < 48 THEN RAISE EXCEPTION 'Codes too short'; END IF;
  old_code := owner_code;
  owner_code := public.issue_registration_claim_code(application_id,'primary');
  RESET ROLE;
  UPDATE player_private.registration_claim_codes SET expires_at = now() - interval '1 minute'
    WHERE registration_id=application_id AND player_role='partner';

  PERFORM set_config('request.jwt.claim.sub',stranger_id::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.redeem_registration_claim_code(owner_code);
    RAISE EXCEPTION 'Unrelated account claimed application';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.tournament_registrations WHERE id=application_id) THEN RAISE EXCEPTION 'Stranger can read application'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.redeem_registration_claim_code(old_code);
    RAISE EXCEPTION 'Rotated code was still valid';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.redeem_registration_claim_code(owner_code);
  IF NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE id=application_id AND submitted_by=owner_id AND status='confirmed') THEN RAISE EXCEPTION 'Owner lost application or status'; END IF;
  BEGIN
    PERFORM public.redeem_registration_claim_code(owner_code);
    RAISE EXCEPTION 'Code could be used twice';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub',partner_id::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.redeem_registration_claim_code(partner_code);
    RAISE EXCEPTION 'Expired code was still valid';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',organiser_id::text,true);
  SET LOCAL ROLE authenticated;
  partner_code := public.issue_registration_claim_code(application_id,'partner');
  RESET ROLE;
  UPDATE auth.users SET email_confirmed_at = NULL WHERE id=partner_id;
  PERFORM set_config('request.jwt.claim.sub',partner_id::text,true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.redeem_registration_claim_code(partner_code);
    RAISE EXCEPTION 'Unverified user used code';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  UPDATE auth.users SET email_confirmed_at=now() WHERE id=partner_id;
  PERFORM set_config('request.jwt.claim.sub',partner_id::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM public.redeem_registration_claim_code(partner_code);
  IF NOT EXISTS(SELECT 1 FROM public.tournament_registrations WHERE id=application_id AND partner_user_id=partner_id AND status='confirmed') THEN RAISE EXCEPTION 'Partner cannot read application'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',stranger_id::text,true);
  SET LOCAL ROLE authenticated;
  IF EXISTS(SELECT 1 FROM public.tournament_registrations WHERE id=application_id) THEN RAISE EXCEPTION 'Stranger gained access'; END IF;
  RESET ROLE;
END $$;
ROLLBACK;
