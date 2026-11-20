import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { calendarEvent } from "../lib/tournament-calendar.ts";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("player schedule, private notices, repeat registration and seasonal ranking", async () => {
  const database = new PGlite();
  try {
    await database.exec(await read("./fixtures/player-history-schema.sql"));
    await database.exec(await read("../supabase/migrations/20261030120000_player_match_history.sql"));
    await database.exec(await read("../supabase/migrations/20261120171909_tournament_player_workflows.sql"));
    await database.exec(await read("./tournament-player-workflows.sql"));
  } finally { await database.close(); }
});

test("calendar export writes UTC and escapes and folds event text", () => {
  const calendar = calendarEvent({
    id: "group-fixture", startsAt: "2026-11-21T13:30:00+01:00",
    summary: "Київ".repeat(30) + ", A;B\nCourt", location: "Vienna\\Court 1", link: "https://kyngcup.com/bracket/",
  });
  assert.match(calendar, /UID:group-fixture@kyngcup\.com\r\n/);
  assert.match(calendar, /DTSTART:20261121T123000Z\r\n/);
  assert.match(calendar.replaceAll("\r\n ", ""), /\\, A\\;B\\nCourt/);
  assert.match(calendar, /LOCATION:Vienna\\\\Court 1/);
  assert.ok(calendar.split("\r\n").every(line => Buffer.byteLength(line) <= 75));
});
