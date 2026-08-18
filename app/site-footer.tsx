"use client";

import { usePathname } from "next/navigation";
import Wordmark from "./wordmark";
import { useLanguage } from "./i18n";

export default function SiteFooter() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  return <footer><a className="brand footer-brand" href={`${basePath}/`}><Wordmark /></a><p>{t("copyright")}</p><div className="footer-links"><a className="footer-social-link" href="https://t.me/" target="_blank" rel="noreferrer" aria-label="Telegram" title="Telegram"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.8 3.2 18.6 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9-8.1c.4-.4-.1-.6-.6-.2L6.1 13.8l-4.8-1.5c-1-.3-1.1-1 .2-1.5l18.7-7.2c.9-.3 1.8.2 1.6-.4Z" /></svg></a><a className="footer-social-link" href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.4" cy="6.7" r="1.1" fill="currentColor" /></svg></a><a href="mailto:hello@kyngcup.com">{t("contact")}</a></div><span>© 2026</span></footer>;
}
