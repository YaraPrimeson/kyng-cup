import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { galleryPhotoUpload } from "../supabase/functions/gallery-photo-upload/handler.ts";

const tournamentId = "e1000000-1000-4000-a000-000000000001";
const coverId = "f1000000-1000-4000-a000-000000000001";
const nextId = "f1000000-1000-4000-a000-000000000002";
const pendingId = "f1000000-1000-4000-a000-000000000003";
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");

test("deletion immediately hides the photo, updates the cover and supports safe retries", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.tournaments (id uuid primary key, status text not null);
      create function public.is_global_admin() returns boolean language sql stable as $$ select true $$;
      grant select on public.tournaments to anon, authenticated;
      insert into public.tournaments values ('${tournamentId}', 'completed');
    `);
    await db.exec(await migration("20261124100621_tournament_photo_gallery"));
    await db.exec(await migration("20261125085442_delete_gallery_photo"));
    await db.exec(`
      insert into tournament_galleries (tournament_id) values ('${tournamentId}');
      insert into tournament_gallery_photos (id, tournament_id, state, sort_order) values
        ('${coverId}', '${tournamentId}', 'visible', 0),
        ('${nextId}', '${tournamentId}', 'visible', 1),
        ('${pendingId}', '${tournamentId}', 'pending', 2);
      update tournament_galleries set cover_photo_id = '${coverId}', published_at = now();
    `);
    const claim = async id => (await db.query(
      "select begin_gallery_photo_delete($1::uuid, $2::uuid) as result", [tournamentId, id],
    )).rows[0].result;
    const album = async () => (await db.query("select cover_photo_id, published_at is not null as published from tournament_galleries")).rows[0];

    await db.exec("set role authenticated");
    await assert.rejects(claim(coverId), { code: "42501" });
    await assert.rejects(db.exec(`update tournament_gallery_photos set state = 'deleting' where id = '${coverId}'`), { code: "42501" });
    await db.exec("set role service_role");
    assert.deepEqual(await claim(pendingId), { status: "pending" });
    const first = await claim(coverId);
    assert.equal(first.status, "claimed");
    assert.ok(first.lease);
    assert.deepEqual(await claim(coverId), { status: "busy" });
    assert.deepEqual(await album(), { cover_photo_id: nextId, published: true });

    await db.exec("set role anon");
    assert.deepEqual((await db.query("select id from tournament_gallery_photos")).rows, [{ id: nextId }]);
    await db.exec("set role authenticated");
    await assert.rejects(db.exec(`update tournament_gallery_photos set state = 'visible' where id = '${coverId}'`), { code: "42501" });
    await assert.rejects(db.exec(`update tournament_galleries set cover_photo_id = '${coverId}'`), { code: "23514" });
    await db.exec("set role service_role");
    await db.exec(`update tournament_gallery_photos set delete_lease_until = null where id = '${coverId}'`);
    assert.equal((await claim(coverId)).status, "claimed");
    await db.exec(`delete from tournament_gallery_photos where id = '${coverId}' and state = 'deleting'`);
    assert.deepEqual(await claim(coverId), { status: "missing" });
    assert.equal((await claim(nextId)).status, "claimed");
    assert.deepEqual(await album(), { cover_photo_id: null, published: false });
  } finally {
    await db.close();
  }
});

test("the upload service authorizes deletion, removes both variants and retries storage failures", async () => {
  const photo = { id: coverId, tournament_id: tournamentId };
  const operations = [];
  let failWeb = true;
  const handler = galleryPhotoUpload({
    isOrganizer: async authorization => authorization === "Bearer organizer",
    claimDelete: async target => { assert.deepEqual(target, photo); return { status: "claimed", lease: "lease" }; },
    deleteObject: async (target, variant) => {
      assert.deepEqual(target, photo);
      operations.push(variant);
      if (failWeb && variant === "web") throw new Error("Storage unavailable");
    },
    releaseDelete: async (_photo, lease) => operations.push(`release:${lease}`),
    finishDelete: async (_photo, lease) => operations.push(`finish:${lease}`),
  });
  const request = role => new Request("https://example.test/functions/v1/gallery-photo-upload", {
    method: "POST",
    headers: { authorization: `Bearer ${role}` },
    body: JSON.stringify({ photoId: coverId.toUpperCase(), tournamentId: tournamentId.toUpperCase(), action: "delete" }),
  });

  assert.equal((await handler(request("player"))).status, 403);
  assert.deepEqual(operations, []);
  assert.equal((await handler(request("organizer"))).status, 503);
  assert.deepEqual(operations, ["thumb", "web", "release:lease"]);
  failWeb = false;
  assert.deepEqual(await (await handler(request("organizer"))).json(), { deleted: true });
  assert.deepEqual(operations.slice(3), ["thumb", "web", "finish:lease"]);
});
