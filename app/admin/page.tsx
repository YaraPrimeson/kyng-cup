"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Pair = { id: string; name: string; player_one: string; player_two: string };
type Match = {
  id: string;
  round: number;
  position: number;
  pair_one_id: string | null;
  pair_two_id: string | null;
  pair_one_sets: number[];
  pair_two_sets: number[];
  winner_id: string | null;
  status: string;
  court: string | null;
};

const roundNames: Record<number, string> = {
  1: "Round of 16",
  2: "Quarterfinal",
  3: "Semifinal",
  4: "Final",
};

function parseScore(value: string) {
  const sets = value.split(",").map((set) => set.trim()).filter(Boolean);
  if (!sets.length) return null;

  const pairOne: number[] = [];
  const pairTwo: number[] = [];
  for (const set of sets) {
    const match = set.match(/^(\d{1,2})\s*[-:]\s*(\d{1,2})$/);
    if (!match) return null;
    pairOne.push(Number(match[1]));
    pairTwo.push(Number(match[2]));
  }
  return { pairOne, pairTwo };
}

function AdminMatch({ match, pairMap, onSaved }: { match: Match; pairMap: Map<string, Pair>; onSaved: () => void }) {
  const pairOne = match.pair_one_id ? pairMap.get(match.pair_one_id) : undefined;
  const pairTwo = match.pair_two_id ? pairMap.get(match.pair_two_id) : undefined;
  const [score, setScore] = useState(
    match.pair_one_sets.map((value, index) => `${value}-${match.pair_two_sets[index]}`).join(", "),
  );
  const [winner, setWinner] = useState(match.winner_id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveResult(event: FormEvent) {
    event.preventDefault();
    const parsed = parseScore(score);
    if (!parsed || !winner) {
      setMessage("Use score format 6-4, 3-6, 10-8 and select a winner.");
      return;
    }

    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("record_match_result", {
      p_match_id: match.id,
      p_pair_one_sets: parsed.pairOne,
      p_pair_two_sets: parsed.pairTwo,
      p_winner_id: winner,
    });
    setSaving(false);

    if (error) setMessage(error.message);
    else {
      setMessage("Result saved. The winner has advanced.");
      onSaved();
    }
  }

  return (
    <form className="admin-match" onSubmit={saveResult}>
      <div className="admin-match-title">
        <span>{roundNames[match.round]} · Match {match.position}</span>
        <strong>{match.status === "completed" ? "Completed" : match.court ?? "Scheduled"}</strong>
      </div>
      <label aria-label={`Select ${pairOne?.name ?? "first pair"} as winner`} htmlFor={`winner-${match.id}-one`} className={!pairOne ? "is-disabled" : ""}>
        <input id={`winner-${match.id}-one`} type="radio" name={`winner-${match.id}`} value={pairOne?.id ?? ""} checked={winner === pairOne?.id} onChange={(event) => setWinner(event.target.value)} disabled={!pairOne} />
        <span><strong>{pairOne?.name ?? "Waiting for winner"}</strong><small>{pairOne ? `${pairOne.player_one} · ${pairOne.player_two}` : "Previous round"}</small></span>
      </label>
      <label aria-label={`Select ${pairTwo?.name ?? "second pair"} as winner`} htmlFor={`winner-${match.id}-two`} className={!pairTwo ? "is-disabled" : ""}>
        <input id={`winner-${match.id}-two`} type="radio" name={`winner-${match.id}`} value={pairTwo?.id ?? ""} checked={winner === pairTwo?.id} onChange={(event) => setWinner(event.target.value)} disabled={!pairTwo} />
        <span><strong>{pairTwo?.name ?? "Waiting for winner"}</strong><small>{pairTwo ? `${pairTwo.player_one} · ${pairTwo.player_two}` : "Previous round"}</small></span>
      </label>
      <div className="admin-score-row">
        <input aria-label="Set scores" value={score} onChange={(event) => setScore(event.target.value)} placeholder="6-4, 6-3" disabled={!pairOne || !pairTwo} />
        <button type="submit" disabled={saving || !pairOne || !pairTwo}>{saving ? "Saving…" : "Save result"}</button>
      </div>
      {message && <small className="admin-message" role="status">{message}</small>}
    </form>
  );
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const loadAccess = useCallback(async (currentUser: User | null) => {
    setUser(currentUser);
    if (!currentUser) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }

    const tournamentResult = await supabase.from("tournaments").select("id").eq("slug", "vienna-2026").single();
    if (!tournamentResult.data) {
      setAuthMessage("Tournament not found.");
      setChecking(false);
      return;
    }

    const id = tournamentResult.data.id as string;
    setTournamentId(id);
    const adminResult = await supabase
      .from("tournament_admins")
      .select("user_id")
      .eq("tournament_id", id)
      .eq("user_id", currentUser.id)
      .maybeSingle();
    setIsAdmin(Boolean(adminResult.data));
    setChecking(false);
  }, []);

  const loadMatches = useCallback(async () => {
    if (!tournamentId || !isAdmin) return;
    const [pairsResult, matchesResult] = await Promise.all([
      supabase.from("pairs").select("id,name,player_one,player_two").eq("tournament_id", tournamentId),
      supabase.from("matches").select("id,round,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court").eq("tournament_id", tournamentId).order("round").order("position"),
    ]);
    setPairs((pairsResult.data ?? []) as Pair[]);
    setMatches((matchesResult.data ?? []) as Match[]);
  }, [isAdmin, tournamentId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(async () => {
      const { data } = await supabase.auth.getUser();
      await loadAccess(data.user);
    }, 0);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void loadAccess(session?.user ?? null), 0);
    });
    return () => {
      window.clearTimeout(initialLoad);
      listener.subscription.unsubscribe();
    };
  }, [loadAccess]);

  useEffect(() => {
    const load = window.setTimeout(() => void loadMatches(), 0);
    return () => window.clearTimeout(load);
  }, [loadMatches]);

  const pairMap = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthMessage(null);
    const result = authMode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: new URL(window.location.pathname, window.location.origin).toString(),
          },
        });
    if (result.error) setAuthMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email to confirm the account, then sign in.");
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="brand" href="/"><span className="ball-mark" aria-hidden="true"><i /></span><span>KYNG CUP</span></a>
        {user && <button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>}
      </header>

      {checking ? (
        <section className="admin-state" role="status">Checking access…</section>
      ) : !user ? (
        <section className="admin-auth">
          <div>
            <p className="eyebrow">Protected area</p>
            <h1>Tournament<br />admin<span className="accent-dot">.</span></h1>
            <p>Sign in to update scores. Database permissions prevent every non-admin account from changing the bracket.</p>
          </div>
          <form onSubmit={submitAuth}>
            <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
            <button type="submit">{authMode === "signin" ? "Sign in" : "Create account"} <span aria-hidden="true">↗</span></button>
            <button className="auth-switch" type="button" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>
              {authMode === "signin" ? "Create a new admin account" : "I already have an account"}
            </button>
            {authMessage && <p className="admin-message" role="status">{authMessage}</p>}
          </form>
        </section>
      ) : !isAdmin ? (
        <section className="admin-state pending-access">
          <p className="eyebrow">Account created</p>
          <h1>Access is<br />waiting<span className="accent-dot">.</span></h1>
          <p>Your account is secure, but it has not yet been assigned to KYNG CUP Vienna 2026. Tell the site owner that registration is complete.</p>
          <code>{user.email}</code>
        </section>
      ) : (
        <section className="admin-dashboard">
          <div className="admin-dashboard-heading">
            <div><p className="eyebrow">KYNG CUP Vienna 2026</p><h1>Match control<span className="accent-dot">.</span></h1></div>
            <a href="../bracket/" target="_blank" rel="noreferrer">Open public bracket ↗</a>
          </div>
          <div className="admin-match-grid">
            {matches.map((match) => <AdminMatch key={match.id} match={match} pairMap={pairMap} onSaved={() => void loadMatches()} />)}
          </div>
        </section>
      )}
    </main>
  );
}
