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
  label: string;
  position: number;
  total: number;
  slug: string;
  language: Language;
  opener: HTMLButtonElement | null;
  hasNext: boolean;
  moveLoading: boolean;
  moveFailed: boolean;
  onClose: () => void;
  onMove: (step: -1 | 1) => void;
};

async function fullPhotoUrl(id: string, signal: AbortSignal) {
  const urls = await getPublicPhotoUrls([id], "web", signal);
  if (!urls[id]) throw new Error("Photo not available");
  return urls[id];
}

function FullPhoto({ id, label, previewUrl, text }: { id: string; label: string; previewUrl?: string; text: typeof copy[Language] }) {
  const [url, setUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);
  const showPreview = Boolean(previewUrl && !previewFailed && !loaded);

  useEffect(() => {
    const controller = new AbortController();
    void fullPhotoUrl(id, controller.signal).then(value => {
      if (!controller.signal.aborted) setUrl(value);
    }, () => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [id, attempt]);

  return <>
    {showPreview && <img className="gallery-viewer-preview" src={previewUrl} alt="" draggable={false}
      onError={() => setPreviewFailed(true)} />}
    {url && !failed && <img className="gallery-viewer-image" src={url} alt={label} draggable={false}
      data-loading={!loaded} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    {failed ? <div className="gallery-viewer-message">
      <p role="alert">{text.error}</p>
      <button type="button" className="gallery-viewer-button" onClick={() => {
        setFailed(false);
        setLoaded(false);
        setUrl("");
        setAttempt(value => value + 1);
      }}>{text.retry}</button>
    </div> : !loaded && <p className={showPreview ? "gallery-viewer-message gallery-viewer-loading" : "gallery-viewer-message"} role="status">{text.loading}</p>}
  </>;
}

export default function PhotoViewer({ photoId, previewUrl, label, position, total, slug, language, opener, hasNext, moveLoading, moveFailed, onClose, onMove }: Props) {
  const text = copy[language];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
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
    if (!moveLoading && (step === -1 ? position > 1 : hasNext)) onMove(step);
  }

  function startSwipe(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (!event.isPrimary) { gesture.current = null; return; }
    if (event.target !== event.currentTarget && (event.target as HTMLElement).tagName !== "IMG") return;
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
        aria-label={text.close} onClick={onClose}>×</button>
      <p className="gallery-viewer-counter" aria-live="polite">{position} / {total}</p>
      <button type="button" className="gallery-viewer-button gallery-viewer-icon gallery-viewer-download"
        disabled={downloading} aria-label={downloading ? text.downloading : text.download}
        title={text.download} onClick={() => void downloadPhoto()}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
        </svg>
      </button>
    </header>
    <div className="gallery-viewer-main">
      <button type="button" className="gallery-viewer-button gallery-viewer-icon gallery-viewer-previous"
        aria-label={text.back} disabled={position <= 1 || moveLoading} onClick={() => move(-1)}>‹</button>
      <div className="gallery-viewer-stage" onPointerDown={startSwipe} onPointerUp={endSwipe}
        onPointerCancel={() => { gesture.current = null; }}>
        <FullPhoto key={photoId} id={photoId} label={label} previewUrl={previewUrl} text={text} />
      </div>
      <button type="button" className="gallery-viewer-button gallery-viewer-icon gallery-viewer-next"
        aria-label={text.next} disabled={!hasNext || moveLoading} onClick={() => move(1)}>›</button>
    </div>
    {(downloadError || moveFailed || moveLoading) && <p className="gallery-viewer-feedback" role={moveLoading ? "status" : "alert"}>
      {downloadError ? text.downloadError : moveFailed ? text.moveError : text.loading}
    </p>}
  </dialog>;
}
