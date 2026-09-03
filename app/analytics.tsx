"use client";

import { useEffect } from "react";

const measurementId = "G-SNE2TFJ536";
const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
type AttributionKey = (typeof attributionKeys)[number];
type EventParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: "config" | "event", target: string, params?: EventParams) => void;
  }
}

export function getAttribution() {
  if (typeof window === "undefined") return {} as Partial<Record<AttributionKey, string>>;
  return attributionKeys.reduce<Partial<Record<AttributionKey, string>>>((values, key) => {
    const value = window.sessionStorage.getItem(`kyng_${key}`);
    if (value) values[key] = value;
    return values;
  }, {});
}

export function captureAttribution() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  attributionKeys.forEach((key) => {
    const value = params.get(key);
    if (value) window.sessionStorage.setItem(`kyng_${key}`, value);
  });
}

export function trackEvent(name: string, params: EventParams = {}) {
  window.gtag?.("event", name, { ...getAttribution(), ...params });
}

export function withAttribution(href: string) {
  if (typeof window === "undefined") return href;
  const url = new URL(href, window.location.origin);
  Object.entries(getAttribution()).forEach(([key, value]) => url.searchParams.set(key, value));
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function Analytics() {
  useEffect(() => {
    captureAttribution();
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(...args: unknown[]) { window.dataLayer?.push(args); } as never;
    window.gtag("config", measurementId, { send_page_view: true });
  }, []);

  return <script async src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} />;
}
