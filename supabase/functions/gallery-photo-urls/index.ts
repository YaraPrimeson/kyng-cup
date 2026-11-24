import { AwsClient } from "npm:aws4fetch@1.0.20";
import {
  type GalleryPhoto,
  galleryPhotoUrls,
  photoObjectKey,
  photoUrlLifetimeSeconds,
} from "./handler.ts";

const account = Deno.env.get("GALLERY_R2_ACCOUNT_ID");
const bucket = Deno.env.get("GALLERY_R2_BUCKET");
const accessKeyId = Deno.env.get("GALLERY_R2_ACCESS_KEY_ID");
const secretAccessKey = Deno.env.get("GALLERY_R2_SECRET_ACCESS_KEY");
const databaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

const storage = account && bucket && accessKeyId && secretAccessKey
  ? new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" })
  : null;

Deno.serve(galleryPhotoUrls({
  async findPhotos(ids, authorization) {
    if (!databaseUrl || !anonKey) throw new Error("Database configuration missing");
    const query = new URL("/rest/v1/tournament_gallery_photos", databaseUrl);
    query.searchParams.set("select", "id,tournament_id");
    query.searchParams.set("id", `in.(${ids.join(",")})`);
    query.searchParams.set("state", "neq.pending");

    // PostgREST validates the session and applies the same RLS as the gallery UI.
    const response = await fetch(query, {
      headers: { apikey: anonKey, Authorization: authorization ?? `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Photo lookup failed");
    return await response.json() as GalleryPhoto[];
  },
  async signPhoto(photo, variant) {
    if (!storage) throw new Error("Gallery bucket configuration missing");
    const url = new URL(`https://${account}.r2.cloudflarestorage.com/${bucket}/${photoObjectKey(photo, variant)}`);
    url.searchParams.set("X-Amz-Expires", String(photoUrlLifetimeSeconds));
    return (await storage.sign(new Request(url), { aws: { signQuery: true } })).url;
  },
}));
