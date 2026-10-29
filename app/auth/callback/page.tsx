"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { supabase, hasRecoveryRedirect } from "@/lib/supabase";
import { accountError, accountPassword, siteBasePath } from "@/lib/player-account";
import { clearVerification, rememberVerification, takeOAuthExpectation } from "@/lib/player-security";

export default function AuthCallbackPage() {
  const basePath = siteBasePath(usePathname());
  const [status, setStatus] = useState("Проверяем ссылку…");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const intent = params.get("intent");
    const callbackError = params.get("error") || fragment.get("error");
    async function finish() {
      const initialization = await supabase.auth.initialize();
      // Credentials must not stay in history, analytics, referrers or copied links.
      history.replaceState({}, "", `${basePath}/auth/callback/`);
      if (initialization.error) throw initialization.error;
      if (callbackError) throw new Error("Не удалось завершить вход: ссылка истекла, была использована или действие отменено. Вернитесь в кабинет и повторите.");
      const result = await supabase.auth.getUser();
      const user = result.data.user;
      if (intent === "email") {
        setStatus("Ссылка обработана. Если вы подтвердили только один адрес, откройте письмо на второй почте. Действующий email появится в настройках после завершения подтверждений.");
        return;
      }
      if (result.error || !user) {
        setStatus("Ссылка обработана. Войдите в аккаунт. Если подтверждение не завершено, запросите новое письмо."); return;
      }
      if (intent === "link" || intent === "reauthenticate") {
        const expected = takeOAuthExpectation();
        if (!expected || expected.intent !== intent || expected.userId !== user.id) {
          clearVerification();
          await supabase.auth.signOut({ scope: "local" });
          throw new Error("Выбран другой аккаунт или проверка истекла. Войдите в исходный аккаунт KYNG CUP и повторите действие.");
        }
        rememberVerification(user.id);
        location.replace(`${basePath}/profile/?view=settings`);
      } else if (intent === "recovery") {
        if (!hasRecoveryRedirect()) throw new Error("Ссылка восстановления недействительна. Запросите новую в кабинете.");
        setRecovery(true); setStatus("Задайте новый пароль для своего аккаунта.");
      } else location.replace(`${basePath}/profile/`);
    }
    void finish().catch(cause => { history.replaceState({}, "", `${basePath}/auth/callback/`); setError(accountError(cause)); setStatus("Не удалось завершить действие."); });
  }, [basePath]);

  async function reset(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      accountPassword(password);
      if (password !== repeat) throw new Error("Пароли не совпадают.");
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword(""); setRepeat(""); setRecovery(false);
      clearVerification();
      // A saved password and revoked sessions are separate outcomes.
      const signOut = await supabase.auth.signOut({ scope: "global" }).catch(() => ({ error: new Error("Sign-out unavailable") }));
      setStatus(signOut.error
        ? "Пароль сохранён, но не удалось завершить другие сеансы. Выйдите из аккаунта на остальных устройствах вручную."
        : "Пароль сохранён. Войдите с новым паролем. Другие устройства попросят войти повторно после завершения их сессий.");
    } catch (cause) { setError(accountError(cause)); }
    finally { setBusy(false); }
  }
  return <main className="player-account" lang="ru"><div className="kv-phone"><header className="kv-header"><a className="kv-logo" href={`${basePath}/`}>KYNG CUP</a></header><div className="kv-body"><h1>{recovery ? "Новый пароль" : "Ваш аккаунт"}</h1><p role="status">{status}</p>
    {recovery && <form className="kv-fields kv-section" onSubmit={event => void reset(event)}><label>Новый пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label><label>Повторите пароль<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} /></label><button type="submit" className="kv-primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить пароль"}</button></form>}
    {error && <p className="kv-message player-error" role="alert">{error}</p>}<a className="kv-secondary player-callback-link" href={`${basePath}/profile/`}>Перейти в кабинет</a>
  </div></div></main>;
}
