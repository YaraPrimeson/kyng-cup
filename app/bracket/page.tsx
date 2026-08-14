"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Tournament = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string | null;
  status: "draft" | "published" | "live" | "completed";
};

type Pair = {
  id: string;
  name: string;
  player_one: string;
  player_two: string;
  seed: number | null;
  country_code: string | null;
};

type Match = {
  id: string;
  round: number;
  position: number;
  pair_one_id: string | null;
  pair_two_id: string | null;
  pair_one_sets: number[];
  pair_two_sets: number[];
  winner_id: string | null;
  status: "scheduled" | "live" | "completed";
  court: string | null;
  scheduled_at: string | null;
};

const rounds = [
  { number: 1, label: "Round of 16" },
  { number: 2, label: "Quarterfinals" },
  { number: 3, label: "Semifinals" },
  { number: 4, label: "Final" },
];

function PairRow({ pair, scores, winner }: { pair?: Pair; scores: number[]; winner: boolean }) {
  return (
    <div className={`bracket-pair${winner ? " is-winner" : ""}${!pair ? " is-pending" : ""}`}>
      <span className="pair-seed">{pair?.seed ? String(pair.seed).padStart(2, "0") : "—"}</span>
      <span className="pair-name">
        <strong>{pair?.name ?? "To be decided"}</strong>
        <small>{pair ? `${pair.player_one} · ${pair.player_two}` : "Winner of previous match"}</small>
      </span>
      <span className="pair-score">{scores.length ? scores.join(" · ") : "—"}</span>
    </div>
  );
}

function MatchCard({ match, pairMap }: { match: Match; pairMap: Map<string, Pair> }) {
  const pairOne = match.pair_one_id ? pairMap.get(match.pair_one_id) : undefined;
  const pairTwo = match.pair_two_id ? pairMap.get(match.pair_two_id) : undefined;
  const date = match.scheduled_at
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(match.scheduled_at))
    : "Schedule TBA";

  return (
    <article className={`bracket-match status-${match.status}`}>
      <div className="match-meta">
        <span>{date}</span>
        <span>{match.status === "completed" ? "Final" : match.status === "live" ? "Live" : match.court ?? "Scheduled"}</span>
      </div>
      <PairRow pair={pairOne} scores={match.pair_one_sets} winner={match.winner_id === match.pair_one_id && !!match.winner_id} />
      <PairRow pair={pairTwo} scores={match.pair_two_sets} winner={match.winner_id === match.pair_two_id && !!match.winner_id} />
    </article>
  );
}

export default function BracketPage() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBracket = useCallback(async () => {
    const tournamentResult = await supabase
      .from("tournaments")
      .select("id,name,location,starts_at,status")
      .eq("slug", "vienna-2026")
      .single();

    if (tournamentResult.error || !tournamentResult.data) {
      setError("The tournament bracket is temporarily unavailable.");
      setLoading(false);
      return;
    }

    const currentTournament = tournamentResult.data as Tournament;
    const [pairsResult, matchesResult] = await Promise.all([
      supabase
        .from("pairs")
        .select("id,name,player_one,player_two,seed,country_code")
        .eq("tournament_id", currentTournament.id)
        .order("seed"),
      supabase
        .from("matches")
        .select("id,round,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at")
        .eq("tournament_id", currentTournament.id)
        .order("round")
        .order("position"),
    ]);

    if (pairsResult.error || matchesResult.error) {
      setError("The latest match data could not be loaded.");
    } else {
      setTournament(currentTournament);
      setPairs((pairsResult.data ?? []) as Pair[]);
      setMatches((matchesResult.data ?? []) as Match[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadBracket(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadBracket]);

  useEffect(() => {
    if (!tournament?.id) return;

    const channel = supabase
      .channel(`tournament:${tournament.id}:bracket`)
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket())
      .on("postgres_changes", { event: "*", schema: "public", table: "pairs", filter: `tournament_id=eq.${tournament.id}` }, () => void loadBracket())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadBracket, tournament?.id]);

  const pairMap = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);

  return (
    <main className="bracket-page">
      <header className="bracket-header">
        {/* A plain anchor preserves the GitHub Pages repository base path. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand bracket-brand" href="/" aria-label="KYNG CUP home">
          <span className="ball-mark" aria-hidden="true"><i /></span>
          <span>KYNG CUP</span>
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="bracket-back" href="/">Back to home <span aria-hidden="true">↗</span></a>
      </header>

      <section className="bracket-intro">
        <div>
          <p className="eyebrow">Live tournament · Vienna</p>
          <h1>Tournament<br />bracket<span className="accent-dot">.</span></h1>
        </div>
        <div className="bracket-summary">
          <span className={`live-indicator${tournament?.status === "live" ? " is-live" : ""}`}>
            <i /> {tournament?.status === "live" ? "Live updates" : "Tournament schedule"}
          </span>
          <strong>{tournament?.name ?? "KYNG CUP Vienna 2026"}</strong>
          <span>{tournament?.location ?? "Vienna, Austria"} · 16 doubles pairs</span>
        </div>
      </section>

      {loading ? (
        <div className="bracket-state" role="status" aria-live="polite">Loading the draw…</div>
      ) : error ? (
        <div className="bracket-state is-error" role="alert">{error}</div>
      ) : (
        <section className="bracket-scroll" aria-label="Tournament bracket">
          <div className="bracket-board">
            {rounds.map((round) => (
              <section className={`bracket-round round-${round.number}`} key={round.number}>
                <header>
                  <span>0{round.number}</span>
                  <h2>{round.label}</h2>
                  <small>{matches.filter((match) => match.round === round.number).length} matches</small>
                </header>
                <div className="round-matches">
                  {matches
                    .filter((match) => match.round === round.number)
                    .map((match) => <MatchCard key={match.id} match={match} pairMap={pairMap} />)}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}

      <footer className="bracket-footer">
        <span>Results update automatically</span>
        <span>KYNG CUP · 2026</span>
      </footer>
    </main>
  );
}
