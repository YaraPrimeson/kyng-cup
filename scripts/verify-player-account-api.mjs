// Uses disposable, confirmed QA accounts provisioned separately. Never real players.
// Credentials are read from an ignored local JSON file and never logged.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLIC_KEY } from "../lib/supabase.ts";

const { users } = JSON.parse(await readFile(process.argv[2], "utf8"));
assert.equal(users.length, 2);
assert.ok(users.every(user => /^kyng-qa-[0-9a-f-]+@example\.invalid$/.test(user.email)));
const clients = Array.from({ length: 3 }, () => createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
const [first, secondDevice, other] = clients;
const uploads = [];
function ok(result) { assert.equal(result.error?.message ?? null, null); return result.data; }
try {
  for (const [client, user] of [[first, users[0]], [secondDevice, users[0]], [other, users[1]]]) {
    const data = ok(await client.auth.signInWithPassword({ email: user.email, password: user.password }));
    assert.equal(data.user.id, user.id);
  }
  const profile = ok(await first.from("player_profiles").insert({ auth_user_id: users[0].id, display_name: "Проверка профиля" }).select().single());
  const remote = ok(await secondDevice.from("player_profiles").select().single());
  assert.equal(remote.player_id, profile.player_id);
  const updated = ok(await secondDevice.from("player_profiles").update({ display_name: "Проверка синхронизации" }).eq("version", remote.version).select().single());
  assert.equal(updated.player_id, profile.player_id); assert.equal(updated.version, remote.version + 1);
  assert.deepEqual(ok(await first.from("player_profiles").update({ display_name: "Устаревшая форма" }).eq("version", profile.version).select()), []);
  assert.deepEqual(ok(await other.from("player_profiles").select()), []);
  assert.deepEqual(ok(await other.from("player_profiles").update({ display_name: "Чужой профиль" }).eq("auth_user_id", users[0].id).select()), []);
  const takeover = await first.from("player_profiles").update({ auth_user_id: users[1].id }).eq("player_id", profile.player_id);
  assert.ok(takeover.error);
  assert.equal(ok(await first.rpc("is_global_admin")), false);
  assert.deepEqual(ok(await first.from("tournament_registrations").select("id")), []);
  const path = `${users[0].id}/${crypto.randomUUID()}.jpg`;
  const image = new Blob([Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAr/2Q==", "base64")], { type: "image/jpeg" });
  ok(await first.storage.from("player-avatars").upload(path, image, { contentType: "image/jpeg" })); uploads.push(path);
  const withPhoto = ok(await first.from("player_profiles").update({ avatar_path: path }).eq("version", updated.version).select().single());
  const downloaded = ok(await secondDevice.storage.from("player-avatars").download(path));
  assert.equal(downloaded.size, image.size);
  assert.ok((await other.storage.from("player-avatars").download(path)).error);
  assert.ok((await other.storage.from("player-avatars").upload(`${users[0].id}/${crypto.randomUUID()}.jpg`, image, { contentType: "image/jpeg" })).error);
  assert.ok((await other.from("player_profiles").insert({ auth_user_id: users[0].id, display_name: "Подмена" })).error);
  const deleted = ok(await secondDevice.from("player_profiles").update({ avatar_path: null }).eq("version", withPhoto.version).select().single());
  assert.equal(deleted.player_id, profile.player_id);
  console.log("PASS: real Auth sign-in, stable player ID, two-device profile sync, optimistic locking, private avatars, ownership checks, no organiser access.");
} finally {
  if (uploads.length) await first.storage.from("player-avatars").remove(uploads);
  for (const client of clients) await client.auth.signOut({ scope: "local" });
}
