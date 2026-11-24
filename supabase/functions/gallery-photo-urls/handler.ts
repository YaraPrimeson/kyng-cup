export type GalleryPhoto = { id: string; tournament_id: string };
type Variant = "thumb" | "web";

type Dependencies = {
  findPhotos: (ids: string[], authorization: string | null) => Promise<GalleryPhoto[] | null>;
  signPhoto: (photo: GalleryPhoto, variant: Variant) => Promise<string>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const variants = new Set<unknown>(["thumb", "web"]);
const maxPhotos = 50;
export const photoUrlLifetimeSeconds = 120;

export function photoObjectKey(photo: GalleryPhoto, variant: Variant) {
  const file = variant === "thumb" ? "thumb.webp" : "web.webp";
  return `tournaments/${photo.tournament_id}/${photo.id}/${file}`;
}

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

export function galleryPhotoUrls({ findPhotos, signPhoto }: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response(null, { status: 405, headers });

    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.photoIds) || body.photoIds.length < 1 || body.photoIds.length > maxPhotos
      || !body.photoIds.every((id: unknown) => typeof id === "string" && uuid.test(id))
      || !variants.has(body.variant)) {
      return Response.json({ error: "Expected 1–50 photo IDs and a valid variant" }, { status: 400, headers });
    }

    const ids = [...new Set<string>(body.photoIds.map((id: string) => id.toLowerCase()))];
    try {
      const photos = await findPhotos(ids, request.headers.get("authorization"));
      if (!photos) return Response.json({ error: "Invalid session" }, { status: 401, headers });

      const urls = Object.fromEntries(await Promise.all(photos.map(async (photo) => [
        photo.id,
        await signPhoto(photo, body.variant),
      ])));
      return Response.json({ urls, expiresIn: photoUrlLifetimeSeconds }, { headers });
    } catch {
      return Response.json({ error: "Photo service unavailable" }, { status: 503, headers });
    }
  };
}
