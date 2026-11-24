import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  galleryPhotoUrls,
  photoObjectKey,
} from "../supabase/functions/gallery-photo-urls/handler.ts";

const padel = "e1000000-1000-4000-a000-000000000001";
const tennis = "e1000000-1000-4000-a000-000000000002";
const firstPhoto = "f1000000-1000-4000-a000-000000000001";
const secondPhoto = "f1000000-1000-4000-a000-000000000002";

test("gallery visibility, 300 photos, and cover integrity for padel and tennis", async () => {
  const db = new PGlite();
  const counts = async () => (await db.query(`
    select (select count(*)::int from tournament_galleries) as galleries,
           (select count(*)::int from tournament_gallery_photos) as photos
  `)).rows[0];

  const photoCounts = async () => (await db.query(`
    select * from public_gallery_photo_counts(array['${padel}'::uuid, '${tennis}'::uuid])
    order by tournament_id
  `)).rows;

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create table public.tournaments (id uuid primary key, sport text not null, status text not null);
      grant select on public.tournaments to anon, authenticated;
      create function public.is_global_admin() returns boolean language sql stable
        as $$ select coalesce(current_setting('test.organizer', true) = 'yes', false) $$;
      revoke all on function public.is_global_admin() from public;
      grant execute on function public.is_global_admin() to authenticated;
      insert into public.tournaments values
        ('${padel}', 'padel', 'completed'), ('${tennis}', 'tennis', 'completed');
    `);
    await db.exec(await readFile(new URL(
      "../supabase/migrations/20261124100621_tournament_photo_gallery.sql", import.meta.url,
    ), "utf8"));

    await db.exec("set role authenticated");
    await assert.rejects(db.exec(`insert into tournament_galleries(tournament_id) values ('${padel}')`),
      { code: "42501" });

    await db.exec(`
      set test.organizer = 'yes';
      insert into tournament_galleries(tournament_id) values ('${padel}'), ('${tennis}');
      insert into tournament_gallery_photos (id, tournament_id) values
        ('${firstPhoto}', '${padel}'), ('${secondPhoto}', '${tennis}');
      insert into tournament_gallery_photos (tournament_id, sort_order)
        select '${padel}', place from generate_series(1, 299) place;
    `);
    assert.deepEqual(await counts(), { galleries: 2, photos: 301 });
    await assert.rejects(db.exec(`update tournament_galleries set cover_photo_id = '${secondPhoto}'
      where tournament_id = '${padel}'`), { code: "23503" });
    await db.exec(`update tournament_galleries set cover_photo_id = '${firstPhoto}'
      where tournament_id = '${padel}'`);
    await assert.rejects(db.exec(`update tournament_galleries set published_at = now()
      where tournament_id = '${padel}'`), { code: "23503" });

    await db.exec("set role anon");
    assert.deepEqual(await counts(), { galleries: 0, photos: 0 });

    await db.exec("set role authenticated");
    await assert.rejects(db.exec(`update tournament_gallery_photos set state = 'visible'`), { code: "42501" });
    await db.exec(`
      set role service_role;
      update tournament_gallery_photos set state = 'visible' where sort_order < 299;
      set role authenticated;
      update tournament_galleries set published_at = now(),
        cover_photo_id = case when tournament_id = '${padel}' then '${firstPhoto}'::uuid else '${secondPhoto}'::uuid end;
    `);
    await assert.rejects(db.exec(`update tournament_gallery_photos set state = 'hidden'
      where id = '${firstPhoto}'`), { code: "23503" });
    await db.exec(`update tournament_gallery_photos set state = 'hidden'
      where tournament_id = '${padel}' and sort_order = 1`);
    await db.exec("set role anon");
    assert.deepEqual(await counts(), { galleries: 2, photos: 299 });
    assert.deepEqual(await photoCounts(), [
      { tournament_id: padel, photo_count: 298 },
      { tournament_id: tennis, photo_count: 1 },
    ]);

    await db.exec(`
      set role authenticated;
      set test.organizer = 'no';
      update tournament_galleries set published_at = null;
    `);
    assert.deepEqual(await counts(), { galleries: 2, photos: 299 });

    await db.exec(`
      set test.organizer = 'yes';
      update tournament_galleries set published_at = null where tournament_id = '${padel}';
      update tournament_gallery_photos set state = 'hidden' where id = '${firstPhoto}';
      set role anon;
    `);
    assert.deepEqual(await counts(), { galleries: 1, photos: 1 });
    assert.deepEqual(await photoCounts(), [{ tournament_id: tennis, photo_count: 1 }]);
    await db.exec(`
      reset role;
      update tournaments set status = 'draft' where id = '${tennis}';
      set role anon;
    `);
    assert.deepEqual(await counts(), { galleries: 0, photos: 0 });
    await db.exec(`reset role; delete from tournaments where id = '${tennis}'`);
    assert.deepEqual(await counts(), { galleries: 1, photos: 300 });
  } finally {
    await db.close();
  }
});

test("photo signer signs only photos returned by the caller's visibility query", async () => {
  const signed = [];
  const handle = galleryPhotoUrls({
    async findPhotos(ids, authorization) {
      assert.deepEqual(ids, [firstPhoto, secondPhoto]);
      if (authorization === "Bearer invalid") return null;
      assert.equal(authorization, null);
      return [{ id: firstPhoto, tournament_id: padel }];
    },
    async signPhoto(photo, variant) {
      signed.push(photo.id);
      return photoObjectKey(photo, variant);
    },
  });
  const request = (body, authorization) => new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify(body),
    headers: authorization ? { Authorization: authorization } : {},
  });
  const response = await handle(request({ photoIds: [firstPhoto.toUpperCase(), firstPhoto, secondPhoto], variant: "thumb" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    urls: { [firstPhoto]: `tournaments/${padel}/${firstPhoto}/thumb.webp` },
    expiresIn: 120,
  });
  assert.equal((await handle(request({ photoIds: [firstPhoto, secondPhoto], variant: "web" }, "Bearer invalid"))).status, 401);
  assert.equal((await handle(request({ photoIds: Array(51).fill(firstPhoto), variant: "web" }))).status, 400);
  assert.equal((await handle(request({ photoIds: [firstPhoto], variant: "../other" }))).status, 400);
  assert.deepEqual(signed, [firstPhoto]);
});

test("upload requires organizer access and both variants before making a photo ready", async () => {
  const { galleryPhotoUpload } = await import("../supabase/functions/gallery-photo-upload/handler.ts");
  const photo = { id: firstPhoto, tournament_id: padel, state: "pending" };
  const objects = new Map();
  const signed = [];
  let finalized = 0;
  const handle = galleryPhotoUpload({
    async isOrganizer(authorization) { return authorization === "Bearer organizer"; },
    async findPhoto(id) { return id === photo.id ? photo : null; },
    async signPut(authorizedPhoto, variant) {
      signed.push(variant);
      return photoObjectKey(authorizedPhoto, variant);
    },
    async head(_, variant) { return objects.get(variant) ?? null; },
    async finalize() { finalized += 1; photo.state = "visible"; },
  });
  const call = (action, authorization = "Bearer organizer", photoId = firstPhoto) => handle(
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: authorization },
      body: JSON.stringify({ action, photoId }),
    }),
  );
  assert.equal((await call("prepare", "Bearer player")).status, 403);
  assert.equal((await call("prepare", "Bearer organizer", secondPhoto)).status, 404);
  const prepared = await (await call("prepare")).json();
  assert.deepEqual(signed, ["thumb", "web"]);
  assert.equal(prepared.headers["If-None-Match"], "*");
  assert.equal(prepared.headers["Cache-Control"], "private, no-store");
  objects.set("thumb", new Headers({ "Content-Type": "image/webp", "Content-Length": "256" }));
  assert.equal((await call("finish")).status, 409);
  objects.set("web", new Headers({ "Content-Type": "image/jpeg", "Content-Length": "256" }));
  assert.equal((await call("finish")).status, 409);
  assert.equal(finalized, 0);
  objects.set("web", new Headers({ "Content-Type": "image/webp", "Content-Length": "256" }));
  assert.deepEqual(await (await call("finish")).json(), { ready: true });
  assert.deepEqual(await (await call("prepare")).json(), { ready: true });
  assert.equal(finalized, 1);
});
