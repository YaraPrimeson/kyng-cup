import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/profile/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, Element: dom.window.Element, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
let root, Component, Partners, LanguageProvider, temp, pending;
const match = (extra = {}) => ({ id: 'a', tournament_id: 't', tournament_name: 'Кубок A', sport: 'padel', tournament_status: 'completed', tournament_date: null, pair_id: 'ours', partner_user_id: null, partner_name: '', opponent_name: 'Соперник A', stage: 'group', round: null, final_round: null, is_final: false, status: 'completed', winner_id: 'ours', pair_one_id: 'ours', pair_two_id: 'other', pair_one_sets: [6], pair_two_sets: [3], completed_at: '2026-10-01T10:00:00Z', scheduled_at: null, ...extra });
before(async () => {
  globalThis.__resultsClient = { rpc(name) { assert.equal(name, 'get_my_match_history'); return new Promise(resolve => pending.push(resolve)); } };
  const repo = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(`${repo}tmp`, { recursive: true });
  temp = await mkdtemp(`${repo}tmp/results-ui-`);
  const output = await build({ stdin: { contents: `export {default} from "./app/profile/player-results.tsx"; export {default as Partners} from "./app/profile/player-partners.tsx"; export {LanguageProvider} from "./app/i18n.tsx";`, resolveDir: repo, loader: "tsx" }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic', plugins: [{ name: 'client', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase=globalThis.__resultsClient;' }));
  } }] });
  await writeFile(`${temp}/component.mjs`, output.outputFiles[0].contents);
  ({ default: Component, Partners, LanguageProvider } = await import(pathToFileURL(`${temp}/component.mjs`).href));
});
async function unmount() { if (root) await act(async () => root.unmount()); root = null; }
beforeEach(async () => { await unmount(); window.localStorage.clear(); pending = []; root = createRoot(document.getElementById('root')); });
after(async () => { await unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); delete globalThis.__resultsClient; });
async function render(userId, mode = 'history') { await act(async () => root.render(createElement(LanguageProvider, null, createElement(Component, { userId, mode })))); }
async function resolve(index, rows) { await act(async () => pending[index]({ data: rows, error: null })); }

test('direct rerender hides owner A results while owner B request is pending', async () => {
  await render('A'); await resolve(0, [match()]);
  assert.match(document.body.textContent, /Кубок A/);
  await render('B');
  assert.doesNotMatch(document.body.textContent, /Кубок A|Соперник A/);
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /Loading/);
  await resolve(1, [match({ tournament_name: 'Кубок B', opponent_name: 'Соперник B' })]);
  assert.match(document.body.textContent, /Кубок B/);
});

test('ambiguous chronology shows no numeric streak and explains the locked award', async () => {
  await render('A', 'summary');
  await resolve(0, [match(), match({ id: 'b' }), match({ id: 'c' })]);
  const streak = [...document.querySelectorAll('.kv-stats > div')].find(node => node.querySelector('small')?.textContent === 'Win streak');
  assert.equal(streak?.querySelector('strong')?.textContent, '—');
  assert.match(document.body.textContent, /Not enough data to determine match order/);
  assert.doesNotMatch(document.body.textContent, /Best streak: \d/);
  await render('A', 'achievements');
  const award = document.querySelector('[data-award="streak"]');
  assert.equal(award?.getAttribute('data-earned'), 'false');
  await act(async () => award.click());
  assert.match(document.querySelector('#player-achievement-detail')?.textContent ?? '', /Not enough data to determine match order/);
});

test('delayed owner A response cannot replace resolved owner B results', async () => {
  await render('A'); await render('B');
  await resolve(1, [match({ tournament_name: 'Кубок B', opponent_name: 'Соперник B' })]);
  await resolve(0, [match()]);
  assert.match(document.body.textContent, /Кубок B/);
  assert.doesNotMatch(document.body.textContent, /Кубок A|Соперник A/);
});


test('hidden tennis results cannot appear in history, statistics or achievements', async () => {
  await render('A');
  await resolve(0, [match({ id: 'padel', winner_id: 'other', pair_one_sets: [3], pair_two_sets: [6] }), match({ id: 'tennis', sport: 'tennis', tournament_name: 'Hidden tennis cup', completed_at: '2026-10-02T10:00:00Z' })]);
  assert.doesNotMatch(document.body.textContent, /Tennis|Hidden tennis cup/);
  const stats = [...document.querySelectorAll('.kv-stats > div')].map(node => node.querySelector('strong').textContent);
  assert.deepEqual(stats.slice(0, 3), ['1', '0', '1']);
  await render('A', 'achievements');
  assert.equal(document.querySelector('[data-award="first-win"]').getAttribute('data-earned'), 'false');
});


async function renderPartners(userId) { await act(async () => root.render(createElement(LanguageProvider, null, createElement(Partners, { userId })))); }

test('partner cards expand shared history with player-relative scores and survive language changes', async () => {
  await renderPartners('A');
  assert.match(document.body.textContent, /Loading partners/);
  await resolve(0, [match({ partner_user_id:'p', partner_name:'Anna Example', pair_one_id:'other', pair_two_id:'ours', pair_one_sets:[3], pair_two_sets:[6] }), match({id:'hidden', sport:'tennis', partner_user_id:'t', partner_name:'Hidden tennis partner'})]);
  assert.equal(document.querySelectorAll('.kv-partner-toggle').length,1);
  assert.doesNotMatch(document.body.textContent,/Hidden tennis partner|Tennis/);
  const toggle=document.querySelector('.kv-partner-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.doesNotMatch(document.body.textContent,/Соперник A/);
  await act(async () => toggle.click());
  assert.match(document.body.textContent,/Shared history|Соперник A/);
  assert.match(document.querySelector('.kv-match b').textContent,/6:3/);
  assert.match(document.body.textContent,/1 of 3 tournaments with the same partner/);
  for(const [language,title] of [['uk','Спільна історія'],['de','Gemeinsamer Verlauf']]) {
    await act(async () => window.dispatchEvent(new window.StorageEvent('storage',{key:'kyng-language',newValue:language})));
    assert.ok(document.body.textContent.includes(title));
    assert.equal(toggle.getAttribute('aria-expanded'),'true');
    assert.match(document.body.textContent,/Anna Example/);
  }
  await act(async () => toggle.click());
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  assert.equal(document.querySelector('.kv-match'),null);
});

test('unlinked names stay in separate cards with an explanation instead of combined duo progress', async () => {
  await renderPartners('A');
  await resolve(0,[match({partner_name:'Same Name'}),match({id:'two',tournament_id:'t2',partner_name:'Same Name'})]);
  assert.equal(document.querySelectorAll('.kv-partner-toggle').length,2);
  await act(async () => document.querySelector('.kv-partner-toggle').click());
  assert.match(document.body.textContent,/organiser codes/);
  assert.equal(document.querySelector('.kv-partner-duo'),null);
});

test('partner data disappears immediately on account changes and late replies cannot restore it', async () => {
  await renderPartners('A'); await resolve(0,[match({partner_name:'Private partner A'})]);
  await renderPartners('B');
  assert.doesNotMatch(document.body.textContent,/Private partner A/);
  await renderPartners('C');
  await resolve(2,[match({partner_name:'Partner C'})]);
  await resolve(1,[match({partner_name:'Late partner B'})]);
  assert.match(document.body.textContent,/Partner C/);
  assert.doesNotMatch(document.body.textContent,/Private partner A|Late partner B/);
});

test('partner errors offer retry and are not shown as an empty partner list', async () => {
  await renderPartners('A');
  await act(async () => pending[0]({data:null,error:new Error('unavailable')}));
  assert.match(document.querySelector('[role="alert"]').textContent,/Could not load partners/);
  assert.doesNotMatch(document.body.textContent,/No partners yet/);
  await act(async () => document.querySelector('button').click());
  assert.match(document.body.textContent,/Loading partners/);
  await resolve(1,[]);
  assert.equal(document.querySelector('[role="alert"]'),null);
  assert.match(document.body.textContent,/No partners yet/);
});
