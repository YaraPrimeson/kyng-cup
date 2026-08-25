"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./i18n";

type Consent = "all" | "necessary";
const CONSENT_KEY = "kyng-cookie-consent-v2";

const copy = {
  en: { preferences: "Cookie preferences", privacy: "Privacy & cookies", cookieBody: "We use essential browser storage for secure admin sign-in and your preferences. Optional cookies will only be used with your permission.", policy: "Read cookie policy", necessary: "Necessary only", accept: "Accept all" },
  uk: { preferences: "Налаштування cookies", privacy: "Приватність і cookies", cookieBody: "Ми використовуємо необхідне сховище браузера для безпечного входу адміністратора та ваших налаштувань. Необов’язкові cookies — лише з вашого дозволу.", policy: "Політика cookies", necessary: "Лише необхідні", accept: "Прийняти всі" },
  de: { preferences: "Cookie-Einstellungen", privacy: "Datenschutz & Cookies", cookieBody: "Wir nutzen notwendige Browser-Speicherung für die sichere Admin-Anmeldung und Ihre Einstellungen. Optionale Cookies verwenden wir nur mit Ihrer Erlaubnis.", policy: "Cookie-Richtlinie lesen", necessary: "Nur notwendige", accept: "Alle akzeptieren" },
  ru: { preferences: "Настройки cookies", privacy: "Конфиденциальность и cookies", cookieBody: "Мы используем обязательное хранилище браузера для безопасного входа администратора и ваших настроек. Необязательные cookies — только с вашего разрешения.", policy: "Политика cookies", necessary: "Только необходимые", accept: "Принять все" },
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
  const [showCookies, setShowCookies] = useState(false);

  useEffect(() => {
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
      window.clearTimeout(cookieTimer);
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
      {showCookies && (
        <aside className="cookie-banner" aria-label={text.preferences}>
          <div><span>{text.privacy}</span><p>{text.cookieBody}</p><a href={`${siteRoot}cookies/`}>{text.policy} ↗</a></div>
          <div className="cookie-actions"><button type="button" onClick={() => saveConsent("necessary")}>{text.necessary}</button><button className="cookie-accept" type="button" onClick={() => saveConsent("all")}>{text.accept}</button></div>
        </aside>
      )}
    </>
  );
}
