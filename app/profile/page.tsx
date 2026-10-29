"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { accountEmail, accountError, accountPassword, authCallbackUrl, siteBasePath, type AccountProfile } from "@/lib/player-account";
import { avatarUrl, createPlayerProfile, initialPlayerName, prepareAvatar, saveAccountProfile } from "@/lib/player-account-client";
import { clearVerification, googleEnabled, recentlyVerified, rememberVerification, startGoogle } from "@/lib/player-security";
import { formatTournamentDate, usePublicTournaments } from "../public-tournaments";
import { achievements } from "./profile-data";
import AuthPanel from "./auth-panel";
import ProfileIcon from "./profile-icon";
import { usePlayerAccount } from "./use-player-account";

type View = "profile" | "mine" | "settings" | "achievements" | "history" | "partners" | "cards";

function ProfileCompletion({ user, onSave }: { user: User; onSave: (profile: AccountProfile) => void }) {
  const [name, setName] = useState(() => initialPlayerName(user));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function complete(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { onSave(await createPlayerProfile(user, name)); }
    catch (cause) { setError(accountError(cause)); }
    finally { setBusy(false); }
  }
  return <><h1>Как вас представить?</h1><p className="kv-muted">Почта подтверждена: {user.email}. Укажите имя для профиля. Фото можно добавить позже.</p><form className="kv-fields kv-section" onSubmit={event => void complete(event)}><label>Имя и фамилия<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy} /></label><button className="kv-primary" disabled={busy}>{busy ? "Создаём профиль…" : "Открыть мой профиль"}</button></form>{error && <p className="kv-message player-error" role="alert">{error}</p>}</>;
}

function PlayerAccount({ user, profile, basePath, onSave, reload }: { user: User; profile: AccountProfile; basePath: string; onSave: (profile: AccountProfile) => void; reload: () => Promise<boolean> }) {
  const [view, setView] = useState<View>("profile");
  const [draft, setDraft] = useState(profile);
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState<Blob | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showEvents, setShowEvents] = useState(false);
  const [selectedAward, setSelectedAward] = useState<string>(achievements[0].id);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [google, setGoogle] = useState(false);
  const photoJob = useRef({ id: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasGoogle = user.identities?.some(identity => identity.provider === "google");
  const { tournaments, loading, error: tournamentError } = usePublicTournaments();
  const [now] = useState(() => Date.now());
  const available = tournaments.filter(item => item.registration_status !== "closed" && item.starts_at && Date.parse(item.ends_at || item.starts_at) >= now);
  const award = achievements.find(item => item.id === selectedAward) ?? achievements[0];
  const initials = profile.display_name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    const jobs = photoJob.current;
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(location.search).get("view") === "settings") setView("settings");
      setVerified(recentlyVerified(user.id)); history.replaceState({}, "", `${basePath}/profile/`);
    }, 0);
    const interval = window.setInterval(() => setVerified(recentlyVerified(user.id)), 1000);
    void googleEnabled().then(setGoogle).catch(() => setGoogle(false));
    return () => { window.clearTimeout(timer); window.clearInterval(interval); jobs.id++; };
  }, [user.id, basePath]);
  useEffect(() => {
    let active = true;
    void avatarUrl(user.id, profile.avatar_path).then(url => { if (active) setSource(url); }).catch(() => { if (active) { setSource(""); setError("Не удалось загрузить фото. Обновите данные, чтобы повторить."); } });
    return () => { active = false; };
  }, [user.id, profile.avatar_path, profile.updated_at]);
  useEffect(() => {
    if (!(photo instanceof Blob)) return;
    const url = URL.createObjectURL(photo), timer = window.setTimeout(() => setPreview(url), 0);
    return () => { window.clearTimeout(timer); URL.revokeObjectURL(url); };
  }, [photo]);

  function move(next: View) {
    if (busy) return; photoJob.current.id++; setNotice(""); setError("");
    if (next === "settings") { setDraft(profile); setPhoto(undefined); setPreview(""); }
    setView(next); window.scrollTo({ top: 0, behavior: "instant" });
    window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  async function action(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setNotice(""); setError("");
    try { await work(); } catch (cause) { setError(accountError(cause)); } finally { setBusy(false); }
  }
  function requireVerification() {
    if (!recentlyVerified(user.id)) { setVerified(false); throw new Error("Сначала подтвердите вход в блоке ниже."); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const saved = await saveAccountProfile(draft, draft.display_name, photo);
      onSave(saved.profile); setDraft(saved.profile); setPhoto(undefined); setPreview("");
      setNotice(saved.cleanupFailed ? "Профиль сохранён. Старый файл пока не удалось удалить." : "Профиль сохранён на всех устройствах.");
    });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || busy) return;
    const job = ++photoJob.current.id; setBusy(true); setError(""); setNotice("Подготавливаем фото…");
    try { const blob = await prepareAvatar(file); if (job === photoJob.current.id) { setPhoto(blob); setNotice("Фото готово. Сохраните изменения."); } }
    catch (cause) { if (job === photoJob.current.id) setError(accountError(cause)); }
    finally { if (job === photoJob.current.id) setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const result = await supabase.auth.signInWithPassword({ email: user.email!, password: currentPassword });
      setCurrentPassword(""); if (result.error) throw result.error;
      if (result.data.user?.id !== user.id) { await supabase.auth.signOut({ scope: "local" }); throw new Error("Войдите в исходный аккаунт и повторите."); }
      rememberVerification(user.id); setVerified(true); setNotice("Вход подтверждён на 5 минут.");
    });
  }
  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      requireVerification(); const email = accountEmail(newEmail);
      if (email.toLowerCase() === user.email?.toLowerCase()) throw new Error("Укажите новый адрес почты.");
      const result = await supabase.auth.updateUser({ email }, { emailRedirectTo: authCallbackUrl(location.origin, location.pathname, "email") });
      if (result.error) throw result.error;
      setNewEmail(""); setNotice("Подтвердите изменение по ссылкам на старой и новой почте. До завершения действует прежний адрес."); await reload();
    });
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      requireVerification(); accountPassword(password); if (password !== repeat) throw new Error("Пароли не совпадают.");
      const result = await supabase.auth.updateUser({ password }); if (result.error) throw result.error;
      setPassword(""); setRepeat(""); clearVerification(); setVerified(false);
      const signOut = await supabase.auth.signOut({ scope: "others" });
      setNotice(signOut.error ? "Пароль сохранён. Не удалось завершить остальные сессии." : "Пароль сохранён. Можно входить с почтой и паролем. Остальные устройства попросят войти повторно после завершения их сессий.");
    });
  }
  const displayPhoto = view === "settings" ? photo === null ? "" : photo instanceof Blob ? preview : source : source;
  const title: Record<View, string> = { profile: "Профиль", mine: "Мои турниры", settings: "Настройки профиля", achievements: "Достижения", history: "История и матчи", partners: "Мои партнёры", cards: "Мои карточки" };
  return <>
    {view !== "profile" && view !== "mine" && <button className="kv-back" type="button" disabled={busy} onClick={() => move("profile")}><ProfileIcon name="back" />Назад</button>}
    <h1 ref={heading} tabIndex={-1}>{title[view]}</h1>
    {view === "profile" && <>
      <div className="kv-person"><span className="kv-avatar">{source ? <img src={source} alt="Фото игрока" width="72" height="72" referrerPolicy="no-referrer" /> : initials}</span><div><strong>{profile.display_name}</strong><small>{user.email}</small></div></div><span className="kv-badge">Почта подтверждена</span>
      <section className="kv-section"><p className="kv-note">Ваш профиль готов. История матчей и статистика появятся после подключения результатов турниров.</p></section>
      <section className="kv-section">{([["history", "История и матчи", "Пока нет результатов"], ["partners", "Мои партнёры", "Пока нет связанных выступлений"], ["achievements", "Достижения", "Условия наград"], ["cards", "Мои карточки", "После появления результатов"]] as const).map(([id, label, detail]) => <button type="button" key={id} className="kv-row" onClick={() => move(id)}><span>{label}<small>{detail}</small></span><ProfileIcon name="next" /></button>)}</section>
      <section className="kv-section"><button type="button" className="kv-secondary" onClick={() => move("settings")}><ProfileIcon name="settings" />Настройки профиля</button></section>
    </>}
    {view === "settings" && <>
      <fieldset className="player-settings-fields" disabled={busy}>
        <div className="kv-photo-setting"><span className="kv-avatar">{displayPhoto ? <img src={displayPhoto} alt="Фото игрока" width="72" height="72" /> : initials}</span><div><button type="button" className="kv-secondary" onClick={() => fileInput.current?.click()}>{displayPhoto ? "Заменить фото" : "Добавить фото"}</button><small>JPG, PNG, WebP · до 5 МБ</small>{displayPhoto && <button className="kv-link" type="button" onClick={() => { photoJob.current.id++; setPhoto(null); setPreview(""); }}>Удалить фото</button>}</div></div>
        <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInput} hidden onChange={event => void upload(event)} />
        <form className="kv-fields" onSubmit={event => void save(event)}><label>Имя и фамилия<input autoComplete="name" maxLength={80} required value={draft.display_name} onChange={event => setDraft(value => ({ ...value, display_name: event.target.value }))} /></label><p className="kv-muted kv-small">Имя и фото хранятся в аккаунте. Изменение имени сохраняет ваш ID игрока.</p><button className="kv-primary" type="submit">{busy ? "Сохраняем…" : "Сохранить профиль"}</button></form>
        <button type="button" className="kv-link" onClick={() => void action(async () => { if (!await reload()) return; setPhoto(undefined); setPreview(""); setNotice("Актуальные данные загружены. Откройте настройки снова для редактирования."); setView("profile"); })}>Загрузить актуальные данные</button>
        <section className="kv-section"><h3>Почта и способы входа</h3><p className="kv-muted player-settings-copy">{user.email} · подтверждена</p>{user.new_email && <p className="kv-note">Ожидает подтверждения: {user.new_email}. Завершите подтверждение на обеих почтах.</p>}<p className="kv-muted kv-small">{hasGoogle ? "Google подключён. Смена почты KYNG CUP не меняет ваш аккаунт Google." : "Google пока не подключён."}</p></section>
        <section className="kv-section player-security"><h3>Подтвердите вход</h3><p className="kv-muted kv-small player-settings-copy">Перед сменой почты, пароля или подключением Google подтвердите, что это вы.</p>{verified ? <p className="kv-badge">Вход подтверждён</p> : <><form className="kv-fields" onSubmit={event => void verify(event)}><label>Текущий пароль<input type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><button className="kv-secondary" type="submit">Подтвердить паролем</button></form>{hasGoogle && <button className="kv-secondary player-google" type="button" onClick={() => void action(() => startGoogle("reauthenticate", user.id))}>Подтвердить через Google</button>}</>}</section>
        <section className="kv-section"><form className="kv-fields" onSubmit={event => void changeEmail(event)}><label>Новый email<input type="email" autoComplete="email" maxLength={254} required value={newEmail} onChange={event => setNewEmail(event.target.value)} /></label><button type="submit" className="kv-secondary" disabled={!verified}>Подтвердить смену email</button></form></section>
        <section className="kv-section"><h3>Задать или изменить пароль</h3><form className="kv-fields player-settings-copy" onSubmit={event => void changePassword(event)}><label>Новый пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label><label>Повторите пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} /></label><button type="submit" className="kv-secondary" disabled={!verified}>Сохранить пароль</button></form></section>
        {!hasGoogle && <section className="kv-section"><button type="button" className="kv-secondary" disabled={!verified || !google} onClick={() => void action(async () => { requireVerification(); await startGoogle("link", user.id); })}>Подключить Google</button>{!google && <p className="kv-muted kv-small">Google ещё настраивается.</p>}</section>}
      </fieldset><p className="kv-muted kv-small kv-section">ID игрока: {profile.player_id}</p>
    </>}
    {view === "mine" && <><section className="kv-empty"><div className="kv-empty-icon"><ProfileIcon name="calendar" /></div><h2>Выберите следующую игру</h2><p>Связь заявок с аккаунтом ещё готовится. Заявка через форму пока не появится здесь автоматически.</p><button className="kv-primary" type="button" onClick={() => setShowEvents(value => !value)}>{showEvents ? "Скрыть турниры" : "Посмотреть турниры"}</button></section>{showEvents && <section className="player-event-list kv-section" aria-label="Доступные турниры"><h3>Доступные турниры</h3>{loading ? <p role="status">Загружаем турниры…</p> : tournamentError ? <p role="alert">Не удалось загрузить турниры. <a href={`${basePath}/upcoming-tournaments/`}>Открыть календарь</a></p> : available.length === 0 ? <p className="kv-note">Новая регистрация пока не открыта.</p> : available.map(item => <article className="kv-box" key={item.id}><span className="kv-badge">{item.registration_status === "waitlist" ? "Лист ожидания" : "Регистрация открыта"}</span><p className="kv-when">{formatTournamentDate(item, "ru", true)}</p><h2>{item.name}</h2><p className="kv-muted">{item.location || "Место будет объявлено"}</p><a className="kv-primary player-register-link" href={`${basePath}/register/?tournament=${encodeURIComponent(item.slug)}&sport=${item.sport}`}>Открыть форму заявки</a></article>)}</section>}</>}
    {view === "achievements" && <><p className="kv-muted kv-small">Условия будущих наград. Расчёт достижений ещё не подключён; полученные награды пока не определяются.</p><div className="kv-medals kv-section">{achievements.map((item, index) => <button type="button" className="kv-medal" key={item.id} aria-pressed={selectedAward === item.id} aria-label={`${item.name}. ${item.rule}`} aria-controls="player-achievement-detail" onClick={() => setSelectedAward(item.id)}><span className="kv-medal-circle"><span className="kv-medal-art" style={{ backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100 / 3}%` }} aria-hidden="true" /><span className="kv-medal-lock"><ProfileIcon name="lock" /></span></span><span>{item.name}</span></button>)}</div><div className="kv-award-detail" id="player-achievement-detail" aria-live="polite"><h3>{award.name}</h3><p>{award.rule}</p></div></>}
    {(["history", "partners", "cards"] as View[]).includes(view) && <section className="kv-empty"><div className="kv-empty-icon"><ProfileIcon name="calendar" /></div><h2>{view === "history" ? "Результатов пока нет" : view === "partners" ? "Партнёров пока нет" : "Карточки появятся позже"}</h2><p>{view === "cards" ? "Карточку можно будет создать после появления подтверждённых результатов." : "Связь с выступлениями и результатами турниров появится на следующем этапе."}</p></section>}
    {notice && <p className="kv-message" role="status">{notice}</p>}{error && <p className="kv-message player-error" role="alert">{error}</p>}
    <section className="kv-section"><button type="button" className="kv-link" disabled={busy} onClick={() => void action(async () => { const result = await supabase.auth.signOut({ scope: "local" }); if (result.error) throw result.error; clearVerification(); })}>Выйти из аккаунта</button></section>
    <nav className="kv-nav" aria-label="Разделы кабинета"><a href={`${basePath}/`}><ProfileIcon name="home" /><span>Главная</span></a><button type="button" disabled={busy} onClick={() => move("mine")} aria-current={view === "mine" ? "page" : undefined}><ProfileIcon name="calendar" /><span>Мои турниры</span></button><button type="button" disabled={busy} onClick={() => move("profile")} aria-current={view !== "mine" ? "page" : undefined}><ProfileIcon name="user" /><span>Профиль</span></button></nav>
  </>;
}

export default function ProfilePage() {
  const basePath = siteBasePath(usePathname());
  const account = usePlayerAccount();
  return <main className="player-account" lang="ru" translate="no"><div className="kv-phone"><header className="kv-header"><a className="kv-logo" href={`${basePath}/`} aria-label="Главная KYNG CUP">KYNG CUP</a></header><div className="kv-body">
    {account.loading ? <p role="status">Открываем ваш кабинет…</p> : !account.user ? <AuthPanel basePath={basePath} /> : !account.user.email_confirmed_at ? <><h1>Подтвердите почту</h1><p>Подтвердите адрес, чтобы открыть профиль.</p><button className="kv-link" type="button" onClick={() => void supabase.auth.signOut({ scope: "local" })}>Выйти</button></> : account.error && !account.profile ? <><h1>Не удалось открыть профиль</h1><p className="player-error" role="alert">{account.error}</p><button className="kv-secondary" type="button" onClick={() => void account.reload()}>Повторить</button><button className="kv-link" type="button" onClick={() => void supabase.auth.signOut({ scope: "local" })}>Выйти</button></> : account.profile ? <PlayerAccount key={account.user.id} user={account.user} profile={account.profile} basePath={basePath} onSave={account.acceptProfile} reload={account.reload} /> : <ProfileCompletion key={account.user.id} user={account.user} onSave={account.acceptProfile} />}
    {account.error && account.profile && <p className="kv-message player-error" role="alert">Не удалось обновить данные. {account.error}</p>}
  </div></div></main>;
}
