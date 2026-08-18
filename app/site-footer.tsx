"use client";

import Link from "next/link";
import Wordmark from "./wordmark";
import { useLanguage } from "./i18n";

export default function SiteFooter() {
  const { t } = useLanguage();
  return <footer><Link className="brand footer-brand" href="/"><Wordmark /></Link><p>{t("copyright")}</p><div className="footer-links"><Link href="/tennis/">{t("tennis")}</Link><Link href="/padel/">{t("padel")}</Link><a href="mailto:hello@kyngcup.com">{t("contact")}</a></div><span>© 2026</span></footer>;
}
