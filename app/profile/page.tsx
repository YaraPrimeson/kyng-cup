"use client";

import { ChangeEvent, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PLAYER_PROFILE_EVENT, PLAYER_PROFILE_KEY, readPlayerProfile, savePlayerProfile, type PlayerProfile } from "@/lib/player-profile";
import { formatTournamentDate, usePublicTournaments } from "../public-tournaments";
import { achievements, exampleHistory } from "./profile-data";
import ProfileIcon from "./profile-icon";
import ResultCard from "./result-card";

type View = "profile" | "mine" | "settings" | "achievements" | "history" | "result" | "partners" | "cards" | "schedule";
const defaultProfile: PlayerProfile = { name: "Alex Kovalenko", email: "alex@example.com", photo: "" };
const profileViews: View[] = ["profile", "settings", "achievements", "partners", "cards"];

function Action({ children, onClick, secondary = false }: { children: ReactNode; onClick: () => void; secondary?: boolean }) {
  return <button type="button" className={secondary ? "kv-secondary" : "kv-primary"} onClick={onClick}>{children}</button>;
}

export default function ProfilePage() {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const [view, setView] = useState<View>("profile");
  const [trail, setTrail] = useState<View[]>([]);
  const [profile, setProfile] = useState<PlayerProfile>(defaultProfile);
  const [draft, setDraft] = useState<PlayerProfile>(defaultProfile);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const [showEvents, setShowEvents] = useState(false);
  const [exampleEntry, setExampleEntry] = useState(false);
  const [now, setNow] = useState(0);
  const [selectedAchievement, setSelectedAchievement] = useState<string>("semi");
  const [resultId, setResultId] = useState<string>("autumn");
  const fileInput = useRef<HTMLInputElement>(null);
  const photoJob = useRef({ id: 0 });
  const heading = useRef<HTMLHeadingElement>(null);
  const { tournaments, loading, error } = usePublicTournaments();
  const available = tournaments.filter(item => item.registration_status !== "closed" && item.starts_at && Date.parse(item.ends_at || item.starts_at) >= now);
  const result = exampleHistory.find(item => item.id === resultId) ?? exampleHistory[0];
  const award = achievements.find(item => item.id === selectedAchievement) ?? achievements[4];
  const initials = (profile.name || "KYNG Player").split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    const jobs = photoJob.current;
    const load = () => { const saved = readPlayerProfile(); if (saved) { setProfile(saved); setDraft(saved); } };
    const timer = window.setTimeout(() => {
      load(); setHydrated(true); setNow(Date.now());
      setExampleEntry(new URLSearchParams(window.location.search).get("example") === "entry");
    }, 0);
    const sync = (event: StorageEvent) => { if (event.key === PLAYER_PROFILE_KEY) load(); };
    window.addEventListener("storage", sync);
    window.addEventListener(PLAYER_PROFILE_EVENT, load);
    return () => { window.clearTimeout(timer); jobs.id++; window.removeEventListener("storage", sync); window.removeEventListener(PLAYER_PROFILE_EVENT, load); };
  }, []);

  function move(next: View, tab = false) {
    photoJob.current.id++; setNotice("");
    if (next === "settings") setDraft(profile);
    if (tab) setTrail([]); else if (view !== next) setTrail(values => [...values, view]);
    setView(next); window.scrollTo({ top: 0, behavior: "instant" });
    window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  function goBack() {
    photoJob.current.id++; setNotice("");
    setView(trail.at(-1) ?? "profile"); setTrail(values => values.slice(0, -1));
    window.scrollTo({ top: 0, behavior: "instant" });
    window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...draft, name: draft.name.trim(), email: draft.email.trim() };
    if (!next.name) { setNotice("Укажите имя."); return; }
    if (!savePlayerProfile(next)) { setNotice("Браузер не разрешает сохранить данные. Проверьте настройки хранилища."); return; }
    setProfile(next); setDraft(next); setNotice("Изменения сохранены на этом устройстве.");
  }

  async function uploadPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setNotice("Выберите JPG, PNG или WebP до 5 МБ."); return; }
    const job = ++photoJob.current.id;
    setNotice("Подготавливаем фото…");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Image is too large");
      const canvas = document.createElement("canvas"), size = 720;
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      canvas.width = size; canvas.height = size;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas unavailable");
      context.fillStyle = "#f4f1eb"; context.fillRect(0, 0, size, size);
      context.drawImage(image, (size - image.naturalWidth * scale) / 2, (size - image.naturalHeight * scale) / 2, image.naturalWidth * scale, image.naturalHeight * scale);
      const photo = canvas.toDataURL("image/jpeg", .8);
      if (photo.length > 700_000) throw new Error("Image is too large");
      if (photoJob.current.id !== job) return;
      setDraft(value => ({ ...value, photo })); setNotice("Фото готово. Сохраните изменения.");
    } catch { if (photoJob.current.id === job) setNotice("Не удалось обработать фото. Попробуйте другое изображение."); }
    finally { URL.revokeObjectURL(url); }
  }

  const photo = (source = profile.photo) => source ? <img src={source} alt="Фото игрока" width="72" height="72" /> : initials;
  const historyList = (short = false) => (short ? exampleHistory.slice(0, 1) : exampleHistory).map(item => <button type="button" className="kv-history" key={item.id} onClick={() => { setResultId(item.id); move("result"); }}><span className="kv-date"><b>{item.day}</b>{item.month}</span><span className="kv-history-copy">{item.name}<small>{item.result} · {item.partner}</small></span><ProfileIcon name="next" /></button>);
  const past = <section className="kv-section"><div className="kv-section-head"><h3>Прошедшие турниры</h3><button type="button" className="kv-link" onClick={() => move("history")}>Все</button></div>{historyList(true)}</section>;
  const eventList = <section className="player-event-list" aria-label="Доступные турниры"><h3>Доступные турниры</h3>{loading ? <p className="kv-note" role="status">Загружаем турниры…</p> : error ? <p className="kv-note" role="alert">Не удалось загрузить турниры. <a href={`${basePath}/upcoming-tournaments/`}>Открыть календарь</a></p> : available.length === 0 ? <div className="kv-note">Новая регистрация пока не открыта. Даты появятся в <a href={`${basePath}/upcoming-tournaments/`}>календаре турниров</a>.</div> : available.map(item => <article className="kv-box" key={item.id}><span className="kv-badge">{item.registration_status === "waitlist" ? "Лист ожидания" : "Регистрация открыта"}</span><p className="kv-when">{formatTournamentDate(item, "ru", true)}</p><h2>{item.name}</h2><p className="kv-muted">{item.location || "Место будет объявлено"}</p><a className="kv-primary player-register-link" href={`${basePath}/register/?tournament=${encodeURIComponent(item.slug)}&sport=${item.sport}`}>{item.registration_status === "waitlist" ? "В лист ожидания" : "Записаться"}</a></article>)}</section>;
  const title: Record<View, string> = { profile: "Профиль", mine: "Мои турниры", settings: "Настройки", achievements: "Достижения", history: "История и матчи", result: result.name, partners: "Мои партнёры", cards: "Мои карточки", schedule: "Ваш турнир" };

  return <main className="player-account" lang="ru" translate="no"><div className="kv-phone">
    <header className="kv-header"><a className="kv-logo" href={`${basePath}/`} aria-label="Главная KYNG CUP">KYNG CUP</a><button type="button" className="kv-avatar" onClick={() => move("profile", true)} aria-label="Открыть профиль">{photo()}</button></header>
    <div className="kv-body">
      <p className="player-preview-note">Предпросмотр · спортивная история показана для примера</p>
      {view !== "profile" && view !== "mine" && <button type="button" className="kv-back" onClick={goBack}><ProfileIcon name="back" />Назад</button>}
      <h1 ref={heading} tabIndex={-1}>{title[view]}</h1>
      {view === "profile" && <>
        <div className="kv-person"><span className="kv-avatar">{photo()}</span><div><strong>{profile.name}</strong><small>{profile.email}</small></div></div>
        <div className="kv-stats"><div><strong>9</strong><small>турниров</small></div><div><strong>24</strong><small>матча</small></div><div><strong>15</strong><small>побед</small></div></div>
        <section className="kv-section">{([ ["history", "История и матчи", ""], ["partners", "Мои партнёры", ""], ["achievements", "Достижения", "6 из 12 открыто"], ["cards", "Мои карточки", "Результаты для публикации"] ] as const).map(([id, label, detail]) => <button type="button" key={id} className="kv-row" onClick={() => move(id)}><span>{label}{detail && <small>{detail}</small>}</span><ProfileIcon name="next" /></button>)}</section>
        <section className="kv-section"><Action secondary onClick={() => move("settings")}><ProfileIcon name="settings" />Настройки профиля</Action></section>
      </>}
      {view === "settings" && <>
        <div className="kv-photo-setting"><span className="kv-avatar">{photo(draft.photo)}</span><div><Action secondary onClick={() => fileInput.current?.click()}>Изменить фото</Action><small>JPG, PNG, WebP · до 5 МБ</small></div></div>
        <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInput} hidden onChange={event => void uploadPhoto(event)} />
        <form className="kv-fields" onSubmit={saveSettings}><label>Имя и фамилия<input autoComplete="name" value={draft.name} onChange={event => setDraft(value => ({ ...value, name: event.target.value }))} maxLength={80} required /></label><label>Email<input type="email" autoComplete="email" value={draft.email} onChange={event => setDraft(value => ({ ...value, email: event.target.value }))} maxLength={254} required /></label><p className="kv-muted kv-small">Данные сохраняются в этом браузере и подставляются при регистрации. Это ещё не аккаунт с подтверждённой почтой.</p><button type="submit" className="kv-primary" disabled={!hydrated}>Сохранить изменения</button></form>
        <p className="kv-message" role="status">{notice}</p>
      </>}
      {view === "mine" && <>
        {exampleEntry ? <><article className="kv-box"><span className="kv-badge"><ProfileIcon name="check" />Участие подтверждено · пример</span><p className="kv-when">14 ноября · 10:00</p><h2>KYNG Winter Cup</h2><p className="kv-muted">Падел · Intermediate</p><div className="kv-details"><div className="kv-detail"><ProfileIcon name="pin" /><div>Padelzone Vienna<small>Вена · точный корт в расписании</small></div></div><div className="kv-detail"><ProfileIcon name="people" /><div>Daniel Horvat<small>Ваш партнёр в примере</small></div></div></div><Action onClick={() => move("schedule")}>Открыть мой турнир</Action></article><div className="player-more-events"><Action secondary onClick={() => setShowEvents(value => !value)}>{showEvents ? "Скрыть доступные турниры" : "Посмотреть другие турниры"}</Action></div></> : !showEvents && <section className="kv-empty"><div className="kv-empty-icon"><ProfileIcon name="calendar" /></div><h2>Выберите следующую игру</h2><p>Здесь появятся ваши заявки и информация об участии.</p><Action onClick={() => setShowEvents(true)}>Посмотреть турниры</Action></section>}
        {showEvents && <div className={exampleEntry ? "kv-section" : undefined}>{eventList}</div>}
        {past}
        <button type="button" className="kv-link player-example-toggle" onClick={() => setExampleEntry(value => !value)}>{exampleEntry ? "Посмотреть вариант без заявки" : "Посмотреть пример подтверждённой заявки"}</button>
      </>}
      {view === "achievements" && <>
        <div className="kv-section-head"><p className="kv-muted kv-small">Нажмите на награду, чтобы узнать условие.</p><span className="kv-badge">6 / 12</span></div>
        <div className="kv-medals">{achievements.map((item, index) => <button type="button" className={`kv-medal${item.open ? " is-open" : ""}`} key={item.id} aria-pressed={selectedAchievement === item.id} aria-label={`${item.name}. ${item.open ? "Открыто в примере" : "Закрыто"}. ${item.rule}`} aria-controls="player-achievement-detail" onClick={() => setSelectedAchievement(item.id)}><span className="kv-medal-circle"><span className="kv-medal-art" style={{ backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100 / 3}%` }} aria-hidden="true" />{!item.open && <span className="kv-medal-lock"><ProfileIcon name="lock" /></span>}</span><span>{item.name}</span><span className="player-award-tooltip" role="tooltip">{item.rule}</span></button>)}</div>
        <div className="kv-award-detail" id="player-achievement-detail" aria-live="polite"><span className="kv-badge"><ProfileIcon name={award.open ? "check" : "lock"} />{award.open ? "Открыто в примере" : "Пока закрыто"}</span><h3>{award.name}</h3><p>{award.rule}</p><small>{award.progress}</small></div>
      </>}
      {view === "cards" && <ResultCard profile={profile} result={{ name: result.name, date: result.date, result: result.result, partner: result.partner, wins: result.wins, matches: result.matches.length, topEight: result.id === "autumn" }} />}
      {view === "history" && <><p className="kv-muted kv-small">Пример истории участника KYNG CUP</p>{historyList()}</>}
      {view === "result" && <><span className="kv-badge">{result.result}</span><p className="kv-muted kv-small player-result-date">{result.date} · {result.partner}</p><section className="kv-section"><h3>Матчи</h3>{result.matches.map(match => <div className="kv-match" key={match.rivals}><span>{match.rivals}<small>{match.stage}</small></span><b>{match.score}</b></div>)}</section><div className="kv-section"><Action secondary onClick={() => move("cards")}>Моя карточка результата</Action></div></>}
      {view === "partners" && <><p className="kv-muted kv-small">Пример партнёров по турнирам KYNG CUP</p>{[["DH", "Daniel Horvat", "6 турниров · 11 побед"], ["MS", "Maria Schmidt", "2 турнира · 3 победы"]].map(([initial, name, stats]) => <article key={name} className="kv-box player-partner-card"><div className="kv-person"><span className="kv-avatar">{initial}</span><div><strong>{name}</strong><small>{stats} вместе</small></div></div><Action secondary onClick={() => { setShowEvents(true); move("mine"); }}>Выбрать турнир для пары</Action></article>)}</>}
      {view === "schedule" && <><article className="kv-box"><span className="kv-badge">Участие подтверждено · пример</span><h2>KYNG Winter Cup</h2><p className="kv-muted">14 ноября · 10:00</p><div className="kv-details"><div className="kv-detail"><ProfileIcon name="pin" /><div>Padelzone Vienna<small>Вена</small></div></div><div className="kv-detail"><ProfileIcon name="people" /><div>Daniel Horvat<small>Ваш партнёр в примере</small></div></div></div></article><section className="kv-section"><h3>Группа B · пример расписания</h3>{[["10:15", "Корт 4", "M. Weiss / T. Berger"], ["11:00", "Корт 2", "L. Graf / N. König"], ["11:45", "Корт 4", "P. Novak / I. Costa"]].map(([time, court, rivals]) => <div className="kv-match" key={time}><span>{rivals}<small>{court}</small></span><b>{time}</b></div>)}</section></>}
    </div>
    <nav className="kv-nav" aria-label="Разделы кабинета">
      <a href={`${basePath}/`}><ProfileIcon name="home" /><span>Главная</span></a>
      <button type="button" onClick={() => move("mine", true)} aria-current={!profileViews.includes(view) ? "page" : undefined}><ProfileIcon name="calendar" /><span>Мои турниры</span></button>
      <button type="button" onClick={() => move("profile", true)} aria-current={profileViews.includes(view) ? "page" : undefined}><ProfileIcon name="user" /><span>Профиль</span></button>
    </nav>
  </div></main>;
}
