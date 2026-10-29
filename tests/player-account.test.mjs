import assert from "node:assert/strict";
import test from "node:test";
import { accountEmail, accountPassword, profileName, authCallbackUrl, ownsAvatar } from "../lib/player-account.ts";
import { build } from "esbuild";

test("account inputs keep display names independent of login and reject invalid values", () => {
  assert.equal(profileName("  Анна van der Meer  "), "Анна van der Meer");
  assert.equal(accountEmail(" Anna@example.com "), "Anna@example.com");
  for (const name of ["", " ", "a".repeat(81), "name\nadmin"]) assert.throws(() => profileName(name));
  for (const email of ["a@", "a@b", "a b@site.com", "a@site.com\nother@site.com"]) assert.throws(() => accountEmail(email));
  assert.throws(() => accountPassword("short"));
  assert.equal(accountPassword("a long password phrase"), "a long password phrase");
});

test("authentication returns only to deployed KYNG CUP or local development", () => {
  assert.equal(authCallbackUrl("https://kyngcup.com", "/profile/", "recovery"), "https://kyngcup.com/auth/callback/?intent=recovery");
  assert.equal(authCallbackUrl("https://yaraprimeson.github.io", "/kyng-cup/profile/", "signup"), "https://yaraprimeson.github.io/kyng-cup/auth/callback/?intent=signup");
  assert.equal(authCallbackUrl("http://localhost:4173", "/profile/", "google"), "http://localhost:4173/auth/callback/?intent=google");
  for (const origin of ["https://evil.test", "https://kyngcup.com.evil.test", "http://kyngcup.com"]) assert.throws(() => authCallbackUrl(origin, "/", "signup"));
});

const owner = "11111111-1111-4111-8111-111111111111";
const path = `${owner}/22222222-2222-4222-8222-222222222222.jpg`;
test("avatar references cannot cross accounts or escape the upload folder", () => {
  assert.equal(ownsAvatar(owner, path), true);
  for (const value of ["https://site.test/image.jpg", `${owner}/../image.jpg`, path.replace(".jpg", ".svg"), path.replace(owner, "33333333-3333-4333-8333-333333333333")]) assert.equal(ownsAvatar(owner, value), false);
});

async function accountClient(client) {
  // Bundle only this store, replacing its network boundary with a controlled client.
  globalThis.kyngAccountTestClient = client;
  const result = await build({ entryPoints: [new URL("../lib/player-account-client.ts", import.meta.url).pathname], bundle: true, write: false, format: "esm", platform: "node", plugins: [{ name: "network-fixture", setup(builder) {
    builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: "client", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const supabase = globalThis.kyngAccountTestClient;" }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${crypto.randomUUID()}`).toString("base64")}`);
}
function fixture({ data = null, error = null, uploadError = null } = {}) {
  const calls = [];
  const chain = { update(value) { calls.push(["update", value]); return this; }, eq(...args) { calls.push(["eq", ...args]); return this; }, select() { return this; }, async maybeSingle() { return { data, error }; } };
  return { calls, client: { from: () => chain, storage: { from: () => ({ async upload(...args) { calls.push(["upload", ...args]); return { error: uploadError }; }, async remove(paths) { calls.push(["remove", paths]); return { error: null }; } }) } } };
}
const profile = { player_id: "stable", auth_user_id: owner, display_name: "Player", avatar_path: path, version: 4 };
test("a concurrent edit preserves the old photo and removes only the failed new upload", async () => {
  const f = fixture(); const store = await accountClient(f.client);
  await assert.rejects(store.saveAccountProfile(profile, "Edited", new Blob(["photo"], { type: "image/jpeg" })), /другом устройстве/);
  const uploaded = f.calls.find(call => call[0] === "upload")[1];
  assert.notEqual(uploaded, path);
  assert.deepEqual(f.calls.filter(call => call[0] === "remove"), [["remove", [uploaded]]]);
  assert.ok(f.calls.some(call => call[0] === "eq" && call[1] === "version" && call[2] === 4));
});
test("a failed upload never changes the active profile or deletes its photo", async () => {
  const f = fixture({ uploadError: new Error("network failure") }); const store = await accountClient(f.client);
  await assert.rejects(store.saveAccountProfile(profile, "Edited", new Blob(["photo"], { type: "image/jpeg" })), /network failure/);
  assert.equal(f.calls.some(call => call[0] === "update" || call[0] === "remove"), false);
});
test("an ambiguous save response never deletes a possibly committed avatar", async () => {
  const f = fixture({ error: { code: "", message: "fetch failed" } }); const store = await accountClient(f.client);
  await assert.rejects(store.saveAccountProfile(profile, "Edited", new Blob(["photo"], { type: "image/jpeg" })));
  assert.equal(f.calls.some(call => call[0] === "remove"), false);
});
test("photo deletion is committed before the previous file is removed", async () => {
  const f = fixture({ data: { ...profile, avatar_path: null, version: 5 } }); const store = await accountClient(f.client);
  const saved = await store.saveAccountProfile(profile, "Edited", null);
  assert.equal(saved.profile.player_id, "stable");
  assert.equal(f.calls[0][0], "update");
  assert.equal(f.calls[0][1].avatar_path, null);
  assert.deepEqual(f.calls.at(-1), ["remove", [path]]);
});
