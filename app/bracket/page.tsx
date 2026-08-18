"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Language, useLanguage } from "../i18n";

type Sport = "tennis" | "padel";

type Tournament = {
  id: string;
  slug: string;
  name: string;
  sport: Sport;
  location: string | null;
  starts_at: string | null;
  bracket_size: number;
  status: "published" | "live" | "completed";
};

type Pair = { id: string; name: string; player_one: string; player_two: string; seed: number | null; country_code: string | null };
type Match = { id: string; round: number; position: number; pair_one_id: string | null; pair_two_id: string | null; pair_one_sets: number[]; pair_two_sets: number[]; winner_id: string | null; status: "scheduled" | "live" | "completed"; court: string | null; scheduled_at: string | null };

const bracketCopy = {
  en: { headingA: "Tournament", headingB: "bracket", decided: "To be decided", previousWinner: "Winner of previous match", scheduleTba: "Schedule TBA", courtTba: "Court TBA", final: "Final", live: "Live", scheduled: "Scheduled", locationTba: "Location TBA", pairs: "doubles pairs", matches: "matches", previous: "Previous", next: "Next", noBracket: "No published tournament bracket is available yet.", loadError: "The latest match data could not be loaded." },
  uk: { headingA: "Турнірна", headingB: "сітка", decided: "Ще не визначено", previousWinner: "Переможець попереднього матчу", scheduleTba: "Розклад уточнюється", courtTba: "Корт уточнюється", final: "Фінал", live: "Наживо", scheduled: "Заплановано", locationTba: "Локація уточнюється", pairs: "пар", matches: "матчів", previous: "Назад", next: "Далі", noBracket: "Опублікованої турнірної сітки поки немає.", loadError: "Не вдалося завантажити актуальні дані матчів." },
  de: { headingA: "Turnier-", headingB: "baum", decided: "Noch offen", previousWinner: "Sieger des vorherigen Matches", scheduleTba: "Zeitplan folgt", courtTba: "Court folgt", final: "Finale", live: "Live", scheduled: "Geplant", locationTba: "Ort folgt", pairs: "Doppelpaare", matches: "Matches", previous: "Zurück", next: "Weiter", noBracket: "Noch kein veröffentlichter Turnierbaum verfügbar.", loadError: "Die aktuellen Matchdaten konnten nicht geladen werden." },
  ru: { headingA: "Турнирная", headingB: "сетка", decided: "Ещё не определено", previousWinner: "Победитель предыдущего матча", scheduleTba: "Расписание уточняется", courtTba: "Корт уточняется", final: "Финал", live: "В эфире", scheduled: "Запланирован", locationTba: "Локация уточняется", pairs: "пар", matches: "матчей", previous: "Назад", next: "Далее", noBracket: "Опубликованной турнирной сетки пока нет.", loadError: "Не удалось загрузить актуальные данные матчей." },
} as const;

function getRounds(size: number, language: Language) {
  const labelsByLanguage: Record<Language, Record<number, string[]>> = {
    en: {
    8: ["Quarterfinals", "Semifinals", "Final"],
    16: ["Round of 16", "Quarterfinals", "Semifinals", "Final"],
    32: ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"],
    },
    uk: { 8: ["Чвертьфінали", "Півфінали", "Фінал"], 16: ["1/8 фіналу", "Чвертьфінали", "Півфінали", "Фінал"], 32: ["1/16 фіналу", "1/8 фіналу", "Чвертьфінали", "Півфінали", "Фінал"] },
    de: { 8: ["Viertelfinale", "Halbfinale", "Finale"], 16: ["Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"], 32: ["Sechzehntelfinale", "Achtelfinale", "Viertelfinale", "Halbfinale", "Finale"] },
    ru: { 8: ["Четвертьфиналы", "Полуфиналы", "Финал"], 16: ["1/8 финала", "Четвертьфиналы", "Полуфиналы", "Финал"], 32: ["1/16 финала", "1/8 финала", "Четвертьфиналы", "Полуфиналы", "Финал"] },
  };
  const labels = labelsByLanguage[language];
  return (labels[size] ?? labels[16]).map((label, index) => ({ number: index + 1, label }));
}

function PairRow({ pair, scores, winner, language }: { pair?: Pair; scores: number[]; winner: boolean; language: Language }) {
  const text = bracketCopy[language];
  return <div className={`bracket-pair${winner ? " is-winner" : ""}${!pair ? " is-pending" : ""}`}><span className="pair-seed">{pair?.seed ? String(pair.seed).padStart(2, "0") : "—"}</span><span className="pair-name"><strong>{pair?.name ?? text.decided}</strong><small>{pair ? `${pair.player_one} · ${pair.player_two}` : text.previousWinner}</small></span><span className="pair-score">{scores.length ? scores.join(" · ") : "—"}</span></div>;
}

const dateLocales: Record<Language, string> = { en: "en-GB", uk: "uk-UA", de: "de-DE", ru: "ru-RU" };

function MatchCard({ match, pairMap, language }: { match: Match; pairMap: Map<string, Pair>; language: Language }) {
  const pairOne = match.pair_one_id ? pairMap.get(match.pair_one_id) : undefined;
  const pairTwo = match.pair_two_id ? pairMap.get(match.pair_two_id) : undefined;
  const text = bracketCopy[language];
  const date = match.scheduled_at ? new Intl.DateTimeFormat(dateLocales[language], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(match.scheduled_at)) : text.scheduleTba;
  return <article className={`bracket-match status-${match.status}`}><span className="match-connector" aria-hidden="true" /><div className="match-meta"><span>{date}</span><span>{match.court ?? text.courtTba}</span><strong>{match.status === "completed" ? text.final : match.status === "live" ? text.live : text.scheduled}</strong></div><PairRow pair={pairOne} scores={match.pair_one_sets} winner={match.winner_id === match.pair_one_id && !!match.winner_id} language={language} /><PairRow pair={pairTwo} scores={match.pair_two_sets} winner={match.winner_id === match.pair_two_id && !!match.winner_id} language={language} /></article>;
}

export default function BracketPage() {
  const { language } = useLanguage();
  const text = bracketCopy[language];
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeRound, setActiveRound] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBracket = useCallback(async (requestedSlug?: string) => {
    const tournamentResult = await supabase.from("tournaments").select("id,slug,name,sport,location,starts_at,bracket_size,status").in("status", ["published", "live", "completed"]).order("starts_at", { ascending: false, nullsFirst: false });
    if (tournamentResult.error || !tournamentResult.data?.length) { setError(text.noBracket); setLoading(false); return; }
    const available = tournamentResult.data as Tournament[];
    const urlSlug = requestedSlug ?? new URLSearchParams(window.location.search).get("tournament") ?? undefined;
    const requestedSport = new URLSearchParams(window.location.search).get("sport") as Sport | null;
    const sportAvailable = requestedSport ? available.filter((item) => item.sport === requestedSport) : available;
    const current = available.find((item) => item.slug === urlSlug) ?? sportAvailable.find((item) => item.status === "live") ?? sportAvailable.find((item) => item.status === "published") ?? sportAvailable[0] ?? available[0];
    const [pairsResult, matchesResult] = await Promise.all([
      supabase.from("pairs").select("id,name,player_one,player_two,seed,country_code").eq("tournament_id", current.id).order("seed"),
      supabase.from("matches").select("id,round,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at").eq("tournament_id", current.id).order("round").order("position"),
    ]);
    if (pairsResult.error || matchesResult.error) setError(text.loadError);
    else { setTournaments(available); setTournament(current); setPairs((pairsResult.data ?? []) as Pair[]); setMatches((matchesResult.data ?? []) as Match[]); setError(null); }
    setLoading(false);
  }, [text.loadError, text.noBracket]);

  useEffect(() => { const timer = window.setTimeout(() => void loadBracket(), 0); return () => window.clearTimeout(timer); }, [loadBracket]);
  useEffect(() => {
    if (!tournament?.id) return;
    const channel = supabase.channel(`public:${tournament.id}`).on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).on("postgres_changes", { event: "*", schema: "public", table: "pairs", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournament.id}` }, () => void loadBracket(tournament.slug)).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadBracket, tournament?.id, tournament?.slug]);

  const pairMap = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const rounds = useMemo(() => getRounds(tournament?.bracket_size ?? 16, language), [language, tournament?.bracket_size]);
  const finalMatch = matches.find((match) => match.round === rounds.length && match.position === 1);
  const champion = finalMatch?.winner_id ? pairMap.get(finalMatch.winner_id) : undefined;

  function selectTournament(slug: string) {
    const next = tournaments.find((item) => item.slug === slug);
    const url = new URL(window.location.href); url.searchParams.set("tournament", slug); if (next) url.searchParams.set("sport", next.sport); window.history.replaceState({}, "", url);
    setLoading(true); setActiveRound(1); void loadBracket(slug);
  }

  return <main className="bracket-page">
    <section className="bracket-intro"><div><p className="eyebrow">Live tournament experience</p><h1>{text.headingA}<br />{text.headingB}<span className="accent-dot">.</span></h1></div><div className="bracket-summary"><span className={`live-indicator${tournament?.status === "live" ? " is-live" : ""}`}><i /> {tournament?.status === "live" ? "Live updates" : tournament?.status === "completed" ? "Tournament completed" : "Tournament schedule"}</span><strong>{tournament?.name ?? "KYNG CUP"}</strong><span>{tournament?.location ?? text.locationTba} · {tournament?.bracket_size ?? 16} {text.pairs}</span>{tournaments.length > 1 && <label className="bracket-selector"><span>Choose tournament</span><select value={tournament?.slug ?? ""} onChange={(event) => selectTournament(event.target.value)}>{tournaments.map((item) => <option value={item.slug} key={item.id}>{item.name}{item.status === "completed" ? " · archive" : ""}</option>)}</select></label>}</div></section>
    {champion && <section className="champion-banner"><span>Champion</span><div><strong>{champion.name}</strong><small>{champion.player_one} · {champion.player_two}</small></div><b>KYNG CUP</b></section>}
    {loading ? <div className="bracket-state" role="status" aria-live="polite">Loading the draw…</div> : error ? <div className="bracket-state is-error" role="alert">{error}</div> : <>
      <nav className="round-tabs" aria-label="Tournament rounds">{rounds.map((round) => <button className={activeRound === round.number ? "is-active" : ""} type="button" onClick={() => setActiveRound(round.number)} key={round.number}><span>0{round.number}</span>{round.label}</button>)}</nav>
      <section className="bracket-scroll" aria-label="Tournament bracket"><div className="bracket-board" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(320px, 1fr))`, minWidth: `${Math.max(1, rounds.length) * 370}px` }}>
        {rounds.map((round) => {
          const power = 2 ** (round.number - 1);
          const roundStyle = { "--round-gap": `${168 * power - 154}px`, "--round-offset": `${84 * (power - 1)}px` } as CSSProperties;
          return <section className={`bracket-round round-${round.number}${activeRound === round.number ? " is-active" : ""}`} key={round.number}><header><span>0{round.number}</span><h2>{round.label}</h2><small>{matches.filter((match) => match.round === round.number).length} {text.matches}</small></header><div className="round-matches" style={roundStyle}>{matches.filter((match) => match.round === round.number).map((match) => <MatchCard key={match.id} match={match} pairMap={pairMap} language={language} />)}</div></section>;
        })}
      </div></section>
      <div className="round-mobile-controls"><button type="button" onClick={() => setActiveRound((value) => Math.max(1, value - 1))} disabled={activeRound === 1}>← {text.previous}</button><span>{activeRound} / {rounds.length}</span><button type="button" onClick={() => setActiveRound((value) => Math.min(rounds.length, value + 1))} disabled={activeRound === rounds.length}>{text.next} →</button></div>
    </>}
    <footer className="bracket-footer"><span>Results update automatically</span><span>KYNG CUP · 2026</span></footer>
  </main>;
}
