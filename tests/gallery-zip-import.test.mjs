import assert from "node:assert/strict";
import test from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { archiveLimit, extractPhotos } from "../supabase/functions/gallery-zip-import/archive.ts";
import { galleryZipImport } from "../supabase/functions/gallery-zip-import/handler.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTtkAAAAASUVORK5CYII=", "base64");

function zip(entries) {
  const records = [];
  const directory = [];
  let offset = 0;
  for (const { path, data = png, method = 8, mode = 0, flags = 0, size = data.length, checksum = crc32(data) } of entries) {
    const name = Buffer.from(path);
    const packed = method === 8 ? deflateRawSync(data) : data;
    const local = Buffer.alloc(30);
    const central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    central.writeUInt32LE(0x02014b50);
    for (const [header, base] of [[local, 6], [central, 8]]) {
      header.writeUInt16LE(flags, base);
      header.writeUInt16LE(method, base + 2);
      header.writeUInt32LE(checksum, base + 8);
      header.writeUInt32LE(packed.length, base + 12);
      header.writeUInt32LE(size, base + 16);
      header.writeUInt16LE(name.length, base + 20);
    }
    central.writeUInt32LE(mode * 65536, 38);
    central.writeUInt32LE(offset, 42);
    records.push(local, name, packed);
    directory.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.reduce((sum, part) => sum + part.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...records, ...directory, end]);
}

test("extracts stored and deflated photos in archive order and ignores Finder metadata", async () => {
  const archive = zip([
    { path: "photos/", data: Buffer.alloc(0), method: 0, mode: 0x41ed },
    { path: "photos/падел.png" },
    { path: "__MACOSX/._падел.png", data: Buffer.from("metadata") },
    { path: "final.PNG", method: 0 },
  ]);
  const files = extractPhotos(archive).getAll("photo");
  assert.deepEqual(files.map(file => [file.name, file.type]), [
    ["падел.png", "image/png"], ["final.PNG", "image/png"],
  ]);
  for (const file of files) assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
});

test("rejects unsupported entries and enforces declared and actual limits", () => {
  const invalid = [
    [{ path: "../photo.png" }, /unsafe/],
    [{ path: "/photo.png" }, /unsafe/],
    [{ path: "photo.png", mode: 0xa1ff }, /link/],
    [{ path: "photo.png", flags: 1 }, /unencrypted/],
    [{ path: "script.svg" }, /only contain/],
    [{ path: "nested.zip" }, /only contain/],
    [{ path: "fake.png", data: Buffer.from("text") }, /photo format/],
    [{ path: "large.png", size: 13 * 1024 * 1024 }, /allowed size/],
    [{ path: "photo.png", size: 1 }, /damaged/],
    [{ path: "photo.png", checksum: 0 }, /damaged/],
  ];
  for (const [entry, message] of invalid) assert.throws(() => extractPhotos(zip([entry])), message);
  assert.throws(() => extractPhotos(zip([{ path: "photo.png" }, { path: "photo.png" }])), /duplicate/);
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(20000, 16);
  assert.throws(() => extractPhotos(zip([{ path: "photo.png", data: oversized }])), /dimension/);
  assert.throws(() => extractPhotos(zip(Array.from({ length: 51 }, (_, i) => ({ path: `${i}.png` })))), /up to 50/);
  assert.throws(() => extractPhotos(Buffer.from("bad")), /damaged/);
});

test("authorizes before reading data and caps both declared and streamed request size", async () => {
  const handle = galleryZipImport(async token => token === "Bearer organizer");
  const endpoint = "https://test.example/functions/v1/gallery-zip-import";
  const headers = { authorization: "Bearer organizer", "Content-Type": "application/zip" };
  const archive = zip([{ path: "photo.png" }]);
  const noSession = new Request(endpoint, { method: "POST", body: archive });
  const player = new Request(endpoint, { method: "POST", body: archive, headers: { authorization: "Bearer player" } });
  assert.equal((await handle(noSession)).status, 401);
  assert.equal((await handle(player)).status, 403);
  assert.equal(player.bodyUsed, false);
  assert.equal((await handle(new Request(endpoint, { method: "POST", body: archive,
    headers: { ...headers, "Content-Length": String(archiveLimit + 1) } }))).status, 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(archiveLimit + 1)); controller.close(); } });
  assert.equal((await handle(new Request(endpoint, { method: "POST", headers, body: stream, duplex: "half" }))).status, 413);
  const response = await handle(new Request(endpoint, { method: "POST", headers, body: archive }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.formData()).get("photo").name, "photo.png");
});
