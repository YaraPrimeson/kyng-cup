"use client";

import { useMemo, useState } from "react";
import { playerCards } from "@/lib/player-results";
import { visibleSportItems, visibleSports } from "@/lib/sports";
import { usePlayerMatches } from "./use-player-matches";
import { useProfileLanguage } from "./profile-i18n";
import ResultCard from "./result-card";
import ProfileIcon from "./profile-icon";

export default function PlayerCards({ userId, name, photo }: { userId: string; name: string; photo: string }) {
  const { text: t, locale } = useProfileLanguage();
  const { rows, loading, error, retry } = usePlayerMatches(userId);
  const [sport, setSport] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const cards = useMemo(() => playerCards(visibleSportItems(rows)), [rows]);
  const available = sport === "all" ? cards : cards.filter(card => card.sport === sport);
  const current = available.find(card => card.key === selected) ?? available[0];
  if (loading) return <p role="status" className="kv-section">{t("Загружаем результаты для карточек…")}</p>;
  if (error) return <section className="kv-section"><p role="alert" className="player-error">{t("Не удалось загрузить результаты для карточек. Попробуйте ещё раз.")}</p><button type="button" className="kv-secondary" onClick={retry}>{t("Повторить загрузку")}</button></section>;
  return <section className="kv-section" aria-label={t("Мои карточки")}>
    <p className="kv-muted kv-small">{t("Выберите завершённый турнир и сохраните свой результат. Учитываются только сыгранные матчи с подтверждённым счётом.")}</p>
    {visibleSports.length > 1 && <div className="kv-segment" aria-label={t("Вид спорта")}>{[["all", t("Все")], ...visibleSports.map(value => [value, value === "tennis" ? "Tennis" : "Padel"])].map(([value, label]) => <button type="button" key={value} aria-pressed={sport === value} onClick={() => { setSport(value); setSelected(null); }}>{label}</button>)}</div>}
    {!current ? <div className="kv-empty kv-section"><div className="kv-empty-icon"><ProfileIcon name="calendar" /></div><h2>{t("Пока нет результатов для карточки")}</h2><p>{t("Карточки появятся после завершения турнира, когда организатор свяжет вашу подтверждённую заявку с парой и внесёт результат матча.")}</p></div>
      : <><label className="player-card-tournament">{t("Выберите турнир для карточки")}<select value={current.key} onChange={event => setSelected(event.target.value)}>{available.map(card => <option key={card.key} value={card.key}>{card.name} · {card.date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Vienna" }).format(new Date(card.date)) : t("Дата не указана")}{card.partner ? ` · ${card.partner}` : ""}</option>)}</select></label>
        <ResultCard userId={userId} name={name} photo={photo} result={current} /></>}
  </section>;
}
