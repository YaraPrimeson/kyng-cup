"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./i18n";

type Consent = "all" | "necessary";
const CONSENT_KEY = "kyng-cookie-consent-v2";

const copy = {
  en: { lost: "Connection lost", offline: "You're offline", offlineBody: "The tournament data cannot update without an internet connection. Your current page is safe — reconnect and try again.", retry: "Try again", preferences: "Cookie preferences", privacy: "Privacy & cookies", cookieBody: "We use essential browser storage for secure admin sign-in and your preferences. Optional cookies will only be used with your permission.", policy: "Read cookie policy", necessary: "Necessary only", accept: "Accept all" },
  uk: { lost: "З’єднання втрачено", offline: "Ви офлайн", offlineBody: "Турнірні дані не можуть оновлюватися без інтернету. Поточна сторінка в безпеці — відновіть з’єднання та спробуйте ще раз.", retry: "Спробувати знову", preferences: "Налаштування cookies", privacy: "Приватність і cookies", cookieBody: "Ми використовуємо необхідне сховище браузера для безпечного входу адміністратора та ваших налаштувань. Необов’язкові cookies — лише з вашого дозволу.", policy: "Політика cookies", necessary: "Лише необхідні", accept: "Прийняти всі" },
  de: { lost: "Verbindung verloren", offline: "Sie sind offline", offlineBody: "Turnierdaten können ohne Internetverbindung nicht aktualisiert werden. Ihre aktuelle Seite ist sicher — stellen Sie die Verbindung wieder her und versuchen Sie es erneut.", retry: "Erneut versuchen", preferences: "Cookie-Einstellungen", privacy: "Datenschutz & Cookies", cookieBody: "Wir nutzen notwendige Browser-Speicherung für die sichere Admin-Anmeldung und Ihre Einstellungen. Optionale Cookies verwenden wir nur mit Ihrer Erlaubnis.", policy: "Cookie-Richtlinie lesen", necessary: "Nur notwendige", accept: "Alle akzeptieren" },
  ru: { lost: "Соединение потеряно", offline: "Вы офлайн", offlineBody: "Турнирные данные не могут обновляться без интернета. Текущая страница в безопасности — восстановите соединение и попробуйте снова.", retry: "Попробовать снова", preferences: "Настройки cookies", privacy: "Конфиденциальность и cookies", cookieBody: "Мы используем обязательное хранилище браузера для безопасного входа администратора и ваших настроек. Необязательные cookies — только с вашего разрешения.", policy: "Политика cookies", necessary: "Только необходимые", accept: "Принять все" },
} as const;

function getSiteRoot() {
  return window.location.pathname.includes("/kyng-cup/") ? "/kyng-cup/" : "/";
}

function isHomePage() {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  return pathname === "" || pathname === "/kyng-cup";
}

export default function SiteUtilities() {
  const { language } = useLanguage();
  const text = copy[language];
  const [isOffline, setIsOffline] = useState(false);
  const [showCookies, setShowCookies] = useState(false);

  useEffect(() => {
    const updateConnection = () => setIsOffline(!window.navigator.onLine);
    const connectionTimer = window.setTimeout(updateConnection, 0);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    const cookieTimer = window.setTimeout(() => {
      if (!isHomePage()) {
        setShowCookies(false);
        return;
      }

      try {
        setShowCookies(!window.localStorage.getItem(CONSENT_KEY));
      } catch {
        setShowCookies(true);
      }
    }, 0);

    if ("serviceWorker" in window.navigator) {
      void window.navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js"))
            .map((registration) => registration.unregister()),
        ),
      );
    }

    return () => {
      window.clearTimeout(connectionTimer);
      window.clearTimeout(cookieTimer);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  function saveConsent(value: Consent) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } finally {
      setShowCookies(false);
    }
  }

  const siteRoot = typeof window === "undefined" ? "/" : getSiteRoot();

  return (
    <>
      {isOffline && (
        <section className="connection-error" role="alert" aria-live="assertive">
          <div className="connection-error-card">
            <span className="connection-status"><i /> {text.lost}</span>
            <div className="offline-ball" aria-hidden="true"><i /></div>
            <h2>{text.offline}<span>.</span></h2>
            <p>{text.offlineBody}</p>
            <button type="button" onClick={() => window.location.reload()}>{text.retry} <b aria-hidden="true">↗</b></button>
          </div>
        </section>
      )}

      {showCookies && !isOffline && (
        <aside className="cookie-banner" aria-label={text.preferences}>
          <div><span>{text.privacy}</span><p>{text.cookieBody}</p><a href={`${siteRoot}cookies/`}>{text.policy} ↗</a></div>
          <div className="cookie-actions"><button type="button" onClick={() => saveConsent("necessary")}>{text.necessary}</button><button className="cookie-accept" type="button" onClick={() => saveConsent("all")}>{text.accept}</button></div>
        </aside>
      )}
    </>
  );
}
