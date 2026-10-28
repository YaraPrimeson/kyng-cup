-- Uses only synthetic tournament data; rollback leaves no test tournament.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.global_admins where status='approved' order by requested_at limit 1),true);
do $$
declare v_pairs jsonb; v_groups jsonb; v_id uuid; v_sizes integer[]; v_count integer; v_failed boolean := false;
begin
  select jsonb_agg(jsonb_build_object('name','Test pair '||i,'player_one','Test A'||i,'player_two','Test B'||i,'group',chr(65+(i-1)%4)) order by i) into v_pairs from generate_series(1,14) i;
  select jsonb_agg(jsonb_build_object('code',chr(65+i),'qualify_count',case when i=3 then 1 else 2 end) order by i) into v_groups from generate_series(0,3) i;
  v_id := public.create_tournament_setup('Synthetic setup check','synthetic-setup-'||gen_random_uuid()::text,'Test',now(),now(),'padel','draft','group_knockout',v_pairs,v_groups);
  select array_agg(size order by code) into v_sizes from (select g.code,count(m.pair_id)::integer size from public.tournament_groups g join public.group_members m on m.group_id=g.id where g.tournament_id=v_id group by g.code) sizes;
  if v_sizes <> array[4,4,3,3] then raise exception 'Incorrect group sizes: %',v_sizes; end if;
  select count(*) into v_count from public.group_matches where tournament_id=v_id;
  if v_count <> 18 then raise exception 'Expected 18 group matches, got %',v_count; end if;
  if (select playoff_participant_count from public.tournaments where id=v_id) <> 7 then raise exception 'Individual qualifier counts not saved'; end if;
  if (select count(*) from public.pairs where tournament_id=v_id and player_one like 'Test A%') <> 14 then raise exception 'Names not saved'; end if;
  -- Seven-pair knockout has three preliminary games and a four-pair main draw.
  v_id := public.create_tournament_setup('Synthetic bye check','synthetic-byes-'||gen_random_uuid()::text,'Test',now(),now(),'padel','draft','knockout',(select jsonb_agg(value) from jsonb_array_elements(v_pairs) with ordinality p(value,n) where n<=7),'[]'::jsonb);
  if (select count(*) from public.matches where tournament_id=v_id and status='completed') <> 0 then raise exception 'Premature automatic advancement'; end if;
  -- Impossible group configuration must not create a partial tournament.
  select count(*) into v_count from public.tournaments;
  begin
    perform public.create_tournament_setup('Invalid setup','invalid-'||gen_random_uuid()::text,'Test',now(),now(),'padel','draft','group_knockout',v_pairs,jsonb_set(v_groups,'{0,qualify_count}','12'));
  exception when others then v_failed := true;
  end;
  if not v_failed or (select count(*) from public.tournaments) <> v_count then raise exception 'Invalid setup was not rolled back'; end if;
end;
$$;
rollback;
