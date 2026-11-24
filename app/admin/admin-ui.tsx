"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { adminCopy } from "./admin-copy";

type Locale = "en" | "ru";
type ConfirmOptions = {
  title: string;
  detail?: string;
  action: string;
  danger?: boolean;
  exactName?: string;
};
type AdminContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (text: string) => string;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};
const AdminContext = createContext<AdminContextValue | null>(null);
const localeKey = "kyngcup.admin.locale";

export function useAdminUI() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("Missing admin UI provider.");
  return context;
}

export function AdminUI({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const [value, setValue] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const answer = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(() => {
    try { if (window.localStorage.getItem(localeKey) === "ru") setLocale("ru"); } catch { /* Storage may be disabled. */ }
    return () => answer.current?.(false);
  }, []);

  useEffect(() => {
    if (request && !dialog.current?.open) dialog.current?.showModal();
  }, [request]);

  function chooseLocale(next: Locale) {
    setLocale(next);
    try { window.localStorage.setItem(localeKey, next); } catch { /* Keep the in-memory selection. */ }
  }

  function confirm(next: ConfirmOptions) {
    if (answer.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      answer.current = resolve;
      setValue("");
      setRequest(next);
    });
  }

  function finish(accepted: boolean) {
    dialog.current?.close();
    const resolve = answer.current;
    answer.current = null;
    setRequest(null);
    resolve?.(accepted);
  }

  const t = (text: string) => locale === "ru" ? adminCopy[text] ?? text : text;
  return <AdminContext.Provider value={{ locale, setLocale: chooseLocale, t, confirm }}>
    {children}
    {request && <dialog ref={dialog} className="admin-dialog" lang={locale} aria-labelledby="admin-dialog-title"
      aria-describedby={request.detail ? "admin-dialog-detail" : undefined}
      onCancel={event => { event.preventDefault(); finish(false); }}>
      <form onSubmit={event => { event.preventDefault(); if (!request.exactName || value === request.exactName) finish(true); }}>
        <h2 id="admin-dialog-title">{t(request.title)}</h2>
        {request.detail && <p id="admin-dialog-detail">{t(request.detail)}</p>}
        {request.exactName && <label className="admin-field">
          <span>{t("Enter the exact tournament name")} · {request.exactName}</span>
          <input value={value} onChange={event => setValue(event.target.value)} required />
        </label>}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-button" onClick={() => finish(false)}>{t("Cancel")}</button>
          <button type="submit" className={request.danger ? "admin-button is-danger" : "admin-button is-primary"}
            disabled={Boolean(request.exactName) && value !== request.exactName}>{t(request.action)}</button>
        </div>
      </form>
    </dialog>}
  </AdminContext.Provider>;
}

export function AdminLocale() {
  const { locale, setLocale, t } = useAdminUI();
  return <div className="admin-locale" role="group" aria-label={t("Admin language")}>
    <button type="button" aria-pressed={locale === "en"} lang="en" onClick={() => setLocale("en")}>EN</button>
    <button type="button" aria-pressed={locale === "ru"} lang="ru" onClick={() => setLocale("ru")}>RU</button>
  </div>;
}
