import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost:3000/auth/callback/" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, history: dom.window.history, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { createElement, act } = await import("react");
const { createRoot } = await import("react-dom/client");
const existingUser = { id: "11111111-1111-4111-8111-111111111111", email: "first@example.com" };
let root, Page, temp, signOutError, signOutCalls, passwordUpdates, currentUser;
const client = { auth: {
  initialize: async () => { if (globalThis.__callbackRecoveryLink || globalThis.__callbackOAuthLink) history.replaceState({}, "", `/auth/callback/?intent=${globalThis.__callbackOAuthLink ? "reauthenticate" : "recovery"}`); return { error: null }; },
  getUser: async () => ({ data: { user: currentUser }, error: null }),
  updateUser: async ({ password }) => { passwordUpdates.push(password); return { error: null }; },
  signOut: async ({ scope }) => { signOutCalls.push(scope); return { error: signOutError }; },
} };

before(async () => {
  globalThis.__callbackTestClient = client;
  const repo = fileURLToPath(new URL("../", import.meta.url));
  await mkdir(`${repo}tmp`, { recursive: true }); temp = await mkdtemp(`${repo}tmp/callback-ui-`);
  const output = await build({ entryPoints: [`${repo}app/auth/callback/page.tsx`], bundle: true, write: false, format: "esm", platform: "node", packages: "external", jsx: "automatic", plugins: [{ name: "callback-boundary", setup(builder) {
    builder.onResolve({ filter: /^(?:@\/lib\/supabase|\.\/supabase)$/ }, () => ({ path: "supabase", namespace: "fixture" }));
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "supabase" ? 'export const supabase=globalThis.__callbackTestClient; export const hasRecoveryRedirect=()=>globalThis.__callbackRecoveryLink; export const hasOAuthRedirect=()=>globalThis.__callbackOAuthLink; export const SUPABASE_URL="https://supabase.test"; export const SUPABASE_PUBLIC_KEY="public";' : 'export const usePathname=()=>"/auth/callback/";' }));
  } }] });
  await writeFile(`${temp}/page.mjs`, output.outputFiles[0].contents);
  ({ default: Page } = await import(pathToFileURL(`${temp}/page.mjs`).href));
});
async function settle() { for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
beforeEach(async () => { await unmount(); history.replaceState({}, "", "/auth/callback/?intent=recovery"); sessionStorage.clear(); globalThis.__callbackRecoveryLink = false; globalThis.__callbackOAuthLink = false; signOutError = null; signOutCalls = []; passwordUpdates = []; currentUser = existingUser; });
after(async () => { await unmount(); dom.window.close(); await rm(temp, { recursive: true, force: true }); delete globalThis.__callbackTestClient; });
async function mount() { root = createRoot(document.getElementById("root")); await act(async () => root.render(createElement(Page))); await settle(); }

test("an existing session and a bare recovery intent do not open password reset", async () => {
  await mount();
  assert.ok(!document.querySelector('input[type="password"]'), "bare intent must not display a password field");
  assert.match(document.body.textContent, /ссылк.*восстановлен|восстановлен.*ссылк/i);
  assert.equal(location.search, "");
  assert.equal(passwordUpdates.length, 0);
});
test("a bare recovery intent without an authenticated user is rejected, not reported processed", async () => {
  currentUser = null;
  await mount();
  assert.ok(!document.querySelector('input[type="password"]'));
  assert.match(document.body.textContent, /Ссылка восстановления недействительна/);
  assert.doesNotMatch(document.body.textContent, /Ссылка обработана/);
});
test("a recovery link opens the password form even after Auth clears its fragment", async () => {
  globalThis.__callbackRecoveryLink = true;
  history.replaceState({}, "", "/auth/callback/?intent=recovery#type=recovery&access_token=secret");
  await mount();
  assert.ok(document.querySelector('input[type="password"]'), "recovery form must open");
  assert.equal(location.hash, "");
  assert.equal(location.search, "");
});
async function enter(input, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value").set.call(input, value); input.dispatchEvent(new window.Event("input", { bubbles: true })); });
}
test("a pending OAuth expectation without a provider redirect cannot verify the account", async () => {
  history.replaceState({}, "", "/auth/callback/?intent=reauthenticate");
  sessionStorage.setItem("kyng-account-oauth", JSON.stringify({ userId: existingUser.id, intent: "reauthenticate", at: Date.now() }));
  await mount();
  assert.ok(!sessionStorage.getItem("kyng-account-verification"), "a bare callback cannot mark account verified");
  assert.match(document.body.textContent, /проверка истекла|ссылк.*недействительна/i);
  assert.deepEqual(signOutCalls, ["local"]);
});

test("a matching OAuth redirect verifies the expected account after tokens are cleared", async () => {
  globalThis.__callbackOAuthLink = true;
  history.replaceState({}, "", "/auth/callback/?intent=reauthenticate#access_token=example&refresh_token=example");
  sessionStorage.setItem("kyng-account-oauth", JSON.stringify({ userId: existingUser.id, intent: "reauthenticate", at: Date.now() }));
  await mount();
  assert.equal(JSON.parse(sessionStorage.getItem("kyng-account-verification")).userId, existingUser.id);
  assert.equal(location.hash, "");
  assert.equal(sessionStorage.getItem("kyng-account-oauth"), null);
  assert.deepEqual(signOutCalls, []);
});

test("OAuth cancellation clears the pending expectation", async () => {
  history.replaceState({}, "", "/auth/callback/?intent=reauthenticate&error=access_denied");
  sessionStorage.setItem("kyng-account-oauth", JSON.stringify({ userId: existingUser.id, intent: "reauthenticate", at: Date.now() }));
  await mount();
  assert.equal(sessionStorage.getItem("kyng-account-oauth"), null);
  assert.match(document.body.textContent, /не удалось завершить вход/i);
});

test("a failed global sign-out after reset does not claim other devices were signed out", async () => {
  globalThis.__callbackRecoveryLink = true;
  signOutError = new Error("Sign-out unavailable");
  await mount();
  const [newPassword, repeat] = document.querySelectorAll('input[type="password"]');
  await enter(newPassword, "a safe example passphrase");
  await enter(repeat, "a safe example passphrase");
  await act(async () => document.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await settle();
  assert.deepEqual(passwordUpdates, ["a safe example passphrase"]);
  assert.deepEqual(signOutCalls, ["global"]);
  assert.match(document.body.textContent, /Пароль сохранён/);
  assert.match(document.body.textContent, /не удалось завершить.*сеанс/i);
  assert.doesNotMatch(document.body.textContent, /Другие устройства попросят войти повторно/);
});
