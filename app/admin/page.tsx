"use client";

import type { User } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "../i18n";

type TournamentStatus = "draft" | "published" | "live" | "completed";
type MatchStatus = "scheduled" | "live" | "completed";
type Sport = "tennis" | "padel";

type Tournament = {
  id: string;
  slug: string;
  name: string;
  sport: Sport;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  bracket_size: number;
  status: TournamentStatus;
  updated_at: string;
  role: "owner" | "admin";
};

type Pair = {
  id: string;
  name: string;
  player_one: string;
  player_two: string;
  seed: number | null;
  updated_at: string;
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
  status: MatchStatus;
  court: string | null;
  scheduled_at: string | null;
  updated_at: string;
};

type AdminMember = { user_id: string; email: string; role: "owner" | "admin"; created_at: string };
const roundLabels: Record<number, Record<number, string>> = {
  8: { 1: "Quarterfinal", 2: "Semifinal", 3: "Final" },
  16: { 1: "Round of 16", 2: "Quarterfinal", 3: "Semifinal", 4: "Final" },
  32: { 1: "Round of 32", 2: "Round of 16", 3: "Quarterfinal", 4: "Semifinal", 5: "Final" },
};

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toLocalDate(value: string | null) {
  return toLocalDateTime(value).slice(0, 10);
}

function toIsoDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

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

function Feedback({ message }: { message: string | null }) {
  return message ? <small className="admin-message" role="status">{message}</small> : null;
}

function CreateTournament({ onCreated, onClose }: { onCreated: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [location, setLocation] = useState("Vienna, Austria");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [size, setSize] = useState(16);
  const [sport, setSport] = useState<Sport>("tennis");
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (startsAt && endsAt && endsAt < startsAt) { setMessage("End date cannot be earlier than start date."); return; }
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("create_tournament_with_bracket", {
      p_name: name.trim(),
      p_slug: slug.trim().toLowerCase(),
      p_location: location.trim(),
      p_starts_at: toIsoDate(startsAt),
      p_bracket_size: size,
      p_sport: sport,
    });
    if (error) {
      setSaving(false);
      setMessage(error.message);
      return;
    }

    const tournamentId = data as string;
    const visibility = await supabase.from("tournaments").update({ status, ends_at: toIsoDate(endsAt), updated_at: new Date().toISOString() }).eq("id", tournamentId).select("id").single();
    setSaving(false);
    if (visibility.error) setMessage(visibility.error.message);
    else {
      setMessage(status === "published" ? "Tournament created and published on the relevant sport page." : "Draft tournament created.");
      onCreated(tournamentId);
    }
  }

  return (
    <form className="admin-create-card" onSubmit={create}>
      <div className="admin-section-heading compact-heading"><div><span>+</span><h2>New tournament</h2></div><p>A complete empty bracket will be created automatically.</p></div>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Name</span><input value={name} onChange={(event) => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} required /></label>
        <label className="admin-field"><span>URL slug</span><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="kyng-cup-vienna-2027" required /></label>
        <label className="admin-field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        <label className="admin-field"><span>Start date</span><input type="date" value={startsAt} max={endsAt || undefined} onChange={(event) => setStartsAt(event.target.value)} required /></label>
        <label className="admin-field"><span>End date</span><input type="date" value={endsAt} min={startsAt || undefined} onChange={(event) => setEndsAt(event.target.value)} required /></label>
        <label className="admin-field"><span>Sport</span><select value={sport} onChange={(event) => setSport(event.target.value as Sport)}><option value="tennis">Tennis</option><option value="padel">Padel</option></select></label>
        <label className="admin-field"><span>Visibility / status</span><select value={status} onChange={(event) => setStatus(event.target.value as "draft" | "published")}><option value="published">Published · show on sport page</option><option value="draft">Draft · hidden</option></select></label>
        <label className="admin-field"><span>Pairs</span><select value={size} onChange={(event) => setSize(Number(event.target.value))}><option value={8}>8 pairs</option><option value={16}>16 pairs</option><option value={32}>32 pairs</option></select></label>
      </div>
      <div className="admin-create-actions"><button className="admin-save-button" type="submit" disabled={saving}>{saving ? "Creating…" : "Create tournament"}</button><button className="admin-close-button" type="button" onClick={onClose}>Close</button></div>
      <Feedback message={message} />
    </form>
  );
}

function TournamentSettings({ tournament, onSaved }: { tournament: Tournament; onSaved: () => void }) {
  const [name, setName] = useState(tournament.name);
  const [location, setLocation] = useState(tournament.location ?? "");
  const [startsAt, setStartsAt] = useState(toLocalDate(tournament.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalDate(tournament.ends_at));
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);
  const [sport, setSport] = useState<Sport>(tournament.sport);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (startsAt && endsAt && endsAt < startsAt) { setMessage("End date cannot be earlier than start date."); return; }
    if (status === "completed" && tournament.status !== "completed" && !window.confirm("Archive this tournament as completed?")) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("tournaments").update({
      name: name.trim(), location: location.trim() || null,
      starts_at: toIsoDate(startsAt), ends_at: toIsoDate(endsAt),
      sport, status, updated_at: new Date().toISOString(),
    }).eq("id", tournament.id).select("id").single();
    setSaving(false);
    if (error) setMessage(error.message);
    else { setMessage("Tournament settings saved."); onSaved(); }
  }

  return (
    <form className="admin-settings-card" onSubmit={save}>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Tournament name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="admin-field"><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        <label className="admin-field"><span>Start date</span><input type="date" value={startsAt} max={endsAt || undefined} onChange={(event) => setStartsAt(event.target.value)} required /></label>
        <label className="admin-field"><span>End date</span><input type="date" value={endsAt} min={startsAt || undefined} onChange={(event) => setEndsAt(event.target.value)} required /></label>
        <label className="admin-field"><span>Sport</span><select value={sport} onChange={(event) => setSport(event.target.value as Sport)}><option value="tennis">Tennis</option><option value="padel">Padel</option></select></label>
        <label className="admin-field"><span>Visibility / status</span><select value={status} onChange={(event) => setStatus(event.target.value as TournamentStatus)}><option value="draft">Draft · hidden</option><option value="published">Published</option><option value="live">Live now</option><option value="completed">Completed · archive</option></select></label>
      </div>
      <button className="admin-save-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save tournament"}</button>
      <Feedback message={message} />
    </form>
  );
}

function PairEditor({ pair, onSaved }: { pair: Pair; onSaved: () => void }) {
  const [name, setName] = useState(pair.name);
  const [playerOne, setPlayerOne] = useState(pair.player_one);
  const [playerTwo, setPlayerTwo] = useState(pair.player_two);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (![name, playerOne, playerTwo].every((value) => value.trim())) { setMessage("Fill in all three names."); return; }
    setSaving(true); setMessage(null);
    const { error } = await supabase.from("pairs").update({ name: name.trim(), player_one: playerOne.trim(), player_two: playerTwo.trim() }).eq("id", pair.id).select("id").single();
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Names saved."); onSaved(); }
  }

  return (
    <form className="admin-pair-editor" onSubmit={save}>
      <div className="admin-pair-number">Draw position {pair.seed ?? "—"}</div>
      <label className="admin-field"><span>Pair name</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <div className="admin-player-fields">
        <label className="admin-field"><span>Player one</span><input value={playerOne} onChange={(event) => setPlayerOne(event.target.value)} required /></label>
        <label className="admin-field"><span>Player two</span><input value={playerTwo} onChange={(event) => setPlayerTwo(event.target.value)} required /></label>
      </div>
      <button className="admin-save-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save names"}</button>
      <Feedback message={message} />
    </form>
  );
}

function AdminMatch({ match, pairMap, bracketSize, onSaved }: { match: Match; pairMap: Map<string, Pair>; bracketSize: number; onSaved: () => void }) {
  const pairOne = match.pair_one_id ? pairMap.get(match.pair_one_id) : undefined;
  const pairTwo = match.pair_two_id ? pairMap.get(match.pair_two_id) : undefined;
  const [score, setScore] = useState(match.pair_one_sets.map((value, index) => `${value}-${match.pair_two_sets[index]}`).join(", "));
  const [winner, setWinner] = useState(match.winner_id ?? "");
  const [court, setCourt] = useState(match.court ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTime(match.scheduled_at));
  const [status, setStatus] = useState<"scheduled" | "live">(match.status === "live" ? "live" : "scheduled");
  const [saving, setSaving] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const title = roundLabels[bracketSize]?.[match.round] ?? `Round ${match.round}`;

  async function saveDetails() {
    setSavingDetails(true); setMessage(null);
    const { error } = await supabase.from("matches").update({ court: court.trim() || null, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, status: match.status === "completed" ? "completed" : status, updated_at: new Date().toISOString() }).eq("id", match.id).select("id").single();
    setSavingDetails(false);
    if (error) setMessage(error.message); else { setMessage(status === "live" ? "Match is live." : "Schedule saved."); onSaved(); }
  }

  async function saveResult(event: FormEvent) {
    event.preventDefault();
    const parsed = parseScore(score);
    if (!parsed || !winner) { setMessage("Use score format 6-4, 3-6, 10-8 and select a winner."); return; }
    if (match.winner_id && !window.confirm("Replace the saved result?")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("record_match_result", { p_match_id: match.id, p_pair_one_sets: parsed.pairOne, p_pair_two_sets: parsed.pairTwo, p_winner_id: winner });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Result saved. The winner advanced automatically."); onSaved(); }
  }

  async function saveLiveScore() {
    const parsed = parseScore(score);
    if (!parsed) { setMessage("Use score format 3-2 or 6-4, 3-6."); return; }
    if (match.status === "completed") { setMessage("Reset the final result before changing the live score."); return; }
    setSaving(true); setMessage(null);
    const { error } = await supabase.from("matches").update({
      pair_one_sets: parsed.pairOne,
      pair_two_sets: parsed.pairTwo,
      status: "live",
      updated_at: new Date().toISOString(),
    }).eq("id", match.id).select("id").single();
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Live score updated. No pair has advanced yet."); setStatus("live"); onSaved(); }
  }

  async function resetResult() {
    if (!window.confirm("Reset this result and remove its winner from the next round?")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("reset_match_result", { p_match_id: match.id });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Result reset."); onSaved(); }
  }

  return (
    <form className={`admin-match status-${match.status}`} onSubmit={saveResult}>
      <div className="admin-match-title"><span>{title} · Match {match.position}</span><strong>{match.status === "completed" ? "Completed" : match.status === "live" ? "Live" : "Scheduled"}</strong></div>
      <div className="admin-match-details">
        <label className="admin-field"><span>Date &amp; time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
        <label className="admin-field"><span>Court</span><input value={court} onChange={(event) => setCourt(event.target.value)} placeholder="Centre court" /></label>
        <label className="admin-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "live")} disabled={match.status === "completed"}><option value="scheduled">Scheduled</option><option value="live">Live now</option></select></label>
        <button type="button" onClick={() => void saveDetails()} disabled={savingDetails}>{savingDetails ? "Saving…" : "Save schedule"}</button>
      </div>
      <label aria-label={`Select ${pairOne?.name ?? "first pair"} as winner`} htmlFor={`winner-${match.id}-one`} className={!pairOne ? "is-disabled" : ""}><input id={`winner-${match.id}-one`} type="radio" name={`winner-${match.id}`} value={pairOne?.id ?? ""} checked={winner === pairOne?.id} onChange={(event) => setWinner(event.target.value)} disabled={!pairOne} /><span><strong>{pairOne?.name ?? "Waiting for winner"}</strong><small>{pairOne ? `${pairOne.player_one} · ${pairOne.player_two}` : "Previous round"}</small></span></label>
      <label aria-label={`Select ${pairTwo?.name ?? "second pair"} as winner`} htmlFor={`winner-${match.id}-two`} className={!pairTwo ? "is-disabled" : ""}><input id={`winner-${match.id}-two`} type="radio" name={`winner-${match.id}`} value={pairTwo?.id ?? ""} checked={winner === pairTwo?.id} onChange={(event) => setWinner(event.target.value)} disabled={!pairTwo} /><span><strong>{pairTwo?.name ?? "Waiting for winner"}</strong><small>{pairTwo ? `${pairTwo.player_one} · ${pairTwo.player_two}` : "Previous round"}</small></span></label>
      <div className="admin-score-row"><input aria-label="Set scores" value={score} onChange={(event) => setScore(event.target.value)} placeholder="3-2 or 6-4, 3-6" disabled={!pairOne || !pairTwo} /><div><button className="admin-live-score-button" type="button" onClick={() => void saveLiveScore()} disabled={saving || !pairOne || !pairTwo || match.status === "completed"}>{saving ? "Saving…" : "Update live score"}</button><button type="submit" disabled={saving || !pairOne || !pairTwo}>{saving ? "Saving…" : match.winner_id ? "Correct final result" : "Save final result"}</button></div></div>
      {match.winner_id && <button className="admin-reset-button" type="button" onClick={() => void resetResult()} disabled={saving}>Reset result</button>}
      <Feedback message={message} />
    </form>
  );
}

function TeamManager({ tournament, members, onSaved }: { tournament: Tournament; members: AdminMember[]; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "admin">("admin");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("add_tournament_admin_by_email", { p_tournament_id: tournament.id, p_email: email.trim(), p_role: role });
    setSaving(false);
    if (error) setMessage(error.message); else { setEmail(""); setMessage("Team member added."); onSaved(); }
  }

  async function remove(member: AdminMember) {
    if (!window.confirm(`Remove ${member.email} from this tournament?`)) return;
    const { error } = await supabase.rpc("remove_tournament_admin", { p_tournament_id: tournament.id, p_user_id: member.user_id });
    if (error) setMessage(error.message); else { setMessage("Administrator removed."); onSaved(); }
  }

  return (
    <div className="admin-team-card">
      <div className="admin-team-list">{members.map((member) => <div key={member.user_id}><span><strong>{member.email}</strong><small>{member.role}</small></span>{tournament.role === "owner" && member.role !== "owner" && <button type="button" onClick={() => void remove(member)}>Remove</button>}</div>)}</div>
      {tournament.role === "owner" && <form className="admin-team-form" onSubmit={add}><label className="admin-field"><span>Account email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="admin-field"><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as "owner" | "admin")}><option value="admin">Administrator</option><option value="owner">Owner</option></select></label><button className="admin-save-button" type="submit" disabled={saving}>{saving ? "Adding…" : "Add member"}</button></form>}
      <Feedback message={message} />
    </div>
  );
}

export default function AdminPage() {
  const { language } = useLanguage();
  const adminTitle = { en: ["Tournament", "admin"], uk: ["Адміністрування", "турніру"], de: ["Turnier-", "verwaltung"], ru: ["Управление", "турниром"] }[language];
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selected = tournaments.find((tournament) => tournament.id === selectedId) ?? null;
  const canCreateTournament = tournaments.some((tournament) => tournament.role === "owner");

  const loadTournaments = useCallback(async (currentUser: User | null, preferredId?: string) => {
    setUser(currentUser);
    if (!currentUser) { setTournaments([]); setSelectedId(null); setChecking(false); return; }
    const memberships = await supabase.from("tournament_admins").select("tournament_id,role").eq("user_id", currentUser.id);
    const membershipRows = (memberships.data ?? []) as { tournament_id: string; role: "owner" | "admin" }[];
    if (!membershipRows.length) { setTournaments([]); setSelectedId(null); setChecking(false); return; }
    const ids = membershipRows.map((item) => item.tournament_id);
    const result = await supabase.from("tournaments").select("id,slug,name,sport,location,starts_at,ends_at,bracket_size,status,updated_at").in("id", ids).order("created_at", { ascending: false });
    const roles = new Map(membershipRows.map((item) => [item.tournament_id, item.role]));
    const managed = ((result.data ?? []) as Omit<Tournament, "role">[]).map((item) => ({ ...item, role: roles.get(item.id) ?? "admin" }));
    setTournaments(managed);
    setSelectedId((current) => preferredId && managed.some((item) => item.id === preferredId) ? preferredId : current && managed.some((item) => item.id === current) ? current : managed[0]?.id ?? null);
    setChecking(false);
  }, []);

  const loadTournamentData = useCallback(async () => {
    if (!selectedId) { setPairs([]); setMatches([]); setMembers([]); return; }
    const [pairsResult, matchesResult, membersResult] = await Promise.all([
      supabase.from("pairs").select("id,name,player_one,player_two,seed,updated_at").eq("tournament_id", selectedId).order("seed"),
      supabase.from("matches").select("id,round,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at,updated_at").eq("tournament_id", selectedId).order("round").order("position"),
      supabase.rpc("list_tournament_admins", { p_tournament_id: selectedId }),
    ]);
    setPairs((pairsResult.data ?? []) as Pair[]); setMatches((matchesResult.data ?? []) as Match[]);
    setMembers((membersResult.data ?? []) as AdminMember[]);
  }, [selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(async () => { const { data } = await supabase.auth.getUser(); await loadTournaments(data.user); }, 0);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => window.setTimeout(() => void loadTournaments(session?.user ?? null), 0));
    return () => { window.clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, [loadTournaments]);

  useEffect(() => { const timer = window.setTimeout(() => void loadTournamentData(), 0); return () => window.clearTimeout(timer); }, [loadTournamentData]);

  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase.channel(`admin:${selectedId}`).on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${selectedId}` }, () => void loadTournamentData()).on("postgres_changes", { event: "*", schema: "public", table: "pairs", filter: `tournament_id=eq.${selectedId}` }, () => void loadTournamentData()).on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${selectedId}` }, () => { void loadTournamentData(); void loadTournaments(user); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadTournamentData, loadTournaments, selectedId, user]);

  const pairMap = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const matchesByRound = useMemo(() => Array.from(new Set(matches.map((match) => match.round))).sort((a, b) => a - b).map((round) => ({ round, matches: matches.filter((match) => match.round === round) })), [matches]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setAuthMessage(null);
    const result = authMode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL(window.location.pathname, window.location.origin).toString() } });
    if (result.error) setAuthMessage(result.error.message); else if (authMode === "signup" && !result.data.session) setAuthMessage("Check your email to confirm the account, then sign in.");
  }

  return (
    <main className="admin-page">
      {user && <div className="admin-session"><button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button></div>}
      {checking ? <section className="admin-state" role="status">Checking access…</section> : !user ? (
        <section className="admin-auth"><div><p className="eyebrow">Protected area</p><h1>{adminTitle[0]}<br />{adminTitle[1]}<span className="accent-dot">.</span></h1><p>Sign in to create tournaments, manage participants, schedules and live results.</p></div><form onSubmit={submitAuth}><label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label><button type="submit">{authMode === "signin" ? "Sign in" : "Create account"} <span aria-hidden="true">↗</span></button><button className="auth-switch" type="button" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>{authMode === "signin" ? "Create a new account" : "I already have an account"}</button><Feedback message={authMessage} /></form></section>
      ) : (
        <section className="admin-dashboard">
          <div className="admin-dashboard-heading"><div><p className="eyebrow">Tournament control centre</p><h1>Match control<span className="accent-dot">.</span></h1></div>{selected && <a href={`../bracket/?tournament=${selected.slug}`} target="_blank" rel="noreferrer">Open public bracket ↗</a>}</div>
          <div className="admin-toolbar"><label className="admin-field"><span>Current tournament</span><select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)}><option value="">No tournament selected</option>{tournaments.map((tournament) => <option value={tournament.id} key={tournament.id}>{tournament.name} · {tournament.sport} · {tournament.status}</option>)}</select></label>{canCreateTournament && <button type="button" onClick={() => { setSelectedId(null); setShowCreate(true); }}>+ New tournament</button>}</div>
          {showCreate && canCreateTournament && <CreateTournament onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); void loadTournaments(user, id); }} />}
          {!tournaments.length && <div className="admin-muted-note">This account has no tournament access yet. Ask an owner to add your email as an administrator.</div>}
          {selected && <>
            <div className="admin-section-heading admin-first-section"><div><span>01</span><h2>Tournament</h2></div><p>Publish, start live coverage or archive the completed tournament.</p></div>
            <TournamentSettings key={selected.updated_at} tournament={selected} onSaved={() => void loadTournaments(user)} />
            <details className="admin-collapsible admin-matches-heading">
              <summary><div><span>02</span><h2>Participants</h2></div><p>Edit the pair and player names used in the tournament bracket.</p></summary>
              <div className="admin-collapsible-content"><div className="admin-pair-grid">{pairs.map((pair) => <PairEditor key={`${pair.id}-${pair.updated_at}`} pair={pair} onSaved={() => void loadTournamentData()} />)}</div></div>
            </details>
            <details className="admin-collapsible admin-matches-heading" open>
              <summary><div><span>03</span><h2>Matches &amp; courts</h2></div><p>Schedule matches, switch LIVE on, enter scores and correct results safely.</p></summary>
              <div className="admin-collapsible-content admin-round-groups">{matchesByRound.map(({ round, matches: roundMatches }) => <details className="admin-round-group" open key={round}><summary><h3>{roundLabels[selected.bracket_size]?.[round] ?? `Round ${round}`}</h3><span>{roundMatches.length}</span></summary><div className="admin-match-grid">{roundMatches.map((match) => <AdminMatch key={`${match.id}-${match.updated_at}`} match={match} pairMap={pairMap} bracketSize={selected.bracket_size} onSaved={() => void loadTournamentData()} />)}</div></details>)}</div>
            </details>
            <div className="admin-section-heading admin-matches-heading"><div><span>04</span><h2>Team &amp; roles</h2></div><p>Owners control structure and access; administrators manage tournament operations.</p></div>
            <TeamManager tournament={selected} members={members} onSaved={() => void loadTournamentData()} />
          </>}
        </section>
      )}
    </main>
  );
}
