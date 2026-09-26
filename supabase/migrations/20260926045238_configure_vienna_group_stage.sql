do $$
declare
  v_tournament_id uuid;
  v_owner_id uuid;
  v_format text;
begin
  select id, format
  into v_tournament_id, v_format
  from public.tournaments
  where slug = 'vienna' and sport = 'padel';

  if v_tournament_id is null then
    return;
  end if;

  select user_id
  into v_owner_id
  from public.tournament_admins
  where tournament_id = v_tournament_id and role = 'owner'
  order by created_at
  limit 1;

  if v_owner_id is null then
    raise exception 'The Vienna padel tournament has no owner';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);

  if v_format <> 'group_knockout' then
    perform public.configure_group_stage(v_tournament_id);
  end if;

  perform public.seed_announced_group_pairs(v_tournament_id);
end;
$$;
