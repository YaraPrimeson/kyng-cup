/// <reference lib="deno.ns" />

import { galleryZipImport } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(galleryZipImport(async authorization => {
  if (!url || !anonKey) throw new Error("Database configuration missing");
  const response = await fetch(new URL("/rest/v1/rpc/is_global_admin", url), {
    method: "POST",
    headers: { apikey: anonKey, Authorization: authorization, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) throw new Error("Organizer lookup failed");
  return await response.json() === true;
}));
