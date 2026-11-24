import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

// Render the real admin page, forms and language provider; only Supabase is mocked.
const dom = new JSDOM('<div id="root"></div>', { url: 'https://kyngcup.test/admin/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
dom.window.HTMLDialogElement.prototype.showModal ??= function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open'); };
for (const key of ['Node', 'NodeFilter', 'Element', 'MutationObserver']) globalThis[key] = dom.window[key];
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
let LanguageProvider;
let pairLinks;
let pairLinkRpc;
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
    if (name === 'get_registration_pair_links') return pairLinkRpc?.(name, payload) ?? { data: pairLinks, error: null };
    if (name === 'link_registration_pair') {
      if (pairLinkRpc) return pairLinkRpc(name, payload);
      pairLinks = pairLinks.filter(link => link.registration_id !== payload.p_registration_id);
      if (payload.p_pair_id) pairLinks.push({ registration_id: payload.p_registration_id, pair_id: payload.p_pair_id });
      return { data: null, error: null };
    }
    return name === 'is_global_admin'
      ? { data: true, error: null }
      : name === 'list_tournament_registrations'
        ? { data: records.tournament_registrations ?? [], error: null }
        : name === 'issue_registration_claim_code'
          ? { data: 'a'.repeat(64), error: null }
          : { data: createError ? null : existing.id, error: createError };
  },
  functions: { invoke: async () => ({ data: { urls: {} }, error: null }) },
  from(table) {
    const result = { data: records[table] ?? [], error: null };
    let tournamentId;
    const query = {
      select() { return query; },
      eq(column, value) { if (column === 'tournament_id') tournamentId = value; return query; },
      in() { return query; },
      async maybeSingle() {
        return { data: result.data.find(row => row.tournament_id === tournamentId) ?? null, error: null };
      },
      async range(from, to) {
        return { data: result.data.filter(row => row.tournament_id === tournamentId).slice(from, to + 1), error: null };
      },
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
    stdin: { contents: 'export { default } from "./app/admin/page"; export { LanguageProvider } from "./app/i18n";', resolveDir: repo }, bundle: true, write: false,
    format: 'esm', platform: 'node', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'admin-server-mock', setup(plugin) {
      plugin.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'server', namespace: 'test' }));
      plugin.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const supabase = globalThis.__adminDraftTestSupabase;' }));
    } }],
  });
  const entry = `${tempDir}/admin.mjs`;
  await writeFile(entry, output.outputFiles[0].contents);
  ({ default: AdminPage, LanguageProvider } = await import(pathToFileURL(entry).href));
});

async function settle() {
  // Auth callbacks intentionally schedule work outside the auth lock.
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}
async function mount() {
  root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(createElement(LanguageProvider, null, createElement(AdminPage))); });
  await settle();
}
async function unmount() {
  if (root) { await act(async () => { root.unmount(); }); root = undefined; }
}
beforeEach(async () => {
  await unmount();
  window.sessionStorage.clear();
  window.localStorage.clear();
  user = { id: 'organizer-one' };
  calls = []; createError = null; tournamentChange = undefined; pairLinks = []; pairLinkRpc = undefined;
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
  await openRegistration('legacy-one', 'Player accounts');
  assert.ok(calls.some(call => call.name === 'list_tournament_registrations' && call.payload.p_tournament_id === existing.id), 'Admin list uses protected RPC');
  await click(button('Create player 1 code'));
  assert.ok(calls.some(call => call.name === 'issue_registration_claim_code' && call.payload.p_registration_id === 'legacy-one' && call.payload.p_player_role === 'primary'));
  assert.match(document.body.textContent, /a{64}/);
});

test('shared tournament picker works across all tabs and allows publishing covered albums in every status', async () => {
  const completed = { ...existing, id: 'past', name: 'Past Cup', status: 'completed' };
  records.tournaments.push(completed);
  records.tournament_galleries = [
    { tournament_id: existing.id, cover_photo_id: 'one', published_at: null },
    { tournament_id: completed.id, cover_photo_id: 'two', published_at: null },
  ];
  records.tournament_gallery_photos = [
    { tournament_id: existing.id, id: 'one', sort_order: 0, state: 'visible' },
    { tournament_id: completed.id, id: 'two', sort_order: 0, state: 'visible' },
    { tournament_id: completed.id, id: 'three', sort_order: 1, state: 'visible' },
  ];
  await mount();
  assert.equal(document.querySelector('.admin-workspace-tabs'), null, 'Choose a tournament before tabs are available');
  await selectCup();
  await click(button('Photo album'));
  const gallery = () => document.querySelector('.admin-gallery');
  assert.equal(document.querySelector(".admin-selection .admin-status").textContent, "Draft");
  assert.match(gallery().textContent, /1 visible/);
  assert.equal(button('Publish album').disabled, false);
  await click(button('Publish album'));
  assert.equal(calls.some(call => call.name === 'update:tournament_galleries'), false);
  await click(document.querySelector('dialog button[type=submit]'));
  assert.ok(calls.some(call => call.name === 'update:tournament_galleries' && call.payload.published_at));
  await click(button('Live matches'));
  assert.equal(document.querySelector('#admin-panel-photos').hidden, true);
  assert.match(document.querySelector('.admin-selection').textContent, /Existing Cup/);
  await click(button('Change tournament'));
  await selectCup('Past Cup');
  await click(button('Photo album'));
  assert.equal(document.querySelector("#admin-panel-photos").hidden, false);
  assert.match(document.querySelector('.admin-selection').textContent, /Past Cup/);
  assert.equal(document.querySelector(".admin-selection .admin-status").textContent, "Completed");
  assert.match(gallery().textContent, /2 visible/);
  assert.equal(button('Publish album').disabled, false);
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
  await openRegistration('guest-no-email', 'Player accounts');
  assert.doesNotMatch(document.body.textContent, /mailto:null|tel:null/);
  assert.ok(![...document.querySelectorAll('button')].some(node => node.textContent.includes('Create player 2 code')));
  assert.match(document.body.textContent, /no contact email/);
});

function button(text, root = document) {
  const nodes = [...root.querySelectorAll('button')].filter(node => !node.closest('[hidden]'));
  const element = nodes.find(node => node.textContent.trim() === text)
    ?? nodes.find(node => node.textContent.includes(text));
  assert.ok(element, `Button missing: ${text}`); return element;
}
function field(label) {
  const element = [...document.querySelectorAll('label')].find(node => !node.closest('[hidden]') && node.querySelector('span')?.textContent === label)?.querySelector('input,textarea,select');
  assert.ok(element, `Field missing: ${label}`); return element;
}
async function click(element) { await act(async () => { element.click(); }); await settle(); }
async function enter(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function selectCup(name = existing.name) { await click(button(name, document.querySelector('.admin-picker-table'))); }
async function openRegistration(id, view = 'Pair link') {
  await selectCup();
  await click(button('Registrations'));
  const target = id ? document.querySelector(`[data-open-registration="${id}"]`) : document.querySelector('[data-open-registration]');
  await click(target);
  await click(button(view, document.querySelector('.admin-registration-card:not([hidden] *)')));
}
async function fillDraft() {
  await click(button('New tournament'));
  await enter(field('Tournament name'), 'My unfinished Cup');
  await enter(field('Start date'), '2027-06-12');
  assert.equal(field('End date').value, '2027-06-12', 'Single-day tournament defaults to the start date');
  await enter(field('End date'), '2027-06-14');
  await enter(field('Start date'), '2027-06-11');
  assert.equal(field('End date').value, '2027-06-14', 'Manual end date survives edits to the start date');
  await enter(field('Start date'), '2027-06-12');
  await enter(field('Location'), 'Copied venue');
  await enter(field('Sport'), 'padel');
  await enter(field('Tournament address'), 'custom-unfinished-cup');
  await click(button('Continue to pairs'));
  await enter(field('Number of pairs'), '14');
  await enter(field('Pair list'), 'Alex / Dan\nEva / Mia');
  await enter(document.querySelector('[aria-label="Player one · 1"]'), 'Unsaved player');
  await click(button('Continue to format'));
  await enter(field('Number of groups'), '3');
  await enter(document.querySelector('[aria-label="Group · Pair 1"]'), 'B');
  await enter(field('Qualifiers'), '1');
  await click(button('Review tournament'));
  await enter(field('Visibility'), 'published');
}
async function backToDetails() {
  for (let i = 0; i < 3; i++) await click(button('Back', document.querySelector('.quick-tournament')));
}
function assertDraft() {
  assert.equal(field('Visibility').value, 'published');
  const review = document.querySelector('.admin-create-review');
  for (const text of ['My unfinished Cup', 'Copied venue', '2027-06-12', '2027-06-14', '14', '3']) assert.ok(review.textContent.includes(text));
  try {
    const draft = JSON.parse(window.sessionStorage.getItem('kyng-tournament-draft:v1:organizer-one')).draft;
    assert.equal(draft.slug, 'custom-unfinished-cup');
    assert.equal(draft.list, 'Alex / Dan\nEva / Mia');
    assert.equal(draft.pairs[0].player_one, 'Unsaved player');
    assert.equal(draft.pairs[0].group, 'B');
    assert.equal(draft.qualifiers.A, 1);
  } catch (error) {
    if (error.message !== 'Storage blocked') throw error;
  }
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
  await backToDetails();
  await enter(field('Tournament name'), 'Renamed Cup');
  assert.equal(field('Tournament address').value, 'custom-unfinished-cup', 'A restored custom address must remain custom');
});

test('closing and reopening creation keeps the draft; another account cannot see it', async () => {
  await mount(); await fillDraft(); await backToDetails(); await click(button('Close'));
  await click(button('New tournament'));
  assert.equal(field('Tournament name').value, 'My unfinished Cup');
  await act(async () => { user = { id: 'organizer-two' }; listener('SIGNED_IN', { user }); });
  await settle(); await click(button('New tournament'));
  assert.equal(field('Tournament name').value, '');
  await enter(field('Tournament name'), 'Clean');
  await enter(field('Start date'), '2027-06-12');
  await click(button('Continue to pairs'));
  assert.equal(field('Pair list').value, '');
});

test('background tournament updates do not select an old tournament over a new draft', async () => {
  await mount();
  await selectCup();
  const notify = tournamentChange;
  assert.ok(notify);
  await click(button('Change tournament'));
  await fillDraft();
  await act(async () => { notify(); }); await settle(); assertDraft();
});

test('failed creation keeps the draft, successful creation clears it', async () => {
  await mount(); await fillDraft();
  await click(button('Back', document.querySelector('.quick-tournament')));
  await click(button('Back', document.querySelector('.quick-tournament')));
  await enter(document.querySelector('[aria-label="Player two · 1"]'), 'Dan');
  await click(button('Continue to format'));
  await click(button('Review tournament'));
  createError = { message: 'Temporary save error' };
  await act(async () => { document.querySelector('.quick-tournament').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
  assert.match(document.querySelector('.quick-tournament').textContent, /Temporary save error/);
  await unmount(); await mount(); assertDraft();
  createError = null;
  await act(async () => { document.querySelector('.quick-tournament').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
  assert.equal(calls.filter(call => call.name === 'create_tournament_setup').length, 2);
  await click(button('Change tournament'));
  await click(button('New tournament'));
  assert.equal(field('Tournament name').value, '');
  await enter(field('Tournament name'), 'Clean');
  await enter(field('Start date'), '2027-06-12');
  await click(button('Continue to pairs'));
  assert.equal(field('Pair list').value, '');
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
    await mount(); await click(button('New tournament'));
    assert.equal(field('Tournament name').value, '');
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

function registrationFixture(id = 'registration-one', status = 'confirmed') {
  return { id, tournament_id: existing.id, status, pair_name: 'Top pair',
    player_one_first_name: 'First', player_one_last_name: 'Player', player_one_email: 'first@example.invalid', player_one_level: 'beginner',
    player_two_first_name: 'Second', player_two_last_name: 'Player', player_two_email: null, player_two_level: 'beginner',
    created_at: '2026-10-01T00:00:00Z', updated_at: 'initial', locale: 'en', marketing_opt_in: false };
}
function linkPanel(id = 'registration-one') {
  const panel = document.querySelector(`[data-registration-pair-link="${id}"]`);
  assert.ok(panel, 'Tournament pair link controls missing'); return panel;
}
test('confirmed application requires explicit pair selection and linking, then unlink before replacement', async () => {
  pairFixtures(); records.tournament_registrations = [registrationFixture()];
  await mount(); await openRegistration();
  const panel = linkPanel();
  assert.ok(calls.some(call => call.name === 'get_registration_pair_links' && call.payload.p_tournament_id === existing.id));
  assert.equal(panel.querySelector('select').value, '', 'No name-based auto-selection');
  assert.ok(panel.querySelector('button').disabled);
  await enter(panel.querySelector('select'), 'p2');
  assert.equal(calls.filter(call => call.name === 'link_registration_pair').length, 0);
  await click(panel.querySelector('button'));
  assert.deepEqual(calls.find(call => call.name === 'link_registration_pair').payload, { p_registration_id: 'registration-one', p_pair_id: 'p2' });
  assert.match(panel.textContent, /Linked tournament pair: Bottom pair/);
  assert.equal(panel.querySelector('select'), null, 'Must unlink before replacement');
  await click(panel.querySelector('button'));
  assert.deepEqual(calls.filter(call => call.name === 'link_registration_pair').at(-1).payload, { p_registration_id: 'registration-one', p_pair_id: null });
  assert.equal(panel.querySelector('select').value, '');
});

test('only confirmed applications can link and occupied or foreign pairs cannot be chosen', async () => {
  pairFixtures(); records.pairs.push({ ...records.pairs[0], id: 'foreign', tournament_id: 'other-cup' });
  records.tournament_registrations = [registrationFixture(), registrationFixture('pending', 'reviewing')];
  pairLinks = [{ registration_id: 'hidden-application', pair_id: 'p1' }];
  await mount(); await openRegistration();
  const panel = linkPanel();
  assert.ok(!panel.querySelector('option[value="foreign"]'));
  assert.ok(panel.querySelector('option[value="p1"]').disabled, 'Pair linked to another application must be blocked');
  const pending = linkPanel('pending');
  assert.match(pending.textContent, /Only confirmed applications/);
  assert.equal(pending.querySelector('select'), null);
  assert.equal(pending.querySelector('button'), null);
});

test('Refresh applications reloads pair links and available choices without discarding unsaved notes', async () => {
  pairFixtures(); records.tournament_registrations = [registrationFixture(), registrationFixture('second')];
  pairLinks = [{ registration_id: 'registration-one', pair_id: 'p1' }];
  await mount(); await openRegistration();
  assert.match(linkPanel().textContent, /Linked tournament pair: Top pair/);
  assert.ok(linkPanel('second').querySelector('option[value="p1"]').disabled);
  assert.equal(linkPanel('second').querySelector('option[value="p2"]').disabled, false);
  const card = linkPanel().closest('form');
  const notes = card.querySelector('textarea');
  await enter(notes, 'Keep this unsaved note');
  const reads = calls.filter(call => call.name === 'get_registration_pair_links').length;
  const applicationReads = calls.filter(call => call.name === 'list_tournament_registrations').length;
  pairLinks = [{ registration_id: 'registration-one', pair_id: 'p2' }];
  await click(button('Refresh applications'));
  assert.ok(calls.filter(call => call.name === 'list_tournament_registrations').length > applicationReads);
  assert.ok(calls.filter(call => call.name === 'get_registration_pair_links').length > reads, 'Refresh must reload pair links');
  assert.match(linkPanel().textContent, /Linked tournament pair: Bottom pair/);
  assert.equal(linkPanel('second').querySelector('option[value="p1"]').disabled, false);
  assert.ok(linkPanel('second').querySelector('option[value="p2"]').disabled);
  assert.equal(linkPanel().closest('form'), card, 'Refresh must not remount unchanged applications');
  assert.equal(notes.value, 'Keep this unsaved note');
});

test('pair links fail closed while loading and after load errors, with an explicit retry', async () => {
  pairFixtures(); records.tournament_registrations = [registrationFixture()];
  let resolveLoad;
  pairLinkRpc = () => new Promise(resolve => { resolveLoad = resolve; });
  await mount(); await openRegistration();
  const panel = linkPanel();
  assert.match(panel.textContent, /Loading pair links/);
  assert.equal(panel.querySelector('select'), null);
  await act(async () => { resolveLoad({ data: null, error: { message: 'Denied' } }); });
  assert.match(panel.querySelector('[role="alert"]').textContent, /Could not load pair links/);
  assert.equal(panel.querySelector('select'), null);
  pairLinkRpc = undefined;
  await click(button('Retry pair links'));
  assert.ok(panel.querySelector('select'));
  assert.equal(panel.querySelector('[role="alert"]'), null);
});

for (const unlink of [false, true]) {
  for (const thrown of [false, true]) {
    test(`${unlink ? 'unlink' : 'link'} RPC ${thrown ? 'rejection' : 'error'} shows no false success and preserves the prior link`, async () => {
      pairFixtures(); records.tournament_registrations = [registrationFixture()];
      if (unlink) pairLinks = [{ registration_id: 'registration-one', pair_id: 'p2' }];
      await mount(); await openRegistration();
      const panel = linkPanel();
      if (!unlink) await enter(panel.querySelector('select'), 'p2');
      pairLinkRpc = (name) => {
        if (name === 'get_registration_pair_links') return { data: pairLinks, error: null };
        if (thrown) throw new Error('Network offline');
        return { data: null, error: { message: 'Write denied' } };
      };
      await click(panel.querySelector('button'));
      assert.match(panel.querySelector('[role="alert"]')?.textContent ?? '', /Could not (link|unlink) pair/);
      assert.doesNotMatch(panel.textContent, /Pair linked successfully|Pair unlinked successfully/);
      assert.equal(Boolean(panel.querySelector('select')), !unlink);
    });
  }
}

test('pair linking blocks duplicate submissions until the server read-back completes', async () => {
  pairFixtures(); records.tournament_registrations = [registrationFixture(), registrationFixture('second')];
  await mount(); await openRegistration(); const panel = linkPanel();
  await enter(panel.querySelector('select'), 'p2');
  let resolveWrite;
  pairLinkRpc = name => name === 'get_registration_pair_links' ? { data: pairLinks, error: null } : new Promise(resolve => { resolveWrite = resolve; });
  const action = panel.querySelector('button');
  await act(async () => { action.click(); action.click(); });
  assert.equal(calls.filter(call => call.name === 'link_registration_pair').length, 1);
  assert.ok(action.disabled);
  assert.ok(linkPanel('second').querySelector('select').disabled);
  pairLinks = [{ registration_id: 'registration-one', pair_id: 'p2' }];
  await act(async () => { resolveWrite({ data: null, error: null }); }); await settle();
  assert.match(linkPanel().textContent, /Linked tournament pair: Bottom pair/);
  assert.ok(linkPanel('second').querySelector('option[value="p2"]').disabled);
});

test('Refresh applications preserves busy protection through pending write and deferred read-back', async () => {
  pairFixtures(); records.tournament_registrations = [registrationFixture(), registrationFixture('second')];
  await mount(); await openRegistration();
  await enter(linkPanel().querySelector('select'), 'p2');
  await enter(linkPanel('second').querySelector('select'), 'p3');
  let resolveWrite;
  let resolveReadBack;
  let deferReadBack = true;
  pairLinkRpc = name => name === 'link_registration_pair'
    ? new Promise(resolve => { resolveWrite = resolve; })
    : deferReadBack ? new Promise(resolve => { resolveReadBack = resolve; }) : { data: pairLinks, error: null };
  const reads = calls.filter(call => call.name === 'get_registration_pair_links').length;
  await act(async () => { linkPanel().querySelector('button').click(); linkPanel().querySelector('button').click(); });
  records.tournament_registrations = records.tournament_registrations.map(record => ({ ...record, updated_at: 'refreshed' }));
  await click(button('Refresh applications'));
  assert.equal(calls.filter(call => call.name === 'get_registration_pair_links').length, reads, 'Refresh must wait for the pending write');
  assert.ok(linkPanel().querySelector('button').disabled);
  assert.ok(linkPanel('second').querySelector('select').disabled);
  await click(linkPanel('second').querySelector('button'));
  assert.equal(calls.filter(call => call.name === 'link_registration_pair').length, 1);
  pairLinks = [{ registration_id: 'registration-one', pair_id: 'p2' }];
  await act(async () => { resolveWrite({ data: null, error: null }); });
  assert.equal(typeof resolveReadBack, 'function', 'Write must await server read-back');
  await click(button('Refresh applications'));
  assert.equal(calls.filter(call => call.name === 'get_registration_pair_links').length, reads + 1, 'Refresh must not supersede the active read-back');
  assert.ok(linkPanel().querySelector('button').disabled);
  assert.match(linkPanel().textContent, /Saving pair link/);
  await click(linkPanel().querySelector('button'));
  assert.equal(calls.filter(call => call.name === 'link_registration_pair').length, 1);
  deferReadBack = false;
  await act(async () => { resolveReadBack({ data: pairLinks, error: null }); });
  await settle();
  assert.equal(calls.filter(call => call.name === 'get_registration_pair_links').length, reads + 2, 'Deferred refresh should run after verification');
  assert.match(linkPanel().textContent, /Linked tournament pair: Bottom pair/);
  assert.equal(linkPanel().querySelector('button').disabled, false, 'Busy must clear after verification and refresh');
  assert.equal(linkPanel('second').querySelector('select').disabled, false);
  assert.ok(linkPanel('second').querySelector('option[value="p2"]').disabled);
});

for (const verification of ['error', 'mismatch']) {
  test(`pair link ${verification} on read-back never reports success and requires retry`, async () => {
    pairFixtures(); records.tournament_registrations = [registrationFixture()];
    await mount(); await openRegistration(); const panel = linkPanel(); await enter(panel.querySelector('select'), 'p2');
    pairLinkRpc = name => name === 'link_registration_pair' ? { data: null, error: null }
      : verification === 'error' ? { data: null, error: { message: 'Offline' } } : { data: [], error: null };
    await click(panel.querySelector('button'));
    assert.match(linkPanel().textContent, /Could not verify pair link/);
    assert.doesNotMatch(linkPanel().textContent, /Pair linked successfully/);
    assert.ok(button('Retry pair links'));
  });
}

function pairFixtures() {
  records.pairs = Array.from({ length: 4 }, (_,i) => ({ id: `p${i+1}`, name: ['Top pair','Bottom pair','Other three','Other four'][i], player_one: `A${i}`, player_two: `B${i}`, seed: i+1, updated_at: 'initial', tournament_id: existing.id }));
}
function gameFixture(id, overrides = {}) {
  return { id, round: 1, position: 1, bracket_kind: 'playoffs', pair_one_id: 'p1', pair_two_id: 'p2', pair_one_sets: [], pair_two_sets: [], winner_id: null, status: 'scheduled', court: null, scheduled_at: null, updated_at: 'initial', ...overrides };
}
async function submit(form) {
  await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
  await settle();
}
test('live match workspace can adjust games, finish a set, and submit the final score', async () => {
  pairFixtures();
  records.matches = [gameFixture('main-game', {
    tournament_id: existing.id, court: 'Court 1', status: 'live', pair_one_sets: [6], pair_two_sets: [5],
  })];
  await mount();
  await selectCup();
  await click(button('Live matches'));
  await click(button('Update score'));
  const form = document.querySelector('.admin-day-editor .admin-match');
  await click(form.querySelector('[aria-label="Add a game for Top pair"]'));
  assert.equal(form.querySelector('[aria-label="Set scores"]').value, '7-5');
  await click(button('Finish set'));
  assert.equal(form.querySelector('[aria-label="Set scores"]').value, '7-5, 0-0');
  await click(button('Enter final result'));
  await click(form.querySelector('input[type="radio"]'));
  await submit(form);
  const save = calls.find(call => call.name === 'record_match_result');
  assert.deepEqual(save?.payload.p_pair_one_sets, [7]);
  assert.deepEqual(save?.payload.p_pair_two_sets, [5]);
});

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
    await mount(); await selectCup(); await click(button(kind === 'groups' ? 'Groups' : 'Playoffs'));
    if (kind === 'groups') await click(button('Standings'));
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
  await mount(); await selectCup(); await click(button('King of the Basement'));
  const section=[...document.querySelectorAll('.admin-collapsible')].find(node=>node.querySelector('h2')?.textContent==='King of the Basement');
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
  await mount(); await selectCup(); await click(button('Groups')); await click(button('Playoff qualifiers'));
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
  await click(button('Confirm playoff draw'));
  await click(document.querySelector('dialog button[type=submit]'));
  const saved=calls.find(call=>call.name==='confirm_group_qualifiers');
  assert.equal(saved.payload.p_pair_ids.length,9);
  assert.equal(new Set(saved.payload.p_pair_ids).size,9);
  assert.equal(saved.payload.p_pair_ids[7],toId);
  assert.equal(saved.payload.p_pair_ids[8],fromId);
});

test('500-photo album pages by 24 and filters across pages by filename and visibility', async () => {
  records.tournament_galleries = [{ tournament_id: existing.id, cover_photo_id: 'photo-1', published_at: null }];
  records.tournament_gallery_photos = Array.from({ length: 500 }, (_, i) => ({
    tournament_id: existing.id, id: `photo-${i + 1}`, sort_order: i, state: i === 499 ? 'hidden' : 'visible',
  }));
  records.tournament_gallery_photo_filenames = [
    { tournament_id: existing.id, photo_id: 'photo-500', filename: 'Vienna Final.webp' },
  ];
  await mount(); await selectCup(); await click(button('Photo album'));
  assert.equal(document.querySelectorAll('.admin-gallery-grid article').length, 24);
  await enter(document.querySelector('.admin-gallery-pages select'), '20');
  assert.equal(document.querySelectorAll('.admin-gallery-grid article').length, 20);
  assert.match(document.querySelector('.admin-gallery-pages').textContent, /481–500 of 500/);
  await enter(field('Find a photo'), 'vienna final');
  assert.equal(document.querySelectorAll('.admin-gallery-grid article').length, 1);
  assert.match(document.querySelector('.admin-gallery-grid article').textContent, /Photo 500.*Vienna Final/);
  await enter(field('Visibility filter'), 'visible');
  assert.match(document.querySelector('.admin-gallery').textContent, /No matching photos/);
  await enter(field('Visibility filter'), 'hidden');
  assert.equal(document.querySelectorAll('.admin-gallery-grid article').length, 1);
});

test('Russian preference applies to the admin and survives reload without setting site language', async () => {
  await mount(); await selectCup();
  const siteLanguage = document.documentElement.lang;
  await click(button('RU'));
  assert.equal(document.querySelector('main').lang, 'ru');
  assert.match(document.body.textContent, /Настройки турнира|Сменить турнир/);
  assert.equal(document.documentElement.lang, siteLanguage);
  await unmount(); await mount();
  assert.equal(document.querySelector('main').lang, 'ru');
  assert.match(document.body.textContent, /Турниры/);
});

test('deleting requires the exact tournament name and a final confirmation', async () => {
  await mount(); await selectCup(); await click(button('More actions'));
  await click(button('Delete tournament'));
  let dialog = document.querySelector('dialog');
  assert.equal(dialog.querySelector('button[type="submit"]').disabled, true);
  await enter(dialog.querySelector('input'), 'Wrong Cup');
  await submit(dialog.querySelector('form'));
  assert.equal(document.querySelector('dialog'), dialog);
  await enter(dialog.querySelector('input'), existing.name);
  await click(dialog.querySelector('button[type="submit"]'));
  assert.equal(calls.some(call => call.name === 'delete_tournament'), false);
  dialog = document.querySelector('dialog');
  assert.match(dialog.textContent, /Confirm permanent deletion/);
  await click(dialog.querySelector('button[type="submit"]'));
  assert.deepEqual(calls.find(call => call.name === 'delete_tournament')?.payload, {
    p_tournament_id: existing.id, p_confirmation_name: existing.name,
  });
});
