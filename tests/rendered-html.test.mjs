import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the KYNG CUP landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>KYNG CUP — More Than a Game<\/title>/i);
  assert.match(html, /More than/);
  assert.match(html, /Open live bracket/);
  assert.match(html, /brand-wordmark/);
  assert.match(html, /favicon\.png/);
  assert.doesNotMatch(html, /ball-mark/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships live bracket and protected tournament controls", async () => {
  const [admin, bracket, migration] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/bracket/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814190000_full_tournament_management.sql", import.meta.url), "utf8"),
  ]);

  assert.match(admin, /create_tournament_with_bracket/);
  assert.match(admin, /set_manual_draw/);
  assert.match(admin, /reset_match_result/);
  assert.match(admin, /Team &amp; roles/);
  assert.match(admin, /Activity log/);
  assert.match(bracket, /postgres_changes/);
  assert.match(bracket, /round-mobile-controls/);
  assert.match(bracket, /Champion/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /is_tournament_owner/);
  assert.match(migration, /activity_log/);
});
