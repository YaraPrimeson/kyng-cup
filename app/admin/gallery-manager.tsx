"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminUI } from "./admin-ui";
import { deleteGalleryPhoto, uploadGalleryPhoto } from "./gallery-upload";
import { extractGalleryZip, galleryFileTypes, galleryZipBusy, galleryZipHint, isGalleryZip } from "./gallery-zip";

type Album = { cover_photo_id: string | null; published_at: string | null };
type Photo = { filename?: string; id: string; sort_order: number; state: "pending" | "visible" | "hidden" | "deleting" };
type Job = { file: File; order: number; state: "waiting" | "uploading" | "done" | "failed"; error?: string };
const pageSize = 24;
const galleryZipEnabled = false;
const photoMime = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorText(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Could not update the photo album.";
}

export default function GalleryManager({ tournamentId, tournamentSlug, active, onBusyChange }: {
  tournamentId: string;
  tournamentSlug: string;
  active: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t, confirm } = useAdminUI();
  const [filter, setFilter] = useState<"all" | Photo["state"]>("all");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const previewScroll = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [album, setAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const upload = useRef<AbortController | null>(null);
  const operation = useRef(false);
  useEffect(() => () => upload.current?.abort(), []);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

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
    const filenames = new Map<string, string>();
    for (let offset = 0; result.data; offset += 500) {
      const names = await supabase.from("tournament_gallery_photo_filenames").select("photo_id,filename")
        .eq("tournament_id", tournamentId).order("photo_id").range(offset, offset + 499);
      if (names.error) break;
      for (const entry of names.data) filenames.set(entry.photo_id, entry.filename);
      if (names.data.length < 500) break;
    }
    setAlbum(result.data);
    setPhotos(rows.map(photo => ({ ...photo, filename: filenames.get(photo.id) })));
    setLoaded(true);
  }, [tournamentId]);

  useEffect(() => {
    if (active && !loaded) void load().catch(reason => setError(errorText(reason)));
  }, [active, loaded, load]);

  const search = query.trim().toLowerCase();
  const matching = useMemo(() => photos.filter(photo =>
    (filter === "all" || photo.state === filter) &&
    (!search || photo.filename?.toLowerCase().includes(search) || String(photo.sort_order + 1).includes(search)),
  ), [filter, photos, search]);
  const lastPage = Math.max(0, Math.ceil(matching.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const displayed = useMemo(() => matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize), [matching, currentPage]);

  useEffect(() => {
    if (!active) return;
    const photoIds = displayed.filter(photo => photo.state === "visible" || photo.state === "hidden").map(photo => photo.id);
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
  }, [active, displayed]);

  async function save(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError("");
    try { await action(); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { operation.current = false; setBusy(false); }
  }

  function patchJob(order: number, patch: Partial<Job>) {
    setJobs(current => current.map(job => job.order === order ? { ...job, ...patch } : job));
  }

  async function uploadJobs(batch: Job[]) {
    if (operation.current) return;
    operation.current = true;
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
      operation.current = false;
      setBusy(false);
    }
  }

  async function selectFiles(selection: FileList) {
    if (operation.current || !loaded) return;
    const files = Array.from(selection);
    const archives = galleryZipEnabled ? files.filter(isGalleryZip) : [];
    if (archives.length > 1) {
      setError("Choose one ZIP archive at a time.");
      return;
    }
    const archive = archives[0];
    if (archive) {
      const controller = new AbortController();
      upload.current = controller;
      operation.current = true;
      setBusy(true);
      setExtracting(true);
      setError("");
      try {
        const extracted = await extractGalleryZip(archive, controller.signal);
        if (controller.signal.aborted) return;
        files.splice(files.indexOf(archive), 1, ...extracted);
      } catch (reason) {
        if (!controller.signal.aborted) setError(errorText(reason));
        return;
      } finally {
        upload.current = null;
        operation.current = false;
        setExtracting(false);
        setBusy(false);
      }
    }
    const start = Math.max(
      photos.reduce((max, photo) => Math.max(max, photo.sort_order), -1),
      jobs.reduce((max, job) => Math.max(max, job.order), -1),
    ) + 1;
    const batch: Job[] = Array.from(files, (file, index) => {
      const supported = !isGalleryZip(file) && (photoMime.has(file.type) || (!file.type && /\.(?:jpe?g|png|webp)$/i.test(file.name)));
      return { file, order: start + index, state: supported ? "waiting" : "failed",
        error: supported ? undefined : "Choose JPG, PNG or WebP images." };
    });
    if (!batch.length) return;
    setError("");
    setJobs(current => [...current.filter(job => job.state === "failed"), ...batch]);
    const accepted = batch.filter(job => job.state === "waiting");
    if (accepted.length) void uploadJobs(accepted);
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

  async function removePhoto(photo: Photo) {
    if (busy || operation.current) return;
    if (photo.state !== "deleting") {
      const approved = await confirm({
        title: "Delete photo?",
        detail: photo.id === album?.cover_photo_id
          ? "This permanently deletes the photo. The next visible photo becomes the cover. If no visible photos remain, the album becomes a draft."
          : "This permanently deletes the photo from the album and storage.",
        action: "Delete photo",
        danger: true,
      });
      if (!approved) return;
    }
    await save(async () => {
      try {
        await deleteGalleryPhoto(tournamentId, photo.id);
      } catch (reason) {
        await load().catch(() => {});
        throw reason;
      }
    });
  }

  const failed = jobs.filter(job => job.state === "failed");
  const retryable = failed.filter(job => job.error !== "Choose JPG, PNG or WebP images.");
  const done = jobs.filter(job => job.state === "done").length;
  const settled = done + failed.length;
  const ready = photos.filter(photo => photo.state === "visible").length;
  const hidden = photos.filter(photo => photo.state === "hidden").length;
  const cover = photos.find(photo => photo.id === album?.cover_photo_id);
  const published = Boolean(album?.published_at);
  const publishHint = published ? null : ready === 0 ? "Upload at least one photo to publish." :
    cover?.state !== "visible" ? "Choose a visible photo as the cover to publish." : null;

  function goToPage(next: number) {
    setPage(next);
    if (previewScroll.current) previewScroll.current.scrollTop = 0;
  }

  async function changePublication() {
    if (busy || publishHint) return;
    const approved = await confirm({
      title: published ? "Unpublish album?" : "Publish album?",
      detail: published ? "The album will be removed from the public gallery. Your photos will be kept." : "The cover and visible photos will appear in the public gallery.",
      action: published ? "Unpublish album" : "Publish album",
    });
    if (approved) await updateAlbum({ published_at: published ? null : new Date().toISOString() });
  }

  return <section className="admin-gallery">
    <div className="admin-workspace-section-heading"><h2>{t("Photo album")}</h2></div>
    <div className="admin-gallery-body">
      {error && <p role="alert">{t(error)} {!loaded && <button type="button" className="admin-button" onClick={() => { setError(""); void load().catch(reason => setError(errorText(reason))); }}>{t("Retry")}</button>}</p>}
      {!loaded && !error && <p role="status">{t("Loading album…")}</p>}
      {loaded && <>
        <label className="admin-gallery-upload" data-dragging={dragging} data-disabled={busy}
          onDragOver={event => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = busy ? "none" : "copy";
            if (!busy) setDragging(true);
          }}
          onDragLeave={event => { if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={event => { event.preventDefault(); setDragging(false); void selectFiles(event.dataTransfer.files); }}>
          <span className="admin-upload-icon" aria-hidden="true">↑</span>
          <strong>{t(galleryZipEnabled ? "Drop photos or a ZIP here, or choose files" : "Drop photos here or choose files")}</strong>
          <span>JPG, PNG, WebP</span>
          {galleryZipEnabled && <span>{t(galleryZipHint)}</span>}
          <input className="admin-visually-hidden" aria-label={t(galleryZipEnabled ? "Upload photos or ZIP" : "Upload photos")} type="file" multiple
            accept={galleryZipEnabled ? galleryFileTypes : [...photoMime].join(",")}
            disabled={busy} onChange={event => { if (event.currentTarget.files) void selectFiles(event.currentTarget.files); event.currentTarget.value = ""; }} />
        </label>
        {galleryZipEnabled && extracting && <p role="status">{t(galleryZipBusy)}</p>}
        {jobs.length > 0 && <section className="admin-gallery-progress">
          <h3>{t("Upload queue")}</h3>
          <div className="admin-upload-meter"><progress max={jobs.length} value={settled} aria-label={t("Processed")} />
            <p role="status">{t("Processed")} · {settled} / {jobs.length}</p></div>
          <dl className="admin-upload-counts">{([
            ["Uploaded", done], ["Uploading", jobs.filter(job => job.state === "uploading").length],
            ["Waiting", jobs.filter(job => job.state === "waiting").length], ["Failed", failed.length],
          ] as const).map(([label, count]) => <div key={label} data-failed={label === "Failed" && count > 0}><dt>{t(label)}</dt><dd>{count}</dd></div>)}</dl>
          {!!failed.length && <details><summary>{t("Failed")} · {failed.length}</summary><ul>{failed.map(job =>
            <li key={job.order}>{job.file.name} · {t(job.error ?? "")}</li>)}</ul></details>}
          {!!retryable.length && <div className="admin-action-bar"><button type="button" className="admin-button" disabled={busy} onClick={() => {
            retryable.forEach(job => patchJob(job.order, { state: "waiting", error: undefined }));
            void uploadJobs(retryable);
          }}>{t("Retry failed files")} · {retryable.length}</button></div>}
        </section>}
        <div className="admin-album-status">
          <p><strong>{t(published ? "Published" : "Draft")}</strong> · {photos.length} {t("photos")} · {ready} {t("Visible").toLowerCase()} · {hidden} {t("Hidden").toLowerCase()}</p>
          {publishHint && <small id="gallery-publish-hint">{t(publishHint)}</small>}
        </div>
        {!!photos.length && <div className="admin-form-grid">
          <label className="admin-field"><span>{t("Find a photo")}</span><input type="search" placeholder={t("Filename or photo number")}
            value={query} onChange={event => { setQuery(event.target.value); goToPage(0); }} /></label>
          <label className="admin-field"><span>{t("Visibility filter")}</span><select value={filter} onChange={event => {
            setFilter(event.target.value as typeof filter); goToPage(0);
          }}><option value="all">{t("All photos")}</option><option value="visible">{t("Visible")}</option><option value="hidden">{t("Hidden")}</option><option value="pending">{t("Upload pending")}</option><option value="deleting">{t("Deletion pending")}</option></select></label>
        </div>}
        {previewFailed && <p role="status">{t("Photo previews are temporarily unavailable.")}</p>}
        {!!photos.length && !displayed.length && <p>{t("No matching photos.")}</p>}
        {!!displayed.length && <div className="admin-gallery-scroll" ref={previewScroll}>
          <div className="admin-gallery-grid">{displayed.map(photo => <article key={photo.id} data-state={photo.state}>
            {photo.state !== "deleting" && urls[photo.id] ? <img src={urls[photo.id]} alt="" loading="lazy" /> : <div className="admin-gallery-placeholder" aria-hidden="true" />}
            {photo.id === album?.cover_photo_id && <span className="admin-gallery-cover">{t("Cover")}</span>}
            <p><strong>{t("Photo")} {photo.sort_order + 1}</strong> · {t(photo.state === "pending" ? "Upload pending" : photo.state === "hidden" ? "Hidden" : photo.state === "deleting" ? "Deletion pending" : "Visible")}</p>
            {photo.filename && <small title={photo.filename}>{photo.filename}</small>}
            <div className="admin-gallery-photo-actions">
              {photo.state === "visible" && photo.id !== album?.cover_photo_id && <button type="button" className="admin-button" disabled={busy}
                onClick={() => void updateAlbum({ cover_photo_id: photo.id })}>{t("Set cover")}</button>}
              {(photo.state === "visible" || photo.state === "hidden") && !(photo.id === album?.cover_photo_id && published) &&
                <button type="button" className="admin-button" disabled={busy} onClick={() => void togglePhoto(photo)}>{t(photo.state === "hidden" ? "Show" : "Hide")}</button>}
              {photo.state !== "pending" && <button type="button" className="admin-button is-danger" disabled={busy}
                onClick={() => void removePhoto(photo)}>{t(photo.state === "deleting" ? "Retry deletion" : "Delete photo")}</button>}
            </div>
          </article>)}</div>
        </div>}
        {matching.length > 0 && <nav aria-label={t("Album pages")} className="admin-gallery-pages">
          <p>{currentPage * pageSize + 1}–{Math.min(matching.length, (currentPage + 1) * pageSize)} {t("of")} {matching.length} {t("photos")}</p>
          <div><button type="button" className="admin-button" disabled={currentPage === 0} onClick={() => goToPage(currentPage - 1)}>{t("Previous")}</button>
            <select aria-label={t("Page")} value={currentPage} onChange={event => goToPage(Number(event.target.value))}>
              {Array.from({ length: lastPage + 1 }, (_, i) => <option key={i} value={i}>{t("Page")} {i + 1} {t("of")} {lastPage + 1}</option>)}
            </select>
            <button type="button" className="admin-button" disabled={currentPage === lastPage} onClick={() => goToPage(currentPage + 1)}>{t("Next")}</button></div>
        </nav>}
        <div className="admin-action-bar">
          {published && <a className="admin-button" href={`../gallery/?tournament=${encodeURIComponent(tournamentSlug)}`} target="_blank" rel="noreferrer">{t("Open album")}</a>}
          <button type="button" className={published ? "admin-button" : "admin-button is-primary"} disabled={busy || Boolean(publishHint)}
            aria-describedby={publishHint ? "gallery-publish-hint" : undefined} onClick={() => void changePublication()}>{t(published ? "Unpublish album" : "Publish album")}</button>
        </div>
      </>}
    </div>
  </section>;
}
