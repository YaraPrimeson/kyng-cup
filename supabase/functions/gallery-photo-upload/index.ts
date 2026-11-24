import { AwsClient } from "npm:aws4fetch@1.0.20";
import { photoObjectKey } from "../gallery-photo-urls/handler.ts";
import { galleryPhotoUpload, uploadHeaders } from "./handler.ts";

const account = Deno.env.get("GALLERY_R2_ACCOUNT_ID");
const bucket = Deno.env.get("GALLERY_R2_BUCKET");
const accessKeyId = Deno.env.get("GALLERY_R2_UPLOAD_ACCESS_KEY_ID");
const secretAccessKey = Deno.env.get("GALLERY_R2_UPLOAD_SECRET_ACCESS_KEY");
const databaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const storage = account && bucket && accessKeyId && secretAccessKey
  ? new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" })
  : null;

function database(path: string, authorization: string, init?: RequestInit, key = anonKey) {
  if (!databaseUrl || !key) throw new Error("Database configuration missing");
  return fetch(new URL(`/rest/v1/${path}`, databaseUrl), {
    ...init,
    headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8000),
  });
}

function objectUrl(key: string) {
  return new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${key}`);
}

Deno.serve(galleryPhotoUpload({
  async isOrganizer(authorization) {
    const response = await database("rpc/is_global_admin", authorization, { method: "POST", body: "{}" });
    if (response.status === 401 || response.status === 403) return false;
    if (!response.ok) throw new Error("Organizer lookup failed");
    return await response.json() === true;
  },
  async findPhoto(id, authorization) {
    const response = await database(`tournament_gallery_photos?id=eq.${id}&select=id,tournament_id,state`, authorization);
    if (!response.ok) throw new Error("Photo lookup failed");
    return (await response.json())[0] ?? null;
  },
  async signPut(photo, variant) {
    if (!storage) throw new Error("R2 upload configuration missing");
    const url = objectUrl(photoObjectKey(photo, variant));
    url.searchParams.set("X-Amz-Expires", "300");
    const request = new Request(url, { method: "PUT", headers: uploadHeaders });
    return (await storage.sign(request, { aws: { signQuery: true, allHeaders: true } })).url;
  },
  async head(photo, variant) {
    if (!storage) throw new Error("R2 upload configuration missing");
    const response = await storage.fetch(objectUrl(photoObjectKey(photo, variant)), {
      method: "HEAD", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("R2 inspection failed");
    return response.headers;
  },
  async finalize(photo) {
    if (!serviceKey) throw new Error("Database service configuration missing");
    const response = await database(
      `tournament_gallery_photos?id=eq.${photo.id}&tournament_id=eq.${photo.tournament_id}&state=eq.pending`,
      `Bearer ${serviceKey}`, { method: "PATCH", body: '{"state":"visible"}' }, serviceKey,
    );
    if (!response.ok) throw new Error("Photo finalization failed");
  },
}));
