import { crc32, inflateRawSync } from "node:zlib";

export const archiveLimit = 24 * 1024 * 1024;
const expandedLimit = 32 * 1024 * 1024;
const photoLimit = 12 * 1024 * 1024;
const entryLimit = 150;
const photoCountLimit = 50;
const localSignature = 0x04034b50;
const centralSignature = 0x02014b50;
const endSignature = 0x06054b50;
const invalidZip = "The ZIP is damaged or uses an unsupported ZIP format.";

export class ArchiveError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireZip(condition: unknown, message = invalidZip): asserts condition {
  if (!condition) throw new ArchiveError(message);
}

function jpegDimensions(data: Uint8Array, view: DataView) {
  for (let offset = 2; offset + 4 < data.length;) {
    if (data[offset++] !== 255) break;
    while (data[offset] === 255) offset++;
    if (offset + 3 >= data.length) break;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > data.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) break;
      return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
    }
    offset += length;
  }
  return [];
}

function webpDimensions(data: Uint8Array, view: DataView) {
  const chunk = view.getUint32(12);
  if (chunk === 0x56503858 && data.length >= 30 && view.getUint32(16, true) === 10) {
    requireZip(!(data[20] & 2), "ZIP import supports still photos only.");
    return [1 + data[24] + data[25] * 256 + data[26] * 65536, 1 + data[27] + data[28] * 256 + data[29] * 65536];
  }
  if (chunk === 0x56503820 && data.length >= 30 && data[23] === 157 && data[24] === 1 && data[25] === 42) {
    return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
  }
  if (chunk === 0x5650384c && data.length >= 25 && data[20] === 47) {
    const bits = view.getUint32(21, true);
    return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
  }
  return [];
}

function photoFormat(name: string, data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let type: string;
  let dimensions: number[];
  if (/\.jpe?g$/i.test(name) && data[0] === 255 && data[1] === 216 && data[2] === 255) {
    type = "image/jpeg";
    dimensions = jpegDimensions(data, view);
  } else if (/\.png$/i.test(name) && data.length >= 33 && view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452) {
    type = "image/png";
    dimensions = [view.getUint32(16), view.getUint32(20)];
  } else if (/\.webp$/i.test(name) && data.length >= 20 && view.getUint32(0) === 0x52494646 &&
    view.getUint32(8) === 0x57454250 && view.getUint32(4, true) === data.length - 8) {
    type = "image/webp";
    dimensions = webpDimensions(data, view);
  } else {
    throw new ArchiveError("A ZIP entry does not match its photo format.");
  }
  const [width, height] = dimensions;
  requireZip(width > 0 && height > 0, "A ZIP entry does not match its photo format.");
  requireZip(width <= 12000 && height <= 12000 && width * height <= 50000000, "A photo in the ZIP exceeds the image dimension limit.");
  return type;
}

export async function readArchive(request: Request) {
  if (Number(request.headers.get("content-length")) > archiveLimit) {
    throw new ArchiveError("ZIP files must be 24 MB or smaller.", 413);
  }
  if (!request.body) throw new ArchiveError(invalidZip);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > archiveLimit) {
        void reader.cancel().catch(() => {});
        throw new ArchiveError("ZIP files must be 24 MB or smaller.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const archive = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  return archive;
}

export function extractPhotos(archive: Uint8Array): FormData {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const short = (offset: number) => view.getUint16(offset, true);
  const word = (offset: number) => view.getUint32(offset, true);

  // Read the classic ZIP central directory first so all declared sizes are checked before inflation.
  let end = archive.length - 22;
  const earliest = Math.max(0, end - 65535);
  while (end >= earliest && (word(end) !== endSignature || end + 22 + short(end + 20) !== archive.length)) end--;
  requireZip(end >= earliest && short(end + 4) === 0 && short(end + 6) === 0);
  const count = short(end + 10);
  const directory = word(end + 16);
  requireZip(count === short(end + 8) && directory + word(end + 12) === end);
  requireZip(count <= entryLimit, "The ZIP contains too many entries.");

  const decode = new TextDecoder("utf-8", { fatal: true });
  const entries: { name: string; metadata: boolean; local: number; start: number; stop: number; size: number; method: number; checksum: number }[] = [];
  const paths = new Set<string>();
  let cursor = directory;
  let expanded = 0;
  let photos = 0;

  for (let i = 0; i < count; i++) {
    requireZip(cursor + 46 <= end && word(cursor) === centralSignature);
    const flags = short(cursor + 8);
    const method = short(cursor + 10);
    const checksum = word(cursor + 16);
    const packed = word(cursor + 20);
    const size = word(cursor + 24);
    const nameSize = short(cursor + 28);
    const local = word(cursor + 42);
    const nameStart = cursor + 46;
    const next = nameStart + nameSize + short(cursor + 30) + short(cursor + 32);
    requireZip(next <= end && nameSize > 0 && nameSize <= 1024 && short(cursor + 34) === 0);
    requireZip((flags & ~0x80e) === 0 && (method === 0 || method === 8), "Use an unencrypted ZIP with standard compression.");
    const nameBytes = archive.subarray(nameStart, nameStart + nameSize);
    let path: string;
    try { path = decode.decode(nameBytes); } catch { throw new ArchiveError(invalidZip); }

    const folder = path.endsWith("/");
    const parts = (folder ? path.slice(0, -1) : path).split("/");
    const name = parts.at(-1)!;
    requireZip(!/[\\:\u0000-\u001f\u007f]/.test(path) &&
      parts.every(part => part !== "" && part !== "." && part !== "..") && !paths.has(path), "The ZIP contains an unsafe or duplicate path.");
    paths.add(path);
    const mode = (word(cursor + 38) >>> 16) & 0xf000;
    requireZip(mode === 0 || mode === (folder ? 0x4000 : 0x8000), "The ZIP contains a link or a special file.");
    const metadata = folder || name === ".DS_Store" || (parts[0] === "__MACOSX" && name.startsWith("._"));
    if (!metadata) {
      requireZip(/\.(?:jpe?g|png|webp)$/i.test(name), "ZIP files may only contain JPG, PNG or WebP photos.");
      requireZip(++photos <= photoCountLimit, "ZIP files may contain up to 50 photos.");
      requireZip(size > 0);
    }

    expanded += size;
    requireZip(size <= photoLimit && expanded <= expandedLimit, "The ZIP expands beyond the allowed size (12 MB per photo, 32 MB total).");
    requireZip(!folder || size === 0);
    requireZip(local + 30 <= directory && word(local) === localSignature &&
      short(local + 6) === flags && short(local + 8) === method && short(local + 26) === nameSize);
    if (!(flags & 8)) {
      requireZip(word(local + 14) === checksum && word(local + 18) === packed && word(local + 22) === size);
    }
    const start = local + 30 + nameSize + short(local + 28);
    const stop = start + packed;
    requireZip(stop <= directory && nameBytes.every((byte, index) => byte === archive[local + 30 + index]));
    requireZip(method !== 0 || packed === size);
    entries.push({ name, metadata, local, start, stop, size, method, checksum });
    cursor = next;
  }
  requireZip(cursor === end && photos > 0, photos ? invalidZip : "The ZIP does not contain any supported photos.");
  const byOffset = [...entries].sort((first, second) => first.local - second.local);
  requireZip(byOffset.every((entry, index) => index === 0 || byOffset[index - 1].stop <= entry.local));

  const result = new FormData();
  for (const entry of entries) {
    if (entry.metadata) continue;
    const compressed = archive.subarray(entry.start, entry.stop);
    let data: Uint8Array;
    try {
      data = entry.method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: entry.size });
    } catch { throw new ArchiveError(invalidZip); }
    requireZip(data.length === entry.size && crc32(data) === entry.checksum);
    const type = photoFormat(entry.name, data);
    result.append("photo", new Blob([data as Uint8Array<ArrayBuffer>], { type }), entry.name);
  }
  return result;
}
