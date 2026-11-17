"use client";

import { useState } from "react";
import { matchScore, matchStage, playerPartners } from "@/lib/player-results";
import { visibleSportItems, visibleSports } from "@/lib/sports";
import { usePlayerMatches } from "./use-player-matches";
import { useProfileLanguage } from "./profile-i18n";
import ProfileIcon from "./profile-icon";

export default function PlayerPartners({ userId }: { userId: string }) {
  const { text: t, locale } = useProfileLanguage();
  const { rows, loading, error, retry } = usePlayerMatches(userId);
  const [sport, setSport] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  function date(value: string | null) {
    return value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Vienna" }).format(new Date(value))
      : t("Дата не указана");
  }
  if (loading) return <p role="status" className="kv-section">{t("Загружаем партнёров…")}</p>;
  if (error) return <section className="kv-section"><p className="player-error" role="alert">{t("Не удалось загрузить партнёров. Попробуйте ещё раз.")}</p><button className="kv-secondary" type="button" onClick={retry}>{t("Повторить загрузку")}</button></section>;
  const visible = visibleSportItems(rows);
  const partners = playerPartners(sport === "all" ? visible : visible.filter(match => match.sport === sport));
  return <section className="kv-section" aria-label={t("Мои партнёры")}>
    {visibleSports.length > 1 && <div className="kv-segment" aria-label={t("Вид спорта")}>
      {[["all", t("Все")], ...visibleSports.map(value => [value, value === "tennis" ? "Tennis" : "Padel"])].map(([value, label]) => <button type="button" key={value} aria-pressed={sport === value} onClick={() => { setSport(value); setSelected(null); }}>{label}</button>)}
    </div>}
    <p className="kv-muted kv-small">{t("Партнёры появляются после совместных матчей с подтверждённым счётом. Первыми — те, с кем вы чаще играли на турнирах.")}</p>
    {!partners.length && <div className="kv-empty kv-section"><div className="kv-empty-icon"><ProfileIcon name="calendar" /></div><h2>{t("Партнёров пока нет")}</h2><p>{t("Организатор должен связать подтверждённую заявку с парой в сетке и внести результат вашего матча.")}</p></div>}
    <div className="kv-partners">{partners.map((partner, index) => {
      const open = selected === partner.key;
      const name = partner.name || t("Не указан");
      const initials = partner.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toUpperCase() || "?";
      const detailId = `partner-details-${index}`;
      return <article className="kv-partner kv-box" key={partner.key}>
        <button className="kv-partner-toggle" type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setSelected(open ? null : partner.key)}>
          <span className="kv-avatar" aria-hidden="true">{initials}</span><span className="kv-partner-name"><strong>{name}</strong><small>{partner.sport === "tennis" ? "Tennis" : "Padel"} · {t(partner.accountId ? "Аккаунт привязан" : "Отдельное выступление")}</small></span><ProfileIcon name="next" />
        </button>
        <dl className="kv-partner-stats">{[[partner.tournamentCount, "Совместных турниров"], [partner.stats.wins, "Побед"], [partner.stats.losses, "Поражений"], [`${partner.stats.winRate}%`, "Доля побед"]].map(([value, label]) => <div key={label}><dt>{t(String(label))}</dt><dd>{value}</dd></div>)}</dl>
        <p className="kv-muted kv-small kv-partner-date">{t("Последнее выступление:")} {date(partner.lastPlayedAt)}</p>
        <div id={detailId} hidden={!open} className="kv-partner-details">
          {open && <>
            <h3>{t("Совместная история")}</h3>
            <p className="kv-muted kv-small">{t("Только сыгранные матчи с подтверждённым счётом. Технические проходы не учитываются.")}</p>
            {partner.accountId ? <div className="kv-partner-duo"><strong>{t("Сыгранная пара")}</strong><span className="kv-badge">{t(partner.duo.progress)}</span><p className="kv-muted kv-small">{t(partner.duo.rule)}</p></div>
              : <p className="kv-note">{t("Чтобы объединить выступления за разные турниры, партнёру нужно привязать заявки к своему аккаунту через код организатора. Совпадения имени недостаточно.")}</p>}
            {partner.history.map(event => <section className="kv-section" key={event.id}>
              <h3>{event.name}</h3><p className="kv-muted kv-small">{date(event.date)} · {t(event.status === "completed" ? "Завершён" : "Идёт турнир")}</p>
              {event.matches.map(match => <div className="kv-match" key={match.id}><span>{match.opponent_name || t("Соперники не указаны")}<small>{t(match.winner_id === match.pair_id ? "Победа" : "Поражение")} · {t(matchStage(match))}</small><small>{date(match.completed_at)}</small></span><b aria-label={t(`Счёт вашей пары: ${matchScore(match)}`)}>{matchScore(match)}</b></div>)}
            </section>)}
          </>}
        </div>
      </article>;
    })}</div>
  </section>;
}
