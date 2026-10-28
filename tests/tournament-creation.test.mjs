import assert from 'node:assert/strict';
import test from 'node:test';
import {
  balancePairs, blankPairs, buildTournamentSetup, groupSummary, parsePairList, tournamentSlug,
} from '../lib/tournament-setup.ts';

function setup(overrides = {}) {
  return {
    name: '  KYNG Padel Cup  ', slug: '', fallbackSlug: 'kyng-cup-fallback',
    location: '  Vienna, Austria  ', date: '2027-06-12', endDate: '',
    sport: 'padel', status: 'draft', format: 'group_knockout',
    pairs: balancePairs(blankPairs(16), 4), groups: 4,
    qualifiers: { A: 2, B: 2, C: 2, D: 2 }, ...overrides,
  };
}

for (const sport of ['padel', 'tennis']) {
  for (const status of ['draft', 'published']) {
    for (const format of ['knockout', 'group_knockout']) {
      for (const count of [2, 7, 16, 64]) {
        test(`creation payload: ${sport}, ${status}, ${format}, ${count} pairs`, () => {
          const groups = Math.min(4, Math.floor(count / 2));
          const pairs = balancePairs(blankPairs(count), groups);
          const input = setup({ sport, status, format, pairs, groups });
          const original = structuredClone(input);
          const payload = buildTournamentSetup(input);
          assert.equal(payload.p_sport, sport);
          assert.equal(payload.p_status, status);
          assert.equal(payload.p_format, format);
          assert.equal(payload.p_name, 'KYNG Padel Cup');
          assert.equal(payload.p_slug, 'kyng-padel-cup');
          assert.equal(payload.p_location, 'Vienna, Austria');
          assert.equal(payload.p_pairs.length, count);
          assert.deepEqual(payload.p_pairs, pairs);
          assert.equal(payload.p_starts_at, new Date('2027-06-12T12:00:00').toISOString());
          assert.equal(payload.p_ends_at, payload.p_starts_at);
          assert.deepEqual(payload.p_groups, format === 'knockout' ? [] : Array.from(
            { length: groups }, (_, i) => ({ code: String.fromCharCode(65 + i), qualify_count: 2 }),
          ));
          assert.deepEqual(input, original, 'Preparing a request must not mutate form state');
        });
      }
    }
  }
}

test('all allowed pair/group counts distribute every pair once and keep groups balanced', () => {
  for (let count = 2; count <= 64; count++) {
    const pairs = Array.from({ length: count }, (_, i) => ({
      name: `Team ${i}`, player_one: `A${i}`, player_two: `B${i}`, group: 'Z',
    }));
    const original = structuredClone(pairs);
    for (let groups = 1; groups <= Math.min(26, Math.floor(count / 2)); groups++) {
      const distributed = balancePairs(pairs, groups);
      const summary = groupSummary(distributed, groups);
      const sizes = summary.map(group => group.size);
      assert.equal(sizes.reduce((total, size) => total + size, 0), count);
      assert.ok(Math.min(...sizes) >= 2);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
      assert.equal(new Set(distributed.map(pair => pair.name)).size, count);
      const players = list => list.map(pair => [pair.name, pair.player_one, pair.player_two]);
      assert.deepEqual(players(distributed), players(pairs));
      assert.deepEqual(summary.map(group => group.matches), sizes.map(size => size * (size - 1) / 2));
    }
    assert.deepEqual(pairs, original);
  }
});

test('blank pairs are independent editable objects', () => {
  const pairs = blankPairs(64);
  pairs[0].player_one = 'Alex';
  assert.equal(pairs[1].player_one, '');
  assert.equal(new Set(pairs).size, 64);
});

test('manual 3+5 groups, individual qualifiers, Unicode names and multi-day dates survive submission', () => {
  const pairs = balancePairs(parsePairList(
    Array.from({ length: 8 }, (_, i) => ` Команда ${i} | Алексей ${i} | José ${i} `).join('\n'),
  ), 2);
  pairs[0].group = 'B';
  const payload = buildTournamentSetup(setup({ pairs, groups: 2, qualifiers: { A: 1, B: 3 }, endDate: '2027-06-14' }));
  assert.deepEqual(groupSummary(payload.p_pairs, 2).map(group => group.size), [3, 5]);
  assert.deepEqual(payload.p_groups, [{ code: 'A', qualify_count: 1 }, { code: 'B', qualify_count: 3 }]);
  assert.equal(payload.p_pairs[0].player_one, 'Алексей 0');
  assert.equal(payload.p_pairs[0].player_two, 'José 0');
  assert.equal(payload.p_ends_at, new Date('2027-06-14T12:00:00').toISOString());
});

test('zero qualifiers in one group is allowed when at least two qualify overall', () => {
  const payload = buildTournamentSetup(setup({ qualifiers: { A: 0, B: 0, C: 1, D: 1 } }));
  assert.deepEqual(payload.p_groups.map(group => group.qualify_count), [0, 0, 1, 1]);
});

test('knockout ignores stale group and qualifier settings after switching format', () => {
  const payload = buildTournamentSetup(setup({ format: 'knockout', pairs: blankPairs(3), qualifiers: { A: 64 } }));
  assert.equal(payload.p_pairs.length, 3);
  assert.deepEqual(payload.p_groups, []);
});

test('custom URL, Cyrillic fallback URL, empty location and trimmed manual names', () => {
  assert.equal(buildTournamentSetup(setup({ slug: 'custom-cup-2027' })).p_slug, 'custom-cup-2027');
  assert.equal(buildTournamentSetup(setup({ name: 'Кубок Києва' })).p_slug, 'kyng-cup-fallback');
  const pairs = blankPairs(16);
  pairs[0] = { name: '  Dream team  ', player_one: '  Alex  ', player_two: '  Dan  ', group: 'A' };
  const payload = buildTournamentSetup(setup({ pairs: balancePairs(pairs, 4), location: '  ' }));
  assert.deepEqual(payload.p_pairs[0], { name: 'Dream team', player_one: 'Alex', player_two: 'Dan', group: 'A' });
  assert.equal(payload.p_location, '');
  assert.equal(payload.p_pairs[1].player_one, '', 'Empty names are sent to the database for placeholders');
});

for (const [label, overrides, message] of [
  ['empty title', { name: '' }, /название и дату/],
  ['whitespace title', { name: '   ' }, /название и дату/],
  ['missing date', { date: '' }, /название и дату/],
  ['end before start', { endDate: '2027-06-11' }, /раньше начала/],
  ['URL with spaces', { slug: 'my cup' }, /адрес турнира/],
  ['uppercase URL', { slug: 'MY-CUP' }, /адрес турнира/],
  ['Cyrillic URL', { slug: 'кубок' }, /адрес турнира/],
  ['leading URL dash', { slug: '-cup' }, /адрес турнира/],
  ['trailing URL dash', { slug: 'cup-' }, /адрес турнира/],
  ['repeated URL dash', { slug: 'cup--2027' }, /адрес турнира/],
  ['no playoff qualifiers', { qualifiers: { A: 0, B: 0, C: 0, D: 0 } }, /минимум 2 пары/],
  ['one playoff qualifier', { qualifiers: { A: 1, B: 0, C: 0, D: 0 } }, /минимум 2 пары/],
  ['too many qualifiers', { qualifiers: { A: 5, B: 2, C: 2, D: 2 } }, /минимум 2 пары/],
  ['empty group after manual moves', { pairs: blankPairs(16) }, /минимум 2 пары/],
]) {
  test(`form rejects ${label}`, () => assert.throws(() => buildTournamentSetup(setup(overrides)), message));
}

for (const field of ['player_one', 'player_two']) {
  test(`form rejects a manually entered pair with only ${field}`, () => {
    const pairs = balancePairs(blankPairs(16), 4);
    pairs[0][field] = 'Alex';
    assert.throws(() => buildTournamentSetup(setup({ pairs })), /обоих игроков/);
    pairs[0][field] = '   ';
    assert.doesNotThrow(() => buildTournamentSetup(setup({ pairs })));
  });
}

test('import handles CRLF, blank lines, Unicode and mixed spreadsheet separators', () => {
  assert.deepEqual(parsePairList('\r\n Алексей / Данило \r\n\r\n José\tAnna\r\n Team C | Eva | Mia \r\n'), [
    { name: '', player_one: 'Алексей', player_two: 'Данило', group: 'A' },
    { name: '', player_one: 'José', player_two: 'Anna', group: 'A' },
    { name: 'Team C', player_one: 'Eva', player_two: 'Mia', group: 'A' },
  ]);
});

test('three spreadsheet columns may have an empty optional team name', () => {
  const pairs = parsePairList('\tAlex\tDan\n\tEva\tMia');
  assert.deepEqual(pairs[0], { name: '', player_one: 'Alex', player_two: 'Dan', group: 'A' });
});

for (const count of [2, 64]) {
  test(`import accepts boundary of ${count} pairs`, () => {
    assert.equal(parsePairList(Array.from({ length: count }, (_, i) => `A${i} / B${i}`).join('\n')).length, count);
  });
}

for (const [label, value, message] of [
  ['empty list', '', /от 2 до 64/],
  ['one pair', 'Alex / Dan', /от 2 до 64/],
  ['65 pairs', Array.from({ length: 65 }, (_, i) => `A${i} / B${i}`).join('\n'), /от 2 до 64/],
  ['missing player', 'Alex / Dan\nEva /', /Строка 2/],
  ['extra column', 'Alex / Dan\nTeam | Eva | Mia | Other', /Строка 2/],
  ['empty spreadsheet player', 'Alex / Dan\nTeam\tEva\t', /Строка 2/],
  ['empty first spreadsheet player', 'Alex / Dan\n\tMia', /Строка 2/],
  ['duplicate team with reversed names', 'Alex / Dan\n DAN / alex', /уже есть/],
  ['duplicate Unicode names', 'АЛЕКСЕЙ / Данило\nданило / алексей', /уже есть/],
  ['different team label for same players', 'One | Alex | Dan\nTwo | Dan | Alex', /уже есть/],
]) {
  test(`import rejects ${label}`, () => assert.throws(() => parsePairList(value), message));
}

test('URL generation normalizes accents, spaces, punctuation and surrounding dashes', () => {
  assert.equal(tournamentSlug('  KYNG — José Cup 2027!  '), 'kyng-jose-cup-2027');
  assert.equal(tournamentSlug('Кубок Києва'), '');
});
