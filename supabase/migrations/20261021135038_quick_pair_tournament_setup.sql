-- One transaction creates the tournament, names, group memberships and qualifiers.
create or replace function public.create_tournament_setup(
  p_name text, p_slug text, p_location text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_sport text, p_status text, p_format text,
  p_pairs jsonb, p_groups jsonb
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid; v_count integer; v_group_count integer; v_playoffs integer;
  v_pair record; v_input jsonb; v_group jsonb; v_index integer := 0;
  v_ids uuid[] := '{}'; v_codes text[] := '{}'; v_size integer;
begin
  if not coalesce((select public.is_global_admin()),false) then raise exception 'Organiser access required'; end if;
  if jsonb_typeof(p_pairs) is distinct from 'array' or jsonb_typeof(p_groups) is distinct from 'array' then raise exception 'Invalid setup'; end if;
  v_count := jsonb_array_length(p_pairs);
  v_group_count := jsonb_array_length(p_groups);
  if v_count < 2 or v_count > 64 then raise exception 'Pair count must be between 2 and 64'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at < p_starts_at then raise exception 'Check tournament dates'; end if;
  if p_status is null or p_status not in ('draft','published') then raise exception 'Invalid visibility'; end if;
  if p_format is null or p_format not in ('group_knockout','knockout') then raise exception 'Invalid format'; end if;
  if p_sport is null or p_sport not in ('tennis','padel') then raise exception 'Invalid sport'; end if;
  if exists (select 1 from jsonb_array_elements(p_pairs) item where
      (coalesce(trim(item->>'player_one'),'')='') <> (coalesce(trim(item->>'player_two'),'')='')
      or length(coalesce(item->>'player_one',''))>200 or length(coalesce(item->>'player_two',''))>200 or length(coalesce(item->>'name',''))>200)
  then raise exception 'Enter both player names or leave both empty (maximum 200 characters)'; end if;
  if p_format='group_knockout' then
    if v_group_count < 1 or v_group_count > 26 or v_group_count*2 > v_count then raise exception 'Each group needs at least two pairs'; end if;
    v_playoffs := 0;
    for v_index in 0..v_group_count-1 loop
      v_group := p_groups->v_index;
      if (v_group->>'code') is distinct from chr(65+v_index) then raise exception 'Groups must be ordered A, B, C'; end if;
      select count(*) into v_size from jsonb_array_elements(p_pairs) item where item->>'group'=v_group->>'code';
      if v_size < 2 or (v_group->>'qualify_count') is null or (v_group->>'qualify_count')::integer not between 0 and v_size then raise exception 'Check group size and qualifiers'; end if;
      v_playoffs := v_playoffs + (v_group->>'qualify_count')::integer;
    end loop;
    if exists(select 1 from jsonb_array_elements(p_pairs) item where not exists(select 1 from jsonb_array_elements(p_groups) g where g->>'code'=item->>'group')) then raise exception 'Every pair needs a valid group'; end if;
    if v_playoffs < 2 or v_playoffs > v_count then raise exception 'Choose at least two playoff pairs'; end if;
  else
    if v_group_count <> 0 then raise exception 'Knockout tournaments do not use groups'; end if;
    v_playoffs := v_count;
  end if;
  v_id := public.create_flexible_tournament(p_name,p_slug,p_location,p_starts_at,p_sport,v_count,p_format,v_group_count,v_playoffs);
  v_index := 0;
  for v_pair in select id from public.pairs where tournament_id=v_id order by seed loop
    v_input := p_pairs->v_index;
    update public.pairs set
      name=coalesce(nullif(trim(v_input->>'name'),''),case when nullif(trim(v_input->>'player_one'),'') is not null then trim(v_input->>'player_one') || ' / ' || trim(v_input->>'player_two') else 'Pair ' || lpad((v_index+1)::text,2,'0') end),
      player_one=coalesce(nullif(trim(v_input->>'player_one'),''),'Player ' || (v_index*2+1)::text),
      player_two=coalesce(nullif(trim(v_input->>'player_two'),''),'Player ' || (v_index*2+2)::text), updated_at=now()
    where id=v_pair.id;
    v_ids := array_append(v_ids,v_pair.id);
    v_codes := array_append(v_codes,v_input->>'group');
    v_index := v_index+1;
  end loop;
  if p_format='group_knockout' then
    perform public.set_group_assignments(v_id,v_ids,v_codes);
    for v_group in select value from jsonb_array_elements(p_groups) loop
      update public.tournament_groups set qualify_count=(v_group->>'qualify_count')::integer
      where tournament_id=v_id and code=v_group->>'code';
    end loop;
  end if;
  update public.tournaments set ends_at=p_ends_at,status=p_status,updated_at=now() where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.create_tournament_setup(text,text,text,timestamptz,timestamptz,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_tournament_setup(text,text,text,timestamptz,timestamptz,text,text,text,jsonb,jsonb) to authenticated;

-- An empty slot may await a real opponent from an unfinished feeder match.
-- Advance automatically only when that entire seed range is empty.
do $$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.rebuild_playoff_bracket(uuid,uuid[])'::regprocedure);
  if position('when v_match.pair_one_id is not null and v_match.pair_two_id is null then' in v_definition)=0 then raise exception 'Unexpected bye logic'; end if;
  v_definition := replace(v_definition,
    'when v_match.pair_one_id is not null and v_match.pair_two_id is null then',
    'when v_match.pair_one_id is not null and v_match.pair_two_id is null and (v_match.position-1)*power(2,v_round)+power(2,v_round-1)+1 > v_count then');
  v_definition := replace(v_definition,
    'when v_match.pair_one_id is null and v_match.pair_two_id is not null then',
    'when v_match.pair_one_id is null and v_match.pair_two_id is not null and (v_match.position-1)*power(2,v_round)+1 > v_count then');
  execute v_definition;
end;
$$;
