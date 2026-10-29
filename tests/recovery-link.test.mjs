import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

async function loadClient(pathname, hash) {
  globalThis.window = { location: { pathname, hash } };
  const result = await build({ entryPoints: [new URL("../lib/supabase.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "auth-fixture", setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: "auth", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: 'export const createClient=()=>{ globalThis.window.location.hash=""; return {}; };' }));
  } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${crypto.randomUUID()}`).toString("base64")}`);
}

test("recovery marker is captured before the auth client clears credentials", async () => {
  try {
    const client = await loadClient("/auth/callback/", "#type=recovery&access_token=access&refresh_token=refresh&expires_in=3600&token_type=bearer");
    assert.equal(typeof client.hasRecoveryRedirect === "function" && client.hasRecoveryRedirect(), true);
    assert.equal(window.location.hash, "");
  } finally { delete globalThis.window; }
});
test("OAuth marker is captured before Auth consumes its redirect", async () => {
  try {
    const client = await loadClient("/auth/callback/", "#access_token=access&refresh_token=refresh&expires_in=3600&token_type=bearer");
    assert.equal(client.hasOAuthRedirect(), true);
    assert.equal(client.hasRecoveryRedirect(), false);
    assert.equal(window.location.hash, "");
  } finally { delete globalThis.window; }
});
test("OAuth marker rejects incomplete, recovery and off-route fragments", async () => {
  try {
    for (const [path, hash] of [["/auth/callback/", ""], ["/auth/callback/", "#access_token=x"], ["/auth/callback/", "#type=recovery&access_token=x&refresh_token=y&expires_in=3600&token_type=bearer"], ["/profile/", "#access_token=x&refresh_token=y&expires_in=3600&token_type=bearer"]]) {
      const client = await loadClient(path, hash);
      assert.equal(client.hasOAuthRedirect(), false);
    }
  } finally { delete globalThis.window; }
});

test("recovery marker rejects a bare intent, wrong type or incomplete tokens", async () => {
  try {
    for (const [path, hash] of [["/auth/callback/", ""], ["/auth/callback/", "#type=signup&access_token=x&refresh_token=y&expires_in=3600&token_type=bearer"], ["/auth/callback/", "#type=recovery&access_token=x"], ["/profile/", "#type=recovery&access_token=x&refresh_token=y&expires_in=3600&token_type=bearer"]]) {
      const client = await loadClient(path, hash);
      assert.equal(typeof client.hasRecoveryRedirect === "function" && client.hasRecoveryRedirect(), false);
    }
  } finally { delete globalThis.window; }
});
