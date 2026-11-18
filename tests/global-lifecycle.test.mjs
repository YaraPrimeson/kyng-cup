import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {buildTournamentSetup} from '../lib/tournament-setup.ts';
import {playerResults,playerPartners,playerCards,matchScore} from '../lib/player-results.ts';
import {calculateStandings} from '../app/group-stage.ts';
import {renderResultCard} from '../lib/result-card-svg.ts';

// A real PostgreSQL engine with the schema-only production catalog snapshot.
// No network, auth tokens, emails, notifications or production writes occur.
test('three complete tournaments connect 16 player identities, applications, results, partners and cards',async t=>{
  const db=new PGlite({extensions:{pgcrypto}});
  const players=Array.from({length:16},(_,i)=>({id:randomUUID(),name:i===3||i===5?'QA Same Name':`QA Player ${i+1}`,email:`qa-player-${i+1}@example.invalid`}));
  const organizer={id:randomUUID(),email:'qa-organizer@example.invalid'},outsider={id:randomUUID(),email:'qa-outsider@example.invalid'},unverified={id:randomUUID(),email:'qa-unverified@example.invalid'};
  const events=[],ledger=new Map();
  const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
  async function as(user,sql,args=[],role='authenticated'){
    await db.exec('begin');
    try{
      await query("select set_config('request.jwt.claim.sub',$1,true)",[user?.id??'']);
      await db.exec(`set local role ${role}`);
      const rows=await query(sql,args);await db.exec('commit');return rows;
    }catch(e){await db.exec('rollback');throw e;}
  }
  const history=async(user)=>(await as(user,'select public.get_my_match_history() as rows'))[0].rows;
  async function record(game,preferred,kind='matches'){
    const winner=preferred&&[game.pair_one_id,game.pair_two_id].includes(preferred)?preferred:game.pair_one_id;
    const one=winner===game.pair_one_id?[6,4,10]:[3,6,7],two=winner===game.pair_one_id?[3,6,7]:[6,4,10];
    await as(organizer,`select public.${kind==='matches'?'record_match_result':'record_group_match_result'}($1,$2,$3,$4)`,[game.id,one,two,winner]);
    ledger.set(game.id,{...game,winner_id:winner,pair_one_sets:one,pair_two_sets:two,kind});
  }
  async function finishDraw(event,kind='playoffs',preferred=event.pairs[0].id){
    const games=await query('select id from matches where tournament_id=$1 and bracket_kind=$2 order by round,position',[event.id,kind]);
    for(const game of games){
      const current=(await query('select * from matches where id=$1',[game.id]))[0];
      assert.ok(current.pair_one_id&&current.pair_two_id,'every match has two actual opponents');
      if(current.status!=='completed')await record(current,preferred);
    }
  }
  try{
    await db.exec(await readFile(new URL('./fixtures/lifecycle-schema.sql',import.meta.url),'utf8'));
    for(const suite of ['tournament-creation','results-and-stages','player-match-history'])await t.test(`existing SQL regression suite: ${suite}`,async()=>{
      try{await db.exec(await readFile(new URL(`./${suite}.sql`,import.meta.url),'utf8'));}
      catch(e){await db.exec('rollback');throw e;}
    });
    await t.test('verified players create private profiles, while an unverified account and an outsider cannot take ownership',async()=>{
      for(const p of [...players,organizer,outsider,unverified])await query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[p.id,p.email,p===unverified?null:new Date().toISOString()]);
      await query("insert into global_admins(user_id,status) values($1,'approved')",[organizer.id]);
      for(const p of players)await as(p,'insert into player_profiles(auth_user_id,display_name) values($1,$2)',[p.id,p.name]);
      await assert.rejects(as(unverified,'insert into player_profiles(auth_user_id,display_name) values($1,$2)',[unverified.id,'QA Unverified']),{code:'42501'});
      await assert.rejects(as(outsider,'insert into player_profiles(auth_user_id,display_name) values($1,$2)',[players[0].id,'Forged']),{code:'42501'});
      assert.equal((await as(outsider,'select * from player_profiles')).length,0);
      assert.equal((await as(players[0],'select * from player_profiles')).length,1);
      await assert.rejects(as(players[0],"select public.create_flexible_tournament('Forbidden','forbidden','QA',now(),'padel',2,'knockout',0,2)"));
    });
    const specifications=[{n:4,format:'knockout'},{n:7,format:'knockout'},{n:8,format:'group_knockout'}];
    for(const [index,spec] of specifications.entries())await t.test(`tournament ${index+1}: ${spec.n} pairs, ${spec.format}, real application ownership and partner claim codes`,async()=>{
      const pairs=Array.from({length:spec.n},(_,i)=>({name:`QA Team ${i+1}`,player_one:players[i*2].name,player_two:players[i*2+1].name,group:i%2?'B':'A'}));
      const payload=buildTournamentSetup({name:`QA Lifecycle ${index+1}`,slug:`qa-lifecycle-${index+1}`,fallbackSlug:'unused',location:'QA Court',date:`2026-11-${10+index}`,endDate:`2026-11-${10+index}`,sport:'padel',status:'draft',format:spec.format,pairs,groups:2,qualifiers:{A:2,B:2}});
      const id=(await as(organizer,'select public.create_tournament_setup($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id',Object.values(payload)))[0].id;
      const event={id,index,spec,pairs:await query('select * from pairs where tournament_id=$1 order by seed',[id]),registrations:[]};events.push(event);
      assert.equal((await as(null,'select id from tournaments where id=$1',[id],'anon')).length,0,'draft hidden from guest');
      assert.equal((await as(null,'select id from pairs where tournament_id=$1',[id],'anon')).length,0,'draft participants hidden');
      await as(organizer,"update tournaments set status='published' where id=$1",[id]);
      assert.equal((await as(null,'select id from tournaments where id=$1',[id],'anon')).length,1);
      for(const [i,pair] of event.pairs.entries()){
        const primary=players[i*2],partner=players[i*2+1];
        const application=(await as(primary,`insert into tournament_registrations(tournament_id,pair_name,player_one_first_name,player_one_last_name,player_one_email,player_one_phone,player_one_level,player_two_first_name,player_two_last_name,player_two_email,player_two_level,locale,marketing_opt_in)
          values($1,$2,'QA',$3,$4,'+0000000000','intermediate','QA',$5,$6,'intermediate','en',false) returning id,submitted_by,status`,[id,pair.name,primary.name.replace(/^QA /,''),primary.email,partner.name.replace(/^QA /,''),partner.email]))[0];
        assert.equal(application.submitted_by,primary.id);assert.equal(application.status,'new');
        await as(organizer,"update tournament_registrations set status='confirmed',admin_notes='PRIVATE QA NOTE' where id=$1",[application.id]);
        await as(organizer,'select public.link_registration_pair($1,$2)',[application.id,pair.id]);
        const code=(await as(organizer,"select public.issue_registration_claim_code($1,'partner') as code",[application.id]))[0].code;
        await assert.rejects(as(outsider,'select public.redeem_registration_claim_code($1)',[code]),{code:'42501'});
        assert.equal((await as(partner,'select public.redeem_registration_claim_code($1) as id',[code]))[0].id,application.id);
        await assert.rejects(as(partner,'select public.redeem_registration_claim_code($1)',[code]),{code:'42501'});
        await assert.rejects(as(primary,'select admin_notes from tournament_registrations where id=$1',[application.id]),{code:'42501'});
        assert.equal((await as(partner,'select id from tournament_registrations where id=$1',[application.id])).length,1);
        event.registrations.push(application.id);
      }
      assert.equal((await as(outsider,'select id from tournament_registrations')).length,0);
      assert.equal(playerCards(await history(players[0])).filter(card=>card.tournamentId===id).length,0,'unfinished events cannot produce result cards');
    });
    await t.test('playoffs and preliminary rounds advance real winners, reject contradictory scores and protect completed successors',async()=>{
      for(const event of events.slice(0,2)){
        const game=(await query('select * from matches where tournament_id=$1 order by round,position limit 1',[event.id]))[0];
        await assert.rejects(as(organizer,'select public.record_match_result($1,$2,$3,$4)',[game.id,[6,6],[3,4],game.pair_two_id]));
        await assert.rejects(as(players[0],'select public.record_match_result($1,$2,$3,$4)',[game.id,[6],[3],game.pair_one_id]));
        await finishDraw(event);
        assert.equal((await query('select status from tournaments where id=$1',[event.id]))[0].status,'completed');
        assert.equal((await query('select count(*)::int as n from matches where tournament_id=$1',[event.id]))[0].n,event.spec.n-1);
        const played=(await query('select * from matches where id=$1',[game.id]))[0];
        await assert.rejects(as(organizer,'select public.record_match_result($1,$2,$3,$4)',[played.id,[3],[6],played.pair_two_id]));
        const final=(await query('select * from matches where tournament_id=$1 and next_match_id is null',[event.id]))[0];
        assert.equal(final.winner_id,event.pairs[0].id);
      }
    });
    await t.test('groups, standings, qualifier draws and the consolation tournament have independent winners',async()=>{
      const event=events[2];
      const groups=await query('select * from tournament_groups where tournament_id=$1 order by code',[event.id]);
      const members=await query('select gm.* from group_members gm join tournament_groups g on g.id=gm.group_id where g.tournament_id=$1',[event.id]);
      await assert.rejects(as(organizer,'select public.confirm_group_qualifiers($1,$2)',[event.id,event.pairs.slice(0,4).map(p=>p.id)]));
      const games=await query('select * from group_matches where tournament_id=$1 order by group_id,position',[event.id]);
      assert.equal(games.length,12);
      for(const game of games){
        const one=event.pairs.find(p=>p.id===game.pair_one_id),two=event.pairs.find(p=>p.id===game.pair_two_id);
        await record(game,one.seed<two.seed?one.id:two.id,'group_matches');
      }
      const complete=await query('select * from group_matches where tournament_id=$1',[event.id]);
      const qualifiers=groups.flatMap(group=>{
        const standings=calculateStandings(members.filter(m=>m.group_id===group.id),complete.filter(m=>m.group_id===group.id));
        assert.equal(standings.length,4);assert.equal(standings[0].won,3);assert.equal(standings.at(-1).lost,3);
        return standings.slice(0,group.qualify_count).map(row=>row.pairId);
      });
      await as(organizer,'select public.confirm_group_qualifiers($1,$2)',[event.id,qualifiers]);
      await finishDraw(event,'basement',event.pairs[4].id);
      assert.equal((await query('select status from tournaments where id=$1',[event.id]))[0].status,'live','consolation final cannot finish main event');
      await finishDraw(event);
      assert.equal((await query('select status from tournaments where id=$1',[event.id]))[0].status,'completed');
    });
    await t.test('every player receives exact ledger totals, their own partner, accurate result cards and no private contacts',async()=>{
      const allRows={};
      for(const [index,player] of players.entries()){
        const rows=await history(player);allRows[player.id]=rows;
        const ownPairs=new Set(events.filter(e=>index<e.spec.n*2).map(e=>e.pairs[Math.floor(index/2)].id));
        const expected=[...ledger.values()].filter(g=>ownPairs.has(g.pair_one_id)||ownPairs.has(g.pair_two_id));
        const expectedWins=expected.filter(g=>ownPairs.has(g.winner_id)).length;
        const results=playerResults(rows);
        assert.equal(results.stats.played,expected.length,player.name+' played');
        assert.equal(results.stats.wins,expectedWins,player.name+' wins');
        assert.equal(results.stats.losses,expected.length-expectedWins);
        const partner=players[index%2?index-1:index+1];
        assert.ok(rows.every(r=>r.partner_user_id===partner.id&&r.partner_name===partner.name));
        assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
        assert.doesNotMatch(JSON.stringify(rows),/@example|PRIVATE QA NOTE|phone|email|claim_code/);
        for(const row of rows)assert.match(matchScore(row),/^\d+:\d+ · \d+:\d+ · \d+:\d+$/);
        const partners=playerPartners(rows);assert.equal(partners.length,1);assert.equal(partners[0].accountId,partner.id);
        const cards=playerCards(rows);assert.equal(cards.length,events.filter(e=>index<e.spec.n*2).length);
        for(const card of cards){
          const event=events.find(e=>e.id===card.tournamentId);
          const own=event.pairs[Math.floor(index/2)].id;
          const games=expected.filter(g=>g.tournament_id===event.id);
          assert.equal(card.matches,games.length);assert.equal(card.wins,games.filter(g=>g.winner_id===own).length);assert.equal(card.partner,partner.name);
          const final=(await query("select winner_id from matches where tournament_id=$1 and bracket_kind='playoffs' and next_match_id is null",[event.id]))[0];
          assert.equal(card.result==='Чемпион',final.winner_id===own);
          const svg=renderResultCard({player:player.name,tournament:card.name,sport:'Padel',date:card.date,result:card.result,consolation:card.consolation,partner:card.partner,wins:card.wins,losses:card.losses,matches:card.matches,labels:{partner:'Partner',matches:'Matches',wins:'Wins',losses:'Losses',verified:'Official result'}},'square');
          assert.doesNotMatch(svg,/@example|PRIVATE QA NOTE|пример результата/);assert.match(svg,/width="1080" height="1080"/);
        }
      }
      assert.equal((await history(outsider)).length,0);
      await assert.rejects(history(unverified),{code:'42501'});
      for(const player of players.slice(0,8))assert.equal(playerResults(allRows[player.id]).achievements.find(a=>a.id==='duo').earned,true);
      assert.equal(playerCards(allRows[players[8].id]).find(c=>c.tournamentId===events[2].id).consolation,'Победитель утешительной сетки');
      assert.equal(playerResults(allRows[players[8].id]).achievements.find(a=>a.id==='champion').earned,false);
      if(process.env.KYNG_QA_OUTPUT){await mkdir(process.env.KYNG_QA_OUTPUT,{recursive:true});await writeFile(process.env.KYNG_QA_OUTPUT+'/lifecycle.json',JSON.stringify({players,events,history:allRows,ledger:[...ledger.values()]},null,2));}
    });
    await t.test('reopening and correcting a final removes stale cards and awards and restores consistent totals',async()=>{
      const event=events[0],final=(await query('select * from matches where tournament_id=$1 and next_match_id is null',[event.id]))[0];
      await as(organizer,'select public.reset_match_result($1)',[final.id]);
      assert.equal((await query('select status from tournaments where id=$1',[event.id]))[0].status,'live');
      assert.equal(playerCards(await history(players[0])).some(c=>c.tournamentId===event.id),false);
      const newWinner=final.winner_id===final.pair_one_id?final.pair_two_id:final.pair_one_id;
      await record(final,newWinner);
      for(const [i,pair] of event.pairs.entries()){
        const card=playerCards(await history(players[i*2])).find(c=>c.tournamentId===event.id);
        assert.equal(card.result==='Чемпион',pair.id===newWinner);
      }
    });
    await t.test('profile optimistic locking prevents a second device or account overwriting edits',async()=>{
      const p=players[0],original=(await as(p,'select * from player_profiles'))[0];
      assert.equal((await as(p,'update player_profiles set display_name=$1 where auth_user_id=$2 and version=$3 returning version',['QA Changed',p.id,original.version]))[0].version,original.version+1);
      assert.equal((await as(p,'update player_profiles set display_name=$1 where auth_user_id=$2 and version=$3 returning version',['Stale',p.id,original.version])).length,0);
      assert.equal((await as(players[1],'update player_profiles set display_name=$1 where auth_user_id=$2 returning version',['Foreign',p.id])).length,0);
    });
    await t.test('avatar storage rules reject foreign uploads and references',async()=>{
      const p=players[0],path=`${p.id}/${randomUUID()}.jpg`;
      await as(p,"insert into storage.objects(bucket_id,name,owner_id) values('player-avatars',$1,$2)",[path,p.id]);
      await as(p,'update player_profiles set avatar_path=$1 where auth_user_id=$2',[path,p.id]);
      await assert.rejects(as(players[1],"insert into storage.objects(bucket_id,name,owner_id) values('player-avatars',$1,$2)",[`${p.id}/${randomUUID()}.jpg`,players[1].id]),{code:'42501'});
      assert.equal((await as(players[1],"select * from storage.objects where name=$1",[path])).length,0);
      await assert.rejects(as(players[1],'update player_profiles set avatar_path=$1 where auth_user_id=$2',[path,players[1].id]),{code:'23514'});
    });
    await t.test('registration policies reject duplicates, closed events and completed tournaments, and preserve waitlist status',async()=>{
      const event=events[0],primary=players[0],partner=players[1];
      const insert=`insert into tournament_registrations(tournament_id,player_one_first_name,player_one_last_name,player_one_email,player_one_phone,player_one_level,player_two_first_name,player_two_last_name,player_two_email,player_two_level)
        values($1,'QA','Primary',$2,'+0000000000','intermediate','QA','Partner',$3,'intermediate')`;
      await assert.rejects(as(primary,insert,[event.id,outsider.email,partner.email]),/registration is unavailable/);
      await as(organizer,"update tournaments set status='published',registration_status='closed' where id=$1",[event.id]);
      await assert.rejects(as(primary,insert,[event.id,outsider.email,partner.email]),/registration is closed/);
      await as(organizer,"update tournaments set registration_status='open' where id=$1",[event.id]);
      await assert.rejects(as(primary,insert,[event.id,primary.email.toUpperCase(),partner.email.toUpperCase()]),{code:'23505'});
      await as(organizer,"update tournaments set registration_status='waitlist' where id=$1",[event.id]);
      await as(outsider,insert,[event.id,outsider.email,null]);
      assert.equal((await as(outsider,'select status from tournament_registrations'))[0].status,'waitlist');
      await as(organizer,"update tournaments set status='completed',registration_status='closed' where id=$1",[event.id]);
    });
    await t.test('claim-code expiry, rotation and primary claiming preserve ownership boundaries',async()=>{
      await db.exec(await readFile(new URL('./player-application-claims.sql',import.meta.url),'utf8'));
    });
  }finally{await db.close();}
});
