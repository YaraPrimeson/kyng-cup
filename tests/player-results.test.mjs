import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerResults, matchScore, matchStage } from '../lib/player-results.ts';

const match = (extra = {}) => ({ id: 'group:1', tournament_id: 't1', tournament_name: 'Cup', tournament_slug: 'cup', sport: 'padel', tournament_status: 'completed', tournament_date: '2026-10-01', pair_id: 'ours', partner_user_id: 'partner', partner_name: 'Partner', opponent_name: 'Opponents', stage: 'group', round: null, final_round: null, is_final: false, status: 'completed', winner_id: 'ours', pair_one_id: 'ours', pair_two_id: 'other', pair_one_sets: [6, 6], pair_two_sets: [3, 4], completed_at: '2026-10-01T10:00:00Z', scheduled_at: null, ...extra });

test('only valid played results count; byes, scheduled, duplicates and inconsistent winners do not', () => {
  const result = playerResults([match(), match(), match({ id: 'bye', pair_two_id: null, pair_one_sets: [], pair_two_sets: [] }), match({ id: 'upcoming', status: 'scheduled', winner_id: null }), match({ id: 'invalid', winner_id: 'other' })]);
  assert.deepEqual(result.stats, { played: 1, wins: 1, losses: 0, winRate: 100, completedTournaments: 1, currentStreak: 1, bestStreak: 1 });
  assert.equal(result.history[0].matches.length, 1);
  assert.equal(result.achievements.find(item => item.id === 'first-win').earned, true);
});

test('empty results never grant awards or invent a win percentage', () => {
  const result = playerResults([]);
  assert.equal(result.stats.played, 0);
  assert.equal(result.stats.winRate, 0);
  assert.equal(result.history.length, 0);
  assert.ok(result.achievements.every(award => !award.earned));
});

test('scores are always oriented to the player and stage labels separate consolation', () => {
  const reversed = match({ pair_one_id:'other', pair_two_id:'ours', pair_one_sets:[3,4], pair_two_sets:[6,6] });
  assert.equal(matchScore(reversed), '6:3 · 6:4');
  assert.equal(matchStage(match({ stage:'basement', round:2, final_round:3 })), 'Полуфинал · утешительная сетка');
  assert.equal(matchStage(match({ stage:'playoffs', round:0, final_round:3 })), 'Предварительный раунд');
});

test('unknown rounds and impossible distances do not invent knockout stages', () => {
  for (const stage of ['playoffs', 'basement']) {
    const suffix = stage === 'basement' ? ' · утешительная сетка' : '';
    const neutral = stage === 'basement' ? 'Утешительная сетка' : 'Плей-офф';
    for (const final_round of [null, 1, 2]) {
      for (const is_final of [false, true]) assert.equal(matchStage(match({ stage, round: null, final_round, is_final })), neutral);
    }
    assert.equal(matchStage(match({ stage, round: 2, final_round: null })), `Раунд 2${suffix}`);
    assert.equal(matchStage(match({ stage, round: 4, final_round: 3 })), `Раунд 4${suffix}`);
    assert.equal(matchStage(match({ stage, round: -1, final_round: 1, is_final: true })), neutral);
    assert.equal(matchStage(match({ stage, round: 0, final_round: null, is_final: true })), `Предварительный раунд${suffix}`);
    assert.equal(matchStage(match({ stage, round: 2, final_round: null, is_final: true })), `Финал${suffix}`);
  }
  assert.equal(matchStage(match({ stage: 'group', round: null, final_round: 1, is_final: true })), 'Групповой этап');
});

test('ambiguous played chronology never invents a streak from ids or fallback dates', () => {
  for (const completed_at of [null, 'not-a-date', '2026-10-01T10:00:00Z', '2026-10-01T12:00:00+02:00']) {
    const games = [
      match({ id: 'a', completed_at }),
      match({ id: 'b', completed_at: '2026-10-01T10:00:00Z' }),
      match({ id: 'c', completed_at: '2026-10-01T11:00:00Z' }),
      match({ id: 'd', completed_at: '2026-10-01T12:00:00Z', winner_id: 'other', pair_one_sets: [3,4], pair_two_sets: [6,6] }),
    ];
    for (const rows of [games, [...games].reverse()]) {
      const result = playerResults(rows);
      assert.equal(result.stats.currentStreak, 0);
      assert.equal(result.stats.bestStreak, 0);
      assert.equal(result.streakReliable, false);
      assert.equal(result.achievements.find(a => a.id === 'streak').earned, false);
      assert.equal(result.achievements.find(a => a.id === 'streak').progress, 'Недостаточно данных о порядке матчей');
      assert.equal(result.stats.played, 4);
      assert.equal(result.stats.wins, 3);
    }
  }
});

test('streaks use chronological played results and reset results remove awards', () => {
  const games = Array.from({length:4}, (_, i) => match({ id:`m${i}`, completed_at:`2026-10-01T1${i}:00:00Z`, ...(i===3 ? {winner_id:'other', pair_one_sets:[3,4], pair_two_sets:[6,6]} : {}) }));
  const result = playerResults([...games].reverse());
  assert.equal(result.stats.bestStreak, 3);
  assert.equal(result.stats.currentStreak, 0);
  assert.equal(result.stats.wins, 3);
  assert.equal(result.stats.losses, 1);
  assert.equal(result.stats.winRate, 75);
  assert.ok(result.achievements.find(a => a.id==='streak').earned);
  const reset = playerResults(games.map(game => ({...game, status:'scheduled', winner_id:null, pair_one_sets:[], pair_two_sets:[]})));
  assert.ok(reset.achievements.every(a => !a.earned));
});

test('completed tournament and win milestones count distinct events, not registrations', () => {
  const games = Array.from({length:10}, (_, i) => match({ id:`m${i}`, tournament_id:`t${i}` }));
  const result = playerResults([...games, games[0]]);
  assert.equal(result.stats.completedTournaments, 10);
  assert.ok(result.achievements.find(a => a.id==='ten-wins').earned);
  assert.ok(result.achievements.find(a => a.id==='ten-events').earned);
  const live = playerResults(games.map(game => ({ ...game, tournament_status:'live', partner_user_id:null })));
  for(const id of ['debut','ten-events','duo']) assert.equal(live.achievements.find(a => a.id===id).earned, false, id);
});

test('a preliminary draw and matching partner names do not grant qualification or duo', () => {
  const games = [match(), match({id:'prelim', stage:'playoffs', round:0, final_round:3}), match({id:'2',tournament_id:'t2', partner_user_id:null}), match({id:'3',tournament_id:'t3',partner_user_id:null})];
  const result = playerResults(games);
  for(const id of ['group','duo','top8','semi','final','champion']) assert.equal(result.achievements.find(a=>a.id===id).earned,false,id);
});

test('partial, tied, negative and null set scores never count as played results', () => {
  const bad = [ [[],[]], [[6],[4,3]], [[6],[6]], [[-1],[6]], [[null],[6]], [[6,3],[4,6]], [[100],[0]] ];
  assert.equal(playerResults(bad.map(([a,b],i)=>match({id:`bad${i}`,pair_one_sets:a,pair_two_sets:b}))).stats.played,0);
});


test('awards use played main rounds, completed tournaments and account-linked partners', () => {
  const rounds = [
    match(),
    match({ id: 'q', stage: 'playoffs', round: 1, final_round: 3 }),
    match({ id: 's', stage: 'playoffs', round: 2, final_round: 3 }),
    match({ id: 'f', stage: 'playoffs', round: 3, final_round: 3, is_final: true }),
    match({ id: 'b', tournament_id: 't2', stage: 'basement', round: 1, final_round: 1, is_final: true }),
    match({ id: 'third', tournament_id: 't3' }),
  ].map((game, index) => ({ ...game, completed_at: `2026-10-01T1${index}:00:00Z` }));
  const earned = new Set(playerResults(rounds).achievements.filter(a => a.earned).map(a => a.id));
  for (const id of ['debut','first-win','group','top8','semi','final','champion','second-chance','streak','duo']) assert.ok(earned.has(id), id);
  assert.ok(!earned.has('ten-wins'));
  assert.ok(!earned.has('ten-events'));
  const notEarned = playerResults([match({ stage:'basement', round:1, final_round:3 }), match({ id:'auto', stage:'playoffs', round:3, final_round:3, is_final:true, pair_two_id:null, pair_one_sets:[], pair_two_sets:[] })]);
  for (const id of ['top8','semi','final','champion','group','second-chance']) assert.equal(notEarned.achievements.find(a => a.id === id).earned, false, id);
});

