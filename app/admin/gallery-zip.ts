import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, supabase } from "@/lib/supabase";

export const galleryFileTypes = "image/jpeg,image/png,image/webp,.zip,application/zip";
export const galleryZipHint = "ZIP: up to 50 photos and 24 MB per archive";
export const galleryZipBusy = "Checking and extracting photos from ZIP…";
export const isGalleryZip = (file: File) => /\.zip$/i.test(file.name);

export async function extractGalleryZip(file: File, signal: AbortSignal): Promise<File[]> {
  if (file.size > 24 * 1024 * 1024) throw new Error("ZIP files must be 24 MB or smaller.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Organizer session required.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gallery-zip-import`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/zip",
    },
    body: file,
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error ?? "ZIP import service unavailable.");
  }
  const parts = (await response.formData()).getAll("photo");
  const photos = parts.filter((part): part is File => part instanceof File);
  if (!photos.length) throw new Error("The ZIP does not contain any supported photos.");
  return photos;
}
