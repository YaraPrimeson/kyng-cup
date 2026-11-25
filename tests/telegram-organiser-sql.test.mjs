import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import test from 'node:test';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const migration = (name) => read('supabase/migrations/' + name + '.sql');
const section = (source, start, end) => {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + 1);
  assert.ok(first >= 0 && last > first, start);
  return source.slice(first, last);
};
test('Telegram organiser controls a twelve-pair tournament through both finals', async () => {
  const db = new PGlite();
  const exec = (sql) => db.exec(sql);
  const query = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const organiser = '10000000-0000-4000-8000-000000000001';
  const telegram = 42;
  try {
    await exec(read('tests/fixtures/player-history-schema.sql'));
    const shared = migration('20261028180015_tournament_results_and_knockout_stages');
    const groups = migration('20260925201516_add_safe_group_stage');
    const management = migration('20260814190000_full_tournament_management');
    const initial = migration('20261123155530_telegram_tournament_demo');
    const multi = migration('20261123162307_telegram_demo_multiset');
    await exec(section(groups, 'create table if not exists public.group_members', 'create table if not exists public.group_matches'));
    await exec(section(shared, 'create function public.assert_result_score', '-- Preserve existing'));
    await exec(section(shared, '-- Shared builder', '-- Also supports'));
    for (const [source, start, end] of [
      [management, 'create function public.record_match_result', 'create or replace function public.reset_match_result'],
      [groups, 'create or replace function public.record_group_match_result', 'create or replace function public.reset_group_match_result'],
    ]) {
      await exec(section(source,start,end).replace("if cardinality(p_pair_one_sets) = 0 or cardinality(p_pair_one_sets) <> cardinality(p_pair_two_sets) then raise exception 'Enter a valid score'; end if;",'perform public.assert_result_score(v_match.pair_one_id,v_match.pair_two_id,p_winner_id,p_pair_one_sets,p_pair_two_sets);').replace("else\n    update public.tournaments set status = 'completed'","elsif v_match.bracket_kind = 'playoffs' then\n    update public.tournaments set status = 'completed'"));
    }
    await exec('alter table public.match_result_history alter column id add generated always as identity');
    await exec(section(initial, 'create schema if not exists telegram_demo', 'create view telegram_demo.scoreboard'));
    await exec(section(multi, 'create function telegram_demo.wins', 'create or replace view telegram_demo.scoreboard'));
    const scoring = migration('20261124075154_telegram_manual_scoring');
    await exec(section(scoring,'create or replace function telegram_demo.next_match_play','create or replace function telegram_demo.cup_board'));
    await exec(migration('20261030120000_player_match_history'));
    await exec(migration('20261125103728_telegram_organiser_workflow'));
    const tournament = '20000000-0000-4000-8000-000000000001';
    const outsider = '10000000-0000-4000-8000-000000000002';
    const code = 'f'.repeat(48);
    const key = 'a'.repeat(24);
    await exec(`
      insert into auth.users(id) values ('${organiser}'),('${outsider}');
      insert into public.global_admins(user_id,status) values ('${organiser}','approved');
      insert into public.tournaments(id,slug,name,status,format,bracket_size,participant_count,playoff_participant_count)
      values ('${tournament}','telegram-test','Twelve pairs','published','group_knockout',4,12,4);
      insert into public.tournament_groups(tournament_id,code,qualify_count)
      select '${tournament}',chr(64+i),1 from generate_series(1,4) i;
      insert into public.pairs(tournament_id,name,player_one,player_two,seed)
      select '${tournament}','Pair '||i,'Player '||i,'Partner '||i,i from generate_series(1,12) i;
      insert into public.group_members(group_id,pair_id,position)
      select g.id,p.id,((p.seed-1)%3)+1 from public.pairs p join public.tournament_groups g on g.code=chr(65+((p.seed-1)/3))
      where p.tournament_id='${tournament}' and g.tournament_id='${tournament}';
      insert into public.group_matches(tournament_id,group_id,position,pair_one_id,pair_two_id,court)
      select '${tournament}',a.group_id,row_number() over(partition by a.group_id order by a.position,b.position),a.pair_id,b.pair_id,'Court'
      from public.group_members a join public.group_members b on a.group_id=b.group_id and a.position<b.position;
      grant usage on schema auth to authenticated;
    `);
    const rpc=async(action, payload={}, id=telegram)=>(await query(
      'select public.telegram_organiser($1,$2,$3) as value',[id,action,payload])).value;
    assert.equal((await rpc('board',{tournament_id:tournament})).linked,false);
    const privileges=await query(`select has_function_privilege('authenticated','public.telegram_organiser(bigint,text,jsonb)','EXECUTE') as auth,
      has_function_privilege('anon','public.telegram_confirm_link(text)','EXECUTE') as anon`);
    assert.deepEqual(privileges,{auth:false,anon:false});
    await exec('set role service_role');
    assert.equal((await rpc('link',{code,label:'Telegram test'})).linked,false);
    await exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${outsider}',false);`);
    assert.equal((await query('select public.telegram_confirm_link($1) as value',[code])).value,false);
    await exec(`select set_config('request.jwt.claim.sub','${organiser}',false);`);
    assert.match((await query('select public.telegram_link_info($1) as value',[code])).value,/Telegram test/);
    assert.equal((await query('select public.telegram_confirm_link($1) as value',[code])).value,true);
    assert.equal((await query('select public.telegram_confirm_link($1) as value',[code])).value,false);
    await exec(`reset role; select set_config('request.jwt.claim.sub','',false); set role service_role;`);
    assert.equal((await rpc('list')).tournaments.length,1);
    assert.equal((await rpc('list',{},99)).linked,false);
    assert.equal((await rpc('save_panel',{key,buttons:[{screen:'match'}]})).ok,true);
    assert.deepEqual((await rpc('button',{key,index:0})).command,{screen:'match'});
    assert.match((await rpc('button',{key,index:0})).error,/устарела/);
    const control=(action,payload={})=>rpc(action,{tournament_id:tournament,...payload});
    let board=await control('board');
    assert.equal(board.groups.length,4);
    assert.equal(board.matches.length,12);
    const call=async(action,payload)=>{
      board=await control(action,payload);
      assert.ok(!board.error,board.error);
    };
    const matchMove=(m,move,extra={})=>call('match',{match_id:m.id,group:!!m.group_id,version:m.updated_at,move,...extra});
    const one=board.pairs[0];
    await call('player',{pair_id:one.id,version:one.version,side:1,name:'Reserve',mode:'replace'});
    assert.equal(board.pairs[0].player_one,'Reserve');
    const first=board.matches.find(m=>m.pair_one_id===one.id);
    const find=id=>board.matches.find(m=>m.id===id);
    await matchMove(first,'start');
    const past=await control('match',{match_id:first.id,group:true,version:first.updated_at,move:'plus1'});
    assert.match(past.error,/уже обновился/);
    assert.match((await control('player',{pair_id:one.id,version:board.pairs[0].version,side:1,name:'Another',mode:'replace'})).error,/уже начался/);
    await matchMove(find(first.id),'setplus1');
    await matchMove(find(first.id),'score',{one:7,two:5});
    await matchMove(find(first.id),'finishwithset');
    assert.deepEqual(find(first.id).awarded_sets,[1]);
    assert.deepEqual(find(first.id).play.sets,[[1,0,true],[7,5]]);
    await matchMove(find(first.id),'correct',{sets:[[1,0],[8,6]],reason:'Input error'});
    assert.deepEqual(find(first.id).play.sets,[[1,0,true],[8,6]]);
    for(const id of board.matches.filter(m=>m.id!==first.id).map(m=>m.id)){
      await matchMove(find(id),'start');
      await matchMove(find(id),'score',{one:7,two:5});
      await matchMove(find(id),'finishwithset');
    }
    const version=board.draw_version;
    const qualified=board.groups.map(group=>group.members[0].pair_id);
    await call('draw',{version,qualified});
    assert.equal(board.matches.filter(m=>m.bracket_kind==='playoffs').length,3);
    assert.equal(board.matches.filter(m=>m.bracket_kind==='basement').length,7);
    for(const kind of ['playoffs','basement']){
      const [first,second]=board.matches.filter(m=>m.bracket_kind===kind&&m.round===1);
      await call('swap',{match_id:first.id,other_id:second.id,side:1,other_side:1,version:first.updated_at,other_version:second.updated_at});
      assert.equal(find(first.id).pair_one_id,second.pair_one_id);
      await matchMove(find(first.id),'start');
      assert.ok((await control('swap',{match_id:first.id,other_id:second.id,side:1,other_side:1,version:find(first.id).updated_at,other_version:find(second.id).updated_at})).error);
      for(const id of board.matches.filter(m=>m.bracket_kind===kind).sort((a,b)=>a.round-b.round).map(m=>m.id)){
        if(find(id).status==='scheduled')await matchMove(find(id),'start');
        await matchMove(find(id),'score',{one:7,two:5});
        await matchMove(find(id),'finishwithset');
      }
      assert.notEqual(board.tournament.status,'completed');
    }
    assert.equal(board.matches.filter(m=>m.status==='completed').length,22);
    await call('close');
    assert.equal(board.tournament.status,'completed');
    assert.ok((await control('log')).log.some(entry=>entry.action==='telegram_swap'));
  } finally {
    await db.close();
  }
});
