"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Language } from "./i18n";

export type PublicTournament = {
  id: string;
  slug: string;
  name: string;
  sport: "tennis" | "padel";
  location: string | null;
  format_description: string | null;
  prize_pool: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "published" | "live";
  registration_status: "open" | "waitlist" | "closed";
};

const locales: Record<Language, string> = {
  en: "en-GB",
  uk: "uk-UA",
  de: "de-AT",
  ru: "ru-RU",
};

export function usePublicTournaments() {
  const [tournaments, setTournaments] = useState<PublicTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const result = await supabase
      .from("tournaments")
      .select("id,slug,name,sport,location,format_description,prize_pool,starts_at,ends_at,status,registration_status")
      .in("status", ["published", "live"])
      .order("starts_at", { ascending: true, nullsFirst: false });

    setError(Boolean(result.error));
    setTournaments((result.data ?? []) as PublicTournament[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("public-tournament-dates")
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  return { tournaments, loading, error };
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatTournamentDate(tournament: PublicTournament, language: Language, includeYear = false) {
  if (!tournament.starts_at) return "—";
  const formatter = new Intl.DateTimeFormat(locales[language], {
    timeZone: "Europe/Vienna",
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {}),
  });
  const start = formatter.format(new Date(tournament.starts_at));
  if (!tournament.ends_at || dateKey(tournament.starts_at) === dateKey(tournament.ends_at)) return start;
  return `${start} – ${formatter.format(new Date(tournament.ends_at))}`;
}

export function formatTournamentMonth(tournaments: PublicTournament[], language: Language) {
  const dated = tournaments.find((tournament) => tournament.starts_at);
  if (!dated?.starts_at) return "Vienna";
  const month = new Intl.DateTimeFormat(locales[language], {
    timeZone: "Europe/Vienna",
    month: "long",
    year: "numeric",
  }).format(new Date(dated.starts_at));
  const city = language === "de" ? "Wien" : language === "uk" ? "Відень" : language === "ru" ? "Вена" : "Vienna";
  return `${city} · ${month}`;
}
