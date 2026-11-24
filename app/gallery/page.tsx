"use client";

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
  uk: { title: "Галерея", latest: "Останній альбом", archive: "Інші альбоми", open: "Переглянути альбом", back: "Усі альбоми", results: "Результати турніру", empty: "Опублікованих альбомів поки немає.", missing: "Цей альбом недоступний.", busy: "Завантажуємо фото…", error: "Не вдалося завантажити галерею.", retry: "Спробувати ще раз", moreAlbums: "Показати більше альбомів", perPage: "Фото на сторінці", page: "Сторінка", previousPage: "Попередня сторінка", nextPage: "Наступна сторінка", noPhotos: "У цьому альбомі поки немає фото.", all: "Усі види спорту", photos: "Фото" },
  de: { title: "Galerie", latest: "Neuestes Album", archive: "Weitere Alben", open: "Album ansehen", back: "Alle Alben", results: "Turnierergebnisse", empty: "Es gibt noch keine veröffentlichten Alben.", missing: "Dieses Album ist nicht verfügbar.", busy: "Fotos werden geladen…", error: "Die Galerie konnte nicht geladen werden.", retry: "Erneut versuchen", moreAlbums: "Mehr Alben anzeigen", perPage: "Fotos pro Seite", page: "Seite", previousPage: "Vorherige Seite", nextPage: "Nächste Seite", noPhotos: "In diesem Album gibt es noch keine Fotos.", all: "Alle Sportarten", photos: "Fotos" },
  ru: { title: "Галерея", latest: "Последний альбом", archive: "Другие альбомы", open: "Смотреть альбом", back: "Все альбомы", results: "Результаты турнира", empty: "Опубликованных альбомов пока нет.", missing: "Этот альбом недоступен.", busy: "Загружаем фото…", error: "Не удалось загрузить галерею.", retry: "Попробовать ещё раз", moreAlbums: "Показать больше альбомов", perPage: "Фото на странице", page: "Страница", previousPage: "Предыдущая страница", nextPage: "Следующая страница", noPhotos: "В этом альбоме пока нет фото.", all: "Все виды спорта", photos: "Фото" },
} as const;
type Copy = typeof copy[Language];

function GalleryImage({ id, variant, url, alt = "" }: { id: string; variant: "thumb" | "web"; url?: string; alt?: string }) {
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const src = refreshed ?? url;
  if (!src || failed) return <span className="gallery-image-placeholder" aria-hidden="true" />;
  return <img src={src} alt={alt} decoding="async" onError={() => {
    if (refreshed) { setFailed(true); return; }
    void getPublicPhotoUrls([id], variant).then(next => {
      if (next[id] && next[id] !== src) setRefreshed(next[id]);
      else setFailed(true);
    }, () => setFailed(true));
  }} />;
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
        setAlbums(current => [...current, ...result.albums.filter(album => !current.some(previous => previous.id === album.id))]);
        setMore(result.more);
        const [wide, thumbs, counts] = await Promise.all([
          getPublicPhotoUrls(hero ? [hero.cover_photo_id] : [], "web", controller.signal),
          getPublicPhotoUrls(previewIds, "thumb", controller.signal),
          getArchivePhotoCounts(result.albums.map(album => album.id)),
        ]);
        if (controller.signal.aborted) return;
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
    return count == null ? date : `${date} · ${text.photos} ${new Intl.NumberFormat(language).format(count)}`;
  }

  const [latest, ...earlier] = albums;
  return <>
    {latest && <a className="gallery-feature" href={galleryAlbumHref(latest.slug, basePath)}>
      <GalleryImage id={latest.cover_photo_id} url={urls[latest.cover_photo_id]} variant="web" />
      <div className="gallery-feature-copy">
        <p className="eyebrow">{text.latest}</p>
        <h2>{latest.name}</h2>
        <p>{label(latest)}</p>
        <span>{text.open} <span aria-hidden="true">↗</span></span>
      </div>
    </a>}
    {earlier.length > 0 && <section className="gallery-archive">
      <h2>{text.archive}</h2>
      <div className="gallery-albums">{earlier.map(album => <a className="gallery-card" key={album.id} href={galleryAlbumHref(album.slug, basePath)}>
        <div className="gallery-card-image"><GalleryImage id={album.cover_photo_id} url={urls[album.cover_photo_id]} variant="thumb" /></div>
        <h3>{album.name}</h3>
        <p>{label(album)}</p>
      </a>)}</div>
    </section>}
    {state === "ready" && !latest && <p className="gallery-status">{text.empty}</p>}
    {state === "ready" && more && <button type="button" className="gallery-more" onClick={next}>{text.moreAlbums}</button>}
    <LoadStatus state={state} text={text} retry={retry} />
  </>;
}

function LoadStatus({ state, text, retry }: { state: "loading" | "ready" | "error"; text: Copy; retry: () => void }) {
  if (state === "loading") return <p className="gallery-status" role="status">{text.busy}</p>;
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
  const [count, setCount] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>("loading");
  const [viewer, setViewer] = useState<ViewerPhoto | null>(null);
  const [viewerMoveState, setViewerMoveState] = useState<LoadState>("ready");
  const viewerRequest = useRef<AbortController | null>(null);
  const controls = useRef<HTMLDivElement>(null);
  const offset = (page - 1) * pageSize;
  const pages = Math.max(1, Math.ceil(count / pageSize));

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
  return <>
    <div className="gallery-album-heading">
      <div><h1>{album.name}</h1><p>{formatTournamentDate(album, language, true)}{album.location && ` · ${album.location}`} · {text.photos} {count}</p></div>
      {album.has_public_bracket && <a className="gallery-text-link" href={`${basePath}/bracket/?${new URLSearchParams({ tournament: album.slug, sport: album.sport })}`}>{text.results} <span aria-hidden="true">↗</span></a>}
    </div>
    <div className="gallery-photo-controls" ref={controls}>
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
    </div>
    {state === "ready" && photoIds.length > 0 && <>
      <div className="gallery-photo-grid">{photoIds.map((id, index) =>
        <button type="button" key={id} className="gallery-photo" data-shape={index % 8 === 0 ? "portrait" : index % 8 === 2 ? "wide" : undefined}
          aria-label={`${album.name} · ${text.photos} ${offset + index + 1}`} aria-haspopup="dialog" onClick={event => {
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
    {viewer && <PhotoViewer photoId={viewer.page.ids[viewer.index - viewer.page.offset]}
      label={`${album.name} · ${text.photos} ${viewerPosition}`} position={viewerPosition} total={viewer.total}
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
      {hydrated ? <Archive key={sport ?? "all"} sport={sport} text={text} language={language} basePath={basePath} /> : <p className="gallery-status" role="status">{text.busy}</p>}
    </>}
  </main>;
}
