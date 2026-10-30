-- Explicit organiser assertion, never inferred from a name or contact address.
-- Composite FKs keep tournament identity invariant even if a parent row is edited.
ALTER TABLE public.tournament_registrations
  ADD CONSTRAINT tournament_registrations_id_tournament_key UNIQUE (id,tournament_id);
ALTER TABLE public.pairs
  ADD CONSTRAINT pairs_id_tournament_key UNIQUE (id,tournament_id);
CREATE TABLE player_private.registration_pair_links (
  registration_id uuid PRIMARY KEY,
  pair_id uuid NOT NULL UNIQUE,
  tournament_id uuid NOT NULL,
  FOREIGN KEY (registration_id,tournament_id)
    REFERENCES public.tournament_registrations(id,tournament_id) ON DELETE CASCADE,
  FOREIGN KEY (pair_id,tournament_id)
    REFERENCES public.pairs(id,tournament_id) ON DELETE CASCADE
);
CREATE INDEX registration_pair_links_tournament_idx
  ON player_private.registration_pair_links(tournament_id);
ALTER TABLE player_private.registration_pair_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON player_private.registration_pair_links FROM public,anon,authenticated;

CREATE FUNCTION public.link_registration_pair(p_registration_id uuid,p_pair_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  registration_row public.tournament_registrations%ROWTYPE;
  existing_pair uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Organiser access required' USING errcode='42501';
  END IF;
  -- Lock the registration to serialize link/unlink and status changes.
  SELECT * INTO registration_row FROM public.tournament_registrations
    WHERE id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.is_tournament_admin(registration_row.tournament_id),false) THEN
    RAISE EXCEPTION 'Organiser access required' USING errcode='42501';
  END IF;
  -- Allow removing a stale link after a registration has been cancelled.
  IF p_pair_id IS NULL THEN
    DELETE FROM player_private.registration_pair_links WHERE registration_id=p_registration_id;
    RETURN;
  END IF;
  IF registration_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Confirmed registration required' USING errcode='23514';
  END IF;
  PERFORM 1 FROM public.pairs WHERE id=p_pair_id AND tournament_id=registration_row.tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pair must belong to the registration tournament' USING errcode='23514';
  END IF;
  SELECT l.pair_id INTO existing_pair FROM player_private.registration_pair_links l
    WHERE l.registration_id=p_registration_id;
  IF existing_pair IS NOT NULL THEN
    IF existing_pair=p_pair_id THEN RETURN; END IF;
    RAISE EXCEPTION 'Unlink the registration before assigning another pair' USING errcode='23505';
  END IF;
  -- UNIQUE(pair_id) arbitrates concurrent attempts for the same pair.
  INSERT INTO player_private.registration_pair_links(registration_id,pair_id,tournament_id)
    VALUES(p_registration_id,p_pair_id,registration_row.tournament_id);
END;
$$;
REVOKE ALL ON FUNCTION public.link_registration_pair(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.link_registration_pair(uuid,uuid) TO authenticated;

CREATE FUNCTION public.get_registration_pair_links(p_tournament_id uuid)
RETURNS TABLE(registration_id uuid,pair_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_tournament_id IS NULL
    OR NOT coalesce(public.is_tournament_admin(p_tournament_id),false) THEN
    RAISE EXCEPTION 'Organiser access required' USING errcode='42501';
  END IF;
  RETURN QUERY SELECT l.registration_id,l.pair_id FROM player_private.registration_pair_links l
    WHERE l.tournament_id=p_tournament_id ORDER BY l.registration_id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_registration_pair_links(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_registration_pair_links(uuid) TO authenticated;

CREATE FUNCTION public.get_my_match_history()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  viewer_id uuid := (SELECT auth.uid());
  result jsonb;
BEGIN
  IF viewer_id IS NULL OR NOT (SELECT player_private.is_verified_user()) THEN
    RAISE EXCEPTION 'Verified player account required' USING errcode='42501';
  END IF;
  WITH own_pairs AS (
    SELECT l.pair_id,r.tournament_id,
      CASE WHEN r.submitted_by=viewer_id THEN nullif(r.partner_user_id,viewer_id)
        ELSE nullif(r.submitted_by,viewer_id) END AS partner_user_id,
      CASE WHEN r.submitted_by=viewer_id THEN btrim(concat_ws(' ',r.player_two_first_name,r.player_two_last_name))
        ELSE btrim(concat_ws(' ',r.player_one_first_name,r.player_one_last_name)) END AS partner_name,
      t.name AS tournament_name,t.slug AS tournament_slug,t.sport,t.status AS tournament_status,t.starts_at
    FROM player_private.registration_pair_links l
    JOIN public.tournament_registrations r ON r.id=l.registration_id AND r.tournament_id=l.tournament_id
    JOIN public.tournaments t ON t.id=r.tournament_id
    WHERE r.status='confirmed' AND t.status<>'draft'
      AND (r.submitted_by=viewer_id OR r.partner_user_id=viewer_id)
  ), match_rows AS (
    SELECT 'group'::text AS kind,g.id,g.tournament_id,'group'::text AS stage,
      null::integer AS round,null::integer AS final_round,false AS is_final,
      g.status,g.winner_id,g.pair_one_id,g.pair_two_id,g.pair_one_sets,g.pair_two_sets,g.completed_at,g.scheduled_at
    FROM public.group_matches g
    UNION ALL
    SELECT 'knockout',m.id,m.tournament_id,m.bracket_kind,m.round,
      max(m.round) OVER (PARTITION BY m.tournament_id,m.bracket_kind),
      m.round>0 AND m.round=max(m.round) OVER (PARTITION BY m.tournament_id,m.bracket_kind)
        AND m.next_match_id IS NULL,
      m.status,m.winner_id,m.pair_one_id,m.pair_two_id,m.pair_one_sets,m.pair_two_sets,m.completed_at,m.scheduled_at
    FROM public.matches m
  ), projected AS (
    -- Multiple owned pairs may have independent matches, but owning both sides
    -- makes a match ambiguous: exclude it rather than choosing a side by UUID.
    SELECT m.kind,m.id,o.starts_at,m.completed_at,m.scheduled_at,
      jsonb_build_object(
        'id',m.kind||':'||m.id::text,
        'tournament_id',o.tournament_id,'tournament_name',o.tournament_name,
        'tournament_slug',o.tournament_slug,'sport',o.sport,
        'tournament_status',o.tournament_status,'tournament_date',o.starts_at,
        'pair_id',o.pair_id,'partner_user_id',o.partner_user_id,'partner_name',o.partner_name,
        'opponent_name',opponent.name,
        'stage',m.stage,'round',m.round,'final_round',m.final_round,'is_final',m.is_final,
        'status',m.status,'winner_id',m.winner_id,
        'pair_one_id',m.pair_one_id,'pair_two_id',m.pair_two_id,
        'pair_one_sets',m.pair_one_sets,'pair_two_sets',m.pair_two_sets,
        'completed_at',m.completed_at,'scheduled_at',m.scheduled_at
      ) AS payload
    FROM own_pairs o JOIN match_rows m ON m.tournament_id=o.tournament_id
      AND (m.pair_one_id=o.pair_id OR m.pair_two_id=o.pair_id)
    LEFT JOIN public.pairs opponent ON opponent.tournament_id=m.tournament_id
      AND opponent.id=CASE WHEN m.pair_one_id=o.pair_id THEN m.pair_two_id ELSE m.pair_one_id END
    WHERE m.status IN ('scheduled','live','completed')
      AND NOT EXISTS (
        SELECT 1 FROM own_pairs other
        WHERE other.tournament_id=m.tournament_id
          AND other.pair_id=CASE WHEN m.pair_one_id=o.pair_id THEN m.pair_two_id ELSE m.pair_one_id END
      )
  )
  SELECT coalesce(jsonb_agg(payload ORDER BY starts_at DESC NULLS LAST,
    coalesce(completed_at,scheduled_at) DESC NULLS LAST,kind,id),'[]'::jsonb)
  INTO result FROM projected;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_match_history() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_match_history() TO authenticated;
