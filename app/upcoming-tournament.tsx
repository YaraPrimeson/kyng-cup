"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "./i18n";

type Sport = "tennis" | "padel";
type Tournament = { id: string; slug: string; name: string; location: string | null; starts_at: string | null; ends_at: string | null; status: "published" | "live" };
const locales = { en: "en-GB", uk: "uk-UA", de: "de-AT", ru: "ru-RU" } as const;

export default function UpcomingTournament({ sport }: { sport: Sport }) {
  const pathname = usePathname();
  const basePath = pathname.startsWith("/kyng-cup") ? "/kyng-cup" : "";
  const { language, t } = useLanguage();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const result = await supabase.from("tournaments").select("id,slug,name,location,starts_at,ends_at,status,sport").eq("sport", sport).in("status", ["published", "live"]).order("starts_at", { ascending: true, nullsFirst: false });
    const rows = (result.data ?? []) as (Tournament & { sport: Sport })[];
    const now = Date.now();
    setTournament(rows.find((item) => item.status === "live") ?? rows.find((item) => !item.starts_at || new Date(item.starts_at).getTime() >= now) ?? rows.at(-1) ?? null);
    setLoading(false);
  }, [sport]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { const channel = supabase.channel(`upcoming:${sport}`).on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `sport=eq.${sport}` }, () => void load()).subscribe(); return () => { void supabase.removeChannel(channel); }; }, [load, sport]);
  const startDate = tournament?.starts_at ? new Date(tournament.starts_at) : null;
  const endDate = tournament?.ends_at ? new Date(tournament.ends_at) : null;
  const dateKey = (date: Date | null) => date ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : null;
  const isSingleDay = Boolean(startDate && endDate && dateKey(startDate) === dateKey(endDate));
  const formatDay = (date: Date | null) => date ? new Intl.DateTimeFormat(locales[language], { day: "2-digit" }).format(date) : "—";
  const formatMonth = (date: Date | null) => date ? new Intl.DateTimeFormat(locales[language], { month: "long", year: "numeric" }).format(date) : t("scheduled");
  return <section className="upcoming-dynamic" id="tournament"><div className="section-index"><span>03</span><span>{t("upcoming")}</span></div>
    {loading ? <p className="upcoming-state">{t("loadingTournament")}</p> : !tournament ? <p className="upcoming-state">{t("noTournament")}</p> : <div className="upcoming-layout">
      <div className={`upcoming-date${isSingleDay ? " is-single-day" : ""}`}>{isSingleDay
        ? <div className="upcoming-date-point"><strong>{formatDay(startDate)}</strong><span>{formatMonth(startDate)}</span></div>
        : <><div className="upcoming-date-point"><small>Start</small><strong>{formatDay(startDate)}</strong><span>{formatMonth(startDate)}</span></div><i aria-hidden="true">—</i><div className="upcoming-date-point"><small>End</small><strong>{formatDay(endDate)}</strong><span>{formatMonth(endDate)}</span></div></>}
      </div>
      <div className="upcoming-copy"><span className={`live-indicator${tournament.status === "live" ? " is-live" : ""}`}><i />{tournament.status === "live" ? t("live") : t("scheduled")}</span><h2>{tournament.name}</h2><div><span>{t("location")}<strong>{tournament.location ?? "Vienna, Austria"}</strong></span></div><div className="upcoming-actions"><a href={`${basePath}/bracket/?tournament=${tournament.slug}&sport=${sport}`}>{t("viewBracket")} ↗</a><button type="button">{t("participate")}</button></div></div>
    </div>}
  </section>;
}
