import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../supabase/migrations/20261029184937_link_player_registrations.sql", import.meta.url);

test("registration ownership is assigned by the database, not by supplied email or client payload", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /add column submitted_by uuid references auth\.users\(id\) on delete set null/i);
  assert.match(sql, /new\.submitted_by\s*:=\s*case\s+when \(select player_private\.is_verified_user\(\)\) then \(select auth\.uid\(\)\) else null end/i);
  assert.match(sql, /before insert on public\.tournament_registrations/i);
  assert.match(sql, /assign_registration_owner\(\)[\s\S]*?security definer set search_path = ''/i, "anonymous inserts need a private definer to check verification");
  assert.match(sql, /for select to authenticated\s+using\s*\(submitted_by\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(sql, /grant insert\s*\(\s*submitted_by|player_one_email\s*=\s*auth\.email\(\)/i);
});
