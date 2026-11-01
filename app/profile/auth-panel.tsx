"use client";

import { useProfileLanguage } from "./profile-i18n";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { accountEmail, accountError, accountPassword, authCallbackUrl, profileName } from "@/lib/player-account";
import { googleEnabled, startGoogle } from "@/lib/player-security";

type Mode = "signup" | "signin" | "forgot" | "verify";

export default function AuthPanel({ basePath }: { basePath: string }) {
  const { text: t } = useProfileLanguage();
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [google, setGoogle] = useState<boolean | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    let active = true;
    void googleEnabled().then(value => { if (active) setGoogle(value); }).catch(() => { if (active) setGoogle(false); });
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  function change(next: Mode) { setMode(next); setPassword(""); setMessage(""); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const address = accountEmail(email);
      if (mode === "signup") {
        const result = await supabase.auth.signUp({ email: address, password: accountPassword(password), options: { data: { display_name: profileName(name) }, emailRedirectTo: authCallbackUrl(location.origin, location.pathname, "signup") } });
        if (result.error && !["user_already_exists", "email_exists", "identity_already_exists"].includes(result.error.code ?? "")) throw result.error;
        setMode("verify"); setPassword(""); setCooldown(60);
        setMessage("Если адрес доступен для регистрации, мы отправили письмо. Если вы уже входили через Google, выберите кнопку выше: повторная регистрация не нужна. Пароль можно задать в настройках профиля.");
      } else if (mode === "signin") {
        const result = await supabase.auth.signInWithPassword({ email: address, password });
        if (result.error) throw result.error;
        setPassword("");
      } else if (mode === "forgot") {
        if (cooldown) return;
        const result = await supabase.auth.resetPasswordForEmail(address, { redirectTo: authCallbackUrl(location.origin, location.pathname, "recovery") });
        if (result.error) throw result.error;
        setCooldown(60); setMessage("Если восстановление доступно для этого адреса, мы отправили письмо. Проверьте входящие и спам. Если вы входили через Google, можно продолжить с Google.");
      } else {
        if (cooldown) return;
        const result = await supabase.auth.resend({ type: "signup", email: address, options: { emailRedirectTo: authCallbackUrl(location.origin, location.pathname, "signup") } });
        if (result.error) throw result.error;
        setCooldown(60); setMessage("Если подтверждение требуется, письмо отправлено. Проверьте входящие и спам.");
      }
    } catch (cause) { setError(accountError(cause)); }
    finally { setBusy(false); }
  }

  async function googleSignIn() {
    if (busy) return; setBusy(true); setError("");
    try { await startGoogle("google"); }
    catch (cause) { setError(accountError(cause)); setBusy(false); }
  }

  return <section className="player-auth" aria-label={t("Аккаунт игрока")}>
    <h1>{({ signup: t("Ваш KYNG CUP"), signin: t("С возвращением"), forgot: t("Восстановить доступ"), verify: t("Подтвердите почту") })[mode]}</h1>
    <p className="kv-muted">{mode === "signup" ? t("Создайте аккаунт, чтобы сохранить свой профиль на всех устройствах.") : mode === "verify" ? t("Проверьте почту. Если письмо не пришло, войдите через Google или с существующим паролем.") : t("Войдите в свой аккаунт игрока.")}</p>
    {(mode === "signup" || mode === "signin" || mode === "verify") && <>
      <button type="button" className="kv-secondary player-google" onClick={() => void googleSignIn()} disabled={busy || google !== true}><span aria-hidden="true">G</span>{t("Продолжить с Google")}</button>
      {google === false && <p className="kv-muted kv-small">{t("Google ещё настраивается.")}</p>}
      <p className="player-auth-divider">{t("или через почту")}</p>
    </>}
    <form className="kv-fields" onSubmit={event => void submit(event)}>
      {mode === "signup" && <label>{t("Имя и фамилия")}<input name="name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={80} required disabled={busy} /></label>}
      <label>Email<input name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required disabled={busy} /></label>
      {(mode === "signup" || mode === "signin") && <label>{t("Пароль")}<input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : 1} maxLength={128} required disabled={busy} />{mode === "signup" && <small>{t("От 12 символов. Можно использовать длинную фразу.")}</small>}</label>}
      <button className="kv-primary" type="submit" disabled={busy || ((mode === "forgot" || mode === "verify") && cooldown > 0)}>{busy ? t("Подождите…") : mode === "signup" ? t("Создать аккаунт") : mode === "signin" ? t("Войти") : cooldown > 0 ? t(`Повторить через ${cooldown} с`) : mode === "verify" ? t("Отправить письмо ещё раз") : t("Отправить ссылку")}</button>
    </form>
    {error && <p className="kv-message player-error" role="alert">{t(error)}</p>}
    {message && <p className="kv-message" role="status">{t(message)}</p>}
    <div className="player-auth-links">
      {mode !== "signin" && <button className="kv-link" type="button" disabled={busy} onClick={() => change("signin")}>{t("Уже есть аккаунт? Войти")}</button>}
      {mode === "signin" && <><button className="kv-link" type="button" disabled={busy} onClick={() => change("forgot")}>{t("Забыли пароль?")}</button><button className="kv-link" type="button" disabled={busy} onClick={() => change("signup")}>{t("Создать аккаунт")}</button><button className="kv-link" type="button" disabled={busy} onClick={() => change("verify")}>{t("Повторить подтверждение почты")}</button></>}
      {mode === "verify" && <button className="kv-link" type="button" disabled={busy} onClick={() => change("signup")}>{t("Изменить адрес регистрации")}</button>}
    </div>
    <p className="kv-muted kv-small player-auth-note">{t("Аккаунт не является заявкой на турнир. ")}<a href={`${basePath}/cookies/`}>{t("Конфиденциальность и хранение данных")}</a></p>
  </section>;
}
