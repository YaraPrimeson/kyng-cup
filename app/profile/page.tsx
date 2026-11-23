"use client";

import { useProfileLanguage } from "./profile-i18n";
import LanguageSelect from "../language-select";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { accountEmail, accountError, accountPassword, authCallbackUrl, profileName, siteBasePath, type AccountProfile } from "@/lib/player-account";
import { avatarUrl, createPlayerProfile, suggestedPlayerName, prepareAvatar, saveAccountProfile } from "@/lib/player-account-client";
import { clearVerification, recentlyVerified, rememberVerification, startGoogle } from "@/lib/player-security";
import { formatTournamentDate, usePublicTournaments } from "../public-tournaments";
import PlayerResults from "./player-results";
import PlayerPartners from "./player-partners";
import PlayerCards from "./player-cards";
import AuthPanel from "./auth-panel";
import MyRegistrations from "./my-registrations";
import ProfileIcon from "./profile-icon";
import { SeasonRanking } from "./tournament-updates";
import { usePlayerAccount } from "./use-player-account";

type Credential = "email" | "password";

type View = "profile" | "mine" | "settings" | "achievements" | "history" | "partners" | "cards" | "ranking";

function ProfileCompletion({ user, onSave }: { user: User; onSave: (profile: AccountProfile) => void }) {
  const { text: t } = useProfileLanguage();
  const [name, setName] = useState(() => suggestedPlayerName(user) ?? t("Игрок KYNG"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function complete(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { onSave(await createPlayerProfile(user, name)); }
    catch (cause) { setError(accountError(cause)); }
    finally { setBusy(false); }
  }
  return <><h1>{t("Как вас представить?")}</h1><p className="kv-muted">{t("Почта подтверждена: ")}{user.email}{t(". Укажите имя для профиля. Фото можно добавить позже.")}</p><form className="kv-fields kv-section" onSubmit={event => void complete(event)}><label>{t("Имя и фамилия")}<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={busy} /></label><button className="kv-primary" disabled={busy}>{busy ? t("Создаём профиль…") : t("Открыть мой профиль")}</button></form>{error && <p className="kv-message player-error" role="alert">{t(error)}</p>}</>;
}

function PlayerAccount({ user, profile, basePath, onSave, reload }: { user: User; profile: AccountProfile; basePath: string; onSave: (profile: AccountProfile) => void; reload: () => Promise<boolean> }) {
  const { text: t, language } = useProfileLanguage();
  const [view, setView] = useState<View>("profile");
  const [draft, setDraft] = useState(profile);
  const [name, setName] = useState(profile.display_name);
  const [profileNotice, setProfileNotice] = useState<{ text: string; saved?: boolean }>();
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState<Blob | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showEvents, setShowEvents] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [credential, setCredential] = useState<Credential>();
  const photoJob = useRef({ id: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasGoogle = user.identities?.some(identity => identity.provider === "google");
  const { tournaments, loading, error: tournamentError } = usePublicTournaments();
  const [now] = useState(() => Date.now());
  const available = tournaments.filter(item => item.registration_status !== "closed" && item.starts_at && Date.parse(item.ends_at || item.starts_at) >= now);
  const initials = profile.display_name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase();

  useEffect(() => {
    const jobs = photoJob.current;
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(location.search).get("view") === "settings") setView("settings");
      setVerified(recentlyVerified(user.id)); history.replaceState({}, "", `${basePath}/profile/`);
    }, 0);
    const interval = window.setInterval(() => setVerified(recentlyVerified(user.id)), 1000);
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
    resetCredentialForm();
    setProfileNotice(undefined);
    if (next === "settings") { setDraft(profile); setName(profile.display_name); setPhoto(undefined); setPreview(""); }
    setView(next); window.scrollTo({ top: 0, behavior: "instant" });
    window.requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  async function action(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setNotice(""); setError("");
    try { await work(); } catch (cause) { setError(accountError(cause)); } finally { setBusy(false); }
  }
  function resetCredentialForm(next?: Credential) {
    setCredential(next);
    setCurrentPassword("");
    setNewEmail("");
    setPassword("");
    setRepeat("");
  }
  function toggleCredential(next: Credential) {
    setError("");
    setNotice("");
    resetCredentialForm(credential === next ? undefined : next);
  }
  async function verifyForChange() {
    if (recentlyVerified(user.id)) return;
    if (!currentPassword) {
      setVerified(false);
      throw new Error("Введите текущий пароль.");
    }
    const result = await supabase.auth.signInWithPassword({ email: user.email!, password: currentPassword });
    setCurrentPassword("");
    if (result.error) throw result.error;
    if (result.data.user?.id !== user.id) {
      await supabase.auth.signOut({ scope: "local" });
      throw new Error("Войдите в исходный аккаунт и повторите.");
    }
    rememberVerification(user.id);
    setVerified(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      setProfileNotice(undefined);
      const displayName = profileName(name);
      if (displayName === draft.display_name && (photo === undefined || (photo === null && !draft.avatar_path))) {
        setName(displayName);
        setProfileNotice({ text: "Изменений нет." });
        return;
      }
      const saved = await saveAccountProfile(draft, displayName, photo);
      onSave(saved.profile); setDraft(saved.profile); setName(saved.profile.display_name); setPhoto(undefined); setPreview("");
      setProfileNotice({
        saved: true,
        text: saved.cleanupFailed ? "Профиль сохранён. Старый файл пока не удалось удалить." : "Изменения профиля сохранены.",
      });
    });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || busy) return;
    const job = ++photoJob.current.id; setBusy(true); setError(""); setProfileNotice({ text: "Подготавливаем фото…" });
    try { const blob = await prepareAvatar(file); if (job === photoJob.current.id) { setPhoto(blob); setProfileNotice({ text: "Фото готово. Сохраните изменения." }); } }
    catch (cause) { if (job === photoJob.current.id) { setProfileNotice(undefined); setError(accountError(cause)); } }
    finally { if (job === photoJob.current.id) setBusy(false); }
  }
  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      const email = accountEmail(newEmail);
      if (email.toLowerCase() === user.email?.toLowerCase()) throw new Error("Укажите новый адрес почты.");
      await verifyForChange();
      const result = await supabase.auth.updateUser({ email }, { emailRedirectTo: authCallbackUrl(location.origin, location.pathname, "email") });
      if (result.error) throw result.error;
      resetCredentialForm(); setNotice("Подтвердите изменение по ссылкам на старой и новой почте. До завершения действует прежний адрес."); await reload();
    });
  }
  async function changePassword(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      accountPassword(password);
      if (password !== repeat) throw new Error("Пароли не совпадают.");
      await verifyForChange();
      const result = await supabase.auth.updateUser({ password }); if (result.error) throw result.error;
      resetCredentialForm(); clearVerification(); setVerified(false);
      const signOut = await supabase.auth.signOut({ scope: "others" });
      setNotice(signOut.error ? "Пароль сохранён. Не удалось завершить остальные сессии." : "Пароль сохранён. Можно входить с почтой и паролем. Остальные устройства попросят войти повторно после завершения их сессий.");
    });
  }
  const displayPhoto = view === "settings" ? photo === null ? "" : photo instanceof Blob ? preview : source : source;
  const title: Record<View, string> = { profile: "Профиль", mine: "Мои турниры", settings: "Настройки профиля", achievements: "Достижения", history: "История и матчи", partners: "Мои партнёры", cards: "Мои карточки", ranking: "Сезонный рейтинг" };
  return <>
    {view !== "profile" && view !== "mine" && <button className="kv-back" type="button" disabled={busy} onClick={() => move("profile")}><ProfileIcon name="back" />{t("Назад")}</button>}
    <h1 ref={heading} tabIndex={-1}>{t(title[view])}</h1>
    {view === "profile" && <>
      <div className="kv-person"><span className="kv-avatar">{source ? <img src={source} alt={t("Фото игрока")} width="72" height="72" referrerPolicy="no-referrer" /> : initials}</span><div><strong>{profile.display_name}</strong><small>{user.email}</small></div></div>
      <section className="kv-section">{([["history", t("История и матчи"), t("Результаты и статистика")], ["partners", t("Мои партнёры"), t("Совместные турниры и результаты")], ["achievements", t("Достижения"), t("Награды и прогресс")], ["cards", t("Мои карточки"), t("Результаты для публикации")], ["ranking", t("Сезонный рейтинг"), t("Место и очки по сезонам")]] as const).map(([id, label, detail]) => <button type="button" key={id} className="kv-row" onClick={() => move(id)}><span>{label}<small>{detail}</small></span><ProfileIcon name="next" /></button>)}</section>
      <section className="kv-section"><button type="button" className="kv-secondary" onClick={() => move("settings")}><ProfileIcon name="settings" />{t("Настройки профиля")}</button></section>
    </>}
    {view === "settings" && <>
      <fieldset className="player-settings-fields" disabled={busy}>
        <div className="kv-photo-setting"><span className="kv-avatar">{displayPhoto ? <img src={displayPhoto} alt={t("Фото игрока")} width="72" height="72" /> : initials}</span><div><button type="button" className="kv-secondary" onClick={() => fileInput.current?.click()}>{displayPhoto ? t("Заменить фото") : t("Добавить фото")}</button><small>{t("JPG, PNG, WebP · до 5 МБ")}</small>{displayPhoto && <button className="kv-link" type="button" onClick={() => { photoJob.current.id++; setPhoto(null); setPreview(""); setProfileNotice(undefined); }}>{t("Удалить фото")}</button>}</div></div>
        <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInput} hidden onChange={event => void upload(event)} />
        <form className="kv-fields" onSubmit={event => void save(event)}>
          <label>{t("Имя и фамилия")}<input autoComplete="name" maxLength={80} required value={name} onChange={event => { setName(event.target.value); setProfileNotice(undefined); }} /></label>
          <button className="kv-primary" type="submit">{busy ? t("Сохраняем…") : t("Сохранить профиль")}</button>
        </form>
        <div role="status">
          {profileNotice && <p className={profileNotice.saved ? "kv-message player-profile-saved" : "kv-message"}>
            {profileNotice.saved && <ProfileIcon name="check" />}{t(profileNotice.text)}
          </p>}
        </div>
        <button type="button" className="kv-link" onClick={() => void action(async () => { if (!await reload()) return; setPhoto(undefined); setPreview(""); setNotice("Актуальные данные загружены. Откройте настройки снова для редактирования."); setView("profile"); })}>{t("Загрузить актуальные данные")}</button>
        <div className="kv-section player-credential-actions">
          {(["password", "email"] as const).map(next => <div key={next}>
            <button className="kv-secondary" type="button" aria-expanded={credential === next} aria-controls={`player-change-${next}`} onClick={() => toggleCredential(next)}>
              {t(next === "password" ? "Изменить пароль" : "Изменить email")}
            </button>
            <div id={`player-change-${next}`} hidden={credential !== next}>
              {credential === next && <form className="kv-fields player-credential-form" onSubmit={event => void (next === "password" ? changePassword(event) : changeEmail(event))}>
                {!verified && <>
                  <label>{t("Текущий пароль")}<input type="password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
                  {hasGoogle && <button className="kv-link" type="button" onClick={() => void action(() => startGoogle("reauthenticate", user.id))}>{t("Подтвердить через Google")}</button>}
                </>}
                {next === "password" ? <>
                  <label>{t("Новый пароль")}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
                  <label>{t("Повторите пароль")}<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} /></label>
                </> : <>
                  {user.new_email && <p className="kv-note">{t("Ожидает подтверждения: ")}{user.new_email}{t(". Завершите подтверждение на обеих почтах.")}</p>}
                  <label>{t("Новый email")}<input type="email" autoComplete="email" maxLength={254} required value={newEmail} onChange={event => setNewEmail(event.target.value)} /></label>
                </>}
                <button type="submit" className="kv-primary">{t(next === "password" ? "Сохранить пароль" : "Подтвердить смену email")}</button>
              </form>}
            </div>
          </div>)}
        </div>
      </fieldset>
    </>}
    {view === "mine" && <><MyRegistrations userId={user.id} basePath={basePath} /><section className="kv-empty"><div className="kv-empty-icon"><ProfileIcon name="calendar" /></div><h2>{t("Выберите следующую игру")}</h2><p>{t("Когда вы отправите новую заявку из своего аккаунта, она появится выше. Заявки, отправленные без входа, автоматически не привязываются.")}</p><button className="kv-primary" type="button" onClick={() => setShowEvents(value => !value)}>{showEvents ? t("Скрыть турниры") : t("Посмотреть турниры")}</button></section>{showEvents && <section className="player-event-list kv-section" aria-label={t("Доступные турниры")}><h3>{t("Доступные турниры")}</h3>{loading ? <p role="status">{t("Загружаем турниры…")}</p> : tournamentError ? <p role="alert">{t("Не удалось загрузить турниры. ")}<a href={`${basePath}/upcoming-tournaments/`}>{t("Открыть календарь")}</a></p> : available.length === 0 ? <p className="kv-note">{t("Новая регистрация пока не открыта.")}</p> : available.map(item => <article className="kv-box" key={item.id}><span className="kv-badge">{item.registration_status === "waitlist" ? t("Лист ожидания") : t("Регистрация открыта")}</span><p className="kv-when">{formatTournamentDate(item, language, true)}</p><h2>{item.name}</h2><p className="kv-muted">{item.location || t("Место будет объявлено")}</p><a className="kv-primary player-register-link" href={`${basePath}/register/?tournament=${encodeURIComponent(item.slug)}&sport=${item.sport}`}>{t("Открыть форму заявки")}</a></article>)}</section>}</>}
    {(view === "history" || view === "achievements") && <PlayerResults key={view} userId={user.id} mode={view} />}
    {view === "partners" && <PlayerPartners userId={user.id} />}
    {view === "ranking" && <SeasonRanking />}
    {view === "cards" && <PlayerCards userId={user.id} name={profile.display_name} photo={source} />}
    {notice && <p className="kv-message" role="status">{t(notice)}</p>}{error && <p className="kv-message player-error" role="alert">{t(error)}</p>}
    {view === "profile" && <section className="kv-section"><button type="button" className="kv-secondary player-sign-out" disabled={busy} onClick={() => void action(async () => { const result = await supabase.auth.signOut({ scope: "local" }); if (result.error) throw result.error; clearVerification(); })}>{t("Выйти из аккаунта")}</button></section>}
    <nav className="kv-nav" aria-label={t("Разделы кабинета")}><a href={`${basePath}/`}><ProfileIcon name="home" /><span>{t("Главная")}</span></a><button type="button" disabled={busy} onClick={() => move("mine")} aria-current={view === "mine" ? "page" : undefined}><ProfileIcon name="calendar" /><span>{t("Мои турниры")}</span></button><button type="button" disabled={busy} onClick={() => move("profile")} aria-current={view !== "mine" ? "page" : undefined}><ProfileIcon name="user" /><span>{t("Профиль")}</span></button></nav>
  </>;
}

export default function ProfilePage() {
  const { text: t, language } = useProfileLanguage();
  const basePath = siteBasePath(usePathname());
  const account = usePlayerAccount();
  return <main className="player-account" lang={language} translate="no"><div className="kv-phone"><header className="kv-header"><a className="kv-logo" href={`${basePath}/`} aria-label={t("Главная KYNG CUP")}>KYNG CUP</a><LanguageSelect /></header><div className="kv-body">
    {account.loading ? <p role="status">{t("Открываем ваш кабинет…")}</p> : !account.user ? <AuthPanel basePath={basePath} /> : !account.user.email_confirmed_at ? <><h1>{t("Подтвердите почту")}</h1><p>{t("Подтвердите адрес, чтобы открыть профиль.")}</p><button className="kv-link" type="button" onClick={() => void supabase.auth.signOut({ scope: "local" })}>{t("Выйти")}</button></> : account.error && !account.profile ? <><h1>{t("Не удалось открыть профиль")}</h1><p className="player-error" role="alert">{t(account.error)}</p><button className="kv-secondary" type="button" onClick={() => void account.reload()}>{t("Повторить")}</button><button className="kv-link" type="button" onClick={() => void supabase.auth.signOut({ scope: "local" })}>{t("Выйти")}</button></> : account.profile ? <PlayerAccount key={account.user.id} user={account.user} profile={account.profile} basePath={basePath} onSave={account.acceptProfile} reload={account.reload} /> : <ProfileCompletion key={account.user.id} user={account.user} onSave={account.acceptProfile} />}
    {account.error && account.profile && <p className="kv-message player-error" role="alert">{t("Не удалось обновить данные. ")}{t(account.error)}</p>}
  </div></div></main>;
}
