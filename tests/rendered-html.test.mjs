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
  assert.match(html, /One community\. Two ways to play\./);
  assert.match(html, /Choose your court/);
  assert.match(html, /brand-wordmark/);
  assert.match(html, /favicon\.png/);
  assert.doesNotMatch(html, /ball-mark/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("server-renders distinct tennis and padel pages", async () => {
  const [tennisResponse, padelResponse] = await Promise.all([render("/tennis"), render("/padel")]);
  assert.equal(tennisResponse.status, 200);
  assert.equal(padelResponse.status, 200);
  const [tennis, padel] = await Promise.all([tennisResponse.text(), padelResponse.text()]);
  assert.match(tennis, /More than/);
  assert.match(tennis, /The tennis experience/);
  assert.match(padel, /Built for/);
  assert.match(padel, /The padel experience/);
});

test("ships live bracket and protected tournament controls", async () => {
  const [admin, bracket, home, upcoming, i18n, styles, sportPage, exporter, migration, sportMigration] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/bracket/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/upcoming-tournament.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/i18n.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/sport-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/export-pages.mjs", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814190000_full_tournament_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260818120000_add_tournament_sport.sql", import.meta.url), "utf8"),
  ]);

  assert.match(admin, /create_tournament_with_bracket/);
  assert.match(admin, /reset_match_result/);
  assert.doesNotMatch(admin, /ManualDraw/);
  assert.match(admin, /Published · show on sport page/);
  assert.match(admin, /Update live score/);
  assert.match(admin, /Team &amp; roles/);
  assert.doesNotMatch(admin, /Activity log/);
  assert.match(bracket, /postgres_changes/);
  assert.match(bracket, /match-connector/);
  assert.match(bracket, /round-mobile-controls/);
  assert.match(bracket, /Champion/);
  assert.match(bracket, /\["published", "live"\]/);
  assert.doesNotMatch(bracket, /archive/);
  assert.doesNotMatch(bracket, /text\.matches/);
  assert.match(home, /key=\{language\}/);
  assert.match(home, /honest competition/);
  assert.doesNotMatch(home, /serious competition/);
  assert.match(upcoming, /t\("participate"\)/);
  assert.doesNotMatch(upcoming, /bracket_size/);
  assert.match(i18n, /localStorage\.setItem\(languageStorageKey/);
  assert.match(i18n, /Request a place/);
  assert.match(i18n, /addEventListener\("storage"/);
  assert.doesNotMatch(styles, /\.language-select::after/);
  assert.match(styles, /kyng-universal-hero-v3\.png/);
  assert.match(sportPage, /preview-connector/);
  assert.match(sportPage, /home-bracket-actions/);
  assert.match(sportPage, /Strong competition\. A community worth returning to\./);
  assert.match(sportPage, /Fast game\. Shared rhythm\./);
  assert.doesNotMatch(sportPage, /fair judging|Social by design|Closer court\. Bigger energy\./);
  assert.doesNotMatch(sportPage, /is-highlighted|className="preview-match is-live"/);
  assert.doesNotMatch(exporter, /if\s*\(route === "\/"\)/);
  assert.doesNotMatch(exporter, /replace\(\/<script/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /is_tournament_owner/);
  assert.match(migration, /activity_log/);
  assert.match(sportMigration, /tournaments_sport_check/);
  assert.match(sportMigration, /p_sport text/);
});
