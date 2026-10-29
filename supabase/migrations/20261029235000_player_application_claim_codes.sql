-- Claim an existing pair application only with a fresh organiser-issued, single-use code.
-- Contact email alone is never sufficient; both the code and confirmed Auth email must match.
ALTER TABLE public.tournament_registrations
  ADD COLUMN partner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX tournament_registrations_partner_user_idx
  ON public.tournament_registrations(partner_user_id, created_at DESC)
  WHERE partner_user_id IS NOT NULL;

CREATE TABLE player_private.registration_claim_codes (
  registration_id uuid NOT NULL REFERENCES public.tournament_registrations(id) ON DELETE CASCADE,
  player_role text NOT NULL CHECK (player_role IN ('primary','partner')),
  code_hash bytea NOT NULL UNIQUE,
  issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (registration_id, player_role)
);
REVOKE ALL ON player_private.registration_claim_codes FROM public, anon, authenticated;

-- RLS restricts rows, not columns. A partner or primary applicant must never
-- read organiser-only notes or other contact details through the table API.
REVOKE SELECT ON public.tournament_registrations FROM authenticated;
GRANT SELECT (id, tournament_id, status, pair_name, created_at, submitted_by, partner_user_id)
  ON public.tournament_registrations TO authenticated;

CREATE FUNCTION public.list_tournament_registrations(p_tournament_id uuid)
RETURNS SETOF public.tournament_registrations
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_tournament_id IS NULL OR NOT (SELECT public.is_tournament_admin(p_tournament_id)) THEN
    RAISE EXCEPTION 'Applications unavailable' USING errcode = '42501';
  END IF;
  RETURN QUERY SELECT r.* FROM public.tournament_registrations r
    WHERE r.tournament_id = p_tournament_id ORDER BY r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.list_tournament_registrations(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tournament_registrations(uuid) TO authenticated;

CREATE POLICY "Partners read own linked registrations"
ON public.tournament_registrations FOR SELECT TO authenticated
USING (partner_user_id = (SELECT auth.uid()) AND (SELECT player_private.is_verified_user()));

CREATE FUNCTION public.issue_registration_claim_code(p_registration_id uuid, p_player_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  registration_row public.tournament_registrations%ROWTYPE;
  claim_code text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_player_role IS NULL OR p_player_role NOT IN ('primary','partner') THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  SELECT * INTO registration_row FROM public.tournament_registrations
    WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND OR NOT (SELECT public.is_tournament_admin(registration_row.tournament_id)) THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  IF (p_player_role = 'primary' AND registration_row.submitted_by IS NOT NULL)
    OR (p_player_role = 'partner' AND (registration_row.partner_user_id IS NOT NULL OR nullif(btrim(registration_row.player_two_email),'') IS NULL)) THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  claim_code := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO player_private.registration_claim_codes(registration_id,player_role,code_hash,issued_by,expires_at)
  VALUES(p_registration_id,p_player_role,extensions.digest(decode(claim_code,'hex'),'sha256'),(SELECT auth.uid()),now() + interval '7 days')
  ON CONFLICT (registration_id,player_role) DO UPDATE
    SET code_hash=excluded.code_hash, issued_by=excluded.issued_by, issued_at=now(), expires_at=excluded.expires_at;
  RETURN claim_code;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_registration_claim_code(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_registration_claim_code(uuid,text) TO authenticated;

CREATE FUNCTION public.redeem_registration_claim_code(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  registration_row public.tournament_registrations%ROWTYPE;
  claim_row player_private.registration_claim_codes%ROWTYPE;
  v_registration_id uuid;
  v_player_role text;
  verified_email text;
  token_hash bytea;
BEGIN
  IF NOT (SELECT player_private.is_verified_user()) OR p_code IS NULL OR p_code !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  token_hash := extensions.digest(decode(lower(p_code),'hex'),'sha256');
  SELECT c.registration_id,c.player_role INTO v_registration_id,v_player_role
    FROM player_private.registration_claim_codes c
    WHERE c.code_hash=token_hash AND c.expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Code unavailable' USING errcode = '42501'; END IF;
  SELECT * INTO registration_row FROM public.tournament_registrations
    WHERE id=v_registration_id FOR UPDATE;
  SELECT * INTO claim_row FROM player_private.registration_claim_codes c
    WHERE c.registration_id=v_registration_id AND c.player_role=v_player_role
      AND c.code_hash=token_hash AND c.expires_at > now() FOR UPDATE;
  IF NOT FOUND OR registration_row.id IS NULL THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  SELECT lower(btrim(u.email)) INTO verified_email FROM auth.users u WHERE u.id=(SELECT auth.uid());
  IF (v_player_role='primary' AND (registration_row.submitted_by IS NOT NULL OR lower(btrim(registration_row.player_one_email)) IS DISTINCT FROM verified_email))
    OR (v_player_role='partner' AND (registration_row.partner_user_id IS NOT NULL OR lower(btrim(registration_row.player_two_email)) IS DISTINCT FROM verified_email)) THEN
    RAISE EXCEPTION 'Code unavailable' USING errcode = '42501';
  END IF;
  IF v_player_role='primary' THEN
    UPDATE public.tournament_registrations SET submitted_by=(SELECT auth.uid()) WHERE id=v_registration_id;
  ELSE
    UPDATE public.tournament_registrations SET partner_user_id=(SELECT auth.uid()) WHERE id=v_registration_id;
  END IF;
  DELETE FROM player_private.registration_claim_codes WHERE registration_id=claim_row.registration_id AND player_role=claim_row.player_role;
  RETURN v_registration_id;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_registration_claim_code(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_registration_claim_code(text) TO authenticated;
