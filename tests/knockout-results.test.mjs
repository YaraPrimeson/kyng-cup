import assert from 'node:assert/strict';
import test from 'node:test';
import { resultError, parseScore } from '../lib/match-result.ts';
import { knockoutPlan, savedDraw } from '../lib/knockout.ts';

const one = { id: 'a', name: 'Top pair' }, two = { id: 'b', name: 'Bottom pair' };
for (const [score, winner, expected] of [
  ['1-0','a',null], ['0-1','b',null], ['1-0','b',/Top pair/], ['0-1','a',/Bottom pair/],
  ['6-0, 5-7, 5-7','b',null], ['6-0, 5-7, 5-7','a',/Bottom pair/],
  ['1-1','a',/ничейного/], ['0-0','b',/ничейного/], ['6-4, 4-6','a',/решающий/],
  ['6-4','','победившую'], ['-1-0','a',/формате/], ['abc','a',/формате/],
]) {
  test(`result validation ${score} / ${winner || 'no winner'}`, () => {
    const actual = resultError(score,winner,one,two);
    if (expected === null) assert.equal(actual,null);
    else if (typeof expected === 'string') assert.ok(actual.includes(expected));
    else assert.match(actual,expected);
  });
}
test('live score parsing still supports ties, while final-result validation rejects them', () => {
  assert.deepEqual(parseScore('3:3'),{pairOne:[3],pairTwo:[3]});
  assert.match(resultError('3:3','a',one,two),/ничейного/);
});
test('every size from 2 to 64 has exactly n-1 real games and each initial seed appears once', () => {
  for (let count=2;count<=64;count++) {
    const plan=knockoutPlan(count);
    assert.equal(plan.matches.length,count-1);
    assert.ok(plan.size<=count && plan.size*2>count);
    assert.equal(plan.matches.filter(match=>match.round===0).length,count-plan.size);
    assert.deepEqual(plan.matches.flatMap(match=>match.seeds).filter(Boolean).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i+1));
    for (const match of plan.matches) for (const source of match.sources.filter(Boolean)) {
      const feeder=plan.matches.find(candidate=>candidate.id===source);
      assert.ok(feeder);
      assert.equal(feeder.round+1,match.round);
    }
    const ids=Array.from({length:count},(_,i)=>`pair-${i+1}`);
    const rows=plan.matches.map(match=>({...match,pair_one_id:match.seeds[0]?ids[match.seeds[0]-1]:null,pair_two_id:match.seeds[1]?ids[match.seeds[1]-1]:null}));
    assert.deepEqual(savedDraw(count,rows),ids);
  }
});
test('nine pairs: seed 8 plays 9, winner meets 1 in an eight-place main bracket', () => {
  const plan=knockoutPlan(9);
  assert.equal(plan.size,8);
  assert.deepEqual(plan.matches.find(match=>match.round===0).seeds,[8,9]);
  assert.deepEqual(plan.matches.find(match=>match.id==='1:1'),{id:'1:1',round:1,position:1,seeds:[1,null],sources:[null,'0:1'],next_match_id:'2:1',next_slot:1});
  assert.deepEqual(plan.matches.filter(match=>match.round>0).map(match=>match.round),[1,1,1,1,2,2,3]);
});
test('unconfirmed placeholder brackets cannot masquerade as a saved draw',()=>assert.equal(savedDraw(9,[]),null));
