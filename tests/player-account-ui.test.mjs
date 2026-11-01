import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/profile/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter, Element: dom.window.Element, MutationObserver: dom.window.MutationObserver, location: dom.window.location, history: dom.window.history, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
window.scrollTo = () => {};
window.requestAnimationFrame = callback => callback();
let googleAvailable = false, signupError = null, oauthCalls;
globalThis.fetch = async () => ({ ok: true, json: async () => ({ external: { google: googleAvailable } }) });
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
let root, Page, LanguageProvider, temp, user, listener, rows, writes, authFailure, profileFailure, createFailure, registrationRows, registrationFailure, claimFailure, matchRows, matchFailure;
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
  async rpc(name, args) { if (name === "get_my_match_history") { assert.equal(args, undefined); return { data: matchRows, error: matchFailure }; } assert.equal(name, "redeem_registration_claim_code"); assert.equal(args.p_code, "a".repeat(64)); if (claimFailure) return { data: null, error: claimFailure }; registrationRows[0].submitted_by = first.id; return { data: registrationRows[0].id, error: null }; },
  from(table) {
    if (table === "tournament_registrations") { let ownerFilter = null, partnerFilter = null; return { select() { return this; }, eq(column, value) { if (column === "submitted_by") ownerFilter = value; return this; }, or(expression) { const match = /^submitted_by\.eq\.([^,]+),partner_user_id\.eq\.(.+)$/.exec(expression); assert.ok(match, `Owner filter required: ${expression}`); ownerFilter = match[1]; partnerFilter = match[2]; return this; }, async order() { return { data: registrationRows.filter(item => ownerFilter === null || item.submitted_by === ownerFilter || item.partner_user_id === partnerFilter), error: registrationFailure }; } }; }
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
  const output = await build({ stdin: { contents: `export {default} from "./app/profile/page.tsx"; export {LanguageProvider} from "./app/i18n.tsx";`, resolveDir: repo, loader: "tsx" }, bundle: true, write: false, format: "esm", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "boundaries", setup(builder) {
    builder.onResolve({ filter: /^(?:@\/lib\/supabase|\.\/supabase)$/ }, () => ({ path: "server", namespace: "fixture" }));
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\.\/public-tournaments$/ }, () => ({ path: "tournaments", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "server" ? 'export const supabase=globalThis.__playerAccountClient; export const SUPABASE_URL="https://supabase.test"; export const SUPABASE_PUBLIC_KEY="public";' : args.path === "navigation" ? 'export const usePathname=()=>"/profile/";' : 'export const usePublicTournaments=()=>({tournaments:[],loading:false,error:false}); export const formatTournamentDate=()=>"";' }));
  } }] });
  await writeFile(`${temp}/page.mjs`, output.outputFiles[0].contents);
  ({ default: Page, LanguageProvider } = await import(pathToFileURL(`${temp}/page.mjs`).href));
});
async function settle() { for (let i=0;i<4;i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); }
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
beforeEach(async () => { await unmount(); sessionStorage.clear(); window.localStorage.clear(); history.replaceState({}, "", "/profile/"); user = { ...first }; rows = { [first.id]: row(first, "Первый игрок"), [second.id]: row(second, "Второй игрок") }; writes = 0; authFailure = null; profileFailure = null; createFailure = null; googleAvailable = false; signupError = null; oauthCalls = []; registrationRows = []; registrationFailure = null; claimFailure = null; matchRows = []; matchFailure = null; });
after(async () => { await unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); delete globalThis.__playerAccountClient; });
async function mount() { root = createRoot(document.getElementById("root")); await act(async () => root.render(createElement(LanguageProvider, null, createElement(Page)))); await settle(); }
function button(text) { const node = [...document.querySelectorAll("button")].find(value => value.textContent.includes(text)); assert.ok(node, `Missing button: ${text}`); return node; }
async function click(text) { await act(async () => button(text).click()); await settle(); }
async function enter(input, value) { await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); }); }

test("profile home keeps results and statistics inside History and Matches only", async () => {
  await mount();
  assert.ok(document.querySelector('.kv-stats') === null, 'Match statistics must not render on the profile home');
  assert.equal(document.querySelector('[aria-label="Sport"]'), null);
  assert.doesNotMatch(document.body.textContent, /No results yet|Refresh results|Best streak/);
  await click("History and matches");
  assert.ok(document.querySelector('.kv-stats'));
  assert.ok(document.querySelector('[aria-label="Sport"]'));
  assert.match(document.body.textContent, /No results yet|Refresh results/);
  await click("Back");
  assert.ok(document.querySelector('.kv-stats') === null, 'Match statistics must not render on the profile home');
  assert.doesNotMatch(document.body.textContent, /No results yet|Refresh results/);
});

test("profile settings uses the balanced replacement gear SVG", async () => {
  await mount();
  const icon = button("Profile settings").querySelector('svg');
  assert.equal(icon.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(icon.getAttribute('aria-hidden'), 'true');
  assert.match(icon.querySelector('path').getAttribute('d'), /^M9\.671 4\.136a2\.34/);
});

test("sign-out appears only on the profile home, below profile settings", async () => {
  await mount();
  const hasLogout = () => [...document.querySelectorAll("button")].some(node => node.textContent === "Sign out of account");
  const settings = button("Profile settings"), logout = button("Sign out of account");
  assert.ok(settings.compareDocumentPosition(logout) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  for (const label of ["History and matches", "My partners", "Achievements", "My cards", "Profile settings"]) {
    await click(label);
    assert.equal(hasLogout(), false, `Sign-out hidden on ${label}`);
    await click("Back");
    assert.equal(hasLogout(), true);
  }
  await click("My tournaments");
  assert.equal(hasLogout(), false, "Sign-out hidden on My Tournaments");
  await click("Profile");
  assert.equal(hasLogout(), true);
});

test("profile omits redundant banners and gives sign-out the secondary danger button style", async () => {
  await mount();
  assert.doesNotMatch(document.body.textContent, /Email verified|Your profile is ready\./);
  const logout = button("Sign out of account");
  assert.ok(logout.classList.contains("kv-secondary"));
  assert.ok(logout.classList.contains("player-sign-out"));
  assert.equal(logout.classList.contains("kv-link"), false);
  await click("Sign out of account");
  assert.match(document.body.textContent, /Create account/);
});

test("Google sign-in creates a profile from the provider name without asking again", async () => {
  user = { ...first, identities: [{ provider: "google", identity_data: { full_name: "Анна Коваленко" } }] };
  delete rows[user.id];
  await mount();
  assert.equal(rows[user.id]?.display_name, "Анна Коваленко");
  assert.equal(writes, 1);
  assert.match(document.body.textContent, /Анна Коваленко/);
  assert.doesNotMatch(document.body.textContent, /What should we call you\?|Open my profile/);
});

test("confirmed email signup opens a profile from the registered name without onboarding", async () => {
  user = { ...first, user_metadata: { display_name: "Почтовое имя" } };
  delete rows[user.id];
  await mount();
  assert.equal(rows[user.id]?.display_name, "Почтовое имя");
  assert.equal(writes, 1);
  assert.match(document.body.textContent, /Почтовое имя/);
  assert.doesNotMatch(document.body.textContent, /What should we call you\?|Open my profile/);
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
  assert.match(document.body.textContent, /What should we call you\?/);
  assert.equal(writes, 0);
});

test("Google profile name can be changed in settings after automatic creation", async () => {
  user = { ...first, identities: [{ provider: "google", identity_data: { full_name: "Имя Google" } }] };
  delete rows[user.id];
  await mount();
  await click("Profile settings");
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
  assert.match(document.body.textContent, /Verify your email/);
  assert.match(document.body.textContent, /If.*Google/i);
  assert.doesNotMatch(document.body.textContent, /Этот адрес уже зарегистрирован/);
  await click("Continue with Google");
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
  assert.match(document.body.textContent, /Verify your email/);
  assert.match(document.body.textContent, /If.*Google/i);
  assert.ok(!document.querySelector('[role="alert"]'));
  await click("Continue with Google");
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
  assert.match(document.querySelector('[role="alert"]')?.textContent || "", /Too many requests/);
  assert.doesNotMatch(document.body.textContent, /Verify your email/);
});

test("a missing history RPC shows an error, not empty results, and can retry", async () => {
  matchFailure = {code:'PGRST202'};
  await mount(); await click("History and matches");
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /Could not load results/);
  assert.doesNotMatch(document.body.textContent, /No results yet/);
  matchFailure = null;
  await click("Try loading results again");
  assert.match(document.body.textContent, /No results yet/);
  assert.equal(document.querySelector('[role="alert"]'), null);
});

test("empty achievements show locked awards without demo progress", async () => {
  await mount(); await click("Achievements");
  assert.equal(document.querySelectorAll('[data-earned="true"]').length,0);
  assert.equal(document.querySelectorAll('[data-earned="false"]').length,12);
  assert.doesNotMatch(document.body.textContent,/в примере|Daniel Horvat|Earned ·/);
});

test("history shows actual results with player-relative score and earned achievements", async () => {
  matchRows = [{ id:"knockout:1", tournament_id:"t1", tournament_name:"Реальный кубок", tournament_slug:"cup", sport:"tennis", tournament_status:"completed", tournament_date:"2026-10-01", pair_id:"ours", partner_user_id:second.id, partner_name:"Имя партнёра", opponent_name:"Соперники", stage:"playoffs", round:1, final_round:1, is_final:true, status:"completed", winner_id:"ours", pair_one_id:"opponent", pair_two_id:"ours", pair_one_sets:[3,4], pair_two_sets:[6,6], completed_at:"2026-10-01T10:00:00Z", scheduled_at:null }];
  await mount(); await click("History and matches");
  assert.match(document.body.textContent, /Реальный кубок/);
  assert.match(document.body.textContent, /6:3 · 6:4/);
  assert.match(document.body.textContent, /Соперники/);
  assert.match(document.body.textContent, /Имя партнёра/);
  await click("Back"); await click("Achievements");
  assert.equal(document.querySelector('[data-award="champion"]')?.getAttribute('data-earned'), 'true');
  assert.doesNotMatch(document.body.textContent, /в примере|Расчёт достижений ещё не подключён/);
});

test("mine shows only applications submitted by this account, not matching email or other users", async () => {
  registrationRows = [
    { id: "own", submitted_by: first.id, status: "confirmed", pair_name: "Наша пара", created_at: "2026-10-01", tournaments: { name: "Vienna Open", sport: "padel", starts_at: null, location: "Vienna" } },
    { id: "other", submitted_by: second.id, status: "new", pair_name: "Другая пара", created_at: "2026-10-01", tournaments: { name: "Чужой турнир", sport: "tennis", starts_at: null, location: "Vienna" } },
    { id: "guest", submitted_by: null, status: "new", pair_name: "Гостевая пара", created_at: "2026-10-01", tournaments: null },
  ];
  await mount(); await click("My tournaments");
  assert.match(document.body.textContent, /Vienna Open|Наша пара/);
  assert.match(document.body.textContent, /Confirmed/);
  assert.doesNotMatch(document.body.textContent, /Чужой турнир|Гостевая пара/);
});

test("mine shows a linked partner application without exposing other players or unclaimed guest rows", async () => {
  registrationRows = [
    { id: "linked", submitted_by: second.id, partner_user_id: first.id, status: "confirmed", pair_name: "Наша пара", created_at: "2026-10-01", tournaments: { name: "Vienna Open", sport: "padel", starts_at: null, location: "Vienna" } },
    { id: "foreign", submitted_by: second.id, partner_user_id: null, status: "new", pair_name: "Чужая заявка", created_at: "2026-10-01", tournaments: null },
    { id: "guest", submitted_by: null, partner_user_id: null, status: "new", pair_name: "Гостевая пара", created_at: "2026-10-01", tournaments: null },
  ];
  await mount(); await click("My tournaments");
  assert.match(document.body.textContent, /Vienna Open|Наша пара/);
  assert.doesNotMatch(document.body.textContent, /Чужая заявка|Гостевая пара/);
});

test("a claim code refreshes the player's applications only after successful redemption", async () => {
  registrationRows = [{ id: "legacy", submitted_by: null, partner_user_id: null, status: "confirmed", pair_name: "Старая заявка", created_at: "2026-10-01", tournaments: { name: "Vienna Open", sport: "padel", starts_at: null, location: null } }];
  await mount(); await click("My tournaments");
  assert.doesNotMatch(document.body.textContent, /Старая заявка/);
  assert.ok(document.querySelector('input[name="claim_code"]'), 'Code entry is available in My Tournaments');
  await enter(document.querySelector('input[name="claim_code"]'), "a".repeat(64));
  await act(async () => document.querySelector('form[data-claim-application]').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.match(document.body.textContent, /Старая заявка/);
});

test("a rejected claim code stays on the form without revealing a guest application", async () => {
  claimFailure = { code: "42501", message: "Code unavailable" };
  registrationRows = [{ id: "legacy", submitted_by: null, partner_user_id: null, status: "confirmed", pair_name: "Гостевая заявка", created_at: "2026-10-01", tournaments: null }];
  await mount(); await click("My tournaments");
  await enter(document.querySelector('input[name="claim_code"]'), "a".repeat(64));
  await act(async () => document.querySelector('form[data-claim-application]').dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.match(document.querySelector('section[aria-label="My applications"] [role="alert"]')?.textContent ?? "", /Could not link the application/);
  assert.equal(document.querySelector('input[name="claim_code"]')?.value, "a".repeat(64));
  assert.doesNotMatch(document.body.textContent, /Гостевая заявка|Заявка связана с вашим аккаунтом/);
});

test("mine shows a loading error rather than claiming no applications", async () => {
  registrationFailure = { code: "PGRST205" };
  await mount(); await click("My tournaments");
  assert.match(document.querySelector('[role="alert"]')?.textContent ?? "", /Could not load applications/);
  assert.doesNotMatch(document.body.textContent, /No applications yet/);
});

test("a guest never inherits local demo identity or sample results", async () => {
  user = null; window.localStorage.setItem("kyng-player-profile-v1", JSON.stringify({ name: "Alex Kovalenko", email: "alex@example.com" }));
  await mount(); assert.match(document.body.textContent, /Create an account/); assert.doesNotMatch(document.body.textContent, /Alex Kovalenko|alex@example.com|Autumn Open/);
});
test("refreshing auth and focusing a tab preserve the unsaved profile form", async () => {
  await mount(); await click("Profile settings");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Моё новое имя");
  await act(async () => { listener("TOKEN_REFRESHED", { user }); window.dispatchEvent(new window.Event("focus")); }); await settle();
  assert.equal(document.querySelector('input[autocomplete="name"]'), input); assert.equal(input.value, "Моё новое имя");
});
test("a session-less refresh event does not discard a draft while the user is still authenticated", async () => {
  await mount(); await click("Profile settings");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Черновик после refresh");
  await act(async () => listener("TOKEN_REFRESHED", null));
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "refresh must not unmount settings before checking auth");
  await settle();
  assert.ok(document.querySelector('input[autocomplete="name"]') === input);
  assert.equal(input.value, "Черновик после refresh");
});
test("a transient auth error keeps the settings draft mounted until reconnection", async () => {
  await mount(); await click("Profile settings");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Несохранённое имя");
  authFailure = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError" });
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "settings input must remain mounted");
  assert.equal(input.value, "Несохранённое имя");
  assert.match(document.body.textContent, /Could not refresh your details/);
  authFailure = null;
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "settings input must remain mounted");
  assert.equal(input.value, "Несохранённое имя");
  assert.doesNotMatch(document.body.textContent, /Could not refresh your details/);
});
test("failed manual refresh keeps the settings draft and does not claim success", async () => {
  await mount(); await click("Profile settings");
  const input = document.querySelector('input[autocomplete="name"]'); await enter(input, "Несохранённое имя");
  profileFailure = Object.assign(new Error("fetch failed"), { code: "" });
  await click("Reload account details");
  assert.ok(document.querySelector('input[autocomplete="name"]') === input, "settings input must remain mounted");
  assert.equal(input.value, "Несохранённое имя");
  assert.match(document.body.textContent, /Could not refresh your details/);
  assert.doesNotMatch(document.body.textContent, /Latest details loaded/);
});
test("a remote edit does not overwrite a draft and an old draft cannot overwrite the remote edit", async () => {
  await mount(); await click("Profile settings"); await enter(document.querySelector('input[autocomplete="name"]'), "Локальный черновик");
  rows[first.id] = { ...rows[first.id], display_name: "Изменено на телефоне", version: 2 };
  await act(async () => window.dispatchEvent(new window.Event("focus"))); await settle();
  await act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); await settle();
  assert.match(document.body.textContent, /another device/); assert.equal(rows[first.id].display_name, "Изменено на телефоне"); assert.equal(writes, 0);
});
test("switching accounts clears the first player's personal data immediately", async () => {
  await mount(); assert.match(document.body.textContent, /Первый игрок/);
  await act(async () => { user = { ...second }; listener("SIGNED_IN", { user }); });
  assert.doesNotMatch(document.body.textContent, /Первый игрок|first@example.com/);
  await settle(); assert.match(document.body.textContent, /Второй игрок/); assert.doesNotMatch(document.body.textContent, /Первый игрок/);
});
test("sign-out clears the player and reopening uses the server profile", async () => {
  await mount(); await click("Sign out of account"); assert.match(document.body.textContent, /Create account/); assert.doesNotMatch(document.body.textContent, /Первый игрок|first@example.com/);
  await unmount(); user = { ...first }; rows[first.id].display_name = "Сохранённое имя"; await mount(); assert.match(document.body.textContent, /Сохранённое имя/);
});

async function chooseLanguage(value) {
  const select = document.querySelector('.kv-language select');
  assert.ok(select, 'Profile language selector is available');
  await act(async () => { select.value = value; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await settle();
}

test('profile login supports UA, EN and DE, keeps typed fields and remembers the choice', async () => {
  user = null;
  await mount();
  const options = [...document.querySelector('.kv-language select').options].map(option => option.value);
  assert.deepEqual(options, ['uk', 'en', 'de']);
  const input = document.querySelector('input[name="name"]');
  await enter(input, 'Anna Example');
  for (const [language, heading, label] of [['uk', 'Ваш KYNG CUP', 'Ім’я та прізвище'], ['de', 'Ihr KYNG CUP', 'Vor- und Nachname'], ['en', 'Your KYNG CUP', 'Full name']]) {
    await chooseLanguage(language);
    assert.equal(document.querySelector('main').lang, language);
    assert.equal(document.documentElement.lang, language);
    assert.equal(document.querySelector('h1').textContent, heading);
    assert.match(input.parentElement.textContent, new RegExp(label));
    assert.equal(document.querySelector('input[name="name"]'), input);
    assert.equal(input.value, 'Anna Example');
  }
  await chooseLanguage('de');
  assert.equal(window.localStorage.getItem('kyng-language'), 'de');
  await unmount(); await mount();
  assert.equal(document.querySelector('h1').textContent, 'Ihr KYNG CUP');
});

test('a previously saved Russian preference falls back to English without a Russian option', async () => {
  user = null;
  window.localStorage.setItem('kyng-language', 'ru');
  await mount();
  assert.equal(document.querySelector('main').lang, 'en');
  assert.equal(document.querySelector('.kv-language select').value, 'en');
  assert.equal(document.querySelector('option[value="ru"]'), null);
  assert.equal(document.querySelector('h1').textContent, 'Your KYNG CUP');
});

test('changing profile language preserves unsaved settings and player identity', async () => {
  await mount(); await click('Profile settings');
  const input = document.querySelector('input[autocomplete="name"]');
  await enter(input, 'Unsaved player name');
  await chooseLanguage('uk');
  assert.equal(document.querySelector('h1').textContent, 'Налаштування профілю');
  assert.equal(document.querySelector('input[autocomplete="name"]'), input);
  assert.equal(input.value, 'Unsaved player name');
  await chooseLanguage('de');
  assert.equal(document.querySelector('h1').textContent, 'Profileinstellungen');
  assert.equal(input.value, 'Unsaved player name');
  assert.equal(rows[first.id].display_name, 'Первый игрок');
  assert.equal(writes, 0);
});

test('achievement translations preserve selected award, sport filtering and earned progress', async () => {
  matchRows = [{ id:'tennis-win', tournament_id:'t1', tournament_name:'Test cup', sport:'tennis', tournament_status:'completed', tournament_date:'2026-10-01', pair_id:'ours', partner_user_id:null, partner_name:'Partner', opponent_name:'Opponent', stage:'group', round:null, final_round:null, is_final:false, status:'completed', winner_id:'ours', pair_one_id:'ours', pair_two_id:'other', pair_one_sets:[6], pair_two_sets:[3], completed_at:'2026-10-01T10:00:00Z', scheduled_at:null }];
  await mount(); await click('Achievements');
  assert.equal(document.querySelector('[data-award="first-win"]').getAttribute('data-earned'), 'true');
  await click('10 wins');
  await click('Tennis');
  for (const [language, title, progress] of [['uk', '10 перемог', '1 із 10 перемог'], ['de', '10 Siege', '1 von 10 Siegen'], ['en', '10 wins', '1 of 10 wins']]) {
    await chooseLanguage(language);
    assert.equal(document.querySelector('#player-achievement-detail h3').textContent, title);
    assert.equal(document.querySelector('#player-achievement-detail small').textContent, progress);
    assert.equal([...document.querySelectorAll('.kv-segment button')].find(button => button.textContent === 'Tennis').getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(document.body.textContent, /Обновить результаты|Refresh results|Ergebnisse aktualisieren|Оновити результати|Получено:|Награды пересчитываются/);
  }
  await click('Padel');
  assert.equal(document.querySelector('[data-award="first-win"]').getAttribute('data-earned'), 'false');
  assert.equal(document.querySelector('#player-achievement-detail small').textContent, '0 of 10 wins');
  await click('Back'); await click('History and matches');
  assert.equal([...document.querySelectorAll('button')].some(button => button.textContent === 'Refresh results'), false);
});
