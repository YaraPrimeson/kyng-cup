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
  assert.match(html, /More than a game\. A standard\./);
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

test("server-renders the four-language pair registration form", async () => {
  const response = await render("/register");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Your next match starts here/);
  assert.match(html, /Player 1/);
  assert.match(html, /Player 2/);
  assert.match(html, /Submit pair application/);
});

test("ships live bracket and protected tournament controls", async () => {
  const [admin, bracket, home, upcoming, i18n, styles, sportPage, footer, exporter, register, migration, sportMigration, dateMigration, registrationMigration] = await Promise.all([
    readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/bracket/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/upcoming-tournament.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/i18n.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/sport-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/site-footer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/export-pages.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/register/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260814190000_full_tournament_management.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260818120000_add_tournament_sport.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260818122000_add_tournament_end_date.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260820071715_create_tournament_registrations.sql", import.meta.url), "utf8"),
  ]);

  assert.match(admin, /create_tournament_with_bracket/);
  assert.match(admin, /reset_match_result/);
  assert.doesNotMatch(admin, /ManualDraw/);
  assert.match(admin, /Published · show on sport page/);
  assert.match(admin, /Update live score/);
  assert.match(admin, /setSelectedId\(null\); setShowCreate\(true\)/);
  assert.match(admin, /showCreate && !selectedId && canCreateTournament/);
  assert.match(admin, /if \(tournamentId\) setShowCreate\(false\)/);
  assert.match(admin, /admin-create-actions/);
  assert.match(admin, /ends_at/);
  assert.match(admin, /matchesByRound/);
  assert.match(admin, /admin-round-group/);
  assert.match(admin, /Team &amp; roles/);
  assert.doesNotMatch(admin, /Activity log/);
  assert.match(bracket, /postgres_changes/);
  assert.match(bracket, /match-connector/);
  assert.match(bracket, /round-mobile-controls/);
  assert.match(bracket, /Champion/);
  assert.match(bracket, /\["published", "live"\]/);
  assert.doesNotMatch(bracket, /archive/);
  assert.doesNotMatch(bracket, /text\.matches/);
  assert.match(bracket, /\["Quarterfinal", "Semifinal", "Final"\]/);
  assert.doesNotMatch(bracket, /Quarterfinals|Semifinals/);
  assert.match(home, /key=\{language\}/);
  assert.match(home, /More than a game\. A standard\./);
  assert.match(home, /High-level play\. Uncompromising organization\. An experience worth repeating\./);
  assert.match(home, /Competition creates the moment\. Community gives it meaning\./);
  assert.match(home, /Thoughtful formats\. Attention to detail\. Strong players\./);
  assert.doesNotMatch(home, /One community\. Two ways to play\.|honest competition/);
  assert.match(upcoming, /t\("participate"\)/);
  assert.match(upcoming, /starts_at,ends_at/);
  assert.match(upcoming, /upcoming-date-point/);
  assert.match(upcoming, /const isSingleDay = Boolean/);
  assert.match(upcoming, /is-single-day/);
  assert.match(upcoming, /timeZone: "Europe\/Vienna"/);
  assert.doesNotMatch(upcoming, /bracket_size/);
  assert.match(i18n, /localStorage\.setItem\(languageStorageKey/);
  assert.match(i18n, /Request a place/);
  assert.match(i18n, /"Semifinal": \{ uk: "Півфінал", de: "Halbfinale", ru: "Полуфинал" \}/);
  assert.match(i18n, /addEventListener\("storage"/);
  assert.doesNotMatch(styles, /\.language-select::after/);
  assert.match(styles, /kyng-universal-hero-v3\.png/);
  assert.match(sportPage, /preview-connector/);
  assert.match(sportPage, /home-bracket-actions/);
  assert.match(sportPage, /Strong competition\. A community worth returning to\./);
  assert.match(sportPage, /Fast game\. Shared rhythm\./);
  assert.match(sportPage, /The match is only part of the experience\./);
  assert.match(sportPage, /Strong players\. Real competition\. Mutual respect\./);
  assert.match(sportPage, /Every detail considered\. Nothing left to chance\./);
  assert.match(sportPage, /Connections that begin on the court and continue beyond it\./);
  assert.match(sportPage, /principle-ball/);
  assert.doesNotMatch(sportPage, /principle-card|principle-number|100%/);
  assert.doesNotMatch(sportPage, /fair judging|Social by design|Closer court\. Bigger energy\./);
  assert.doesNotMatch(sportPage, /is-highlighted|className="preview-match is-live"/);
  assert.match(footer, /aria-label="Telegram"/);
  assert.match(footer, /aria-label="Instagram"/);
  assert.doesNotMatch(footer, /mailto:|t\("contact"\)/);
  assert.doesNotMatch(footer, /basePath}\/tennis|basePath}\/padel/);
  assert.doesNotMatch(exporter, /if\s*\(route === "\/"\)/);
  assert.doesNotMatch(exporter, /replace\(\/<script/);
  assert.match(exporter, /"\/register\/"/);
  assert.match(register, /const prefix = number === 1 \? "player_one" : "player_two"/);
  assert.match(register, /name=\{`\$\{prefix\}_level`\}/);
  assert.match(register, /partner_consent/);
  assert.match(register, /rules_privacy_accepted/);
  assert.match(register, /marketing_opt_in/);
  assert.match(register, /registration_status/);
  assert.match(register, /en: \{/);
  assert.match(register, /uk: \{/);
  assert.match(register, /de: \{/);
  assert.match(register, /ru: \{/);
  assert.doesNotMatch(register, /from\("tournament_registrations"\)/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /is_tournament_owner/);
  assert.match(migration, /activity_log/);
  assert.match(sportMigration, /tournaments_sport_check/);
  assert.match(sportMigration, /p_sport text/);
  assert.match(dateMigration, /add column if not exists ends_at timestamptz/);
  assert.match(dateMigration, /ends_at >= starts_at/);
  assert.match(registrationMigration, /create table public\.tournament_registrations/);
  assert.match(registrationMigration, /alter table public\.tournament_registrations enable row level security/);
  assert.match(registrationMigration, /Public submits registrations for available tournaments/);
  assert.match(registrationMigration, /Tournament admins read registrations/);
  assert.match(registrationMigration, /tournament_registrations_pair_emails_unique/);
  assert.match(registrationMigration, /grant insert \(/);
  assert.doesNotMatch(registrationMigration, /grant select on public\.tournament_registrations to anon/);
  assert.doesNotMatch(registrationMigration, /security definer/);
});
