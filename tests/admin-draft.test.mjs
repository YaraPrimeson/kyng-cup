import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Render the real admin page and creation form; only the server and language context are mocked.
const dom = new JSDOM('<div id="root"></div>', { url: 'https://kyngcup.test/admin/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const existing = {
  id: 'existing', slug: 'existing-cup', name: 'Existing Cup', sport: 'padel',
  location: 'Vienna', starts_at: '2027-06-12T10:00:00Z', ends_at: '2027-06-12T10:00:00Z',
  bracket_size: 4, format: 'knockout', participant_count: 4, playoff_participant_count: 4,
  status: 'draft', registration_status: 'open', updated_at: '2027-01-01T00:00:00Z',
};
let listener;
let root;
let AdminPage;
let tempDir;
let user;
let calls;
let createError;
let tournamentChange;
let records;
const supabase = {
  auth: {
    getUser: async () => ({ data: { user } }),
    onAuthStateChange(callback) {
      listener = callback;
      const timer = setTimeout(() => callback('INITIAL_SESSION', user ? { user } : null), 0);
      return { data: { subscription: { unsubscribe() { clearTimeout(timer); listener = undefined; } } } };
    },
    signOut: async () => { user = null; listener('SIGNED_OUT', null); },
  },
  rpc: async (name, payload) => {
    calls.push({ name, payload });
    return name === 'is_global_admin'
      ? { data: true, error: null }
      : name === 'list_tournament_registrations'
        ? { data: records.tournament_registrations ?? [], error: null }
        : name === 'issue_registration_claim_code'
          ? { data: 'a'.repeat(64), error: null }
          : { data: createError ? null : existing.id, error: createError };
  },
  from(table) {
    const result = { data: records[table] ?? [], error: null };
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      order() { return query; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
      update(value) { calls.push({ name: `update:${table}`, payload: value }); return query; },
      single: async () => ({ data: { id: 'match-one' }, error: null }),
    };
    return query;
  },
  channel() {
    const channel = {
      on(_type, filter, callback) { if (filter.table === 'tournaments') tournamentChange = callback; return channel; },
      subscribe() { return channel; },
    };
    return channel;
  },
  removeChannel: async () => {},
};

before(async () => {
  globalThis.__adminDraftTestSupabase = supabase;
  const repo = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(`${repo}tmp`, { recursive: true });
  tempDir = await mkdtemp(`${repo}tmp/admin-draft-test-`);
  const output = await build({
    entryPoints: [`${repo}app/admin/page.tsx`], bundle: true, write: false,
    format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'admin-server-mock', setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'server', namespace: 'test' }));
      plugin.onResolve({ filter: /^\.\.\/i18n$/ }, () => ({ path: 'language', namespace: 'test' }));
      plugin.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'server'
        ? 'export const supabase = globalThis.__adminDraftTestSupabase;'
        : 'export const useLanguage = () => ({ language: "en" });' }));
    } }],
  });
  const entry = `${tempDir}/admin.mjs`;
  await writeFile(entry, output.outputFiles[0].contents);
  ({ default: AdminPage } = await import(pathToFileURL(entry).href));
});

async function settle() {
  // Auth callbacks intentionally schedule work outside the auth lock.
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}
async function mount() {
  root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(createElement(AdminPage)); });
  await settle();
}
async function unmount() {
  if (root) { await act(async () => { root.unmount(); }); root = undefined; }
}
beforeEach(async () => {
  await unmount();
  window.sessionStorage.clear();
  user = { id: 'organizer-one' };
  calls = []; createError = null; tournamentChange = undefined;
  records = { tournaments: [{ ...existing }] };
});
after(async () => {
  await unmount(); dom.window.close(); delete globalThis.__adminDraftTestSupabase;
  await rm(tempDir, { recursive: true, force: true });
});

test('organiser creates a single-use claim code for the registered contact without changing the application', async () => {
  records.tournament_registrations = [{
    id: 'legacy-one', tournament_id: existing.id, status: 'confirmed', pair_name: 'QA Pair',
    player_one_first_name: 'First', player_one_last_name: 'Player', player_one_email: 'first@example.invalid', player_one_phone: '+43000000000', player_one_level: 'beginner',
    player_two_first_name: 'Second', player_two_last_name: 'Player', player_two_email: 'second@example.invalid', player_two_phone: '+43000000001', player_two_level: 'beginner',
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', locale: 'en', marketing_opt_in: false,
    submitted_by: null, partner_user_id: null,
  }];
  await mount();
  assert.ok(calls.some(call => call.name === 'list_tournament_registrations' && call.payload.p_tournament_id === existing.id), 'Admin list uses protected RPC');
  await click(button('Create player 1 code'));
  assert.ok(calls.some(call => call.name === 'issue_registration_claim_code' && call.payload.p_registration_id === 'legacy-one' && call.payload.p_player_role === 'primary'));
  assert.match(document.body.textContent, /a{64}/);
});

test('partner without a contact email cannot receive a claim code', async () => {
  records.tournament_registrations = [{
    id: 'guest-no-email', tournament_id: existing.id, status: 'new', pair_name: 'Guest pair',
    player_one_first_name: 'First', player_one_last_name: 'Player', player_one_email: 'first@example.invalid', player_one_phone: '+430000000000', player_one_level: 'beginner',
    player_two_first_name: 'Second', player_two_last_name: 'Player', player_two_email: null, player_two_phone: null, player_two_level: 'beginner',
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', locale: 'en', marketing_opt_in: false,
    submitted_by: null, partner_user_id: null,
  }];
  await mount();
  assert.doesNotMatch(document.body.textContent, /mailto:null|tel:null/);
  assert.ok(![...document.querySelectorAll('button')].some(node => node.textContent.includes('Create player 2 code')));
  assert.match(document.body.textContent, /no contact email/);
});

function button(text) {
  const element = [...document.querySelectorAll('button')].find(node => node.textContent.includes(text));
  assert.ok(element, `Button missing: ${text}`); return element;
}
function field(label) {
  const element = [...document.querySelectorAll('label')].find(node => node.querySelector('span')?.textContent === label)?.querySelector('input,textarea,select');
  assert.ok(element, `Field missing: ${label}`); return element;
}
async function click(element) { await act(async () => { element.click(); }); await settle(); }
async function enter(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function fillDraft() {
  await click(button('+ New tournament'));
  await enter(field('Название'), 'My unfinished Cup');
  await enter(field('Дата'), '2027-06-12');
  await enter(field('Локация'), 'Copied venue');
  await enter(field('Вид спорта'), 'tennis');
  await enter(field('Количество пар'), '14');
  await enter(field('Количество групп'), '3');
  await enter(field('Дата завершения · необязательно'), '2027-06-14');
  await enter(field('Адрес турнира'), 'custom-unfinished-cup');
  await enter(field('Видимость'), 'published');
  await enter(field('Список пар'), 'Alex / Dan\nEva / Mia');
  await enter(document.querySelector('[aria-label="Пара 1: первый игрок"]'), 'Unsaved player');
  await enter(document.querySelector('[aria-label="Группа пары 1"]'), 'B');
  await enter(field('Выходят в плей-офф'), '1');
}
function assertDraft() {
  assert.equal(field('Название').value, 'My unfinished Cup');
  assert.equal(field('Дата').value, '2027-06-12');
  assert.equal(field('Локация').value, 'Copied venue');
  assert.equal(field('Вид спорта').value, 'tennis');
  assert.equal(field('Количество пар').value, '14');
  assert.equal(field('Количество групп').value, '3');
  assert.equal(field('Дата завершения · необязательно').value, '2027-06-14');
  assert.equal(field('Адрес турнира').value, 'custom-unfinished-cup');
  assert.equal(field('Видимость').value, 'published');
  assert.equal(field('Список пар').value, 'Alex / Dan\nEva / Mia');
  assert.equal(document.querySelector('[aria-label="Пара 1: первый игрок"]').value, 'Unsaved player');
  assert.equal(document.querySelector('[aria-label="Группа пары 1"]').value, 'B');
  assert.equal(field('Выходят в плей-офф').value, '1');
}

test('switching tabs and repeated SIGNED_IN/TOKEN_REFRESHED preserve the same form and typed text', async () => {
  await mount(); await fillDraft();
  const form = document.querySelector('.quick-tournament');
  for (const event of ['SIGNED_IN', 'TOKEN_REFRESHED', 'SIGNED_IN']) {
    await act(async () => {
      window.dispatchEvent(new window.Event('blur'));
      document.dispatchEvent(new window.Event('visibilitychange'));
      window.dispatchEvent(new window.Event('focus'));
      listener(event, { user: { ...user } });
    });
    await settle();
    assert.equal(document.querySelector('.quick-tournament'), form, 'Auth refresh unmounted the form');
    assertDraft();
  }
  assert.equal(calls.filter(call => call.name === 'is_global_admin').length, 1, 'Same-account auth refresh should not reload the dashboard');
});

test('page reload restores the open creation form and every unsaved field', async () => {
  await mount(); await fillDraft(); await unmount(); await mount(); assertDraft();
  await enter(field('Название'), 'Renamed Cup');
  assert.equal(field('Адрес турнира').value, 'custom-unfinished-cup', 'A restored custom address must remain custom');
});

test('closing and reopening creation keeps the draft; another account cannot see it', async () => {
  await mount(); await fillDraft(); await click(button('Закрыть'));
  await click(button('+ New tournament')); assertDraft();
  await act(async () => { user = { id: 'organizer-two' }; listener('SIGNED_IN', { user }); });
  await settle(); await click(button('+ New tournament'));
  assert.equal(field('Название').value, '');
  assert.equal(field('Список пар').value, '');
});

test('background tournament updates do not select an old tournament over a new draft', async () => {
  await mount();
  const notify = tournamentChange;
  assert.ok(notify);
  await fillDraft();
  await act(async () => { notify(); }); await settle(); assertDraft();
});

test('failed creation keeps the draft, successful creation clears it', async () => {
  await mount(); await fillDraft();
  await enter(document.querySelector('[aria-label="Пара 1: второй игрок"]'), 'Dan');
  createError = { message: 'Temporary save error' };
  await act(async () => { document.querySelector('.quick-tournament').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
  assert.match(document.querySelector('.quick-tournament').textContent, /Temporary save error/);
  await unmount(); await mount(); assertDraft();
  createError = null;
  await act(async () => { document.querySelector('.quick-tournament').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
  assert.equal(calls.filter(call => call.name === 'create_tournament_setup').length, 2);
  await click(button('+ New tournament'));
  assert.equal(field('Название').value, '');
  assert.equal(field('Список пар').value, '');
});

test('sign-out still protects the admin page and signing back in restores the same account draft', async () => {
  await mount(); await fillDraft();
  await click(button('Sign out'));
  assert.equal(document.querySelector('.quick-tournament'), null);
  assert.match(document.body.textContent, /Sign in/);
  await act(async () => { user = { id: 'organizer-one' }; listener('SIGNED_IN', { user }); });
  await settle(); assertDraft();
});

test('corrupt or unsupported stored drafts fall back to a usable empty form', async () => {
  for (const raw of ['not json', 'null', '{"version":2,"draft":{}}', '{"version":1,"draft":{"pairs":null}}']) {
    window.sessionStorage.setItem('kyng-tournament-draft:v1:organizer-one', raw);
    await mount(); await click(button('+ New tournament'));
    assert.equal(field('Название').value, '');
    await unmount();
  }
});

test('disabled browser storage does not break editing or tab switching', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
  t.after(() => Object.defineProperty(window, 'sessionStorage', descriptor));
  await mount(); await fillDraft();
  await act(async () => { listener('SIGNED_IN', { user }); });
  await settle(); assertDraft();
});

function pairFixtures() {
  records.pairs = Array.from({ length: 4 }, (_,i) => ({ id: `p${i+1}`, name: ['Top pair','Bottom pair','Other three','Other four'][i], player_one: `A${i}`, player_two: `B${i}`, seed: i+1, updated_at: 'initial' }));
}
function gameFixture(id, overrides = {}) {
  return { id, round: 1, position: 1, bracket_kind: 'playoffs', pair_one_id: 'p1', pair_two_id: 'p2', pair_one_sets: [], pair_two_sets: [], winner_id: null, status: 'scheduled', court: null, scheduled_at: null, updated_at: 'initial', ...overrides };
}
async function submit(form) {
  await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
}
for (const kind of ['playoffs', 'groups']) {
  test(`${kind}: a score/winner mismatch is red, names the score winner and never calls the save RPC`, async () => {
    pairFixtures();
    const rpc = kind === 'groups' ? 'record_group_match_result' : 'record_match_result';
    if (kind === 'groups') {
      records.tournaments[0].format = 'group_knockout';
      records.tournament_groups = [{ id:'group-a',code:'A',qualify_count:2 }];
      records.group_members = records.pairs.map((pair,i) => ({group_id:'group-a',pair_id:pair.id,position:i+1}));
      records.group_matches = [gameFixture('group-game',{tournament_id:'existing',group_id:'group-a'})];
    } else records.matches = [gameFixture('main-game')];
    await mount();
    const form = document.querySelector('.admin-match');
    await enter(form.querySelector('[aria-label="Set scores"]'),'1-0');
    await click(form.querySelector('[aria-label="Select Bottom pair as winner"] input'));
    await submit(form);
    assert.equal(calls.filter(call=>call.name===rpc).length,0);
    assert.match(form.querySelector('[role="alert"]').textContent,/Top pair/);
    assert.equal(form.querySelector('[aria-label="Set scores"]').getAttribute('aria-invalid'),'true');
    assert.ok(form.classList.contains('has-result-error'));
    await click(form.querySelector('[aria-label="Select Top pair as winner"] input'));
    await submit(form);
    assert.equal(calls.filter(call=>call.name===rpc).length,1);
    assert.equal(form.querySelector('[role="alert"]'),null);
  });
}

test('consolation games expose the same score saving controls as playoff games', async () => {
  pairFixtures(); records.tournaments[0].format='group_knockout';
  records.matches=[gameFixture('basement-game',{bracket_kind:'basement'})];
  await mount();
  const section=[...document.querySelectorAll('.admin-collapsible')].find(node=>node.querySelector('h2')?.textContent==='Король подвала');
  assert.ok(section);
  const form=section.querySelector('.admin-match');
  await enter(form.querySelector('[aria-label="Set scores"]'),'0-1');
  await click(form.querySelector('[aria-label="Select Bottom pair as winner"] input'));
  await submit(form);
  const saved=calls.find(call=>call.name==='record_match_result');
  assert.equal(saved.payload.p_match_id,'basement-game');
  assert.equal(saved.payload.p_winner_id,'p2');
});

test('nine-pair draw shows one preliminary match; drag/drop swaps actual slots and saves the order', async () => {
  records.tournaments[0].format='group_knockout';
  records.tournaments[0].participant_count=9; records.tournaments[0].playoff_participant_count=9;
  records.pairs=Array.from({length:9},(_,i)=>({id:`p${i+1}`,name:`Pair ${i+1}`,player_one:`A${i}`,player_two:`B${i}`,seed:i+1,updated_at:'initial'}));
  records.tournament_groups=[{id:'group-a',code:'A',qualify_count:9}];
  records.group_members=records.pairs.map((pair,i)=>({group_id:'group-a',pair_id:pair.id,position:i+1}));
  records.group_matches=[gameFixture('finished-group',{group_id:'group-a',tournament_id:'existing',status:'completed',pair_one_sets:[1],pair_two_sets:[0],winner_id:'p1'})];
  await mount();
  const preview=document.querySelector('[aria-label="Playoff draw preview"]');
  assert.ok(preview);
  assert.equal(preview.querySelectorAll('.draw-preview-match').length,8);
  assert.equal([...preview.querySelectorAll('.knockout-round h4')].filter(node=>node.textContent==='Preliminary').length,1);
  const sources=[...preview.querySelectorAll('[draggable="true"]')];
  assert.equal(sources.length,9);
  const from=sources[0],to=sources[1];
  const targetText=to.textContent;
  const fromId=from.parentElement.querySelector('select').value;
  const toId=to.parentElement.querySelector('select').value;
  const drag=new window.Event('dragstart',{bubbles:true});
  Object.defineProperty(drag,'dataTransfer',{value:{setData(){}}});
  await act(async()=>{from.dispatchEvent(drag);});
  await act(async()=>{to.dispatchEvent(new window.Event('drop',{bubbles:true,cancelable:true}));});
  assert.equal(preview.querySelectorAll('[draggable="true"]')[0].textContent,targetText);
  const confirm=button('Confirm 9/9');
  window.confirm=()=>true;
  await click(confirm);
  const saved=calls.find(call=>call.name==='confirm_group_qualifiers');
  assert.equal(saved.payload.p_pair_ids.length,9);
  assert.equal(new Set(saved.payload.p_pair_ids).size,9);
  assert.equal(saved.payload.p_pair_ids[7],toId);
  assert.equal(saved.payload.p_pair_ids[8],fromId);
});
