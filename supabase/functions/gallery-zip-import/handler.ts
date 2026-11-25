import { ArchiveError, extractPhotos, readArchive } from "./archive.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function galleryZipImport(isOrganizer: (authorization: string) => Promise<boolean>) {
  function error(message: string, status: number) {
    return Response.json({ error: message }, { status, headers });
  }

  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return error("Method not allowed.", 405);
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return error("Organizer session required.", 401);
    try {
      if (!await isOrganizer(authorization)) return error("Organizer access required.", 403);
      if (request.headers.get("content-type") !== "application/zip") return error("Select a ZIP archive.", 415);
      return new Response(extractPhotos(await readArchive(request)), { headers });
    } catch (reason) {
      if (reason instanceof ArchiveError) return error(reason.message, reason.status);
      return error("ZIP import service unavailable.", 503);
    }
  };
}
