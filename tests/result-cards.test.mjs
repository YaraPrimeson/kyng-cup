import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { playerCards } from '../lib/player-results.ts';
import { renderResultCard, cardHeights } from '../lib/result-card-svg.ts';

const match = (extra = {}) => ({ id:'group:1', tournament_id:'t1', tournament_name:'Autumn Cup', tournament_slug:'autumn-cup', sport:'padel', tournament_status:'completed', tournament_date:'2026-10-01', pair_id:'ours', partner_name:'Partner', partner_user_id:null, opponent_name:'Opponents', stage:'group', round:null, final_round:null, is_final:false, status:'completed', winner_id:'ours', pair_one_id:'ours', pair_two_id:'other', pair_one_sets:[6,6], pair_two_sets:[3,4], completed_at:'2026-10-01T10:00:00Z', scheduled_at:null, ...extra });
const loss = {winner_id:'other',pair_one_sets:[3,4],pair_two_sets:[6,6]};

test('card result separates main elimination and consolation victory without invented placements', () => {
  const group=match(), quarter=match({id:'quarter',stage:'playoffs',round:1,final_round:3,...loss}), consolation=match({id:'consolation',stage:'basement',round:2,final_round:2,is_final:true});
  const [card]=playerCards([group,group,quarter,consolation]);
  assert.equal(card.result,'Четвертьфинал');
  assert.equal(card.consolation,'Победитель утешительной сетки');
  assert.deepEqual([card.wins,card.losses,card.matches],[2,1,3]);
  assert.equal(card.date,'2026-10-01');
  assert.equal(card.slug,'autumn-cup');
  assert.doesNotMatch(JSON.stringify(card),/TOP|2025|2024|пример/);
});

test('only a played main final victory grants a champion card', () => {
  const final=match({stage:'playoffs',round:3,final_round:3,is_final:true});
  assert.equal(playerCards([final])[0].result,'Чемпион');
  assert.equal(playerCards([{...final,...loss}])[0].result,'Финал');
  assert.equal(playerCards([{...final,stage:'basement'}])[0].result,'Утешительная сетка');
  assert.equal(playerCards([{...final,stage:'basement'}])[0].consolation,'Победитель утешительной сетки');
  assert.equal(playerCards([{...final,round:null}])[0].result,'Плей-офф');
  assert.equal(playerCards([{...final,stage:'basement',round:null}])[0].consolation,'Утешительная сетка');
});

test('live events, byes, inconsistent scores, scheduled and reset matches cannot create cards', () => {
  for (const extra of [ {tournament_status:'live'}, {tournament_status:'registration_open'}, {pair_two_id:null}, {pair_two_id:'ours'}, {winner_id:'other'}, {pair_one_sets:[6],pair_two_sets:[6]}, {status:'scheduled'}, {winner_id:null,pair_one_sets:[],pair_two_sets:[]} ]) {
    assert.deepEqual(playerCards([match(extra)]),[],JSON.stringify(extra));
  }
});

test('preliminary and unknown rounds use neutral labels and dates never default to today', () => {
  assert.equal(playerCards([match({stage:'playoffs',round:0})])[0].result,'Предварительный раунд');
  assert.equal(playerCards([match({stage:'playoffs',round:2})])[0].result,'Раунд 2');
  assert.equal(playerCards([match({tournament_date:null,completed_at:null})])[0].date,null);
  assert.equal(playerCards([match({tournament_date:'invalid'})])[0].date,'2026-10-01T10:00:00Z');
});

test('cards separate tournaments, sports and pairs and sort by actual event date', () => {
  const cards=playerCards([match(),match({id:'pair2',pair_id:'other',partner_name:'Second partner'}),match({id:'tennis',sport:'tennis'}),match({id:'t2',tournament_id:'t2',tournament_date:'2026-11-01'})]);
  assert.equal(cards.length,4);
  assert.equal(new Set(cards.map(card=>card.key)).size,4);
  assert.equal(cards[0].tournamentId,'t2');
  assert.ok(cards.some(card=>card.sport==='tennis'));
});

const content={player:'O’Connor & Müller <script>alert(1)</script>',tournament:'Autumn & Winter Cup',sport:'Padel',date:'1 Oct 2026',result:'Quarterfinal',consolation:'Consolation winner',partner:'Partner "Name"',wins:3,losses:2,matches:5,labels:{partner:'Partner',matches:'Matches',wins:'Wins',losses:'Losses',verified:'Confirmed results'}};

test('each exported SVG has exact dimensions, actual content and escaped player input', () => {
  for(const [format,height] of Object.entries(cardHeights)) {
    const svg=renderResultCard(content,format);
    const dom=new JSDOM(svg,{contentType:'image/svg+xml'});
    const root=dom.window.document.documentElement;
    assert.equal(root.getAttribute('width'),'1080');
    assert.equal(root.getAttribute('height'),String(height));
    assert.equal(root.getAttribute('viewBox'),`0 0 1080 ${height}`);
    assert.equal(root.querySelector('script'),null);
    const visibleText=[...root.querySelectorAll('text')].map(node=>[...node.querySelectorAll('tspan')].map(line=>line.textContent).join(' ')).join(' ');
    for(const text of [content.player,content.tournament,content.result,content.consolation,content.date]) assert.ok(visibleText.includes(text),text);
    assert.equal(root.querySelectorAll('image').length,0);
    assert.doesNotMatch(svg,/пример|TOP 8|2024|2025/);
    dom.window.close();
  }
});

test('card image accepts only embedded raster photos and strips invalid XML controls', () => {
  for(const photoDataUrl of ['https://example.com/photo.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)']) {
    assert.doesNotMatch(renderResultCard({...content,photoDataUrl},'square'),/<image/);
  }
  const svg=renderResultCard({...content,player:'Name\u0001 Surname',photoDataUrl:'data:image/png;base64,aGVsbG8='},'square');
  assert.match(svg,/<image href="data:image\/png;base64,aGVsbG8="/);
  assert.ok(!svg.includes('\u0001'));
  assert.match(svg,/Name Surname/);
});
