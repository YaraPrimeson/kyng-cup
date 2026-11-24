"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { type Sport, visibleSports } from "@/lib/sports";
import { formatTournamentDate } from "../public-tournaments";
import { type Language, useLanguage } from "../i18n";
import { archivePageSize, photoPageSize, galleryAlbumHref, getAlbum, getAlbumPhotos, getArchive, getArchivePhotoCounts, getPublicPhotoUrls, type PublicAlbum } from "./public-gallery";
import PhotoViewer from "./photo-viewer";
import "./gallery.css";

const copy = {
  en: { title: "Gallery", latest: "Latest album", archive: "Past tournaments", open: "View album", back: "All albums", results: "Tournament results", empty: "There are no published albums yet.", missing: "This album is unavailable.", busy: "Loading photos…", error: "Could not load the gallery.", retry: "Retry", moreAlbums: "Show more albums", morePhotos: "Show more photos", all: "All sports", photos: "Photos" },
  uk: { title: "Галерея", latest: "Останній альбом", archive: "Минулі турніри", open: "Переглянути альбом", back: "Усі альбоми", results: "Результати турніру", empty: "Опублікованих альбомів поки немає.", missing: "Цей альбом недоступний.", busy: "Завантажуємо фото…", error: "Не вдалося завантажити галерею.", retry: "Спробувати ще раз", moreAlbums: "Показати більше альбомів", morePhotos: "Показати більше фото", all: "Усі види спорту", photos: "Фото" },
  de: { title: "Galerie", latest: "Neuestes Album", archive: "Vergangene Turniere", open: "Album ansehen", back: "Alle Alben", results: "Turnierergebnisse", empty: "Es gibt noch keine veröffentlichten Alben.", missing: "Dieses Album ist nicht verfügbar.", busy: "Fotos werden geladen…", error: "Die Galerie konnte nicht geladen werden.", retry: "Erneut versuchen", moreAlbums: "Mehr Alben anzeigen", morePhotos: "Mehr Fotos anzeigen", all: "Alle Sportarten", photos: "Fotos" },
  ru: { title: "Галерея", latest: "Последний альбом", archive: "Прошедшие турниры", open: "Смотреть альбом", back: "Все альбомы", results: "Результаты турнира", empty: "Опубликованных альбомов пока нет.", missing: "Этот альбом недоступен.", busy: "Загружаем фото…", error: "Не удалось загрузить галерею.", retry: "Попробовать ещё раз", moreAlbums: "Показать больше альбомов", morePhotos: "Показать больше фото", all: "Все виды спорта", photos: "Фото" },
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
        const previewIds = result.albums.slice(hero ? 1 : 0).map(album => album.gallery.cover_photo_id);
        if (controller.signal.aborted) return;
        setAlbums(current => [...current, ...result.albums.filter(album => !current.some(previous => previous.id === album.id))]);
        setMore(result.more);
        const [wide, thumbs, counts] = await Promise.all([
          getPublicPhotoUrls(hero ? [hero.gallery.cover_photo_id] : [], "web", controller.signal),
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
      <GalleryImage id={latest.gallery.cover_photo_id} url={urls[latest.gallery.cover_photo_id]} variant="web" />
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
        <div className="gallery-card-image"><GalleryImage id={album.gallery.cover_photo_id} url={urls[album.gallery.cover_photo_id]} variant="thumb" /></div>
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

function Album({ slug, text, language, basePath }: { slug: string; text: Copy; language: Language; basePath: string }) {
  const [album, setAlbum] = useState<PublicAlbum | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const waitingForNext = useRef<Set<string> | null>(null);
  const [count, setCount] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const current = await getAlbum(slug);
        if (controller.signal.aborted) return;
        if (!current) {
          waitingForNext.current = null;
          setSelectedId(null);
          setAlbum(null);
          setPhotoIds([]);
          setUrls({});
          setState("ready");
          return;
        }
        const result = await getAlbumPhotos(current.id, offset);
        if (controller.signal.aborted) return;
        setAlbum(current);
        setPhotoIds(previous => [...new Set([...previous, ...result.ids])]);
        setCount(result.count);
        const known = waitingForNext.current;
        if (known) {
          waitingForNext.current = null;
          const next = result.ids.find(id => !known.has(id));
          if (next) setSelectedId(next);
        }
        const signed = await getPublicPhotoUrls(result.ids, "thumb", controller.signal);
        if (controller.signal.aborted) return;
        setUrls(previous => ({ ...previous, ...signed }));
        setState("ready");
      } catch { if (!controller.signal.aborted) setState("error"); }
    })();
    return () => controller.abort();
  }, [slug, offset, attempt]);

  const selectedIndex = selectedId ? photoIds.indexOf(selectedId) : -1;
  const hasMorePhotos = photoIds.length < count;

  function loadMore() {
    setState("loading");
    if (state === "error") setAttempt(attempt + 1);
    else setOffset(offset + photoPageSize);
  }

  function movePhoto(step: -1 | 1) {
    const next = photoIds[selectedIndex + step];
    if (next) {
      waitingForNext.current = null;
      setSelectedId(next);
    } else if (step === 1 && hasMorePhotos) {
      waitingForNext.current = new Set(photoIds);
      if (state !== "loading") loadMore();
    }
  }

  return <>
    <a className="gallery-text-link" href={`${basePath}/gallery/`}><span aria-hidden="true">← </span>{text.back}</a>
    {album && <>
      <div className="gallery-album-heading">
        <div><h1>{album.name}</h1><p>{formatTournamentDate(album, language, true)}{album.location && ` · ${album.location}`} · {text.photos} {count}</p></div>
        <a className="gallery-text-link" href={`${basePath}/bracket/?${new URLSearchParams({ tournament: album.slug, sport: album.sport })}`}>{text.results} <span aria-hidden="true">↗</span></a>
      </div>
      <div className="gallery-photo-grid">{photoIds.map((id, index) =>
        <button type="button" key={id} className="gallery-photo" data-shape={index % 8 === 0 ? "portrait" : index % 8 === 2 ? "wide" : undefined}
          aria-label={`${album.name} · ${text.photos} ${index + 1}`} aria-haspopup="dialog" onClick={event => {
            setOpener(event.currentTarget);
            setSelectedId(id);
          }}>
          <GalleryImage id={id} url={urls[id]} variant="thumb" />
        </button>
      )}</div>
      {state === "ready" && hasMorePhotos && <button type="button" className="gallery-more" onClick={loadMore}>{text.morePhotos}</button>}
      {selectedId && selectedIndex >= 0 && <PhotoViewer photoId={selectedId}
        label={`${album.name} · ${text.photos} ${selectedIndex + 1}`} position={selectedIndex + 1} total={count}
        slug={album.slug} language={language} opener={opener}
        hasNext={selectedIndex < photoIds.length - 1 || hasMorePhotos}
        nextLoading={state === "loading" && selectedIndex === photoIds.length - 1 && hasMorePhotos}
        nextFailed={state === "error" && selectedIndex === photoIds.length - 1 && hasMorePhotos}
        onClose={() => { waitingForNext.current = null; setSelectedId(null); }}
        onMove={movePhoto} />}
    </>}
    {state === "ready" && !album && <p className="gallery-status">{text.missing}</p>}
    <LoadStatus state={state} text={text} retry={() => { setState("loading"); setAttempt(attempt + 1); }} />
  </>;
}

export default function GalleryPage() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup/") ? "/kyng-cup" : "";
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
