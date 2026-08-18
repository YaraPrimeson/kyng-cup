"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import Wordmark from "./wordmark";
import { Language, useLanguage } from "./i18n";

export default function SiteHeader() {
  const pathname = usePathname();
  const { language, setLanguage, t } = useLanguage();
  const path = pathname.replace(/^\/kyng-cup/, "").replace(/\/+$/, "") || "/";
  const links = path === "/"
    ? [["/tennis/", t("tennis")], ["/padel/", t("padel")]]
    : path === "/tennis"
      ? [["/", t("home")], ["/padel/", t("padel")]]
      : path === "/padel"
        ? [["/", t("home")], ["/tennis/", t("tennis")]]
        : [["/", t("home")], ["/tennis/", t("tennis")], ["/padel/", t("padel")]];

  return (
    <header className="global-header">
      <Link className="brand" href="/" aria-label="KYNG CUP home"><Wordmark /></Link>
      <nav aria-label="Main navigation">{links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}</nav>
      <label className="language-select"><span>{t("language")}</span><select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option value="en">EN</option><option value="uk">UA</option><option value="de">DE</option><option value="ru">RU</option></select></label>
    </header>
  );
}
