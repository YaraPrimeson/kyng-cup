"use client";

import { usePathname } from "next/navigation";
import Wordmark from "./wordmark";
import { isSportVisible } from "@/lib/sports";
import { useLanguage } from "./i18n";
import LanguageSelect from "./language-select";

export default function SiteHeader() {
  const pathname = usePathname();
  const { language, t } = useLanguage();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const path = pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
  if (path === "/profile" || path === "/auth/callback") return null;
  const links = (path === "/"
    ? [["/tennis/", t("tennis")], ["/padel/", t("padel")]]
    : path === "/tennis"
      ? [["/", t("home")], ["/padel/", t("padel")]]
      : path === "/padel"
        ? [["/", t("home")], ["/tennis/", t("tennis")]]
        : [["/", t("home")], ["/tennis/", t("tennis")], ["/padel/", t("padel")]])
    .filter(([href]) => href === "/" || isSportVisible(href.split("/")[1]));

  return (
    <header className="global-header">
      <a className="brand" href={`${basePath}/`} aria-label="KYNG CUP home"><Wordmark /></a>
      <nav aria-label="Main navigation">{links.map(([href, label]) => <a href={`${basePath}${href}`} aria-current={path === href.replace(/\/+$/, "") ? "page" : undefined} key={href}>{label}</a>)}<a href={`${basePath}/profile/`}>{({ en: "My KYNG", uk: "Мій KYNG", de: "Mein KYNG", ru: "Мой KYNG" })[language]}</a></nav>
      <LanguageSelect />
    </header>
  );
}
