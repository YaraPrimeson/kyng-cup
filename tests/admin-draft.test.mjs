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
      : { data: createError ? null : existing.id, error: createError };
  },
  from(table) {
    const result = { data: table === 'tournaments' ? [existing] : [], error: null };
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      order() { return query; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
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
});
after(async () => {
  await unmount(); dom.window.close(); delete globalThis.__adminDraftTestSupabase;
  await rm(tempDir, { recursive: true, force: true });
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
