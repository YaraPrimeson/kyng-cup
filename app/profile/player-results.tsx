"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { matchScore, matchStage, playerResults, type PlayerMatch } from "@/lib/player-results";
import ProfileIcon from "./profile-icon";
import { useProfileLanguage } from "./profile-i18n";

function dateLabel(value: string | null, locale: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Vienna" }).format(date) : "Дата не указана";
}

export default function PlayerResults({ userId, mode }: { userId: string; mode: "summary" | "history" | "achievements" }) {
  const { text: t, locale } = useProfileLanguage();
  const [loaded, setLoaded] = useState<{ owner: string; revision: number; rows: PlayerMatch[]; error: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const [sport, setSport] = useState("all");
  const [selected, setSelected] = useState("debut");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await supabase.rpc("get_my_match_history");
        if (result.error || !Array.isArray(result.data)) throw result.error ?? new Error("Invalid history response");
        if (active) setLoaded({ owner: userId, revision, rows: result.data as PlayerMatch[], error: false });
      } catch { if (active) setLoaded({ owner: userId, revision, rows: [], error: true }); }
    }
    void load();
    return () => { active = false; };
  }, [userId, revision]);
  function retry() { setRevision(value => value + 1); }
  if (!loaded || loaded.owner !== userId || loaded.revision !== revision) return <p role="status" className="kv-section">{t("Загружаем результаты…")}</p>;
  const { rows, error } = loaded;
  if (error) return <section className="kv-section"><p role="alert" className="player-error">{t("Не удалось загрузить результаты. Статистика и достижения пока недоступны.")}</p><button type="button" className="kv-secondary" onClick={retry}>{t("Повторить загрузку результатов")}</button></section>;
  const result = playerResults(sport === "all" ? rows : rows.filter(match => match.sport === sport));
  const achievements = result.achievements.map(item => ({ ...item, name: t(item.name), rule: t(item.rule), progress: t(item.progress) }));
  const award = achievements.find(item => item.id === selected) ?? achievements[0];
  return <section className="kv-section" aria-label={t(mode === "summary" ? "Статистика игрока" : mode === "history" ? "Результаты матчей" : "Достижения игрока")}>
    <div className="kv-segment" aria-label={t("Вид спорта")}>
      {[["all", t("Все")], ["tennis", "Tennis"], ["padel", "Padel"]].map(([value, label]) => <button type="button" key={value} aria-pressed={sport === value} onClick={() => setSport(value)}>{label}</button>)}
    </div>
    {mode !== "achievements" && <>
      <div className="kv-stats">{[[result.stats.played, "Матчей"], [result.stats.wins, "Побед"], [result.stats.losses, "Поражений"], [result.stats.played ? `${result.stats.winRate}%` : "—", "Доля побед"], [result.stats.completedTournaments, "Турниров завершено"], [result.streakReliable ? result.stats.currentStreak : "—", "Побед подряд"]].map(([value, label]) => <div key={label}><strong>{value}</strong><small>{t(String(label))}</small></div>)}</div>
      <p className="kv-muted kv-small">{t("Только сыгранные матчи с подтверждённым счётом. Технические проходы не учитываются.")} {t(result.streakReliable ? `Лучшая серия: ${result.stats.bestStreak}.` : "Недостаточно данных о порядке матчей")}</p>
    </>}
    {mode !== "achievements" && !result.history.length && <div className="kv-empty"><h2>{t("Результатов пока нет")}</h2><p>{t("Здесь появятся сыгранные матчи, когда организатор свяжет подтверждённую заявку с парой в сетке и внесёт счёт.")}</p></div>}
    {mode === "history" && result.history.map(event => <article className="kv-section" key={event.id}>
      <span className="kv-badge">{event.sport === "tennis" ? "Tennis" : "Padel"} · {t(event.status === "completed" ? "Завершён" : "Идёт турнир")}</span>
      <h2>{event.name}</h2><p className="kv-muted kv-small">{t(dateLabel(event.date, locale))} {t("· Партнёр:")} {event.partner || t("Не указан")}</p>
      {event.matches.map(match => <div className="kv-match" key={match.id}><span>{match.opponent_name || t("Соперники не указаны")}<small>{t(match.winner_id === match.pair_id ? "Победа" : "Поражение")} · {t(matchStage(match))}</small><small>{t(dateLabel(match.completed_at, locale))}</small></span><b aria-label={t(`Счёт вашей пары: ${matchScore(match)}`)}>{matchScore(match)}</b></div>)}
    </article>)}
    {mode === "achievements" && <>
      <div className="kv-medals">{achievements.map((item, index) => <button type="button" data-award={item.id} data-earned={item.earned} className={`kv-medal${item.earned ? " is-open" : ""}`} key={item.id} aria-pressed={selected === item.id} aria-label={`${item.name}. ${item.progress}. ${item.rule}`} aria-controls="player-achievement-detail" onClick={() => setSelected(item.id)}><span className="kv-medal-circle"><span className="kv-medal-art" style={{ backgroundPosition: `${(index % 3) * 50}% ${Math.floor(index / 3) * 100 / 3}%` }} aria-hidden="true" />{!item.earned && <span className="kv-medal-lock"><ProfileIcon name="lock" /></span>}</span><span>{item.name}</span><small>{t(item.earned ? "Получено" : "Не получено")}</small></button>)}</div>
      <div className="kv-award-detail" id="player-achievement-detail" aria-live="polite"><h3>{award.name}</h3><p>{award.rule}</p><small>{award.progress}</small></div>
    </>}
  </section>;
}
