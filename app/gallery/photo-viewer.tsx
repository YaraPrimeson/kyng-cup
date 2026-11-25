"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { Language } from "../i18n";
import { getPublicPhotoUrls } from "./public-gallery";

const copy = {
  en: { close: "Close photo", back: "Previous photo", next: "Next photo", download: "Download photo", downloading: "Downloading…", loading: "Loading photo…", error: "This photo could not be loaded.", downloadError: "Could not download this photo. Try again.", moveError: "Could not open this photo. Try again.", retry: "Retry" },
  uk: { close: "Закрити фото", back: "Попереднє фото", next: "Наступне фото", download: "Завантажити фото", downloading: "Завантажуємо…", loading: "Завантажуємо фото…", error: "Не вдалося відкрити це фото.", downloadError: "Не вдалося завантажити фото. Спробуй ще раз.", moveError: "Не вдалося перейти до фото. Спробуй ще раз.", retry: "Спробувати ще раз" },
  de: { close: "Foto schließen", back: "Vorheriges Foto", next: "Nächstes Foto", download: "Foto herunterladen", downloading: "Download läuft…", loading: "Foto wird geladen…", error: "Dieses Foto konnte nicht geladen werden.", downloadError: "Das Foto konnte nicht heruntergeladen werden. Versuche es erneut.", moveError: "Das Foto konnte nicht geöffnet werden. Versuche es erneut.", retry: "Erneut versuchen" },
  ru: { close: "Закрыть фото", back: "Предыдущее фото", next: "Следующее фото", download: "Скачать фото", downloading: "Скачиваем…", loading: "Загружаем фото…", error: "Не удалось открыть это фото.", downloadError: "Не удалось скачать фото. Попробуй ещё раз.", moveError: "Не удалось перейти к фото. Попробуй ещё раз.", retry: "Попробовать ещё раз" },
} as const;

type Props = {
  photoId: string;
  previewUrl?: string;
  neighborIds: string;
  label: string;
  position: number;
  total: number;
  slug: string;
  language: Language;
  opener: HTMLButtonElement | null;
  moveLoading: boolean;
  moveFailed: boolean;
  onClose: () => void;
  onMove: (step: -1 | 1) => void;
};

const viewerIconPaths = {
  previous: "M15 6l-6 6 6 6",
  next: "M9 6l6 6-6 6",
  close: "M7 7l10 10M17 7 7 17",
  download: "M12 4v11m-4-4 4 4 4-4M5 16v4h14v-4",
};

function ViewerIcon({ name }: { name: keyof typeof viewerIconPaths }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={viewerIconPaths[name]} />
  </svg>;
}

async function fullPhotoUrl(id: string, signal: AbortSignal) {
  const urls = await getPublicPhotoUrls([id], "web", signal);
  if (!urls[id]) throw new Error("Photo not available");
  return urls[id];
}

type PreparedPhoto = { image: HTMLImageElement; url: string };

function usePreparedPhotos(photoId: string, neighborIds: string) {
  const [prepared, setPrepared] = useState<Record<string, PreparedPhoto>>({});
  const cache = useRef(new Map<string, PreparedPhoto>());
  const pending = useRef(new Set<string>());
  const wanted = useRef(new Set<string>());
  const session = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    session.current = controller;
    const photos = cache.current;
    const requests = pending.current;
    return () => {
      controller.abort();
      for (const { url } of photos.values()) URL.revokeObjectURL(url);
      photos.clear();
      requests.clear();
    };
  }, []);

  useEffect(() => {
    const controller = session.current;
    if (!controller) return;
    const ids = neighborIds.split(",").filter(Boolean);
    const keep = new Set([photoId, ...ids]);
    wanted.current = keep;
    const photos = cache.current;
    const requests = pending.current;
    for (const [id, photo] of photos) {
      if (keep.has(id)) continue;
      URL.revokeObjectURL(photo.url);
      photos.delete(id);
    }
    setPrepared(Object.fromEntries(photos));
    const missing = ids.filter(id => !photos.has(id) && !requests.has(id));
    if (!missing.length) return;

    for (const id of missing) requests.add(id);
    void getPublicPhotoUrls(missing, "web", controller.signal).then(async urls => {
      await Promise.all(missing.map(async id => {
        if (controller.signal.aborted || !wanted.current.has(id) || !urls[id]) return;
        const image = new window.Image();
        if (!image.decode) return;
        let objectUrl: string | undefined;
        try {
          const response = await fetch(urls[id], { signal: controller.signal });
          if (!response.ok) return;
          const blob = await response.blob();
          if (!blob.size || controller.signal.aborted || !wanted.current.has(id)) return;
          objectUrl = URL.createObjectURL(blob);
          image.src = objectUrl;
          await image.decode();
          if (controller.signal.aborted || !wanted.current.has(id)) return;
          photos.set(id, { image, url: objectUrl });
          objectUrl = undefined;
        } catch {
          return;
        } finally {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
        setPrepared(Object.fromEntries(photos));
      }));
    }, () => {}).finally(() => {
      if (!controller.signal.aborted) for (const id of missing) requests.delete(id);
    });
  }, [photoId, neighborIds]);

  return prepared[photoId]?.url;
}

type Slide = { fromId: string; step: -1 | 1; source?: string };

function FullPhoto({ id, label, previewUrl, preparedUrl, slide, text }: {
  id: string; label: string; previewUrl?: string; preparedUrl?: string; slide: Slide | null; text: typeof copy[Language];
}) {
  const initialPreparedUrl = useRef(preparedUrl);
  const [url, setUrl] = useState(preparedUrl ?? "");
  const [loaded, setLoaded] = useState(Boolean(preparedUrl));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [previewState, setPreviewState] = useState<"loading" | "ready" | "error">("loading");
  const showPreview = Boolean(previewUrl && previewState !== "error" && !loaded);
  const ready = loaded || (showPreview && previewState === "ready");
  const previous = slide?.source;

  useEffect(() => {
    if (initialPreparedUrl.current && attempt === 0) return;
    const controller = new AbortController();
    void fullPhotoUrl(id, controller.signal).then(value => {
      if (!controller.signal.aborted) setUrl(value);
    }, () => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [id, attempt]);

  return <>
    <div className="gallery-viewer-slides" data-direction={slide?.step} data-ready={ready}>
      {previous && <img className="gallery-viewer-outgoing" src={previous} alt="" draggable={false} />}
      <div className="gallery-viewer-frame">
        {showPreview && <img className="gallery-viewer-preview" src={previewUrl} alt="" draggable={false}
          data-loading={previewState !== "ready"} onLoad={() => setPreviewState("ready")} onError={() => setPreviewState("error")} />}
        {url && !failed && <img className="gallery-viewer-image" src={url} alt={label} draggable={false}
          data-loading={!loaded} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      </div>
    </div>
    {failed ? <div className="gallery-viewer-message">
      <p role="alert">{text.error}</p>
      <button type="button" className="gallery-viewer-button" onClick={() => {
        setFailed(false);
        setLoaded(false);
        setUrl("");
        setAttempt(value => value + 1);
      }}>{text.retry}</button>
    </div> : !loaded && <p className={slide ? "gallery-visually-hidden" : ready ? "gallery-viewer-message gallery-viewer-loading" : "gallery-viewer-message"} role="status">{text.loading}</p>}
  </>;
}

export default function PhotoViewer({ photoId, previewUrl, neighborIds, label, position, total, slug, language, opener, moveLoading, moveFailed, onClose, onMove }: Props) {
  const text = copy[language];
  const preparedUrl = usePreparedPhotos(photoId, neighborIds);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState<Slide | null>(null);
  const canMove = total > 1 && !moveLoading;
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const download = useRef<AbortController | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadErrorPhoto, setDownloadErrorPhoto] = useState<string | null>(null);
  const downloadError = downloadErrorPhoto === photoId;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    dialog.showModal();
    body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      download.current?.abort();
      dialog.close();
      body.style.overflow = previousOverflow;
      opener?.focus({ preventScroll: true });
    };
  }, [opener]);

  function move(step: -1 | 1) {
    if (!canMove) return;
    const frame = stageRef.current;
    const visible = frame?.querySelector<HTMLImageElement>(".gallery-viewer-frame img[data-loading='false']")
      ?? frame?.querySelector<HTMLImageElement>(".gallery-viewer-outgoing");
    const source = visible?.currentSrc || visible?.src;
    setSlide({ fromId: photoId, step, source });
    onMove(step);
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (!event.isPrimary) { gesture.current = null; return; }
    if ((event.target as Element).closest("button")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || event.pointerId !== start.id) return;
    gesture.current = null;
    const horizontal = event.clientX - start.x;
    const vertical = event.clientY - start.y;
    if (Math.abs(horizontal) >= 42 && Math.abs(horizontal) > Math.abs(vertical) * 1.4) move(horizontal < 0 ? 1 : -1);
  }

  async function downloadPhoto() {
    if (download.current) return;
    const controller = new AbortController();
    download.current = controller;
    setDownloading(true);
    setDownloadErrorPhoto(null);
    try {
      const url = await fullPhotoUrl(photoId, controller.signal);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      if (!blob.size) throw new Error("Empty photo");
      controller.signal.throwIfAborted();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `kyng-cup-${slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 64) || "gallery"}-${photoId.slice(0, 8)}.webp`;
      dialogRef.current?.append(anchor);
      try { anchor.click(); }
      finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch {
      if (!controller.signal.aborted) setDownloadErrorPhoto(photoId);
    } finally {
      download.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return <dialog className="gallery-viewer" ref={dialogRef} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }
    }}>
    <header className="gallery-viewer-toolbar">
      <button type="button" ref={closeRef} className="gallery-viewer-button gallery-viewer-icon"
        aria-label={text.close} onClick={onClose}><ViewerIcon name="close" /></button>
      <p className="gallery-viewer-counter" aria-live="polite">{position} / {total}</p>
      <button type="button" className="gallery-viewer-button gallery-viewer-icon gallery-viewer-download"
        disabled={downloading} aria-label={downloading ? text.downloading : text.download}
        title={text.download} onClick={() => void downloadPhoto()}>
        <ViewerIcon name="download" />
      </button>
    </header>
    <div className="gallery-viewer-main">
      <button type="button" className="gallery-viewer-button gallery-viewer-icon gallery-viewer-previous"
        aria-label={text.back} disabled={!canMove} onClick={() => move(-1)}><ViewerIcon name="previous" /></button>
      <div className="gallery-viewer-stage" ref={stageRef} onPointerDown={startSwipe} onPointerUp={endSwipe}
        onPointerCancel={() => { gesture.current = null; }}>
        <FullPhoto key={photoId} id={photoId} label={label} previewUrl={previewUrl} preparedUrl={preparedUrl} slide={slide?.fromId !== photoId ? slide : null} text={text} />
      </div>
      <button type="button" className="gallery-viewer-button gallery-viewer-icon gallery-viewer-next"
        aria-label={text.next} disabled={!canMove} onClick={() => move(1)}><ViewerIcon name="next" /></button>
    </div>
    {moveLoading && <p className="gallery-visually-hidden" role="status">{text.loading}</p>}
    {(downloadError || moveFailed) && <p className="gallery-viewer-feedback" role="alert">
      {downloadError ? text.downloadError : text.moveError}
    </p>}
  </dialog>;
}
