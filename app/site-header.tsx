"use client";

import { usePathname } from "next/navigation";
import Wordmark from "./wordmark";
import { isSportVisible } from "@/lib/sports";
import { siteBasePath } from "@/lib/player-account";
import { useLanguage } from "./i18n";
import LanguageSelect from "./language-select";

export default function SiteHeader() {
  const pathname = usePathname();
  const { language, t } = useLanguage();
  const basePath = siteBasePath(pathname);
  const path = pathname.slice(basePath.length).replace(/\/+$/, "") || "/";
  if (path === "/profile" || path === "/auth/callback") return null;
  const links = [
    { path: "/", label: t("home"), visible: true },
    { path: "/tennis", label: t("tennis"), visible: isSportVisible("tennis") },
    { path: "/padel", label: t("padel"), visible: isSportVisible("padel") },
    { path: "/gallery", label: { en: "Gallery", uk: "Галерея", de: "Galerie", ru: "Галерея" }[language], visible: true },
    { path: "/profile", label: { en: "My KYNG", uk: "Мій KYNG", de: "Mein KYNG", ru: "Мой KYNG" }[language], visible: true },
  ].filter(link => link.visible);

  return (
    <header className="global-header">
      <a className="brand" href={`${basePath}/`} aria-label="KYNG CUP home"><Wordmark /></a>
      <nav aria-label="Main navigation">
        {links.map(link => <a key={link.path} href={`${basePath}${link.path === "/" ? "/" : `${link.path}/`}`}
          aria-current={path === link.path ? "page" : undefined}>{link.label}</a>)}
      </nav>
      <LanguageSelect />
    </header>
  );
}
