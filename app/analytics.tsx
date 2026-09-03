"use client";

import { useEffect } from "react";

export const ANALYTICS_CONSENT_KEY = "kyng-cookie-consent-v2";
export const ANALYTICS_CONSENT_EVENT = "kyng:cookie-consent";
const GA_ID = "G-SNE2TFJ536";
const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

function getAttribution() {
  return attributionKeys.reduce<Record<string, string>>((values, key) => {
    const value = window.sessionStorage.getItem(`kyng_${key}`);
    if (value) values[key] = value;
    return values;
  }, {});
}

function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  attributionKeys.forEach((key) => {
    const value = params.get(key);
    if (value) window.sessionStorage.setItem(`kyng_${key}`, value);
  });
}

export function withAttribution(href: string) {
  const url = new URL(href, window.location.origin);
  Object.entries(getAttribution()).forEach(([key, value]) => url.searchParams.set(key, value));
  return `${url.pathname}${url.search}${url.hash}`;
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, parameters: Record<string, unknown> = {}) {
  window.gtag?.("event", name, { ...getAttribution(), ...parameters });
}

function enableAnalytics() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(...args: unknown[]) { window.dataLayer.push(args); };
  window.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  if (!document.querySelector(`script[data-kyng-ga="${GA_ID}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.dataset.kyngGa = GA_ID;
    document.head.appendChild(script);
  }
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { anonymize_ip: true, send_page_view: true });
}

export default function Analytics() {
  useEffect(() => {
    captureAttribution();
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(...args: unknown[]) { window.dataLayer.push(args); };
    window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500 });
    if (window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "all") enableAnalytics();

    const onConsent = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "all") enableAnalytics();
    };
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href*="/register/"]');
      if (link) trackEvent("select_content", { content_type: "registration_cta", link_url: link.href });
    };
    let registrationStarted = false;
    const onFormInteraction = (event: Event) => {
      if (registrationStarted || !(event.target as Element | null)?.closest("#registration-form")) return;
      registrationStarted = true;
      trackEvent("begin_checkout", { items: [{ item_name: "KYNG CUP registration" }] });
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    document.addEventListener("click", onClick);
    document.addEventListener("input", onFormInteraction);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
      document.removeEventListener("click", onClick);
      document.removeEventListener("input", onFormInteraction);
    };
  }, []);
  return null;
}
