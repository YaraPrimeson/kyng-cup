"use client";

import { type Language, useLanguage } from "./i18n";

export default function LanguageSelect() {
  const { language, setLanguage, t } = useLanguage();

  return <label className="language-select">
    <span>{t("language")}</span>
    <select aria-label={t("language")} value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
      <option value="en">EN</option>
      <option value="uk">UA</option>
      <option value="de">DE</option>
    </select>
  </label>;
}
