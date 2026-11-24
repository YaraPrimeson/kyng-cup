import { supabase } from "@/lib/supabase";

type Variant = "thumb" | "web";
type Ticket = { ready: true } | { urls: Record<Variant, string>; headers: Record<string, string> };

async function fileId(tournamentId: string, file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const bytes = new TextEncoder().encode(tournamentId + ":" +
    Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join(""));
  const id = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 16);
  id[6] = (id[6] & 0x0f) | 0x80;
  id[8] = (id[8] & 0x3f) | 0x80;
  const hex = Array.from(id, byte => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function encodePhoto(image: ImageBitmap, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the image.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob?.type === "image/webp") resolve(blob);
      else reject(new Error("This browser could not create a WebP image."));
    }, "image/webp", quality);
  });
}

async function uploadAction<T>(photoId: string, action: "prepare" | "finish") {
  const result = await supabase.functions.invoke<T>("gallery-photo-upload", { body: { photoId, action } });
  if (result.error) {
    const response = result.error.context;
    const details = response instanceof Response ? await response.json().catch(() => null) : null;
    throw new Error(details?.error ?? "Could not reach the photo upload service.");
  }
  return result.data;
}

export async function uploadGalleryPhoto(tournamentId: string, file: File, sortOrder: number, signal: AbortSignal) {
  const id = await fileId(tournamentId, file);
  signal.throwIfAborted();

  // Re-selecting an identical file also resumes its existing photo after a reload.
  const reservation = await supabase.from("tournament_gallery_photos").upsert(
    { id, tournament_id: tournamentId, sort_order: sortOrder },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (reservation.error) throw reservation.error;
  const filename = Array.from(file.name).slice(0, 255).join("");
  if (filename) {
    const metadata = await supabase.from("tournament_gallery_photo_filenames").upsert(
      { photo_id: id, tournament_id: tournamentId, filename },
      { onConflict: "photo_id", ignoreDuplicates: true },
    );
    if (metadata.error) throw metadata.error;
  }
  signal.throwIfAborted();
  const ticket = await uploadAction<Ticket>(id, "prepare");
  if (!ticket) throw new Error("The upload service did not return a ticket.");
  if ("ready" in ticket) return;
  signal.throwIfAborted();

  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new Error("Could not open this image. Select a readable JPEG, PNG or WebP file."); }
  try {
    const thumb = await encodePhoto(image, 480, 0.78);
    const web = await encodePhoto(image, 2048, 0.86);
    const results = await Promise.allSettled([put("thumb", thumb), put("web", web)]);
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
  } finally {
    image.close();
  }
  signal.throwIfAborted();
  await uploadAction(id, "finish");

  async function put(variant: Variant, blob: Blob) {
    if (!ticket || !("urls" in ticket)) throw new Error("Missing upload URLs.");
    const response = await fetch(ticket.urls[variant], {
      method: "PUT", headers: ticket.headers, body: blob,
      signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
    // A retry can find one of the two immutable objects already uploaded.
    if (!response.ok && response.status !== 412) throw new Error(`Could not upload the ${variant} image (${response.status}).`);
  }
}
