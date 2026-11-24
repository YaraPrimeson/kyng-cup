import { type GalleryPhoto } from "../gallery-photo-urls/handler.ts";

export type PhotoState = "pending" | "visible" | "hidden";
type UploadPhoto = GalleryPhoto & { state: PhotoState };
export type UploadVariant = "thumb" | "web";

export const uploadHeaders = { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "If-None-Match": "*" };
const variants = ["thumb", "web"] as const;
const maxBytes = { thumb: 512 * 1024, web: 5 * 1024 * 1024 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

type Dependencies = {
  isOrganizer: (authorization: string) => Promise<boolean>;
  findPhoto: (id: string, authorization: string) => Promise<UploadPhoto | null>;
  signPut: (photo: UploadPhoto, variant: UploadVariant) => Promise<string>;
  head: (photo: UploadPhoto, variant: UploadVariant) => Promise<Headers | null>;
  finalize: (photo: UploadPhoto) => Promise<void>;
};

export function galleryPhotoUpload(deps: Dependencies) {
  function reply(body: object, status = 200) { return Response.json(body, { status, headers }); }

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Organizer session required" }, 401);
    const body = await request.json().catch(() => null);
    if (typeof body?.photoId !== "string" || !uuid.test(body.photoId)
      || (body.action !== "prepare" && body.action !== "finish")) {
      return reply({ error: "Invalid upload request" }, 400);
    }

    try {
      if (!await deps.isOrganizer(authorization)) return reply({ error: "Organizer access required" }, 403);
      const photo = await deps.findPhoto(body.photoId, authorization);
      if (!photo) return reply({ error: "Photo does not exist" }, 404);
      if (photo.state !== "pending") return reply({ ready: true });
      if (body.action === "prepare") {
        const [thumb, web] = await Promise.all(variants.map(variant => deps.signPut(photo, variant)));
        return reply({ urls: { thumb, web }, headers: uploadHeaders });
      }

      const objects = await Promise.all(variants.map(variant => deps.head(photo, variant)));
      const complete = variants.every((variant, index) => {
        const object = objects[index];
        const size = Number(object?.get("Content-Length"));
        return object?.get("Content-Type") === "image/webp" && size > 0 && size <= maxBytes[variant];
      });
      if (!complete) return reply({ error: "Both WebP files must be uploaded before finishing" }, 409);
      await deps.finalize(photo);
      return reply({ ready: true });
    } catch {
      return reply({ error: "Gallery upload service unavailable" }, 503);
    }
  };
}
