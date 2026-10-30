"use client";

import CreateTournament from "./create-tournament";
import RegistrationPairLink, { RegistrationPairLinks } from "./registration-pair-link";
import KnockoutDraw from "./knockout-draw";
import KnockoutBoard from "../knockout-board";
import { parseScore, resultError as matchResultError } from "@/lib/match-result";
import { knockoutRoundLabel, savedDraw, mainBracketSize } from "@/lib/knockout";
import { balancePairs, groupSummary } from "@/lib/tournament-setup";
import { readTournamentDraft } from "@/lib/tournament-draft";
import type { User } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "../i18n";
import { calculateStandings, GroupMatch, GroupMember, TournamentGroup } from "../group-stage";

type TournamentStatus = "draft" | "published" | "live" | "completed";
type MatchStatus = "scheduled" | "live" | "completed";
type RegistrationStatus = "new" | "reviewing" | "confirmed" | "waitlist" | "rejected";
type RegistrationAvailability = "open" | "waitlist" | "closed";
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
  format: "knockout" | "group_knockout";
  participant_count: number;
  playoff_participant_count: number;
  status: TournamentStatus;
  registration_status: RegistrationAvailability;
  updated_at: string;
  role: "owner" | "admin";
};

type Pair = {
  id: string;
  tournament_id: string;
  name: string;
  player_one: string;
  player_two: string;
  seed: number | null;
  updated_at: string;
};

type Match = {
  id: string;
  round: number;
  bracket_kind: "playoffs" | "basement";
  next_match_id: string | null;
  next_slot: number | null;
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

type Registration = {
  id: string;
  tournament_id: string;
  status: RegistrationStatus;
  pair_name: string | null;
  player_one_first_name: string;
  player_one_last_name: string;
  player_one_email: string;
  player_one_phone: string;
  player_one_messenger: string | null;
  player_one_level: string;
  player_one_rating_system: string | null;
  player_one_rating_value: string | null;
  player_two_first_name: string;
  player_two_last_name: string;
  player_two_email: string | null;
  player_two_phone: string | null;
  player_two_messenger: string | null;
  player_two_level: string;
  player_two_rating_system: string | null;
  player_two_rating_value: string | null;
  comment: string | null;
  locale: "en" | "uk" | "de" | "ru";
  marketing_opt_in: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  landing_page: string | null;
  referrer: string | null;
  admin_notes: string | null;
  submitted_by: string | null;
  partner_user_id: string | null;
  created_at: string;
  updated_at: string;
};

const registrationStatuses: { value: RegistrationStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "confirmed", label: "Confirmed" },
  { value: "waitlist", label: "Waitlist" },
  { value: "rejected", label: "Rejected" },
];
function roundLabel(bracketSize: number, round: number) {
  if (round === 0) return "Preliminary";
  const remaining = Math.log2(bracketSize) - round;
  if (remaining === 0) return "Final";
  if (remaining === 1) return "Semifinal";
  if (remaining === 2) return "Quarterfinal";
  return `Round of ${2 ** (remaining + 1)}`;
}

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

function Feedback({ message }: { message: string | null }) {
  return message ? <small className="admin-message" role="status">{message}</small> : null;
}

function TournamentSettings({ tournament, onSaved }: { tournament: Tournament; onSaved: () => void }) {
  const [name, setName] = useState(tournament.name);
  const [location, setLocation] = useState(tournament.location ?? "");
  const [startsAt, setStartsAt] = useState(toLocalDate(tournament.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalDate(tournament.ends_at));
  const [status, setStatus] = useState<TournamentStatus>(tournament.status);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationAvailability>(tournament.registration_status);
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
      sport, status, registration_status: registrationStatus, updated_at: new Date().toISOString(),
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
        <label className="admin-field"><span>Registration</span><select value={registrationStatus} onChange={(event) => setRegistrationStatus(event.target.value as RegistrationAvailability)}><option value="open">Open · accepting pairs</option><option value="waitlist">Waitlist only</option><option value="closed">Closed</option></select></label>
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

function TournamentReset({ tournament, onReset }: { tournament: Tournament; onReset: () => void }) {
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    const approved = window.confirm("Reset this tournament? This permanently removes every registration, clears all results and schedules, and restores placeholder pairs.");
    if (!approved) return;

    const reconfirmed = window.confirm("Final confirmation: delete the registrations and reset this tournament now?");
    if (!reconfirmed) return;

    setResetting(true);
    setMessage(null);
    const { error } = await supabase.rpc("reset_tournament_data", { p_tournament_id: tournament.id });
    setResetting(false);
    if (error) setMessage(error.message);
    else {
      setMessage("Tournament reset. Registrations, participants, results and schedules were cleared.");
      onReset();
    }
  }

  if (tournament.role !== "owner") return null;

  return (
    <section className="admin-reset-card" aria-label="Reset tournament data">
      <div><strong>Reset tournament data</strong><p>Use only for test data. This clears every registration, participant name, result and scheduled court/time, while preserving the tournament settings and bracket size.</p></div>
      <button className="admin-reset-button" type="button" onClick={() => void reset()} disabled={resetting}>{resetting ? "Resetting…" : "Reset test data"}</button>
      <Feedback message={message} />
    </section>
  );
}

function TournamentDelete({ tournament, onDeleted }: { tournament: Tournament; onDeleted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function remove() {
    const confirmation = window.prompt(`Type the exact tournament name to delete it permanently:\n\n${tournament.name}`);
    if (confirmation === null) return;
    if (confirmation !== tournament.name) { setMessage("Tournament name does not match."); return; }
    if (!window.confirm("Final confirmation: delete this tournament, its bracket, matches and registrations?")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("delete_tournament", { p_tournament_id: tournament.id, p_confirmation_name: confirmation });
    setSaving(false);
    if (error) setMessage(error.message); else onDeleted();
  }

  if (tournament.role !== "owner") return null;
  return <div className="admin-danger-card"><div><strong>Delete tournament</strong><p>Permanently removes the tournament, bracket, matches and registrations.</p></div><button type="button" onClick={() => void remove()} disabled={saving}>{saving ? "Deleting…" : "Delete tournament"}</button><Feedback message={message} /></div>;
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
  const [resultAttempted, setResultAttempted] = useState(false);
  const [resultServerError, setResultServerError] = useState<string | null>(null);
  const validationError = (resultAttempted || Boolean(score.trim() && winner)) ? matchResultError(score, winner, pairOne, pairTwo) : null;
  const resultProblem = validationError ?? resultServerError;
  const title = roundLabel(bracketSize, match.round);

  async function saveDetails() {
    setSavingDetails(true); setMessage(null);
    const { error } = await supabase.from("matches").update({ court: court.trim() || null, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, status: match.status === "completed" ? "completed" : status, updated_at: new Date().toISOString() }).eq("id", match.id).select("id").single();
    setSavingDetails(false);
    if (error) setMessage(error.message); else { setMessage(status === "live" ? "Match is live." : "Schedule saved."); onSaved(); }
  }

  async function saveResult(event: FormEvent) {
    event.preventDefault();
    const parsed = parseScore(score);
    setResultAttempted(true); setResultServerError(null);
    if (matchResultError(score, winner, pairOne, pairTwo) || !parsed) return;
    if (match.winner_id && !window.confirm("Replace the saved result?")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("record_match_result", { p_match_id: match.id, p_pair_one_sets: parsed.pairOne, p_pair_two_sets: parsed.pairTwo, p_winner_id: winner });
    setSaving(false);
    if (error) setResultServerError(error.message); else { setMessage("Result saved. The winner advanced automatically."); onSaved(); }
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
    <form className={`admin-match status-${match.status}${resultProblem ? " has-result-error" : ""}`} onSubmit={saveResult}>
      <div className="admin-match-title"><span>{title} · Match {match.position}</span><strong>{match.status === "completed" ? "Completed" : match.status === "live" ? "Live" : "Scheduled"}</strong></div>
      <div className="admin-match-details">
        <label className="admin-field"><span>Date &amp; time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
        <label className="admin-field"><span>Court</span><input value={court} onChange={(event) => setCourt(event.target.value)} placeholder="Centre court" /></label>
        <label className="admin-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "live")} disabled={match.status === "completed"}><option value="scheduled">Scheduled</option><option value="live">Live now</option></select></label>
        <button type="button" onClick={() => void saveDetails()} disabled={savingDetails}>{savingDetails ? "Saving…" : "Save schedule"}</button>
      </div>
      <label aria-label={`Select ${pairOne?.name ?? "first pair"} as winner`} htmlFor={`winner-${match.id}-one`} className={!pairOne ? "is-disabled" : ""}><input id={`winner-${match.id}-one`} type="radio" name={`winner-${match.id}`} value={pairOne?.id ?? ""} checked={winner === pairOne?.id} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setWinner(event.target.value); setResultServerError(null); }} disabled={!pairOne} /><span><strong>{pairOne?.name ?? "Waiting for winner"}</strong><small>{pairOne ? `${pairOne.player_one} · ${pairOne.player_two}` : "Previous round"}</small></span></label>
      <label aria-label={`Select ${pairTwo?.name ?? "second pair"} as winner`} htmlFor={`winner-${match.id}-two`} className={!pairTwo ? "is-disabled" : ""}><input id={`winner-${match.id}-two`} type="radio" name={`winner-${match.id}`} value={pairTwo?.id ?? ""} checked={winner === pairTwo?.id} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setWinner(event.target.value); setResultServerError(null); }} disabled={!pairTwo} /><span><strong>{pairTwo?.name ?? "Waiting for winner"}</strong><small>{pairTwo ? `${pairTwo.player_one} · ${pairTwo.player_two}` : "Previous round"}</small></span></label>
      <div className="admin-score-row"><input aria-label="Set scores" value={score} aria-invalid={Boolean(resultProblem)} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setScore(event.target.value); setResultServerError(null); }} placeholder="3-2 or 6-4, 3-6" disabled={!pairOne || !pairTwo} /><div><button className="admin-live-score-button" type="button" onClick={() => void saveLiveScore()} disabled={saving || !pairOne || !pairTwo || match.status === "completed"}>{saving ? "Saving…" : "Update live score"}</button><button type="submit" disabled={saving || !pairOne || !pairTwo}>{saving ? "Saving…" : match.winner_id ? "Correct final result" : "Save final result"}</button></div></div>
    {resultProblem && <p className="result-error" role="alert" id={`score-error-${match.id}`}>{resultProblem}</p>}
      {match.winner_id && <button className="admin-reset-button" type="button" onClick={() => void resetResult()} disabled={saving}>Reset result</button>}
      <Feedback message={message} />
    </form>
  );
}

function AdminGroupMatch({ match, pairMap, groupCode, onSaved }: { match: GroupMatch; pairMap: Map<string, Pair>; groupCode: string; onSaved: () => void }) {
  const pairOne = pairMap.get(match.pair_one_id);
  const pairTwo = pairMap.get(match.pair_two_id);
  const [score, setScore] = useState(match.pair_one_sets.map((value, index) => `${value}-${match.pair_two_sets[index]}`).join(", "));
  const [winner, setWinner] = useState(match.winner_id ?? "");
  const [court, setCourt] = useState(match.court ?? "");
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTime(match.scheduled_at));
  const [status, setStatus] = useState<"scheduled" | "live">(match.status === "live" ? "live" : "scheduled");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resultAttempted, setResultAttempted] = useState(false);
  const [resultServerError, setResultServerError] = useState<string | null>(null);
  const validationError = (resultAttempted || Boolean(score.trim() && winner)) ? matchResultError(score, winner, pairOne, pairTwo) : null;
  const resultProblem = validationError ?? resultServerError;

  async function saveDetails() {
    setSaving(true); setMessage(null);
    const { error } = await supabase.from("group_matches").update({ court: court.trim() || null, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, status: match.status === "completed" ? "completed" : status, updated_at: new Date().toISOString() }).eq("id", match.id).select("id").single();
    setSaving(false); if (error) setMessage(error.message); else { setMessage("Group match schedule saved."); onSaved(); }
  }
  async function saveResult(event: FormEvent) {
    event.preventDefault(); const parsed = parseScore(score);
    setResultAttempted(true); setResultServerError(null);
    if (matchResultError(score, winner, pairOne, pairTwo) || !parsed) return;
    if (match.winner_id && !window.confirm("Replace the saved group result?")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("record_group_match_result", { p_match_id: match.id, p_pair_one_sets: parsed.pairOne, p_pair_two_sets: parsed.pairTwo, p_winner_id: winner });
    setSaving(false); if (error) setResultServerError(error.message); else { setMessage("Result saved. The table was recalculated."); onSaved(); }
  }
  async function resetResult() {
    if (!window.confirm("Reset this group result?")) return;
    setSaving(true); const { error } = await supabase.rpc("reset_group_match_result", { p_match_id: match.id }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Group result reset."); onSaved(); }
  }
  return <form className={`admin-match status-${match.status}${resultProblem ? " has-result-error" : ""}`} onSubmit={saveResult}>
    <div className="admin-match-title"><span>Group {groupCode} · Match {match.position}</span><strong>{match.status}</strong></div>
    <div className="admin-match-details"><label className="admin-field"><span>Date &amp; time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label className="admin-field"><span>Court</span><input value={court} onChange={(event) => setCourt(event.target.value)} /></label><label className="admin-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "live")} disabled={match.status === "completed"}><option value="scheduled">Scheduled</option><option value="live">Live now</option></select></label><button type="button" onClick={() => void saveDetails()} disabled={saving}>Save schedule</button></div>
    {[pairOne, pairTwo].map((pair, index) => <label htmlFor={`group-winner-${match.id}-${index}`} aria-label={`Select ${pair?.name ?? `pair ${index + 1}`} as winner`} key={pair?.id} className={!pair ? "is-disabled" : ""}><input id={`group-winner-${match.id}-${index}`} type="radio" name={`group-winner-${match.id}`} value={pair?.id ?? ""} checked={winner === pair?.id} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setWinner(event.target.value); setResultServerError(null); }} /><span><strong>{pair?.name}</strong><small>{pair?.player_one} · {pair?.player_two}</small></span></label>)}
    <div className="admin-score-row"><input aria-label="Set scores" value={score} aria-invalid={Boolean(resultProblem)} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setScore(event.target.value); setResultServerError(null); }} placeholder="6-4, 3-6, 10-8" /><div><button type="submit" disabled={saving}>{saving ? "Saving…" : match.winner_id ? "Correct result" : "Save result"}</button></div></div>
    {resultProblem && <p className="result-error" role="alert" id={`score-error-${match.id}`}>{resultProblem}</p>}
    {match.winner_id && <button className="admin-reset-button" type="button" onClick={() => void resetResult()} disabled={saving}>Reset result</button>}<Feedback message={message} />
  </form>;
}

function GroupStageManager({ tournament, pairs, groups, members, matches, playoffMatches, pairMap, onSaved }: { tournament: Tournament; pairs: Pair[]; groups: TournamentGroup[]; members: GroupMember[]; matches: GroupMatch[]; playoffMatches: Match[]; pairMap: Map<string, Pair>; onSaved: () => void }) {
  const memberGroup = useMemo(() => new Map(members.map((member) => [member.pair_id, groups.find((group) => group.id === member.group_id)?.code ?? "A"])), [groups, members]);
  const [assignments, setAssignments] = useState<Record<string, string>>(Object.fromEntries(pairs.map((pair) => [pair.id, memberGroup.get(pair.id) ?? "A"])));
  const suggestedQualifiers = useMemo(() => groups.flatMap((group) => calculateStandings(members.filter((member) => member.group_id === group.id), matches.filter((match) => match.group_id === group.id)).slice(0, group.qualify_count).map((row) => row.pairId)), [groups, matches, members]);
  const [draw, setDraw] = useState<string[]>(() => savedDraw(tournament.playoff_participant_count, playoffMatches) ?? suggestedQualifiers);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function saveAssignments() {
    const counts = Object.values(assignments).reduce<Record<string, number>>((total, code) => ({ ...total, [code]: (total[code] ?? 0) + 1 }), {});
    if (groups.some((group) => (counts[group.code] ?? 0) < 2)) { setMessage("Every group needs at least two pairs."); return; }
    if (matches.some((match) => match.scheduled_at || match.court) && !window.confirm("Перераспределение пересоздаст групповые матчи и удалит назначенное время и корты. Продолжить?")) return;
    setSaving(true); setMessage(null); const pairIds = pairs.map((pair) => pair.id); const { error } = await supabase.rpc("set_group_assignments", { p_tournament_id: tournament.id, p_pair_ids: pairIds, p_group_codes: pairIds.map((id) => assignments[id]) }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Groups saved and matches regenerated."); onSaved(); }
  }
  async function seedAnnouncedPairs() {
    if (!window.confirm("Replace the 18 pair and player names with the announced lineup from the group posters?")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("seed_announced_group_pairs", { p_tournament_id: tournament.id });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("All 18 announced pairs were loaded into groups A–E."); onSaved(); }
  }
  const allCompleted = matches.length > 0 && matches.every((match) => match.status === "completed");
  const drawLocked = playoffMatches.some(match => match.status === "live" || match.pair_one_sets.length > 0 || match.pair_two_sets.length > 0);
  function toggleQualifier(pairId: string) { setDraw((current) => current.includes(pairId) ? current.filter((id) => id !== pairId) : current.length < tournament.playoff_participant_count ? [...current, pairId] : current); }
  async function confirmDraw() {
    if (draw.length !== tournament.playoff_participant_count) return; if (!window.confirm("Подтвердить участников и сохранить новую сетку? Назначенные время и корты будут сброшены. Сыгранные матчи менять нельзя.")) return;
    setSaving(true); setMessage(null); const { error } = await supabase.rpc("confirm_group_qualifiers", { p_tournament_id: tournament.id, p_pair_ids: draw }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Playoff bracket confirmed and published."); onSaved(); }
  }

  if (tournament.format !== "group_knockout") return <div className="admin-group-setup"><p>This tournament starts directly with the playoff bracket.</p></div>;
  return <div className="admin-group-manager">
    <section className="admin-group-assignments"><div><h3>Group assignments</h3><p>Distribute all {pairs.length} pairs between {groups.length} groups. Every group must contain at least two pairs.</p></div><div className="setup-actions"><button type="button" disabled={saving || matches.some((match) => match.status !== "scheduled")} onClick={() => { const balanced = balancePairs(pairs.map((pair) => ({ name: pair.name, player_one: pair.player_one, player_two: pair.player_two, group: "A" })), groups.length); setAssignments(Object.fromEntries(pairs.map((pair, index) => [pair.id, balanced[index].group]))); }}>Распределить равномерно</button><span>{groupSummary(pairs.map((pair) => ({ name: pair.name, player_one: pair.player_one, player_two: pair.player_two, group: assignments[pair.id] ?? "A" })), groups.length).map((group) => `${group.code}: ${group.size} пар · ${group.matches} матчей`).join(" / ")}</span></div><div className="admin-group-pair-list">{pairs.map((pair) => <label className="admin-field" key={pair.id}><span>{pair.name} · {pair.player_one} / {pair.player_two}</span><select value={assignments[pair.id] ?? groups[0]?.code ?? "A"} onChange={(event) => setAssignments((current) => ({ ...current, [pair.id]: event.target.value }))}>{groups.map((group) => <option value={group.code} key={group.id}>Group {group.code}</option>)}</select></label>)}</div><div className="admin-group-actions">{pairs.length === 18 && groups.map((group) => group.code).join("") === "ABCDE" && <button className="admin-save-button" type="button" onClick={() => void seedAnnouncedPairs()} disabled={saving}>Load announced pairs</button>}<button className="admin-save-button" type="button" onClick={() => void saveAssignments()} disabled={saving}>Save groups &amp; regenerate matches</button></div></section>
    <div className="admin-round-groups">{groups.map((group) => { const standings = calculateStandings(members.filter((member) => member.group_id === group.id), matches.filter((match) => match.group_id === group.id)); return <details className="admin-round-group" open key={group.id}><summary><h3>Group {group.code}</h3><span>{matches.filter((match) => match.group_id === group.id && match.status === "completed").length}/{matches.filter((match) => match.group_id === group.id).length}</span></summary><div className="admin-group-standings">{standings.map((row) => <div className={row.place <= group.qualify_count ? "is-qualified" : ""} key={row.pairId}><b>{row.place}</b><strong>{pairMap.get(row.pairId)?.name}</strong><span>{row.won}W · {row.lost}L · {row.points} pts</span></div>)}</div><div className="admin-match-grid">{matches.filter((match) => match.group_id === group.id).map((match) => <AdminGroupMatch match={match} pairMap={pairMap} groupCode={group.code} onSaved={onSaved} key={`${match.id}-${match.updated_at}`} />)}</div></details>; })}</div>
    <section className="admin-qualifier-card"><div><h3>Playoff qualifiers</h3><p>{allCompleted ? `Select exactly ${tournament.playoff_participant_count} pairs, then arrange their seed order.` : "Complete every group match to unlock qualifier selection."}</p></div>{allCompleted && <div className="admin-group-pair-list">{groups.flatMap((group) => calculateStandings(members.filter((member) => member.group_id === group.id), matches.filter((match) => match.group_id === group.id)).map((row) => <label className="admin-field" key={row.pairId}><span>Group {group.code} · #{row.place} · {pairMap.get(row.pairId)?.name}</span><input type="checkbox" disabled={saving || drawLocked} checked={draw.includes(row.pairId)} onChange={() => toggleQualifier(row.pairId)} /></label>))}</div>}{tournament.bracket_size > mainBracketSize(tournament.playoff_participant_count) && <p>Сохранена старая расширенная сетка. Ниже показана новая сетка с предварительными играми. Подтвердите её до начала матчей; сыгранные результаты не перезаписываются.</p>}{drawLocked && <p>Жеребьёвка заблокирована: сначала сбросьте результаты плей-офф.</p>}<KnockoutDraw draw={draw} pairMap={pairMap} onChange={setDraw} disabled={saving || !allCompleted || drawLocked} /><button className="admin-save-button" type="button" onClick={() => void confirmDraw()} disabled={!allCompleted || saving || drawLocked || draw.length !== tournament.playoff_participant_count}>Confirm {draw.length}/{tournament.playoff_participant_count} qualifiers</button><Feedback message={message} /></section>
  </div>;
}

function AdminBracketOverview({ matches, pairMap, size }: { matches: Match[]; pairMap: Map<string, Pair>; size: number }) {
  return <KnockoutBoard matches={matches} size={size} label="Current tournament bracket" renderMatch={match => <article className={`draw-preview-match status-${match.status}`}><small>{knockoutRoundLabel(size, match.round)} · {match.position}</small>{[match.pair_one_id, match.pair_two_id].map((id, index) => <div className={`draw-match-pair${id && id === match.winner_id ? " is-winner" : ""}`} key={index}><strong>{id ? pairMap.get(id)?.name : "Победитель предыдущей игры"}</strong><span>{(index === 0 ? match.pair_one_sets : match.pair_two_sets).join(" · ") || "—"}</span></div>)}</article>} />;
}

function KnockoutOnlyDraw({ tournament, pairs, matches, pairMap, onSaved }: { tournament: Tournament; pairs: Pair[]; matches: Match[]; pairMap: Map<string, Pair>; onSaved: () => void }) {
  const [draw, setDraw] = useState(() => savedDraw(tournament.playoff_participant_count, matches) ?? pairs.map(pair => pair.id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = matches.some(match => match.status === "live" || match.pair_one_sets.length > 0 || match.pair_two_sets.length > 0);
  async function save() {
    if (!window.confirm("Подтвердить новую жеребьёвку? Назначенные время и корты будут сброшены. Сыгранные матчи менять нельзя.")) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("set_manual_draw", { p_tournament_id: tournament.id, p_pair_ids: draw });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Жеребьёвка сохранена."); onSaved(); }
  }
  return <section className="admin-qualifier-card"><h3>Жеребьёвка плей-офф</h3>{started && <p>Чтобы менять пары местами, сначала сбросьте результаты этой сетки.</p>}<KnockoutDraw draw={draw} pairMap={pairMap} onChange={setDraw} disabled={saving || started} /><button type="button" className="admin-save-button" disabled={saving || started || draw.length !== tournament.playoff_participant_count} onClick={() => void save()}>Сохранить жеребьёвку</button><Feedback message={message} /></section>;
}

function BasementManager({ tournament, matches, pairMap, onSaved }: { tournament: Tournament; matches: Match[]; pairMap: Map<string, Pair>; onSaved: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const size = 2 ** Math.max(1, ...matches.map(match => match.round));
  async function create() {
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("create_basement_bracket", { p_tournament_id: tournament.id });
    setSaving(false);
    if (error) setMessage(error.message); else onSaved();
  }
  return <details className="admin-collapsible" open><summary><div><span>06</span><h2>Король подвала</h2></div><p>Отдельная сетка: счёт, корты, исправление и сброс результатов.</p></summary><div className="admin-collapsible-content admin-round-groups">
    {!matches.length ? <div><p>Сетка создаётся при подтверждении плей-офф из остальных пар. Для уже подтверждённого турнира её можно создать отдельно.</p><button type="button" className="admin-save-button" disabled={saving} onClick={() => void create()}>{saving ? "Создаём…" : "Создать сетку Короля подвала"}</button><Feedback message={message} /></div> : <><AdminBracketOverview matches={matches} pairMap={pairMap} size={size} />{[...new Set(matches.map(match => match.round))].sort((a,b) => a-b).map(round => <details className="admin-round-group" key={round} open><summary><h3>{knockoutRoundLabel(size, round)}</h3></summary><div className="admin-match-grid">{matches.filter(match => match.round === round).map(match => <AdminMatch key={`${match.id}-${match.updated_at}`} match={match} pairMap={pairMap} bracketSize={size} onSaved={onSaved} />)}</div></details>)}</>}
  </div></details>;
}

function RegistrationPlayer({ number, firstName, lastName, email, phone, messenger, level, ratingSystem, ratingValue }: {
  number: 1 | 2;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  messenger: string | null;
  level: string;
  ratingSystem: string | null;
  ratingValue: string | null;
}) {
  return (
    <div className="admin-registration-player">
      <span className="admin-registration-player-label">Player {number}</span>
      <strong>{firstName} {lastName}</strong>
      {email && <a href={`mailto:${email}`}>{email}</a>}
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>}
      {messenger && <small><b>Messenger</b>{messenger}</small>}
      <small><b>Playing level</b>{level}</small>
      {(ratingSystem || ratingValue) && <small><b>Rating</b>{[ratingSystem, ratingValue].filter(Boolean).join(" · ")}</small>}
    </div>
  );
}

function RegistrationCard({ registration, onSaved }: { registration: Registration; onSaved: () => void }) {
  const [status, setStatus] = useState<RegistrationStatus>(registration.status);
  const [notes, setNotes] = useState(registration.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState<{ role: "primary" | "partner"; code: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [claimError, setClaimError] = useState("");
  const pairName = registration.pair_name?.trim() || `${registration.player_one_last_name} & ${registration.player_two_last_name}`;

  async function issueClaim(role: "primary" | "partner") {
    if (issuing) return;
    setIssuing(true); setClaimCode(null); setClaimError("");
    try {
      const { data, error } = await supabase.rpc("issue_registration_claim_code", { p_registration_id: registration.id, p_player_role: role });
      if (error || typeof data !== "string") throw error ?? new Error("Code unavailable");
      setClaimCode({ role, code: data });
    } catch { setClaimError("Could not create a code. Refresh the application and check its contacts."); }
    finally { setIssuing(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("tournament_registrations").update({
      status,
      admin_notes: notes.trim() || null,
    }).eq("id", registration.id).select("id").single();
    setSaving(false);
    if (error) setMessage(error.message);
    else { setMessage("Registration updated."); onSaved(); }
  }

  return (
    <form className="admin-registration-card" onSubmit={save}>
      <div className="admin-registration-head">
        <div><span>Pair application</span><h3>{pairName}</h3></div>
        <strong className={`admin-registration-status status-${registration.status}`}>{registrationStatuses.find((item) => item.value === registration.status)?.label}</strong>
      </div>
      <div className="admin-registration-players">
        <RegistrationPlayer number={1} firstName={registration.player_one_first_name} lastName={registration.player_one_last_name} email={registration.player_one_email} phone={registration.player_one_phone} messenger={registration.player_one_messenger} level={registration.player_one_level} ratingSystem={registration.player_one_rating_system} ratingValue={registration.player_one_rating_value} />
        <RegistrationPlayer number={2} firstName={registration.player_two_first_name} lastName={registration.player_two_last_name} email={registration.player_two_email} phone={registration.player_two_phone} messenger={registration.player_two_messenger} level={registration.player_two_level} ratingSystem={registration.player_two_rating_system} ratingValue={registration.player_two_rating_value} />
      </div>
      <div className="admin-registration-claim">
        <strong>Connect player accounts</strong>
        <p>Confirm the participant before sharing a code. The confirmed account email must match the application contact. A new code cancels the previous one and expires in 7 days.</p>
        {!registration.submitted_by && <button type="button" disabled={issuing} onClick={() => void issueClaim("primary")}>Create player 1 code</button>}
        {!registration.partner_user_id && registration.player_two_email && <button type="button" disabled={issuing} onClick={() => void issueClaim("partner")}>Create player 2 code</button>}
        {registration.submitted_by && <p>Player 1 account connected.</p>}
        {registration.partner_user_id && <p>Player 2 account connected.</p>}
        {!registration.player_two_email && <p>Player 2 has no contact email in this application; a claim code cannot be issued.</p>}
        {claimCode && <p role="status">One-time code for player {claimCode.role === "primary" ? "1" : "2"}: <code>{claimCode.code}</code> Copy it now; it is not stored in readable form.</p>}
        {claimError && <p role="alert">{claimError}</p>}
      </div>
      <RegistrationPairLink registration={registration} />
      <div className="admin-registration-meta">
        <span><b>Submitted</b>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(registration.created_at))}</span>
        <span><b>Language</b>{registration.locale.toUpperCase()}</span>
        <span><b>News opt-in</b>{registration.marketing_opt_in ? "Yes" : "No"}</span>
        {registration.utm_source && <span><b>Source</b>{registration.utm_source}{registration.utm_medium ? ` / ${registration.utm_medium}` : ""}</span>}
        {registration.utm_campaign && <span><b>Campaign</b>{registration.utm_campaign}</span>}
      </div>
      {registration.comment && <div className="admin-registration-comment"><span>Applicant message</span><p>{registration.comment}</p></div>}
      <div className="admin-registration-controls">
        <label className="admin-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as RegistrationStatus)}>{registrationStatuses.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <label className="admin-field"><span>Admin notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder="Private note for the tournament team" /></label>
      </div>
      <button className="admin-save-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save application"}</button>
      <Feedback message={message} />
    </form>
  );
}

function RegistrationManager({ tournamentId, pairs, registrations, error, onRefresh }: { tournamentId: string; pairs: Pair[]; registrations: Registration[]; error: string | null; onRefresh: () => void }) {
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("all");
  const filtered = filter === "all" ? registrations : registrations.filter((registration) => registration.status === filter);
  const [linksRefreshVersion, setLinksRefreshVersion] = useState(0);
  function refresh() {
    setLinksRefreshVersion(version => version + 1);
    onRefresh();
  }

  return (
    <RegistrationPairLinks tournamentId={tournamentId} pairs={pairs} refreshVersion={linksRefreshVersion}><div className="admin-registration-manager">
      <div className="admin-registration-toolbar">
        <label className="admin-field"><span>Filter by status</span><select value={filter} onChange={(event) => setFilter(event.target.value as "all" | RegistrationStatus)}><option value="all">All applications</option>{registrationStatuses.map((item) => <option value={item.value} key={item.value}>{item.label} · {registrations.filter((registration) => registration.status === item.value).length}</option>)}</select></label>
        <button type="button" onClick={refresh}>Refresh applications</button>
      </div>
      {error && <Feedback message={error} />}
      {!error && !filtered.length && <div className="admin-muted-note">No applications match this filter.</div>}
      <div className="admin-registration-grid">{filtered.filter(registration => registration.tournament_id === tournamentId).map((registration) => <RegistrationCard key={`${registration.id}-${registration.updated_at}`} registration={registration} onSaved={onRefresh} />)}</div>
    </div></RegistrationPairLinks>
  );
}

export default function AdminPage() {
  const { language } = useLanguage();
  const adminTitle = { en: ["Tournament", "admin"], uk: ["Адміністрування", "турніру"], de: ["Turnier-", "verwaltung"], ru: ["Управление", "турниром"] }[language];
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  // undefined is the initial selection; null is an explicit choice to leave it empty.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined);
  const loadRequest = useRef(0);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [groups, setGroups] = useState<TournamentGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [groupMatches, setGroupMatches] = useState<GroupMatch[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [login, setLogin] = useState("KyngAdmin");
  const [authSaving, setAuthSaving] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [organizerAccess, setOrganizerAccess] = useState(false);
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authFailures, setAuthFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

  const selected = tournaments.find((tournament) => tournament.id === selectedId) ?? null;
  const canCreateTournament = organizerAccess;

  const loadTournaments = useCallback(async (currentUser: User | null, preferredId?: string) => {
    const request = ++loadRequest.current;
    setUser(currentUser);
    if (!currentUser) { setOrganizerAccess(false); setAccessError(null); setTournaments([]); setSelectedId(null); setChecking(false); return; }
    setAccessError(null);
    const access = await supabase.rpc("is_global_admin");
    if (request !== loadRequest.current) return;
    setOrganizerAccess(access.data === true && !access.error);
    if (access.error || !access.data) {
      setTournaments([]); setSelectedId(null); setChecking(false);
      setAccessError(access.error ? "Could not check organiser access. Please retry." : "This account does not have organiser access.");
      return;
    }
    const result = await supabase.from("tournaments").select("id,slug,name,sport,location,starts_at,ends_at,bracket_size,format,participant_count,playoff_participant_count,status,registration_status,updated_at").order("created_at", { ascending: false });
    if (request !== loadRequest.current) return;
    if (result.error) { setAccessError("Could not load tournaments. Please retry."); setTournaments([]); setSelectedId(null); setChecking(false); return; }
    const managed = ((result.data ?? []) as Omit<Tournament, "role">[]).map((item) => ({ ...item, role: "owner" as const }));
    setTournaments(managed);
    setSelectedId((current) => preferredId && managed.some((item) => item.id === preferredId) ? preferredId : current === null ? null : current && managed.some((item) => item.id === current) ? current : managed[0]?.id ?? null);
    setChecking(false);
  }, []);

  const loadTournamentData = useCallback(async () => {
    if (!selectedId) { setPairs([]); setMatches([]); setGroups([]); setGroupMembers([]); setGroupMatches([]); setRegistrations([]); setRegistrationError(null); return; }
    const groupsResult = await supabase.from("tournament_groups").select("id,code,qualify_count").eq("tournament_id", selectedId).order("code");
    const groupIds = (groupsResult.data ?? []).map((item) => item.id);
    const [pairsResult, matchesResult, groupMembersResult, groupMatchesResult, registrationsResult] = await Promise.all([
      supabase.from("pairs").select("id,tournament_id,name,player_one,player_two,seed,updated_at").eq("tournament_id", selectedId).order("seed"),
      supabase.from("matches").select("id,round,bracket_kind,position,next_match_id,next_slot,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at,updated_at").eq("tournament_id", selectedId).order("round").order("position"),
      groupIds.length ? supabase.from("group_members").select("group_id,pair_id,position").in("group_id", groupIds) : Promise.resolve({ data: [], error: null }),
      supabase.from("group_matches").select("id,tournament_id,group_id,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at,updated_at").eq("tournament_id", selectedId).order("group_id").order("position"),
      supabase.rpc("list_tournament_registrations", { p_tournament_id: selectedId }),
    ]);
    setPairs((pairsResult.data ?? []) as Pair[]); setMatches((matchesResult.data ?? []) as Match[]); setGroups((groupsResult.data ?? []) as TournamentGroup[]); setGroupMembers((groupMembersResult.data ?? []) as GroupMember[]); setGroupMatches((groupMatchesResult.data ?? []) as GroupMatch[]);
    setRegistrations((registrationsResult.data ?? []) as Registration[]);
    setRegistrationError(registrationsResult.error ? "Loading applications failed." : null);
  }, [selectedId]);

  useEffect(() => {
    let currentUserId: string | null | undefined;
    let timer: number | undefined;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      const nextUserId = nextUser?.id ?? null;
      // SIGNED_IN also fires on tab focus; a refreshed session is not a new account.
      if (currentUserId === nextUserId) return;
      currentUserId = nextUserId;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const restoreDraft = nextUser ? Boolean(readTournamentDraft(nextUser.id)) : false;
        setChecking(true);
        setShowCreate(restoreDraft);
        setSelectedId(restoreDraft ? null : undefined);
        void loadTournaments(nextUser);
      }, 0);
    });
    return () => { window.clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, [loadTournaments]);

  useEffect(() => { const timer = window.setTimeout(() => void loadTournamentData(), 0); return () => window.clearTimeout(timer); }, [loadTournamentData]);

  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase.channel(`admin:${selectedId}`).on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `tournament_id=eq.${selectedId}` }, () => void loadTournamentData()).on("postgres_changes", { event: "*", schema: "public", table: "group_matches", filter: `tournament_id=eq.${selectedId}` }, () => void loadTournamentData()).on("postgres_changes", { event: "*", schema: "public", table: "pairs", filter: `tournament_id=eq.${selectedId}` }, () => void loadTournamentData()).on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${selectedId}` }, () => { void loadTournamentData(); void loadTournaments(user); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadTournamentData, loadTournaments, selectedId, user]);

  const pairMap = useMemo(() => new Map(pairs.map((pair) => [pair.id, pair])), [pairs]);
  const matchesByRound = useMemo(() => Array.from(new Set(matches.filter(match => match.bracket_kind !== "basement").map((match) => match.round))).sort((a, b) => a - b).map((round) => ({ round, matches: matches.filter((match) => match.bracket_kind !== "basement" && match.round === round) })), [matches]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setAuthMessage(null);
    const now = Date.now();
    if (lockedUntil > now) { setAuthMessage(`Too many attempts. Try again in ${Math.ceil((lockedUntil - now) / 1000)} seconds.`); return; }
    if (authSaving) return;
    setAuthSaving(true);
    try {
      const result = await supabase.functions.invoke("organizer-login", { body: { username: login.trim(), password } });
      if (result.error || !result.data?.access_token || !result.data?.refresh_token) {
        const failures = authFailures + 1;
        setAuthFailures(failures);
        if (failures >= 5) { setLockedUntil(now + 60_000); setAuthFailures(0); }
        setAuthMessage("Login or password is incorrect. The sign-in service may also be temporarily unavailable; please try again later.");
        return;
      }
      const session = await supabase.auth.setSession({ access_token: result.data.access_token, refresh_token: result.data.refresh_token });
      if (session.error) { setAuthMessage("Could not start your session. Please try again."); return; }
      setAuthFailures(0); setLockedUntil(0); setPassword("");
    } catch {
      setAuthMessage("Could not reach the sign-in service. Please try again.");
    } finally { setAuthSaving(false); }
  }

  return (
    <main className="admin-page">
      {user && <div className="admin-session"><button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button></div>}
      {checking ? <section className="admin-state" role="status">Checking access…</section> : !user ? (
        <section className="admin-auth"><div><p className="eyebrow">Protected area</p><h1>{adminTitle[0]}<br />{adminTitle[1]}<span className="accent-dot">.</span></h1><p>Use KyngAdmin and the organiser password. Every organiser can manage all tournaments.</p></div><form onSubmit={submitAuth}><label><span>Login</span><input type="text" value={login} onChange={(event) => setLogin(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label><label><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required /></label><button type="submit" disabled={authSaving}>{authSaving ? "Signing in…" : "Sign in"} <span aria-hidden="true">↗</span></button><Feedback message={authMessage} /></form></section>
      ) : (
        <section className="admin-dashboard">
          <div className="admin-dashboard-heading"><div><p className="eyebrow">Tournament control centre</p><h1>Match control<span className="accent-dot">.</span></h1></div>{selected && <a href={`../bracket/?tournament=${selected.slug}`} target="_blank" rel="noreferrer">Open public bracket ↗</a>}</div>
          <div className="admin-toolbar"><label className="admin-field"><span>Current tournament</span><select value={selectedId ?? ""} onChange={(event) => { const tournamentId = event.target.value || null; setSelectedId(tournamentId); if (tournamentId) setShowCreate(false); }}><option value="">No tournament selected</option>{tournaments.map((tournament) => <option value={tournament.id} key={tournament.id}>{tournament.name} · {tournament.sport} · {tournament.status}</option>)}</select></label>{canCreateTournament && <button type="button" onClick={() => { setSelectedId(null); setShowCreate(true); }}>+ New tournament</button>}</div>
          {showCreate && !selectedId && canCreateTournament && <CreateTournament key={user.id} userId={user.id} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); void loadTournaments(user, id); }} />}
          {accessError && <div role="alert" className="admin-muted-note">{accessError} <button type="button" onClick={() => void loadTournaments(user)}>Retry</button></div>}
          {!accessError && organizerAccess && !tournaments.length && <div className="admin-muted-note">No tournaments yet. Create the first tournament to get started.</div>}
          {selected && <>
            <div className="admin-section-heading admin-first-section"><div><span>01</span><h2>Tournament</h2></div><p>Publish, start live coverage or archive the completed tournament.</p></div>
            <TournamentSettings key={selected.updated_at} tournament={selected} onSaved={() => void loadTournaments(user)} />
            <TournamentReset tournament={selected} onReset={() => { void loadTournaments(user, selected.id); void loadTournamentData(); }} />
            <TournamentDelete tournament={selected} onDeleted={() => { setSelectedId(null); void loadTournaments(user); }} />
            <details className="admin-collapsible admin-matches-heading" open>
              <summary><div><span>02</span><h2>Registrations</h2></div><p>Review pair applications and keep each status up to date.</p></summary>
              <div className="admin-collapsible-content"><RegistrationManager key={selected.id} tournamentId={selected.id} pairs={pairs} registrations={registrations} error={registrationError} onRefresh={() => void loadTournamentData()} /></div>
            </details>
            <details className="admin-collapsible admin-matches-heading">
              <summary><div><span>03</span><h2>Participants</h2></div><p>Edit the pair and player names used in the tournament.</p></summary>
              <div className="admin-collapsible-content"><div className="admin-pair-grid">{pairs.map((pair) => <PairEditor key={`${pair.id}-${pair.updated_at}`} pair={pair} onSaved={() => void loadTournamentData()} />)}</div></div>
            </details>
            <details className="admin-collapsible admin-matches-heading" open>
              <summary><div><span>04</span><h2>Group stage</h2></div><p>Manage flexible groups and manually choose the playoff qualifiers.</p></summary>
              <div className="admin-collapsible-content"><GroupStageManager key={`${selected.id}-${pairs.length}-${groupMembers.map((member) => `${member.pair_id}:${member.group_id}:${member.position}`).join("|")}`} tournament={selected} pairs={pairs} groups={groups} members={groupMembers} matches={groupMatches} playoffMatches={matches.filter(match => match.bracket_kind !== "basement")} pairMap={pairMap} onSaved={() => { void loadTournamentData(); void loadTournaments(user, selected.id); }} /></div>
            </details>
            <details className="admin-collapsible admin-matches-heading" open>
              <summary><div><span>05</span><h2>Playoffs &amp; courts</h2></div><p>Schedule knockout matches, switch LIVE on and enter results.</p></summary>
              <div className="admin-collapsible-content admin-round-groups">{selected.format === "knockout" && <KnockoutOnlyDraw key={`${selected.id}-${pairs.length}`} tournament={selected} pairs={pairs} matches={matches.filter(match => match.bracket_kind !== "basement")} pairMap={pairMap} onSaved={() => { void loadTournamentData(); void loadTournaments(user, selected.id); }} />}<AdminBracketOverview matches={matches.filter(match => match.bracket_kind !== "basement")} pairMap={pairMap} size={selected.bracket_size} />{matchesByRound.map(({ round, matches: roundMatches }) => <details className="admin-round-group" open key={round}><summary><h3>{roundLabel(selected.bracket_size, round)}</h3><span>{roundMatches.length}</span></summary><div className="admin-match-grid">{roundMatches.map((match) => <AdminMatch key={`${match.id}-${match.updated_at}`} match={match} pairMap={pairMap} bracketSize={selected.bracket_size} onSaved={() => void loadTournamentData()} />)}</div></details>)}</div>
            </details>
            {selected.format === "group_knockout" && <BasementManager tournament={selected} matches={matches.filter(match => match.bracket_kind === "basement")} pairMap={pairMap} onSaved={() => void loadTournamentData()} />}
          </>}
        </section>
      )}
    </main>
  );
}
