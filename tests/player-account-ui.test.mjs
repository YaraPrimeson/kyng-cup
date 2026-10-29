import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/profile/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, location: dom.window.location, history: dom.window.history, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
window.scrollTo = () => {};
window.requestAnimationFrame = callback => callback();
let googleAvailable = false, signupError = null, oauthCalls;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ external: { google: googleAvailable } }) });
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
let root, Page, temp, user, listener, rows, writes, authFailure, profileFailure, createFailure, registrationRows, registrationFailure;
const first = { id: "11111111-1111-4111-8111-111111111111", email: "first@example.com", email_confirmed_at: "2026-10-01T00:00:00Z", identities: [{ provider: "email" }], user_metadata: {} };
const second = { ...first, id: "22222222-2222-4222-8222-222222222222", email: "second@example.com" };
const row = (account, name) => ({ player_id: `player-${account.id}`, auth_user_id: account.id, display_name: name, avatar_path: null, version: 1, created_at: "2026-10-01", updated_at: "2026-10-01" });
const client = {
  auth: {
    getUser: async () => authFailure ? { data: { user: null }, error: authFailure } : { data: { user: user ? { ...user } : null }, error: null },
    signUp: async () => ({ data: { user: { identities: [] }, session: null }, error: signupError }),
    signInWithOAuth: async options => { oauthCalls.push(options); return { data: { url: null }, error: null }; },
    onAuthStateChange(callback) { listener = callback; const timer = setTimeout(() => callback("INITIAL_SESSION", user ? { user } : null), 0); return { data: { subscription: { unsubscribe() { clearTimeout(timer); listener = null; } } } }; },
    async signOut() { user = null; listener?.("SIGNED_OUT", null); return { error: null }; },
  },
  from(table) {
    if (table === "tournament_registrations") { let ownerFilter = null; return { select() { return this; }, eq(column, value) { if (column === "submitted_by") ownerFilter = value; return this; }, async order() { return { data: registrationRows.filter(item => ownerFilter === null || item.submitted_by === ownerFilter), error: registrationFailure }; } }; }
    const filters = {}; let patch, inserted;
    const query = { select() { return query; }, eq(key, value) { filters[key] = value; return query; }, insert(value) { inserted = value; return query; }, update(value) { patch = value; return query; }, async single() {
      if (createFailure) return { data: null, error: createFailure };
      if (rows[inserted.auth_user_id]) return { data: null, error: { code: "23505" } };
      const profile = row({ id: inserted.auth_user_id }, inserted.display_name);
      rows[inserted.auth_user_id] = profile; writes++;
      return { data: { ...profile }, error: null };
    }, async maybeSingle() {
      if (profileFailure && !patch) return { data: null, error: profileFailure };
      const current = rows[filters.auth_user_id];
      if (!current || (filters.version !== undefined && current.version !== filters.version)) return { data: null, error: null };
      if (patch) { writes++; Object.assign(current, patch, { version: current.version + 1, updated_at: String(Date.now()) }); }
      return { data: { ...current }, error: null };
    } };
    return query;
  },
};

before(async () => {
  globalThis.__playerAccountClient = client;
  const repo = fileURLToPath(new URL("../", import.meta.url));
  await mkdir(`${repo}tmp`, { recursive: true }); temp = await mkdtemp(`${repo}tmp/player-ui-`);
  const output = await build({ entryPoints: [`${repo}app/profile/page.tsx`], bundle: true, write: false, format: "esm", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "boundaries", setup(builder) {
    builder.onResolve({ filter: /^(?:@\/lib\/supabase|\.\/supabase)$/ }, () => ({ path: "server", namespace: "fixture" }));
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\.\/public-tournaments$/ }, () => ({ path: "tournaments", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "server" ? 'export const supabase=globalThis.__playerAccountClient; export const SUPABASE_URL="https://supabase.test"; export const SUPABASE_PUBLIC_KEY="public";' : args.path === "navigation" ? 'export const usePathname=()=>"/profile/";' : 'export const usePublicTournaments=()=>({tournaments:[],loading:false,error:false}); export const formatTournamentDate=()=>"";' }));
  } }] });
  await writeFile(`${temp}/page.mjs`, output.outputFiles[0].contents);
  ({ default: Page } = await import(pathToFileURL(`${temp}/page.mjs`).href));
});
async function settle() { for (let i=0;i<4;i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
beforeEach(async () => { await unmount(); sessionStorage.clear(); window.localStorage.clear(); history.replaceState({}, "", "/profile/"); user = { ...first }; rows = { [first.id]: row(first, "Первый игрок"), [second.id]: row(second, "Второй игрок") }; writes = 0; authFailure = null; profileFailure = null; createFailure = null; googleAvailable = false; signupError = null; oauthCalls = []; registrationRows = []; registrationFailure = null; });
after(async () => { await unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); delete globalThis.__playerAccountClient; });
async function mount() { root = createRoot(document.getElementById("root")); await act(async () => root.render(createElement(Page))); await settle(); }
function button(text) { const node = [...document.querySelectorAll("button")].find(value => value.textContent.includes(text)); assert.ok(node, `Missing button: ${text}`); return node; }
async function click(text) { await act(async () => button(text).click()); await settle(); }
async function enter(input, value) { await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); }); }

test("Google sign-in creates a profile from the provider name without asking again", async () => {
  user = { ...first, identities: [{ provider: "google", identity_data: { full_name: "Анна Коваленко" } }] };
  delete rows[user.id];
  await mount();
  assert.equal(rows[user.id]?.display_name, "Анна Коваленко");
  assert.equal(writes, 1);
  assert.match(document.body.textContent, /Анна Коваленко/);
  assert.doesNotMatch(document.body.textContent, /Как вас представить\?|Открыть мой профиль/);
});

test("confirmed email signup opens a profile from the registered name without onboarding", async () => {
  user = { ...first, user_metadata: { display_name: "Почтовое имя" } };
  delete rows[user.id];
  await mount();
  assert.equal(rows[user.id]?.display_name, "Почтовое имя");
  assert.equal(writes, 1);
  assert.match(document.body.textContent, /Почтовое имя/);
  assert.doesNotMatch(document.body.textContent, /Как вас представить\?|Открыть мой профиль/);
});

test("an existing profile keeps the player's chosen name after Google sign-in", async () => {
  user = { ...first, identities: [{ provider: "google", identity_data: { full_name: "Имя Google" } }] };
  rows[user.id] = row(user, "Моё имя в KYNG CUP");
  await mount();
  assert.equal(rows[user.id].display_name, "Моё имя в KYNG CUP");
  assert.equal(writes, 0);
  assert.match(document.body.textContent, /Моё имя в KYNG CUP/);
  assert.doesNotMatch(document.body.textContent, /Имя Google/);
});

test("Google sign-in without a usable provider name keeps manual profile setup", async () => {
  user = { ...first, identities: [{ provider: "google", identity_data: { full_name: "   " } }] };
  delete rows[user.id];
  await mount();
  assert.equal(rows[user.id], undefined);
  assert.match(document.body.textContent, /Как вас представить\?/);
  assert.equal(writes, 0);
});

test("Google profile name can be changed in settings after automatic creation", async () => {
  user = { ...first, identities: [{ provider: "google", identity_data: { full_name: "Имя Google" } }] };
  delete rows[user.id];
  await mount();
  await click("Настройки профиля");
  await enter(document.querySelector('input[autocomplete="name"]'), "Имя игрока");
  await act(async () => document.querySelector('form.kv-fields').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.equal(rows[user.id].display_name, "Имя игрока");
});

test("an ambiguous email signup keeps a direct Google sign-in path instead of a dead end", async () => {
  user = null; googleAvailable = true;
  await mount();
  await enter(document.querySelector('input[name="name"]'), "Тестовый игрок");
  await enter(document.querySelector('input[name="email"]'), "existing@example.com");
  await enter(document.querySelector('input[name="password"]'), "sample passphrase for testing");
  await act(async () => document.querySelector('form.kv-fields').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.match(document.body.textContent, /Подтвердите почту/);
  assert.match(document.body.textContent, /Если.*Google/i);
  assert.doesNotMatch(document.body.textContent, /Этот адрес уже зарегистрирован/);
  await click("Продолжить с Google");
  assert.equal(oauthCalls[0]?.provider, "google");
});

test("an explicit existing-account signup error offers the same non-enumerating Google path", async () => {
  user = null; googleAvailable = true; signupError = { code: "user_already_exists", message: "User already registered" };
  await mount();
  await enter(document.querySelector('input[name="name"]'), "Тестовый игрок");
  await enter(document.querySelector('input[name="email"]'), "existing@example.com");
  await enter(document.querySelector('input[name="password"]'), "sample passphrase for testing");
  await act(async () => document.querySelector('form.kv-fields').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.match(document.body.textContent, /Подтвердите почту/);
  assert.match(document.body.textContent, /Если.*Google/i);
  assert.ok(!document.querySelector('[role="alert"]'));
  await click("Продолжить с Google");
  assert.equal(oauthCalls[0]?.provider, "google");
});

test("an unrelated signup error remains visible instead of claiming a confirmation email", async () => {
  user = null; signupError = { code: "over_email_send_rate_limit", message: "Rate limit" };
  await mount();
  await enter(document.querySelector('input[name="name"]'), "Тестовый игрок");
  await enter(document.querySelector('input[name="email"]'), "new@example.com");
  await enter(document.querySelector('input[name="password"]'), "sample passphrase for testing");
  await act(async () => document.querySelector('form.kv-fields').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.match(document.querySelector('[role="alert"]')?.textContent || "", /Слишком много запросов/);
  assert.doesNotMatch(document.body.textContent, /Подтвердите почту/);
});

test("mine shows only applications submitted by this account, not matching email or other users", async () => {
  registrationRows = [
    { id: "own", submitted_by: first.id, status: "confirmed", pair_name: "Наша пара", created_at: "2026-10-01", tournaments: { name: "Vienna Open", sport: "padel", starts_at: null, location: "Vienna" } },
    { id: "other", submitted_by: second.id, status: "new", pair_name: "Другая пара", created_at: "2026-10-01", tournaments: { name: "Чужой турнир", sport: "tennis", starts_at: null, location: "Vienna" } },
    { id: "guest", submitted_by: null, status: "new", pair_name: "Гостевая пара", created_at: "2026-10-01", tournaments: null },
  ];
  await mount(); await click("Мои турниры");
  assert.match(document.body.textContent, /Vienna Open|Наша пара/);
  assert.match(document.body.textContent, /Подтверждена/);
  assert.doesNotMatch(document.body.textContent, /Чужой турнир|Гостевая пара/);
});

test("mine shows a loading error rather than claiming no applications", async () => {
  registrationFailure = { code: "PGRST205" };
  await mount(); await click("Мои турниры");
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Не удалось загрузить заявки/);
  assert.doesNotMatch(document.body.textContent, /Пока нет ваших заявок/);
});

test("a guest never inherits local demo identity or sample results", async () => {
  user = null; window.localStorage.setItem("kyng-player-profile-v1", JSON.stringify({ name: "Alex Kovalenko", email: "alex@example.com" }));
  await mount(); assert.match(document.body.textContent, /Создайте аккаунт/); assert.doesNotMatch(document.body.textContent, /Alex Kovalenko|alex@example.com|Autumn Open/);
});
test("refreshing auth and focusing a tab preserve the unsaved profile form", async () => {
  await mount(); await click("Настройки профиля");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Моё новое имя");
  await act(async () => { listener("TOKEN_REFRESHED", { user }); window.dispatchEvent(new window.Event("focus")); }); await settle();
  assert.equal(document.querySelector('input[autocomplete="name"]'), input); assert.equal(input.value, "Моё новое имя");
});
test("a session-less refresh event does not discard a draft while the user is still authenticated", async () => {
  await mount(); await click("Настройки профиля");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Черновик после refresh");
  await act(async () => listener("TOKEN_REFRESHED", null));
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "refresh must not unmount settings before checking auth");
  await settle();
  assert.ok(document.querySelector('input[autocomplete="name"]') === input);
  assert.equal(input.value, "Черновик после refresh");
});
test("a transient auth error keeps the settings draft mounted until reconnection", async () => {
  await mount(); await click("Настройки профиля");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Несохранённое имя");
  authFailure = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" });
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "settings input must remain mounted");
  assert.equal(input.value, "Несохранённое имя");
  assert.match(document.body.textContent, /Не удалось обновить данные/);
  authFailure = null;
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "settings input must remain mounted");
  assert.equal(input.value, "Несохранённое имя");
  assert.doesNotMatch(document.body.textContent, /Не удалось обновить данные/);
});
test("failed manual refresh keeps the settings draft and does not claim success", async () => {
  await mount(); await click("Настройки профиля");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Несохранённое имя");
  profileFailure = Object.assign(new Error("fetch failed"), { code: "" });
  await click("Загрузить актуальные данные");
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "settings input must remain mounted");
  assert.equal(input.value, "Несохранённое имя");
  assert.match(document.body.textContent, /Не удалось обновить данные/);
  assert.doesNotMatch(document.body.textContent, /Актуальные данные загружены/);
});
test("a remote edit does not overwrite a draft and an old draft cannot overwrite the remote edit", async () => {
  await mount(); await click("Настройки профиля"); await enter(document.querySelector('input[autocomplete="name"]'), "Локальный черновик");
  rows[first.id] = { ...rows[first.id], display_name: "Изменено на телефоне", version: 2 };
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  await act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle();
  assert.match(document.body.textContent, /другом устройстве/); assert.equal(rows[first.id].display_name, "Изменено на телефоне"); assert.equal(writes, 0);
});
test("switching accounts clears the first player's personal data immediately", async () => {
  await mount(); assert.match(document.body.textContent, /Первый игрок/);
  await act(async () => { user = { ...second }; listener("SIGNED_IN", { user }); });
  assert.doesNotMatch(document.body.textContent, /Первый игрок|first@example.com/);
  await settle(); assert.match(document.body.textContent, /Второй игрок/); assert.doesNotMatch(document.body.textContent, /Первый игрок/);
});
test("sign-out clears the player and reopening uses the server profile", async () => {
  await mount(); await click("Выйти из аккаунта"); assert.match(document.body.textContent, /Создать аккаунт/); assert.doesNotMatch(document.body.textContent, /Первый игрок|first@example.com/);
  await unmount(); user = { ...first }; rows[first.id].display_name = "Сохранённое имя"; await mount(); assert.match(document.body.textContent, /Сохранённое имя/);
});
