import test from 'node:test';
import assert from 'node:assert/strict';
import { balancePairs, blankPairs, parsePairList, groupSummary } from '../lib/tournament-setup.ts';

test('four groups support 16, 14 and 13 pairs with the correct round robin match counts', () => {
  for (const [count, sizes, matches] of [[16,[4,4,4,4],24],[14,[4,4,3,3],18],[13,[4,3,3,3],15]]) {
    const summary=groupSummary(balancePairs(blankPairs(count),4),4);
    assert.deepEqual(summary.map(group=>group.size),sizes);
    assert.equal(summary.reduce((sum,group)=>sum+group.matches,0),matches);
  }
});
test('manual moves keep the original players and allow different group sizes', () => {
  const pairs=balancePairs(parsePairList('Alex / Dan\nMaria / Anna\nMark / Leo\nEva / Mia\nJohn / Bob\nSam / Max\nIan / Tom\nAmy / Zoe'),2);
  pairs[0].group='B';
  assert.deepEqual(groupSummary(pairs,2).map(group=>group.size),[3,5]);
  assert.equal(pairs[0].player_one,'Alex');
});
test('paste accepts slash lists and two or three spreadsheet columns',()=>{
  const pairs=parsePairList('Alex / Dan\nMaria\tAnna\nTeam Three\tMark\tLeo\nTeam Four | Eva | Mia');
  assert.equal(pairs.length,4);
  assert.equal(pairs[2].name,'Team Three');
  assert.equal(pairs[3].player_two,'Mia');
});
test('incomplete, duplicate reversed pairs and oversized lists are rejected',()=>{
  assert.throws(()=>parsePairList('Alex / Dan\nMaria'),/Строка 2/);
  assert.throws(()=>parsePairList('Alex / Dan\nDan / Alex'),/уже есть/);
  assert.throws(()=>parsePairList(Array.from({length:65},(_,i)=>`A${i} / B${i}`).join('\n')),/64/);
});
