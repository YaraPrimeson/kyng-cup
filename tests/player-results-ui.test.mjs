import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/profile/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
let root, Component, temp, pending;
const match = (extra = {}) => ({ id: 'a', tournament_id: 't', tournament_name: 'Кубок A', sport: 'padel', tournament_status: 'completed', tournament_date: null, pair_id: 'ours', partner_user_id: null, partner_name: '', opponent_name: 'Соперник A', stage: 'group', round: null, final_round: null, is_final: false, status: 'completed', winner_id: 'ours', pair_one_id: 'ours', pair_two_id: 'other', pair_one_sets: [6], pair_two_sets: [3], completed_at: '2026-10-01T10:00:00Z', scheduled_at: null, ...extra });
before(async () => {
  globalThis.__resultsClient = { rpc(name) { assert.equal(name, 'get_my_match_history'); return new Promise(resolve => pending.push(resolve)); } };
  const repo = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(`${repo}tmp`, { recursive: true });
  temp = await mkdtemp(`${repo}tmp/results-ui-`);
  const output = await build({ entryPoints: [`${repo}app/profile/player-results.tsx`], bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', plugins: [{ name: 'client', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase=globalThis.__resultsClient;' }));
  } }] });
  await writeFile(`${temp}/component.mjs`, output.outputFiles[0].contents);
  ({ default: Component } = await import(pathToFileURL(`${temp}/component.mjs`).href));
});
async function unmount() { if (root) await act(async () => root.unmount()); root = null; }
beforeEach(async () => { await unmount(); pending = []; root = createRoot(document.getElementById('root')); });
after(async () => { await unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); delete globalThis.__resultsClient; });
async function render(userId, mode = 'history') { await act(async () => root.render(createElement(Component, { userId, mode }))); }
async function resolve(index, rows) { await act(async () => pending[index]({ data: rows, error: null })); }

test('direct rerender hides owner A results while owner B request is pending', async () => {
  await render('A'); await resolve(0, [match()]);
  assert.match(document.body.textContent, /Кубок A/);
  await render('B');
  assert.doesNotMatch(document.body.textContent, /Кубок A|Соперник A/);
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /Загружаем/);
  await resolve(1, [match({ tournament_name: 'Кубок B', opponent_name: 'Соперник B' })]);
  assert.match(document.body.textContent, /Кубок B/);
});

test('ambiguous chronology shows no numeric streak and explains the locked award', async () => {
  await render('A', 'summary');
  await resolve(0, [match(), match({ id: 'b' }), match({ id: 'c' })]);
  const streak = [...document.querySelectorAll('.kv-stats > div')].find(node => node.querySelector('small')?.textContent === 'Побед подряд');
  assert.equal(streak?.querySelector('strong')?.textContent, '—');
  assert.match(document.body.textContent, /Недостаточно данных о порядке матчей/);
  assert.doesNotMatch(document.body.textContent, /Лучшая серия: \d/);
  await render('A', 'achievements');
  const award = document.querySelector('[data-award="streak"]');
  assert.equal(award?.getAttribute('data-earned'), 'false');
  await act(async () => award.click());
  assert.match(document.querySelector('#player-achievement-detail')?.textContent ?? '', /Недостаточно данных о порядке матчей/);
});

test('delayed owner A response cannot replace resolved owner B results', async () => {
  await render('A'); await render('B');
  await resolve(1, [match({ tournament_name: 'Кубок B', opponent_name: 'Соперник B' })]);
  await resolve(0, [match()]);
  assert.match(document.body.textContent, /Кубок B/);
  assert.doesNotMatch(document.body.textContent, /Кубок A|Соперник A/);
});
