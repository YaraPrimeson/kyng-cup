-- Synthetic users and tournaments only. All test writes are rolled back.
begin;
set local statement_timeout='55s';
create temporary table stage_test_report(scenario text primary key,passed boolean);
do $$
declare
  v_user uuid:=gen_random_uuid(); v_id uuid; v_pairs jsonb; v_ids uuid[]; v_groups jsonb;
  v_game public.matches%rowtype; v_group public.group_matches%rowtype; v_next public.matches%rowtype;
  v_row record; v_failed boolean; v_one integer[]; v_two integer[]; v_case integer; v_winner uuid; v_prelim uuid;
begin
  insert into auth.users(id,email) values(v_user,'stage-test-'||v_user||'@example.invalid');
  insert into public.global_admins(user_id,status) values(v_user,'approved');
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  select jsonb_agg(jsonb_build_object('name','Pair '||i,'player_one','A'||i,'player_two','B'||i,'group',chr(65+(i-1)%3)) order by i) into v_pairs from generate_series(1,12) i;
  v_groups:='[{"code":"A","qualify_count":3},{"code":"B","qualify_count":3},{"code":"C","qualify_count":3}]';
  set local role authenticated;
  v_id:=public.create_tournament_setup('Stage regression','stage-test-'||gen_random_uuid(),'Test',now(),now(),'padel','draft','group_knockout',v_pairs,v_groups);
  for v_group in select * from public.group_matches where tournament_id=v_id loop
    perform public.record_group_match_result(v_group.id,array[1],array[0],v_group.pair_one_id);
  end loop;
  select * into v_group from public.group_matches where tournament_id=v_id order by position limit 1;
  begin
    v_failed:=false;
    perform public.record_group_match_result(v_group.id,array[1],array[0],v_group.pair_two_id);
  exception when raise_exception then
    if position('не соответствует' in sqlerrm)=0 then raise; end if; v_failed:=true;
  end;
  if not v_failed then raise exception 'Incorrect group winner was accepted'; end if;
  reset role; insert into stage_test_report values('group winner mismatch rejected',true); set local role authenticated;

  select array_agg(id order by seed) into v_ids from public.pairs where tournament_id=v_id and seed<=9;
  perform public.confirm_group_qualifiers(v_id,v_ids);
  if (select count(*) from public.matches where tournament_id=v_id and bracket_kind='playoffs')<>8
    or (select count(*) from public.matches where tournament_id=v_id and bracket_kind='basement')<>2 then raise exception 'Incorrect independent stage sizes'; end if;
  if exists(select 1 from public.matches a join public.matches b on b.tournament_id=a.tournament_id
    where a.tournament_id=v_id and a.bracket_kind='playoffs' and b.bracket_kind='basement'
    and (a.pair_one_id in(b.pair_one_id,b.pair_two_id) or a.pair_two_id in(b.pair_one_id,b.pair_two_id))) then raise exception 'Pair entered both stages'; end if;
  reset role; insert into stage_test_report values('nine playoff pairs and three consolation pairs create independent brackets',true); set local role authenticated;

  -- Existing tournaments can add consolation once, without replacing the main draw.
  reset role;
  delete from public.matches where tournament_id=v_id and bracket_kind='basement';
  set local role authenticated;
  perform public.create_basement_bracket(v_id);
  v_failed:=false;
  begin perform public.create_basement_bracket(v_id); exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'Existing consolation bracket was overwritten'; end if;
  reset role; insert into stage_test_report values('existing draw adds consolation once without replacing main games',true); set local role authenticated;

  select * into v_game from public.matches where tournament_id=v_id and bracket_kind='playoffs' and round=0;
  v_prelim:=v_game.id;
  for v_case in 1..8 loop
    v_one:=array[1]; v_two:=array[0]; v_winner:=v_game.pair_one_id;
    case v_case
      when 1 then v_winner:=v_game.pair_two_id;
      when 2 then v_one:='{}'; v_two:='{}';
      when 3 then v_one:=null;
      when 4 then v_one:=array[-1];
      when 5 then v_one:=array[1]; v_two:=array[1];
      when 6 then v_one:=array[1,0]; v_two:=array[0,1];
      when 7 then v_winner:=null;
      when 8 then v_one:=array_fill(1,array[1],array[0]);
    end case;
    v_failed:=false;
    begin perform public.record_match_result(v_game.id,v_one,v_two,v_winner);
    exception when raise_exception then v_failed:=true; end;
    if not v_failed then raise exception 'Invalid final score case % was accepted',v_case; end if;
    if (select status from public.matches where id=v_game.id)<>'scheduled' then raise exception 'Failed result changed a match'; end if;
    reset role; insert into stage_test_report values('invalid final score '||v_case||' rejected atomically',true); set local role authenticated;
  end loop;
  -- Validation is enforced even outside the result RPC.
  reset role;
  v_failed:=false;
  begin update public.group_matches set winner_id=v_group.pair_two_id where id=v_group.id;
  exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'Direct invalid completed score bypassed validation'; end if;
  insert into stage_test_report values('database trigger rejects inconsistent completed results',true);
  set local role authenticated;

  perform public.record_match_result(v_game.id,array[1],array[0],v_game.pair_one_id);
  select * into v_next from public.matches where id=v_game.next_match_id;
  if v_next.pair_two_id<>v_game.pair_one_id then raise exception 'Preliminary winner did not advance to the quarterfinal'; end if;
  perform public.record_match_result(v_game.id,array[0],array[1],v_game.pair_two_id);
  if (select pair_two_id from public.matches where id=v_next.id)<>v_game.pair_two_id then raise exception 'Corrected winner did not advance'; end if;
  perform public.reset_match_result(v_game.id);
  if (select pair_two_id from public.matches where id=v_next.id) is not null then raise exception 'Reset did not clear the next participant'; end if;
  perform public.record_match_result(v_game.id,array[1],array[0],v_game.pair_one_id);
  perform public.record_match_result(v_next.id,array[1],array[0],v_next.pair_one_id);
  v_failed:=false;
  begin perform public.reset_match_result(v_prelim); exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'Reset erased a participant of an already completed quarterfinal'; end if;
  reset role; insert into stage_test_report values('preliminary advance correction reset and downstream protection',true); set local role authenticated;

  v_failed:=false;
  begin perform public.confirm_group_qualifiers(v_id,v_ids); exception when raise_exception then v_failed:=true; end;
  if not v_failed or not exists(select 1 from public.matches where id=v_prelim and status='completed') then raise exception 'Reconfirming destroyed started games'; end if;
  reset role; insert into stage_test_report values('rebuilding a started draw is blocked without partial changes',true); set local role authenticated;

  for v_row in select id from public.matches where tournament_id=v_id and bracket_kind='basement' order by round,position loop
    select * into v_game from public.matches where id=v_row.id;
    if v_game.pair_one_id is null or v_game.pair_two_id is null then raise exception 'Consolation opponent did not advance'; end if;
    perform public.record_match_result(v_game.id,array[1],array[0],v_game.pair_one_id);
  end loop;
  if (select status from public.tournaments where id=v_id)<>'live' then raise exception 'Basement final completed the main tournament'; end if;
  select * into v_game from public.matches where tournament_id=v_id and bracket_kind='basement' and next_match_id is null;
  perform public.record_match_result(v_game.id,array[0],array[1],v_game.pair_two_id);
  if (select winner_id from public.matches where id=v_game.id)<>v_game.pair_two_id then raise exception 'Basement correction was not saved'; end if;
  perform public.reset_match_result(v_game.id);
  if (select winner_id from public.matches where id=v_game.id) is not null then raise exception 'Basement reset failed'; end if;
  perform public.record_match_result(v_game.id,array[1],array[0],v_game.pair_one_id);
  reset role; insert into stage_test_report values('consolation winners advance and final supports correction and reset',true); set local role authenticated;

  for v_row in select id from public.matches where tournament_id=v_id and bracket_kind='playoffs' order by round,position loop
    select * into v_game from public.matches where id=v_row.id;
    if v_game.status<>'completed' then perform public.record_match_result(v_game.id,array[1],array[0],v_game.pair_one_id); end if;
  end loop;
  if (select status from public.tournaments where id=v_id)<>'completed' then raise exception 'Main final did not complete the tournament'; end if;
  select * into v_game from public.matches where tournament_id=v_id and bracket_kind='basement' and next_match_id is null;
  perform public.reset_match_result(v_game.id);
  if (select status from public.tournaments where id=v_id)<>'completed' then raise exception 'Resetting the basement final reopened the main tournament'; end if;
  reset role; insert into stage_test_report values('consolation reset preserves the completed main tournament',true);

  if has_function_privilege('anon','public.create_basement_bracket(uuid)','execute')
    or has_function_privilege('authenticated','public.build_knockout_stage(uuid,uuid[],text)','execute') then raise exception 'Private builder exposed'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  set local role authenticated;
  v_failed:=false;
  begin perform public.create_basement_bracket(v_id); exception when raise_exception then v_failed:=true; end;
  if not v_failed then raise exception 'Unapproved account created a consolation bracket'; end if;
  reset role; insert into stage_test_report values('stage creation is restricted to approved organizers',true);
end;
$$;
select count(*) as passed, count(*) filter(where not passed) as failed from stage_test_report;
rollback;
