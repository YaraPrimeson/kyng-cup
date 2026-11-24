import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL } from "@/lib/supabase-public-config";
import { type Sport, visibleSports } from "@/lib/sports";

// Public pages use the anon role even when an organizer is signed in.
const publicDatabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, { accessToken: async () => null });
const albumFields = "id,slug,name,sport,location,starts_at,ends_at,gallery:tournament_galleries!inner(cover_photo_id)";
export const archivePageSize = 10;
export const photoPageSize = 36;

export type PublicAlbum = {
  id: string;
  slug: string;
  name: string;
  sport: Sport;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  gallery: { cover_photo_id: string };
};

function publicAlbums(sport?: Sport) {
  return publicDatabase.from("tournaments").select(albumFields).eq("status", "completed")
    .in("sport", sport ? [sport] : visibleSports);
}

export async function getArchive(offset: number, sport?: Sport) {
  const result = await publicAlbums(sport)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false }).range(offset, offset + archivePageSize);
  if (result.error) throw result.error;
  return { albums: (result.data as unknown as PublicAlbum[]).slice(0, archivePageSize), more: result.data.length > archivePageSize };
}

export async function getArchivePhotoCounts(tournamentIds: string[]) {
  if (!tournamentIds.length) return {} as Record<string, number>;
  const result = await publicDatabase.rpc("public_gallery_photo_counts", { p_tournament_ids: tournamentIds });
  if (result.error) throw result.error;
  const rows = result.data as { tournament_id: string; photo_count: number }[];
  return Object.fromEntries(rows.map(row => [row.tournament_id, row.photo_count]));
}

export async function getAlbum(slug: string) {
  const result = await publicAlbums().eq("slug", slug).maybeSingle();
  if (result.error) throw result.error;
  return result.data as unknown as PublicAlbum | null;
}

export async function hasPublicAlbum(tournamentId: string) {
  const result = await publicAlbums().eq("id", tournamentId).maybeSingle();
  return Boolean(result.data);
}

export function galleryAlbumHref(slug: string, basePath: string) {
  return `${basePath}/gallery/?${new URLSearchParams({ tournament: slug })}`;
}

export async function getAlbumPhotos(tournamentId: string, offset: number) {
  const result = await publicDatabase.from("tournament_gallery_photos").select("id", { count: "exact" })
    .eq("tournament_id", tournamentId).eq("state", "visible").order("sort_order").order("id")
    .range(offset, offset + photoPageSize - 1);
  if (result.error) throw result.error;
  return { ids: result.data.map(photo => photo.id as string), count: result.count ?? 0 };
}

export async function getPublicPhotoUrls(photoIds: string[], variant: "thumb" | "web", signal?: AbortSignal) {
  if (!photoIds.length) return {} as Record<string, string>;
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gallery-photo-urls`, {
    method: "POST",
    headers: { apikey: SUPABASE_PUBLIC_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ photoIds, variant }),
    signal,
  });
  if (!response.ok) throw new Error("Could not load gallery images.");
  return ((await response.json()) as { urls: Record<string, string> }).urls;
}
