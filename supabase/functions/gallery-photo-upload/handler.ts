import { type GalleryPhoto } from "../gallery-photo-urls/handler.ts";

export type PhotoState = "pending" | "visible" | "hidden" | "deleting";
type UploadPhoto = GalleryPhoto & { state: PhotoState };
export type DeleteClaim = { status: "missing" | "pending" | "busy" } | { status: "claimed"; lease: string };
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
  claimDelete: (photo: GalleryPhoto) => Promise<DeleteClaim>;
  deleteObject: (photo: GalleryPhoto, variant: UploadVariant) => Promise<void>;
  finishDelete: (photo: GalleryPhoto, lease: string) => Promise<void>;
  releaseDelete: (photo: GalleryPhoto, lease: string) => Promise<void>;
};

export function galleryPhotoUpload(deps: Dependencies) {
  function reply(body: object, status = 200) { return Response.json(body, { status, headers }); }

  async function removePhoto(photo: GalleryPhoto) {
    const claim = await deps.claimDelete(photo);
    if (claim.status === "missing") return reply({ deleted: true });
    if (claim.status === "pending") return reply({ error: "Wait for the photo upload to finish before deleting it." }, 409);
    if (claim.status !== "claimed") return reply({ error: "Photo deletion is already in progress. Try again shortly." }, 409);

    try {
      const results = await Promise.allSettled(variants.map(variant => deps.deleteObject(photo, variant)));
      if (results.some(result => result.status === "rejected")) throw new Error("R2 deletion failed");
      await deps.finishDelete(photo, claim.lease);
      return reply({ deleted: true });
    } catch {
      await deps.releaseDelete(photo, claim.lease).catch(() => {});
      return reply({ error: "Photo deletion could not finish. Try again." }, 503);
    }
  }

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return reply({ error: "Organizer session required" }, 401);
    const body = await request.json().catch(() => null);
    if (typeof body?.photoId !== "string" || !uuid.test(body.photoId)
      || (body.action !== "prepare" && body.action !== "finish" && body.action !== "delete")
      || (body.action === "delete" && (typeof body.tournamentId !== "string" || !uuid.test(body.tournamentId)))) {
      return reply({ error: "Invalid upload request" }, 400);
    }

    try {
      if (!await deps.isOrganizer(authorization)) return reply({ error: "Organizer access required" }, 403);
      if (body.action === "delete") {
        return await removePhoto({
          id: body.photoId.toLowerCase(), tournament_id: body.tournamentId.toLowerCase(),
        });
      }
      const photo = await deps.findPhoto(body.photoId, authorization);
      if (!photo) return reply({ error: "Photo does not exist" }, 404);
      if (photo.state === "deleting") return reply({ error: "Finish deleting this photo before uploading it again." }, 409);
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
