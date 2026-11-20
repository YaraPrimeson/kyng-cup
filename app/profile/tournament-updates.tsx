"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isSportVisible } from "@/lib/sports";
import { calendarEvent } from "@/lib/tournament-calendar";
import { useProfileLanguage } from "./profile-i18n";

type UpcomingMatch = {
  id: string; kind: string; sport: string; tournament_name: string; tournament_slug: string;
  location: string | null; scheduled_at: string | null; court: string | null; status: string; opponent_name: string | null;
};
type Notice = {
  id: string; sport: string; tournament_name: string; tournament_slug: string; scheduled_at: string | null;
  court: string | null; read_at: string | null;
  kind: "registration_confirmed" | "match_scheduled" | "match_changed";
};
type Standing = { season: number; sport: string; place: number; points: number; tournaments: number };

function matchDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Vienna" }).format(new Date(value));
}

function useTournamentData<T>(load: () => PromiseLike<{ data: unknown; error: unknown }>, refresh: boolean) {
  const [data, setData] = useState<T[]>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    async function update() {
      try {
        const result = await load();
        if (result.error || !Array.isArray(result.data)) throw new Error("Tournament data unavailable");
        if (active) { setData(result.data as T[]); setError(false); }
      } catch { if (active) setError(true); }
    }
    void update();
    const timer = refresh ? window.setInterval(() => void update(), 30_000) : undefined;
    if (refresh) window.addEventListener("focus", update);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [load, attempt, refresh]);
  return { data, error, retry: () => setAttempt(value => value + 1), setData };
}

const loadMatches = () => supabase.rpc("get_my_upcoming_matches");
const loadNotices = () => supabase.from("player_notifications")
  .select("id,sport,tournament_name,tournament_slug,kind,scheduled_at,court,read_at")
  .order("created_at", { ascending: false }).order("id").limit(50);
const loadRanking = () => supabase.rpc("get_my_season_ranking");

export function NextMatch({ basePath }: { basePath: string }) {
  const { text: t, locale } = useProfileLanguage();
  const { data, error, retry } = useTournamentData<UpcomingMatch>(loadMatches, true);
  const match = data?.find(item => isSportVisible(item.sport));

  function downloadCalendar(match: UpcomingMatch) {
    if (!match.scheduled_at) return;
    const url = URL.createObjectURL(new Blob([calendarEvent({
      id: `${match.kind}-${match.id}`, startsAt: match.scheduled_at,
      summary: [match.tournament_name, match.opponent_name].filter(Boolean).join(" · "),
      location: [match.location, match.court && `${t("Корт")} ${match.court}`].filter(Boolean).join(" · "),
      link: new URL(`${basePath}/bracket/?tournament=${encodeURIComponent(match.tournament_slug)}`, window.location.origin).href,
    })], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kyng-cup-match.ics";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="kv-section" aria-label={t("Мой следующий матч")}>
    <h2>{t("Мой следующий матч")}</h2>
    {error && <LoadError retry={retry} />}
    {data && (match ? <article className="kv-box">
      {match.status === "live" && <span className="kv-badge">{t("Матч идёт")}</span>}
      <h3>{match.tournament_name}</h3>
      <p>{match.opponent_name ? `${t("Соперники")} · ${match.opponent_name}` : t("Соперники определяются")}</p>
      {match.scheduled_at && <p><time dateTime={match.scheduled_at}>{matchDate(match.scheduled_at, locale)} (Europe/Vienna)</time></p>}
      <p>{match.court ? `${t("Корт")} ${match.court}` : t("Корт уточняется")}{match.location && ` · ${match.location}`}</p>
      <div className="kv-tournament-actions">
        <a className="kv-secondary" href={`${basePath}/bracket/?tournament=${encodeURIComponent(match.tournament_slug)}`}>{t("Открыть сетку")}</a>
        {match.scheduled_at && <button className="kv-secondary" type="button" onClick={() => downloadCalendar(match)}>{t("Добавить в календарь")}</button>}
      </div>
    </article> : <p className="kv-note">{t("Матч появится, когда организатор назначит время для вашей пары.")}</p>)}
    {!data && !error && <p role="status">{t("Загрузка…")}</p>}
  </section>;
}

const noticeLabels: Record<Notice["kind"], string> = {
  registration_confirmed: "Участие подтверждено",
  match_scheduled: "Матч назначен",
  match_changed: "Расписание матча изменилось",
};

export function PlayerNotifications({ basePath }: { basePath: string }) {
  const { text: t, locale } = useProfileLanguage();
  const { data, error, retry, setData } = useTournamentData<Notice>(loadNotices, true);
  const [saving, setSaving] = useState(false);
  const [markError, setMarkError] = useState(false);
  const visible = data?.filter(item => isSportVisible(item.sport));
  const unread = visible?.filter(item => !item.read_at).map(item => item.id) ?? [];

  async function markRead() {
    setSaving(true);
    setMarkError(false);
    const time = new Date().toISOString();
    try {
      const result = await supabase.from("player_notifications").update({ read_at: time }).in("id", unread).is("read_at", null);
      if (result.error) throw result.error;
      setData(items => items?.map(item => unread.includes(item.id) ? { ...item, read_at: time } : item));
    } catch { setMarkError(true); }
    finally { setSaving(false); }
  }

  return <section className="kv-section" aria-label={t("Уведомления")}>
    <h2>{t("Уведомления")}{unread.length > 0 && ` (${unread.length})`}</h2>
    {error && <LoadError retry={retry} />}
    {!data && !error && <p role="status">{t("Загрузка…")}</p>}
    {visible?.length === 0 && <p className="kv-note">{t("Уведомлений пока нет.")}</p>}
    {Boolean(visible?.length) && <details open={unread.length > 0}>
      <summary>{t("Показать уведомления")}</summary>
      {unread.length > 0 && <button className="kv-link" type="button" disabled={saving} onClick={() => void markRead()}>{t("Отметить прочитанными")}</button>}
      {markError && <p role="alert">{t("Не удалось отметить уведомления.")}</p>}
      <ul className="kv-notifications">{visible?.map(item => <li key={item.id}>
        {!item.read_at && <span className="kv-badge">{t("Новое")}</span>}
        <strong>{t(noticeLabels[item.kind])}</strong>
        <a href={`${basePath}/bracket/?tournament=${encodeURIComponent(item.tournament_slug)}`}>{item.tournament_name}</a>
        {item.scheduled_at && <time dateTime={item.scheduled_at}>{matchDate(item.scheduled_at, locale)} (Europe/Vienna)</time>}
        {item.court && <span>{t("Корт")} {item.court}</span>}
      </li>)}</ul>
    </details>}
  </section>;
}

export function SeasonRanking() {
  const { text: t } = useProfileLanguage();
  const { data, error, retry } = useTournamentData<Standing>(loadRanking, false);
  const visible = data?.filter(item => isSportVisible(item.sport));
  return <section className="kv-section">
    <p className="kv-note">{t("За завершённый турнир: 100 очков победителям, 60 финалистам, 20 остальным игрокам со сыгранным матчем.")}</p>
    {error && <LoadError retry={retry} />}
    {!data && !error && <p role="status">{t("Загрузка…")}</p>}
    {visible?.length === 0 && <p>{t("Пока нет результатов для рейтинга.")}</p>}
    <div className="player-event-list">{visible?.map(item => <article className="kv-box" key={`${item.season}-${item.sport}`}>
      <h2>{item.season} · {t(item.sport === "tennis" ? "Теннис" : "Падел")}</h2>
      <dl className="kv-ranking">
        <div><dt>{t("Место")}</dt><dd>{item.place}</dd></div>
        <div><dt>{t("Очки")}</dt><dd>{item.points}</dd></div>
        <div><dt>{t("Турниры")}</dt><dd>{item.tournaments}</dd></div>
      </dl>
    </article>)}</div>
  </section>;
}

function LoadError({ retry }: { retry: () => void }) {
  const { text: t } = useProfileLanguage();
  return <><p role="alert">{t("Не удалось загрузить данные.")}</p><button className="kv-secondary" type="button" onClick={retry}>{t("Повторить загрузку")}</button></>;
}
