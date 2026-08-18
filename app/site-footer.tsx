"use client";

import { usePathname } from "next/navigation";
import Wordmark from "./wordmark";
import { useLanguage } from "./i18n";

export default function SiteFooter() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  return <footer><a className="brand footer-brand" href={`${basePath}/`}><Wordmark /></a><p>{t("copyright")}</p><div className="footer-links"><a href={`${basePath}/tennis/`}>{t("tennis")}</a><a href={`${basePath}/padel/`}>{t("padel")}</a><a href="mailto:hello@kyngcup.com">{t("contact")}</a></div><span>© 2026</span></footer>;
}
