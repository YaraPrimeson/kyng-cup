"use client";

import { useEffect, useState } from "react";

type Consent = "all" | "necessary";
const CONSENT_KEY = "kyng-cookie-consent-v2";

function getSiteRoot() {
  return window.location.pathname.includes("/kyng-cup/") ? "/kyng-cup/" : "/";
}

function isHomePage() {
  const pathname = window.location.pathname.replace(/\/+$/, "");
  return pathname === "" || pathname === "/kyng-cup";
}

export default function SiteUtilities() {
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
      const root = getSiteRoot();
      void window.navigator.serviceWorker.register(`${root}sw.js`, { scope: root });
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
            <span className="connection-status"><i /> Connection lost</span>
            <div className="offline-ball" aria-hidden="true"><i /></div>
            <h2>You&apos;re<br />offline<span>.</span></h2>
            <p>The tournament data cannot update without an internet connection. Your current page is safe — reconnect and try again.</p>
            <button type="button" onClick={() => window.location.reload()}>Try again <b aria-hidden="true">↗</b></button>
          </div>
        </section>
      )}

      {showCookies && !isOffline && (
        <aside className="cookie-banner" aria-label="Cookie preferences">
          <div><span>Privacy &amp; cookies</span><p>We use essential browser storage for secure admin sign-in and your preferences. Optional cookies will only be used with your permission.</p><a href={`${siteRoot}cookies/`}>Read cookie policy ↗</a></div>
          <div className="cookie-actions"><button type="button" onClick={() => saveConsent("necessary")}>Necessary only</button><button className="cookie-accept" type="button" onClick={() => saveConsent("all")}>Accept all</button></div>
        </aside>
      )}
    </>
  );
}
