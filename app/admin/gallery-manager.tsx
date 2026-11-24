"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadGalleryPhoto } from "./gallery-upload";

type Album = { cover_photo_id: string | null; published_at: string | null };
type Photo = { id: string; sort_order: number; state: "pending" | "visible" | "hidden" };
type Job = { file: File; order: number; state: "waiting" | "uploading" | "done" | "failed"; error?: string };
const pageSize = 36;

function errorText(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Could not update the photo album.";
}

export default function GalleryManager({ tournamentId, completed }: { tournamentId: string; completed: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => () => upload.current?.abort(), []);

  const load = useCallback(async () => {
    const result = await supabase.from("tournament_galleries")
      .select("cover_photo_id,published_at").eq("tournament_id", tournamentId).maybeSingle();
    if (result.error) throw result.error;
    const rows: Photo[] = [];
    if (result.data) {
      for (let offset = 0; ; offset += 500) {
        const batch = await supabase.from("tournament_gallery_photos").select("id,sort_order,state")
          .eq("tournament_id", tournamentId).order("sort_order").order("id").range(offset, offset + 499);
        if (batch.error) throw batch.error;
        rows.push(...batch.data as Photo[]);
        if (batch.data.length < 500) break;
      }
    }
    setAlbum(result.data);
    setPhotos(rows);
    setLoaded(true);
  }, [tournamentId]);

  useEffect(() => {
    if (open && !loaded) void load().catch(reason => setError(errorText(reason)));
  }, [open, loaded, load]);

  useEffect(() => {
    if (!open || !photos.length) return;
    const photoIds = photos.slice(page * pageSize, (page + 1) * pageSize)
      .filter(photo => photo.state !== "pending").map(photo => photo.id);
    if (!photoIds.length) return;
    let ignore = false;
    void supabase.functions.invoke<{ urls: Record<string, string> }>("gallery-photo-urls", {
      body: { photoIds, variant: "thumb" },
    }).then(result => {
      if (ignore) return;
      setUrls(result.data?.urls ?? {});
      setPreviewFailed(Boolean(result.error));
    });
    return () => { ignore = true; };
  }, [open, photos, page]);

  async function save(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  function patchJob(order: number, patch: Partial<Job>) {
    setJobs(current => current.map(job => job.order === order ? { ...job, ...patch } : job));
  }

  async function uploadJobs(batch: Job[]) {
    const controller = new AbortController();
    upload.current = controller;
    const pending = [...batch];
    setBusy(true);
    setError("");
    try {
      const result = await supabase.from("tournament_galleries").upsert(
        { tournament_id: tournamentId }, { onConflict: "tournament_id", ignoreDuplicates: true },
      );
      if (result.error) throw result.error;
      async function worker() {
        while (!controller.signal.aborted) {
          const job = pending.shift();
          if (!job) return;
          patchJob(job.order, { state: "uploading", error: undefined });
          try {
            await uploadGalleryPhoto(tournamentId, job.file, job.order, controller.signal);
            patchJob(job.order, { state: "done" });
          } catch (reason) {
            patchJob(job.order, { state: "failed", error: errorText(reason) });
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, batch.length) }, worker));
      if (!controller.signal.aborted) await load();
    } catch (reason) {
      pending.forEach(job => patchJob(job.order, { state: "failed", error: errorText(reason) }));
      setError(errorText(reason));
    } finally {
      upload.current = null;
      setBusy(false);
    }
  }

  function selectFiles(files: FileList) {
    const start = Math.max(-1, ...photos.map(photo => photo.sort_order), ...jobs.map(job => job.order)) + 1;
    const batch: Job[] = Array.from(files, (file, index) => ({ file, order: start + index, state: "waiting" }));
    if (!batch.length) return;
    setJobs(current => [...current.filter(job => job.state === "failed"), ...batch]);
    void uploadJobs(batch);
  }

  function updateAlbum(patch: Partial<Album>) {
    return save(async () => {
      const result = await supabase.from("tournament_galleries").update(patch)
        .eq("tournament_id", tournamentId).select("tournament_id").single();
      if (result.error) throw result.error;
    });
  }

  function togglePhoto(photo: Photo) {
    return save(async () => {
      const result = await supabase.from("tournament_gallery_photos")
        .update({ state: photo.state === "hidden" ? "visible" : "hidden" })
        .eq("tournament_id", tournamentId).eq("id", photo.id).select("id").single();
      if (result.error) throw result.error;
    });
  }

  const failed = jobs.filter(job => job.state === "failed");
  const settled = jobs.filter(job => job.state === "done" || job.state === "failed").length;
  const ready = photos.filter(photo => photo.state === "visible").length;
  const cover = photos.find(photo => photo.id === album?.cover_photo_id);
  const lastPage = Math.max(0, Math.ceil(photos.length / pageSize) - 1);

  return <details className="admin-collapsible admin-gallery" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><div><h2>Photo album</h2></div><p>Upload tournament photos, choose a cover and publish.</p></summary>
    <div className="admin-collapsible-content admin-gallery-body">
      {error && <p role="alert">{error} {!loaded && <button type="button" onClick={() => { setError(""); void load().catch(reason => setError(errorText(reason))); }}>Retry</button>}</p>}
      {!loaded && !error && <p role="status">Loading album…</p>}
      {loaded && <>
        <div className="admin-gallery-toolbar">
          <label>Upload photos <input aria-label="Upload photos" type="file" multiple accept="image/jpeg,image/png,image/webp"
            disabled={busy} onChange={event => { if (event.currentTarget.files) selectFiles(event.currentTarget.files); event.currentTarget.value = ""; }} /></label>
          <p>{album?.published_at ? "Published" : "Draft"} · {ready} visible photo{ready === 1 ? "" : "s"}</p>
          <button type="button" disabled={busy || (!album?.published_at && (!completed || cover?.state !== "visible"))}
            onClick={() => void updateAlbum({ published_at: album?.published_at ? null : new Date().toISOString() })}>
            {album?.published_at ? "Unpublish album" : "Publish album"}
          </button>
        </div>
        {!album?.published_at && !completed && <p>Complete the tournament before publishing its album.</p>}
        {!album?.published_at && completed && ready > 0 && cover?.state !== "visible" && <p>Choose a visible photo as the cover to publish.</p>}
        {jobs.length > 0 && <div className="admin-gallery-progress">
          <progress max={jobs.length} value={settled} aria-label="Files processed" />
          <p role="status">{settled} / {jobs.length} processed · {failed.length} failed</p>
          {failed.length > 0 && <>
            <button type="button" disabled={busy} onClick={() => {
              failed.forEach(job => patchJob(job.order, { state: "waiting", error: undefined }));
              void uploadJobs(failed);
            }}>Retry failed files</button>
            <details><summary>Failed files ({failed.length})</summary><ul>{failed.map(job =>
              <li key={job.order}>{job.file.name} — {job.error}</li>)}</ul></details>
          </>}
        </div>}
        {previewFailed && <p role="status">Photo previews are temporarily unavailable.</p>}
        {photos.length > 0 && <div className="admin-gallery-grid">{photos.slice(page * pageSize, (page + 1) * pageSize).map(photo => <article key={photo.id}>
          {urls[photo.id] ? <img src={urls[photo.id]} alt="" loading="lazy" /> : <div className="admin-gallery-placeholder" aria-hidden="true" />}
          <p>Photo {photo.sort_order + 1} · {photo.id === album?.cover_photo_id ? "Cover" : photo.state === "pending" ? "Upload pending" : photo.state === "hidden" ? "Hidden" : "Visible"}</p>
          <div className="admin-gallery-photo-actions">
            {photo.state === "visible" && photo.id !== album?.cover_photo_id && <button type="button" disabled={busy}
              onClick={() => void updateAlbum({ cover_photo_id: photo.id })}>Set cover</button>}
            {photo.state !== "pending" && !(photo.id === album?.cover_photo_id && album.published_at) &&
              <button type="button" disabled={busy} onClick={() => void togglePhoto(photo)}>{photo.state === "hidden" ? "Show" : "Hide"}</button>}
          </div>
        </article>)}</div>}
        {lastPage > 0 && <nav aria-label="Album pages" className="admin-gallery-pages">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page + 1} / {lastPage + 1}</span>
          <button type="button" disabled={page === lastPage} onClick={() => setPage(page + 1)}>Next</button>
        </nav>}
      </>}
    </div>
  </details>;
}
