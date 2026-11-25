"use client";

import Skeleton from "@mui/material/Skeleton";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteBasePath } from "@/lib/player-account";
import { type Sport, visibleSports } from "@/lib/sports";
import { formatTournamentDate } from "../public-tournaments";
import { type Language, useLanguage } from "../i18n";
import { archivePageSize, galleryAlbumHref, getAlbum, getAlbumPhotos, getArchive, getArchivePhotoCounts, getPublicPhotoUrls, type PublicAlbum } from "./public-gallery";
import PhotoViewer from "./photo-viewer";
import "./gallery.css";

const copy = {
  en: { title: "Gallery", latest: "Latest album", archive: "More albums", open: "View album", back: "All albums", results: "Tournament results", empty: "There are no published albums yet.", missing: "This album is unavailable.", busy: "Loading photos…", error: "Could not load the gallery.", retry: "Retry", moreAlbums: "Show more albums", perPage: "Photos per page", page: "Page", previousPage: "Previous page", nextPage: "Next page", noPhotos: "There are no photos in this album yet.", all: "All sports", photos: "Photos" },
  uk: { title: "Галерея", latest: "Останній альбом", archive: "Інші альбоми", open: "Дивитися альбом", back: "Усі альбоми", results: "Результати турніру", empty: "Опублікованих альбомів поки немає.", missing: "Цей альбом недоступний.", busy: "Завантажуємо фото…", error: "Не вдалося завантажити галерею.", retry: "Спробувати ще раз", moreAlbums: "Показати більше альбомів", perPage: "Фото на сторінці", page: "Сторінка", previousPage: "Попередня сторінка", nextPage: "Наступна сторінка", noPhotos: "У цьому альбомі поки немає фото.", all: "Усі види спорту", photos: "Фото" },
  de: { title: "Galerie", latest: "Neuestes Album", archive: "Weitere Alben", open: "Album ansehen", back: "Alle Alben", results: "Turnierergebnisse", empty: "Es gibt noch keine veröffentlichten Alben.", missing: "Dieses Album ist nicht verfügbar.", busy: "Fotos werden geladen…", error: "Die Galerie konnte nicht geladen werden.", retry: "Erneut versuchen", moreAlbums: "Mehr Alben anzeigen", perPage: "Fotos pro Seite", page: "Seite", previousPage: "Vorherige Seite", nextPage: "Nächste Seite", noPhotos: "In diesem Album gibt es noch keine Fotos.", all: "Alle Sportarten", photos: "Fotos" },
  ru: { title: "Галерея", latest: "Последний альбом", archive: "Другие альбомы", open: "Смотреть альбом", back: "Все альбомы", results: "Результаты турнира", empty: "Опубликованных альбомов пока нет.", missing: "Этот альбом недоступен.", busy: "Загружаем фото…", error: "Не удалось загрузить галерею.", retry: "Попробовать ещё раз", moreAlbums: "Показать больше альбомов", perPage: "Фото на странице", page: "Страница", previousPage: "Предыдущая страница", nextPage: "Следующая страница", noPhotos: "В этом альбоме пока нет фото.", all: "Все виды спорта", photos: "Фото" },
} as const;
type Copy = typeof copy[Language];

function albumTitle(album: PublicAlbum) {
  // Older tournament names can include their English date after a pipe.
  const [name, suffix, ...rest] = album.name.split(/\s*\|\s*/);
  if (!album.starts_at || !name || !suffix || rest.length) return album.name;
  const date = formatTournamentDate(album, "en", true);
  if (suffix === date) return name;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Vienna", dateStyle: "long" });
  const start = formatter.format(new Date(album.starts_at));
  const end = album.ends_at ? formatter.format(new Date(album.ends_at)) : start;
  return suffix === (start === end ? start : `${start} – ${end}`) ? name : album.name;
}

function photoCountLabel(count: number, language: Language) {
  const noun = language === "en" ? (count === 1 ? "photo" : "photos") : language === "de" ? (count === 1 ? "Foto" : "Fotos") : "фото";
  return `${new Intl.NumberFormat(language).format(count)} ${noun}`;
}

function GallerySkeleton({ className = "", animated = true }: { className?: string; animated?: boolean }) {
  return <Skeleton variant="rounded" animation={animated ? "wave" : false}
    className={`gallery-skeleton ${className}`} aria-hidden="true" />;
}

function ArchiveSkeleton({ text }: { text: Copy }) {
  return <>
    <span className="gallery-visually-hidden" role="status">{text.busy}</span>
    <div className="gallery-feature" aria-hidden="true">
      <div className="gallery-feature-image"><GallerySkeleton className="gallery-skeleton-fill" /></div>
      <div className="gallery-feature-copy">
        <GallerySkeleton className="gallery-skeleton-eyebrow" />
        <GallerySkeleton className="gallery-skeleton-feature-title" />
        <GallerySkeleton className="gallery-skeleton-meta" />
        <GallerySkeleton className="gallery-skeleton-action" />
      </div>
    </div>
    <section className="gallery-archive" aria-hidden="true">
      <h2>{text.archive}</h2>
      <div className="gallery-albums">
        <div className="gallery-card">
          <div className="gallery-card-image"><GallerySkeleton className="gallery-skeleton-fill" /></div>
          <GallerySkeleton className="gallery-skeleton-card-title" />
          <GallerySkeleton className="gallery-skeleton-meta" />
        </div>
      </div>
    </section>
  </>;
}

function PhotoGridSkeleton({ count, text }: { count: number; text: Copy }) {
  return <>
    <span className="gallery-visually-hidden" role="status">{text.busy}</span>
    <div className="gallery-photo-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) =>
        <div className="gallery-photo gallery-photo-placeholder" key={index}>
          <GallerySkeleton className="gallery-skeleton-fill" />
        </div>
      )}
    </div>
  </>;
}

function GalleryImage({ id, variant, url, alt = "" }: { id: string; variant: "thumb" | "web"; url?: string; alt?: string }) {
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const src = refreshed ?? url;
  const loading = Boolean(src && loadedSrc !== src && !failed);
  return <>
    {(!src || loading || failed) && <GallerySkeleton className="gallery-skeleton-fill" animated={loading} />}
    {src && !failed && <img src={src} alt={alt} decoding="async" data-loading={loading} onLoad={() => setLoadedSrc(src)} onError={() => {
      if (refreshed) { setFailed(true); return; }
      void getPublicPhotoUrls([id], variant).then(next => {
        if (next[id] && next[id] !== src) setRefreshed(next[id]);
        else setFailed(true);
      }, () => setFailed(true));
    }} />}
  </>;
}

function Archive({ text, language, sport, basePath }: { text: Copy; language: Language; sport?: Sport; basePath: string }) {
  const [albums, setAlbums] = useState<PublicAlbum[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await getArchive(offset, sport);
        const hero = offset === 0 ? result.albums[0] : undefined;
        const previewIds = result.albums.slice(hero ? 1 : 0).map(album => album.cover_photo_id);
        if (controller.signal.aborted) return;
        const [wide, thumbs, counts] = await Promise.all([
          getPublicPhotoUrls(hero ? [hero.cover_photo_id] : [], "web", controller.signal),
          getPublicPhotoUrls(previewIds, "thumb", controller.signal),
          getArchivePhotoCounts(result.albums.map(album => album.id)),
        ]);
        if (controller.signal.aborted) return;
        setAlbums(current => [...current, ...result.albums.filter(album => !current.some(previous => previous.id === album.id))]);
        setMore(result.more);
        setUrls(current => ({ ...current, ...wide, ...thumbs }));
        setPhotoCounts(current => ({ ...current, ...counts }));
        setState("ready");
      } catch { if (!controller.signal.aborted) setState("error"); }
    })();
    return () => controller.abort();
  }, [offset, attempt, sport]);

  function next() { setState("loading"); setOffset(offset + archivePageSize); }
  function retry() { setState("loading"); setAttempt(attempt + 1); }

  function label(album: PublicAlbum) {
    const date = formatTournamentDate(album, language, true);
    const count = photoCounts[album.id];
    return count == null ? date : `${date} · ${photoCountLabel(count, language)}`;
  }

  const [latest, ...earlier] = albums;
  if (state === "loading" && !latest) return <ArchiveSkeleton text={text} />;
  return <>
    {latest && <a className="gallery-feature" href={galleryAlbumHref(latest.slug, basePath)}>
      <div className="gallery-feature-image">
        <GalleryImage id={latest.cover_photo_id} url={urls[latest.cover_photo_id]} variant="web" />
      </div>
      <div className="gallery-feature-copy">
        <p className="eyebrow">{text.latest}</p>
        <h2>{albumTitle(latest)}</h2>
        <p>{label(latest)}</p>
        <span className="gallery-feature-action">{text.open} <span aria-hidden="true">→</span></span>
      </div>
    </a>}
    {earlier.length > 0 && <section className="gallery-archive">
      <h2>{text.archive}</h2>
      <div className="gallery-albums">{earlier.map(album => <a className="gallery-card" key={album.id} href={galleryAlbumHref(album.slug, basePath)}>
        <div className="gallery-card-image"><GalleryImage id={album.cover_photo_id} url={urls[album.cover_photo_id]} variant="thumb" /></div>
        <h3>{albumTitle(album)}</h3>
        <p>{label(album)}</p>
      </a>)}</div>
    </section>}
    {state === "ready" && !latest && <p className="gallery-status">{text.empty}</p>}
    {more && state !== "error" && <button type="button" className="gallery-more" onClick={next}
      disabled={state === "loading"} aria-busy={state === "loading"}>{text.moreAlbums}</button>}
    <LoadStatus state={state} text={text} retry={retry} />
  </>;
}

function LoadStatus({ state, text, retry }: { state: "loading" | "ready" | "error"; text: Copy; retry: () => void }) {
  if (state === "error") return <div className="gallery-status"><p role="alert">{text.error}</p><button type="button" className="gallery-more" onClick={retry}>{text.retry}</button></div>;
  return null;
}

const photoPageSizes = [20, 50, 100];
type PhotoPage = { offset: number; ids: string[] };
type ViewerPhoto = { page: PhotoPage; index: number; total: number; opener: HTMLButtonElement };
type LoadState = "loading" | "ready" | "error";

function AlbumPagination({ text, page, pages, onPageChange }: {
  text: Copy; page: number; pages: number; onPageChange: (page: number) => void;
}) {
  return <nav className="gallery-pagination" aria-label={text.page}>
    <button type="button" aria-label={text.previousPage} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
    <label>{text.page}
      <select value={page} onChange={event => onPageChange(Number(event.target.value))}>
        {Array.from({ length: pages }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
      </select>
    </label>
    <span aria-hidden="true">/ {pages}</span>
    <button type="button" aria-label={text.nextPage} disabled={page >= pages} onClick={() => onPageChange(page + 1)}>›</button>
  </nav>;
}

function AlbumPhotos({ album, text, language, basePath }: {
  album: PublicAlbum; text: Copy; language: Language; basePath: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(photoPageSizes[0]);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [count, setCount] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [viewer, setViewer] = useState<ViewerPhoto | null>(null);
  const [viewerMoveState, setViewerMoveState] = useState<LoadState>("ready");
  const viewerRequest = useRef<AbortController | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const offset = (page - 1) * pageSize;
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const placeholderCount = count === null ? 4 : Math.max(0, Math.min(pageSize, count - offset));

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await getAlbumPhotos(album.id, offset, pageSize, controller.signal);
        if (controller.signal.aborted) return;
        setCount(result.count);
        const lastPage = Math.max(1, Math.ceil(result.count / pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        const signed = await getPublicPhotoUrls(result.ids, "thumb", controller.signal);
        if (controller.signal.aborted) return;
        setPhotoIds(result.ids);
        setUrls(signed);
        setState("ready");
      } catch { if (!controller.signal.aborted) setState("error"); }
    })();
    return () => controller.abort();
  }, [album.id, offset, page, pageSize, attempt]);

  useEffect(() => () => viewerRequest.current?.abort(), []);

  function changePage(nextPage: number, fromBottom = false) {
    if (nextPage === page) return;
    if (fromBottom) {
      controls.current?.scrollIntoView?.({ block: "start" });
      controls.current?.querySelector<HTMLSelectElement>("nav select")?.focus({ preventScroll: true });
    }
    setState("loading");
    setPage(nextPage);
  }

  function closeViewer() {
    viewerRequest.current?.abort();
    viewerRequest.current = null;
    setViewerMoveState("ready");
    setViewer(null);
  }

  async function movePhoto(step: -1 | 1) {
    if (!viewer || viewerRequest.current) return;
    const index = viewer.index + step;
    if (index < 0 || index >= viewer.total) return;
    const localIndex = index - viewer.page.offset;
    if (viewer.page.ids[localIndex]) {
      setViewer({ ...viewer, index });
      setViewerMoveState("ready");
      return;
    }
    if (photoIds[index - offset]) {
      setViewer({ ...viewer, index, page: { offset, ids: photoIds } });
      setViewerMoveState("ready");
      return;
    }

    const controller = new AbortController();
    viewerRequest.current = controller;
    setViewerMoveState("loading");
    try {
      const start = Math.floor(index / pageSize) * pageSize;
      const result = await getAlbumPhotos(album.id, start, pageSize, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ids[index - start]) {
        setViewer({ ...viewer, index, total: result.count, page: { offset: start, ids: result.ids } });
      } else {
        setViewer({ ...viewer, total: Math.max(viewer.index + 1, result.count) });
      }
      setViewerMoveState("ready");
    } catch {
      if (!controller.signal.aborted) setViewerMoveState("error");
    } finally {
      if (viewerRequest.current === controller) viewerRequest.current = null;
    }
  }

  const viewerPosition = viewer ? viewer.index + 1 : 0;
  const viewerPhotoId = viewer?.page.ids[viewer.index - viewer.page.offset];
  const name = albumTitle(album);
  const date = formatTournamentDate(album, language, true);
  return <>
    <div className="gallery-album-heading">
      <div>
        <h1>{name}</h1>
        <p className="gallery-album-meta">
          {album.starts_at && <span>{date}</span>}
          {album.location && <span className="gallery-album-location">{album.location}</span>}
          {count === null ? <GallerySkeleton className="gallery-skeleton-photo-count" /> : <span>{photoCountLabel(count, language)}</span>}
        </p>
      </div>
      {album.has_public_bracket && <a className="gallery-text-link gallery-results" href={`${basePath}/bracket/?${new URLSearchParams({ tournament: album.slug, sport: album.sport })}`}>{text.results} <span aria-hidden="true">↗</span></a>}
    </div>
    {count !== null && count > photoPageSizes[0] && <div className="gallery-photo-controls" ref={controls}>
      <label>{text.perPage}
        <select value={pageSize} onChange={event => {
          setState("loading");
          setPageSize(Number(event.target.value));
          setPage(1);
        }}>
          {photoPageSizes.map(size => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      {pages > 1 && <AlbumPagination text={text} page={page} pages={pages} onPageChange={changePage} />}
    </div>}
    {state === "loading" && <PhotoGridSkeleton count={placeholderCount} text={text} />}
    {state === "ready" && count !== null && photoIds.length > 0 && <>
      <div className="gallery-photo-grid">{photoIds.map((id, index) =>
        <button type="button" key={id} className="gallery-photo"
          aria-label={`${name} · ${text.photos} ${offset + index + 1}`} aria-haspopup="dialog" onClick={event => {
            setViewer({ page: { offset, ids: photoIds }, index: offset + index, total: count, opener: event.currentTarget });
          }}>
          <GalleryImage id={id} url={urls[id]} variant="thumb" />
        </button>
      )}</div>
      {pages > 1 && <div className="gallery-photo-footer">
        <AlbumPagination text={text} page={page} pages={pages} onPageChange={nextPage => changePage(nextPage, true)} />
      </div>}
    </>}
    {state === "ready" && photoIds.length === 0 && <p className="gallery-status">{text.noPhotos}</p>}
    <LoadStatus state={state} text={text} retry={() => { setState("loading"); setAttempt(value => value + 1); }} />
    {viewer && viewerPhotoId && <PhotoViewer photoId={viewerPhotoId} previewUrl={urls[viewerPhotoId]}
      label={`${name} · ${text.photos} ${viewerPosition}`} position={viewerPosition} total={viewer.total}
      slug={album.slug} language={language} opener={viewer.opener}
      hasNext={viewerPosition < viewer.total}
      moveLoading={viewerMoveState === "loading"} moveFailed={viewerMoveState === "error"}
      onClose={closeViewer} onMove={step => void movePhoto(step)} />}
  </>;
}

function Album({ slug, text, language, basePath }: { slug: string; text: Copy; language: Language; basePath: string }) {
  const [album, setAlbum] = useState<PublicAlbum | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let active = true;
    void getAlbum(slug).then(current => {
      if (!active) return;
      setAlbum(current);
      setState("ready");
    }, () => { if (active) setState("error"); });
    return () => { active = false; };
  }, [slug, attempt]);

  return <>
    <a className="gallery-text-link" href={`${basePath}/gallery/`}><span aria-hidden="true">← </span>{text.back}</a>
    {album && <AlbumPhotos album={album} text={text} language={language} basePath={basePath} />}
    {!album && state === "loading" && <>
      <div className="gallery-album-heading" aria-hidden="true">
        <div>
          <GallerySkeleton className="gallery-skeleton-album-title" />
          <GallerySkeleton className="gallery-skeleton-meta" />
          <GallerySkeleton className="gallery-skeleton-location" />
        </div>
        <GallerySkeleton className="gallery-skeleton-results" />
      </div>
      <PhotoGridSkeleton count={4} text={text} />
    </>}
    {state === "ready" && !album && <p className="gallery-status">{text.missing}</p>}
    <LoadStatus state={state} text={text} retry={() => { setState("loading"); setAttempt(value => value + 1); }} />
  </>;
}

export default function GalleryPage() {
  const pathname = usePathname();
  const basePath = siteBasePath(pathname);
  const { language } = useLanguage();
  const text = copy[language];
  const [slug, setSlug] = useState<string | null>(null);
  const [sport, setSport] = useState<Sport | undefined>();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const readLocation = () => {
      setSlug(new URLSearchParams(window.location.search).get("tournament"));
      setHydrated(true);
    };
    const timer = window.setTimeout(readLocation, 0);
    window.addEventListener("popstate", readLocation);
    return () => { window.clearTimeout(timer); window.removeEventListener("popstate", readLocation); };
  }, []);

  return <main className="gallery-page">
    {hydrated && slug ? <Album key={slug} slug={slug} text={text} language={language} basePath={basePath} /> : <>
      <h1>{text.title}<span className="accent-dot">.</span></h1>
      {visibleSports.length > 1 && <div className="gallery-filters">
        <button type="button" aria-pressed={!sport} onClick={() => setSport(undefined)}>{text.all}</button>
        {visibleSports.map(item => <button key={item} type="button" aria-pressed={sport === item} onClick={() => setSport(item)}>{item === "tennis" ? "Tennis" : "Padel"}</button>)}
      </div>}
      {hydrated ? <Archive key={sport ?? "all"} sport={sport} text={text} language={language} basePath={basePath} /> : <ArchiveSkeleton text={text} />}
    </>}
  </main>;
}
