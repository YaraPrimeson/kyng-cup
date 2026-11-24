"use client";

import { isSportVisible, visibleSportItems } from "@/lib/sports";
import CreateTournament from "./create-tournament";
import GalleryManager from "./gallery-manager";
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
import { AdminLocale, AdminUI, useAdminUI } from "./admin-ui";
import { calculateStandings, GroupMatch, GroupMember, TournamentGroup } from "../group-stage";

const adminTabs = [
  { id: "tournaments", label: "Tournament" },
  { id: "matches", label: "Live matches" },
  { id: "photos", label: "Photo album" },
] as const;
const tournamentStatusLabels = { draft: "Draft", published: "Published", live: "Live", completed: "Completed" };

type TournamentStatus = "draft" | "published" | "live" | "completed";
type MatchStatus = "scheduled" | "live" | "completed";
type MatchEditorView = "Schedule" | "Score" | "Result";
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
  tournament_id: string;
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
  const { t } = useAdminUI();
  return message ? <small className="admin-message" role="status">{t(message)}</small> : null;
}

function TournamentSettings({ tournament, onSaved, onMore }: { tournament: Tournament; onSaved: () => void; onMore: () => void }) {
  const { confirm, t } = useAdminUI();
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
    if (status === "completed" && tournament.status !== "completed" && !await confirm({
      title: "Archive tournament?", detail: "This tournament will move to the completed tournament archive.", action: "Save",
    })) return;
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
        <label className="admin-field"><span>{t("Tournament name")}</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="admin-field"><span>{t("Location")}</span><input value={location} onChange={(event) => setLocation(event.target.value)} /></label>
        <label className="admin-field"><span>{t("Start date")}</span><input type="date" value={startsAt} max={endsAt || undefined} onChange={(event) => setStartsAt(event.target.value)} required /></label>
        <label className="admin-field"><span>{t("End date")}</span><input type="date" value={endsAt} min={startsAt || undefined} onChange={(event) => setEndsAt(event.target.value)} required /></label>
        <label className="admin-field"><span>{t("Sport")}</span><select value={sport} onChange={(event) => setSport(event.target.value as Sport)}>{isSportVisible("tennis") && <option value="tennis">{t("Tennis")}</option>}<option value="padel">{t("Padel")}</option></select></label>
        <label className="admin-field"><span>{t("Visibility / status")}</span><select id="tournament-status" value={status} onChange={(event) => setStatus(event.target.value as TournamentStatus)}><option value="draft">{t("Draft · hidden")}</option><option value="published">{t("Published")}</option><option value="live">{t("Live now")}</option><option value="completed">{t("Completed · archive")}</option></select></label>
        <label className="admin-field"><span>{t("Registration")}</span><select value={registrationStatus} onChange={(event) => setRegistrationStatus(event.target.value as RegistrationAvailability)}><option value="open">{t("Open · accepting pairs")}</option><option value="waitlist">{t("Waitlist only")}</option><option value="closed">{t("Closed")}</option></select></label>
      </div>
      <Feedback message={message} />
      <div className="admin-action-bar">
        <button className="admin-button is-primary" type="submit" disabled={saving}>{t(saving ? "Saving…" : "Save tournament")}</button>
        {tournament.status !== "draft" && <a className="admin-button" href={`../bracket/?tournament=${encodeURIComponent(tournament.slug)}`} target="_blank" rel="noreferrer">{t("Open public bracket")}</a>}
        {tournament.role === "owner" && <button className="admin-button" type="button" onClick={onMore}>{t("More actions")}</button>}
      </div>
    </form>
  );
}

function PairEditor({ pair, onSaved }: { pair: Pair; onSaved: () => void }) {
  const { t } = useAdminUI();
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
      <div className="admin-pair-number">{t("Draw position")} {pair.seed ?? "—"}</div>
      <label className="admin-field"><span>{t("Pair name")}</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
      <div className="admin-player-fields">
        <label className="admin-field"><span>{t("Player one")}</span><input value={playerOne} onChange={(event) => setPlayerOne(event.target.value)} required /></label>
        <label className="admin-field"><span>{t("Player two")}</span><input value={playerTwo} onChange={(event) => setPlayerTwo(event.target.value)} required /></label>
      </div>
      <Feedback message={message} />
      <div className="admin-action-bar"><button className="admin-save-button" type="submit" disabled={saving}>{saving ? t("Saving…") : t("Save names")}</button></div>
    </form>
  );
}

function TournamentMaintenance({ tournament, onReset, onDeleted }: { tournament: Tournament; onReset: () => void; onDeleted: () => void }) {
  const { confirm, t } = useAdminUI();
  const [pending, setPending] = useState<"reset" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    if (pending) return;
    if (!await confirm({ title: "Reset test data?", detail: "This clears registrations, restores placeholder pairs and clears results and schedules.", action: "Continue", danger: true })) return;
    if (!await confirm({ title: "Confirm tournament reset", detail: "The test data will be cleared immediately.", action: "Reset now", danger: true })) return;
    setPending("reset");
    setMessage(null);
    try {
      const { error } = await supabase.rpc("reset_tournament_data", { p_tournament_id: tournament.id });
      if (error) setMessage(error.message);
      else {
        setMessage("Tournament reset. Registrations, participants, results and schedules were cleared.");
        onReset();
      }
    } catch {
      setMessage("Could not complete the action. Please try again.");
    } finally { setPending(null); }
  }

  async function remove() {
    if (pending) return;
    if (!await confirm({ title: "Delete tournament?", detail: "The tournament, bracket, matches and registrations will be deleted.", exactName: tournament.name, action: "Continue to delete", danger: true })) return;
    if (!await confirm({ title: "Confirm permanent deletion", detail: "This permanently deletes the tournament and its data.", action: "Delete tournament", danger: true })) return;
    setPending("delete");
    setMessage(null);
    try {
      const { error } = await supabase.rpc("delete_tournament", { p_tournament_id: tournament.id, p_confirmation_name: tournament.name });
      if (error) setMessage(error.message);
      else onDeleted();
    } catch {
      setMessage("Could not complete the action. Please try again.");
    } finally { setPending(null); }
  }

  if (tournament.role !== "owner") return null;
  return <section className="admin-fill">
    <div><strong>{t("Reset tournament data")}</strong><p>{t("Use only for test data. This clears every registration, participant name, result and scheduled court/time, while preserving the tournament settings and bracket size.")}</p></div>
    <div><strong>{t("Delete tournament")}</strong><p>{t("Permanently removes the tournament, bracket, matches and registrations.")}</p></div>
    <Feedback message={message} />
    <div className="admin-action-bar">
      <button className="admin-button" type="button" onClick={() => void reset()} disabled={Boolean(pending)}>{t(pending === "reset" ? "Resetting…" : "Reset test data")}</button>
      <button className="admin-button is-danger" type="button" onClick={() => void remove()} disabled={Boolean(pending)}>{t(pending === "delete" ? "Deleting…" : "Delete tournament")}</button>
    </div>
  </section>;
}

function LiveSetControls({ score, onChange, names, disabled }: {
  score: string; onChange: (score: string) => void; names: [string, string]; disabled: boolean;
}) {
  const { t } = useAdminUI();
  const parsed = parseScore(score);
  const entries = parsed?.pairOne.map((value, index) => [value, parsed.pairTwo[index]]) ?? [[0, 0]];
  const last = entries.length - 1;
  const valid = !score.trim() || Boolean(parsed);
  const games = entries[last];
  const finished = entries.slice(0, last);
  const apply = (next: number[][]) => onChange(next.map(pair => pair.join("-")).join(", "));
  return <div className="admin-live-controls">
    <div className="admin-live-scoreboard">
      <div><span>{t("Pair")}</span><span>{t("Sets")}</span><span>{t("Current games")}</span></div>
      {names.map((name, side) => <div key={side}>
        <strong>{name}</strong>
        <span>{valid ? finished.filter(set => set[side] > set[1 - side]).length : "—"}</span>
        <span className="admin-live-stepper">
          <button type="button" aria-label={`${t("Subtract a game from")} ${name}`} disabled={disabled || !valid || games[side] === 0} onClick={() =>
            apply([...finished, games.map((count, index) => count - Number(index === side))])}>−</button>
          <b>{valid ? games[side] : "—"}</b>
          <button type="button" aria-label={`${t("Add a game for")} ${name}`} disabled={disabled || !valid || games[side] === 99} onClick={() =>
            apply([...finished, games.map((count, index) => count + Number(index === side))])}>+</button>
        </span>
      </div>)}
    </div>
    <button type="button" className="admin-outline-action" disabled={disabled || !valid || games[0] === games[1]}
      onClick={() => apply([...entries, [0, 0]])}>{t("Finish set")}</button>
  </div>;
}

// A trailing 0-0 is the next unplayed set added by the live console.
function finalMatchScore(score: string, liveWorkspace: boolean) {
  return liveWorkspace ? score.trim().replace(/,\s*0\s*[-:]\s*0\s*,?$/, "") : score;
}

function AdminMatch({ match, pairMap, bracketSize, onSaved, liveWorkspace = false, view, onResult }: { match: Match; pairMap: Map<string, Pair>; bracketSize: number; onSaved: () => void; liveWorkspace?: boolean; view?: MatchEditorView; onResult?: () => void }) {
  const { confirm, t } = useAdminUI();
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
  const resultScore = finalMatchScore(score, liveWorkspace);
  const validationError = (resultAttempted || Boolean(score.trim() && winner)) ? matchResultError(resultScore, winner, pairOne, pairTwo) : null;
  const resultProblem = validationError ?? resultServerError;
  const title = t(roundLabel(bracketSize, match.round));

  async function saveDetails() {
    setSavingDetails(true); setMessage(null);
    const { error } = await supabase.from("matches").update({ court: court.trim() || null, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, status: match.status === "completed" ? "completed" : status, updated_at: new Date().toISOString() }).eq("id", match.id).select("id").single();
    setSavingDetails(false);
    if (error) setMessage(error.message); else { setMessage(status === "live" ? "Match is live." : "Schedule saved."); onSaved(); }
  }

  async function saveResult(event: FormEvent) {
    event.preventDefault();
    if (view && view !== "Result") return;
    const parsed = parseScore(resultScore);
    setResultAttempted(true); setResultServerError(null);
    if (matchResultError(resultScore, winner, pairOne, pairTwo) || !parsed) return;
    if (match.winner_id && !await confirm({ title: "Replace final result?", detail: "The saved playoff result will be replaced.", action: "Save" })) return;
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
    if (!await confirm({ title: "Reset final result?", detail: "The winner will be removed from the next round.", action: "Reset result", danger: true })) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("reset_match_result", { p_match_id: match.id });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Result reset."); onSaved(); }
  }

  return (
    <form className={`admin-match status-${match.status}${resultProblem ? " has-result-error" : ""}`} onSubmit={saveResult}>
      <div className="admin-match-title"><span>{title} · Match {match.position}</span><strong>{t(match.status === "completed" ? "Completed" : match.status === "live" ? "Live" : "Scheduled")}</strong></div>
      <div className="admin-match-details" hidden={Boolean(view && view !== "Schedule")}>
        <label className="admin-field"><span>{t("Date & time")}</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
        <label className="admin-field"><span>{t("Court")}</span><input value={court} onChange={(event) => setCourt(event.target.value)} placeholder={t("Centre court")} /></label>
        <label className="admin-field"><span>{t("Status")}</span><select value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "live")} disabled={match.status === "completed"}><option value="scheduled">{t("Scheduled")}</option><option value="live">{t("Live now")}</option></select></label>
        <button type="button" onClick={() => void saveDetails()} disabled={savingDetails}>{savingDetails ? t("Saving…") : t("Save schedule")}</button>
      </div>
      <div className="admin-winner-options" hidden={Boolean(view && view !== "Result")}>
      <label aria-label={`${t("Select")} ${pairOne?.name ?? t("Pair")} ${t("as winner")}`} htmlFor={`winner-${match.id}-one`} className={!pairOne ? "is-disabled" : ""}><input id={`winner-${match.id}-one`} type="radio" name={`winner-${match.id}`} value={pairOne?.id ?? ""} checked={winner === pairOne?.id} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setWinner(event.target.value); setResultServerError(null); }} disabled={!pairOne} /><span><strong>{pairOne?.name ?? "Waiting for winner"}</strong><small>{pairOne ? `${pairOne.player_one} · ${pairOne.player_two}` : t("Previous round")}</small></span></label>
      <label aria-label={`${t("Select")} ${pairTwo?.name ?? t("Pair")} ${t("as winner")}`} htmlFor={`winner-${match.id}-two`} className={!pairTwo ? "is-disabled" : ""}><input id={`winner-${match.id}-two`} type="radio" name={`winner-${match.id}`} value={pairTwo?.id ?? ""} checked={winner === pairTwo?.id} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setWinner(event.target.value); setResultServerError(null); }} disabled={!pairTwo} /><span><strong>{pairTwo?.name ?? "Waiting for winner"}</strong><small>{pairTwo ? `${pairTwo.player_one} · ${pairTwo.player_two}` : t("Previous round")}</small></span></label>
      </div>
      {liveWorkspace && view !== "Schedule" && view !== "Result" && match.status !== "completed" && pairOne && pairTwo && <LiveSetControls score={score} names={[pairOne.name, pairTwo.name]} disabled={saving}
        onChange={next => { setScore(next); setResultServerError(null); }} />}
      <div className="admin-score-row" hidden={view === "Schedule"}><input aria-label={t("Set scores")} value={score} aria-invalid={Boolean(resultProblem)} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setScore(event.target.value); setResultServerError(null); }} placeholder="3-2 or 6-4, 3-6" disabled={!pairOne || !pairTwo} /><div className="admin-action-bar"><button className="admin-live-score-button" type="button" hidden={view === "Result"} onClick={() => void saveLiveScore()} disabled={saving || !pairOne || !pairTwo || match.status === "completed"}>{saving ? t("Saving…") : t("Update live score")}</button><button type={view === "Score" ? "button" : "submit"} onClick={view === "Score" ? onResult : undefined} className="is-primary" disabled={saving || !pairOne || !pairTwo}>{t(view === "Score" ? "Enter final result" : saving ? "Saving…" : match.winner_id ? "Correct final result" : liveWorkspace ? "Finish match" : "Save final result")}</button></div></div>
    {resultProblem && view !== "Schedule" && <p className="result-error" role="alert" id={`score-error-${match.id}`}>{resultProblem}</p>}
      {match.winner_id && (!view || view === "Result") && <button className="admin-reset-button" type="button" onClick={() => void resetResult()} disabled={saving}>{t("Reset result")}</button>}
      <Feedback message={message} />
    </form>
  );
}

function AdminGroupMatch({ match, pairMap, groupCode, onSaved, liveWorkspace = false, view, onResult }: { match: GroupMatch; pairMap: Map<string, Pair>; groupCode: string; onSaved: () => void; liveWorkspace?: boolean; view?: MatchEditorView; onResult?: () => void }) {
  const { confirm, t } = useAdminUI();
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
  const resultScore = finalMatchScore(score, liveWorkspace);
  const validationError = (resultAttempted || Boolean(score.trim() && winner)) ? matchResultError(resultScore, winner, pairOne, pairTwo) : null;
  const resultProblem = validationError ?? resultServerError;

  async function saveDetails() {
    setSaving(true); setMessage(null);
    const { error } = await supabase.from("group_matches").update({ court: court.trim() || null, scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null, status: match.status === "completed" ? "completed" : status, updated_at: new Date().toISOString() }).eq("id", match.id).select("id").single();
    setSaving(false); if (error) setMessage(error.message); else { setMessage("Group match schedule saved."); onSaved(); }
  }
  async function saveResult(event: FormEvent) {
    event.preventDefault();
    if (view && view !== "Result") return; const parsed = parseScore(resultScore);
    setResultAttempted(true); setResultServerError(null);
    if (matchResultError(resultScore, winner, pairOne, pairTwo) || !parsed) return;
    if (match.winner_id && !await confirm({ title: "Replace final result?", detail: "The group standings will be recalculated.", action: "Save" })) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("record_group_match_result", { p_match_id: match.id, p_pair_one_sets: parsed.pairOne, p_pair_two_sets: parsed.pairTwo, p_winner_id: winner });
    setSaving(false); if (error) setResultServerError(error.message); else { setMessage("Result saved. The table was recalculated."); onSaved(); }
  }
  async function saveLiveScore() {
    const parsed = parseScore(score);
    if (!parsed) { setMessage("Use score format 3-2 or 6-4, 3-6."); return; }
    if (match.status === "completed") return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.from("group_matches").update({
      pair_one_sets: parsed.pairOne, pair_two_sets: parsed.pairTwo,
      status: "live", updated_at: new Date().toISOString(),
    }).eq("id", match.id).select("id").single();
    setSaving(false);
    if (error) setMessage(error.message); else { setStatus("live"); setMessage("Live score updated."); onSaved(); }
  }
  async function resetResult() {
    if (!await confirm({ title: "Reset final result?", detail: "The group standings will be recalculated.", action: "Reset result", danger: true })) return;
    setSaving(true); const { error } = await supabase.rpc("reset_group_match_result", { p_match_id: match.id }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Group result reset."); onSaved(); }
  }
  return <form className={`admin-match status-${match.status}${resultProblem ? " has-result-error" : ""}`} onSubmit={saveResult}>
    <div className="admin-match-title"><span>{t("Group")} {groupCode} · Match {match.position}</span><strong>{t(match.status === "completed" ? "Completed" : match.status === "live" ? "Live" : "Scheduled")}</strong></div>
    <div className="admin-match-details" hidden={Boolean(view && view !== "Schedule")}><label className="admin-field"><span>{t("Date & time")}</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label className="admin-field"><span>{t("Court")}</span><input value={court} onChange={(event) => setCourt(event.target.value)} /></label><label className="admin-field"><span>{t("Status")}</span><select value={status} onChange={(event) => setStatus(event.target.value as "scheduled" | "live")} disabled={match.status === "completed"}><option value="scheduled">{t("Scheduled")}</option><option value="live">{t("Live now")}</option></select></label><button type="button" onClick={() => void saveDetails()} disabled={saving}>{t("Save schedule")}</button></div>
      <div className="admin-winner-options" hidden={Boolean(view && view !== "Result")}>
    {[pairOne, pairTwo].map((pair, index) => <label htmlFor={`group-winner-${match.id}-${index}`} aria-label={`${t("Select")} ${pair?.name ?? `${t("Pair")} ${index + 1}`} ${t("as winner")}`} key={pair?.id} className={!pair ? "is-disabled" : ""}><input id={`group-winner-${match.id}-${index}`} type="radio" name={`group-winner-${match.id}`} value={pair?.id ?? ""} checked={winner === pair?.id} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setWinner(event.target.value); setResultServerError(null); }} /><span><strong>{pair?.name}</strong><small>{pair?.player_one} · {pair?.player_two}</small></span></label>)}
      </div>
    {liveWorkspace && view !== "Schedule" && view !== "Result" && match.status !== "completed" && pairOne && pairTwo && <LiveSetControls score={score} names={[pairOne.name, pairTwo.name]} disabled={saving}
        onChange={next => { setScore(next); setResultServerError(null); }} />}
      <div className="admin-score-row" hidden={view === "Schedule"}><input aria-label={t("Set scores")} value={score} aria-invalid={Boolean(resultProblem)} aria-describedby={`score-error-${match.id}`} onChange={(event) => { setScore(event.target.value); setResultServerError(null); }} placeholder="6-4, 3-6, 10-8" /><div className="admin-action-bar">{liveWorkspace && view !== "Result" && <button className="admin-live-score-button" type="button" disabled={saving || match.status === "completed"} onClick={() => void saveLiveScore()}>{t("Update live score")}</button>}<button type={view === "Score" ? "button" : "submit"} onClick={view === "Score" ? onResult : undefined} className="is-primary" disabled={saving}>{t(view === "Score" ? "Enter final result" : saving ? "Saving…" : match.winner_id ? "Correct result" : liveWorkspace ? "Finish match" : "Save result")}</button></div></div>
    {resultProblem && view !== "Schedule" && <p className="result-error" role="alert" id={`score-error-${match.id}`}>{resultProblem}</p>}
    {match.winner_id && (!view || view === "Result") && <button className="admin-reset-button" type="button" onClick={() => void resetResult()} disabled={saving}>{t("Reset result")}</button>}<Feedback message={message} />
  </form>;
}

function TournamentDay({ tournament, matches, groupMatches, groups, pairMap, onSaved }: {
  tournament: Tournament; matches: Match[]; groupMatches: GroupMatch[]; groups: TournamentGroup[];
  pairMap: Map<string, Pair>; onSaved: () => void;
}) {
  const { locale, t } = useAdminUI();
  const [editing, setEditing] = useState("");
  const [editorView, setEditorView] = useState<MatchEditorView>("Score");
  const [court, setCourt] = useState("");
  const dates = new Intl.DateTimeFormat(locale, { timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "short" });
  const rows = [
    ...groupMatches.filter(match => match.tournament_id === tournament.id).map(match => ({
      key: `group:${match.id}`, match, group: match,
      stage: `${t("Group")} ${groups.find(group => group.id === match.group_id)?.code ?? "?"}`,
    })),
    ...matches.filter(match => match.tournament_id === tournament.id).map(match => ({
      key: `knockout:${match.id}`, match, knockout: match,
      stage: match.bracket_kind === "basement" ? t("Consolation") : t(roundLabel(tournament.bracket_size, match.round)),
    })),
  ].filter(({ match }) => match.pair_one_id && match.pair_two_id)
    .sort((a, b) => ((a.match.scheduled_at ? Date.parse(a.match.scheduled_at) : Infinity)
      - (b.match.scheduled_at ? Date.parse(b.match.scheduled_at) : Infinity)) || a.key.localeCompare(b.key));
  const slots = new Map<string, string[]>();
  const courts = new Set<string>();
  for (const { key, match } of rows) {
    const courtName = match.court?.trim();
    if (courtName) courts.add(courtName);
    if (!match.scheduled_at || match.status === "completed") continue;
    const timestamp = Date.parse(match.scheduled_at);
    const resources = [`pair:${match.pair_one_id}`, `pair:${match.pair_two_id}`];
    if (courtName) resources.push(`court:${courtName.toLowerCase()}`);
    for (const resource of resources) {
      const slot = `${timestamp}:${resource}`;
      slots.set(slot, [...(slots.get(slot) ?? []), key]);
    }
  }
  const conflicts = new Set([...slots.values()].filter(ids => ids.length > 1).flat());
  const visibleRows = rows.filter(({ match }) => !court || match.court?.trim() === court);
  const statusOrder = { live: 0, scheduled: 1, completed: 2 } as const;
  visibleRows.sort((a, b) => statusOrder[a.match.status] - statusOrder[b.match.status]);
  const current = visibleRows.find(row => row.key === editing);
  const setCount = visibleRows.reduce((max, { match }) => Math.max(max, match.pair_one_sets.length, match.pair_two_sets.length), 1);
  const setColumns = Array.from({ length: setCount }, (_, index) => index);
  return <section className="admin-day">
    <div className="admin-workspace-section-heading">
      <h2>{t("Live matches")}</h2>
      <label className="admin-field"><span>{t("Court")}</span><select value={court} onChange={event => setCourt(event.target.value)}>
        <option value="">{t("All courts")}</option>
        {[...courts].sort((a, b) => a.localeCompare(b, locale, { numeric: true })).map(name => <option key={name}>{name}</option>)}
      </select></label>
    </div>
    {conflicts.size > 0 && <p role="status" className="admin-conflict">{t("Schedule conflict")} · {conflicts.size} {t("Matches").toLowerCase()}</p>}
    {!visibleRows.length ? <p>{t(rows.length ? "No matches on this court." : "No matches with both pairs assigned.")}</p> : <div className="admin-score-table">
      <table>
        <thead><tr><th scope="col">{t("Match & court")}</th><th scope="col">{t("Pairs")}</th>
          {setColumns.map(i => <th scope="col" key={i}>{t("Set")} {i + 1}</th>)}<th scope="col">{t("Status")}</th><th scope="col"><span className="admin-visually-hidden">{t("Open match")}</span></th>
        </tr></thead>
        <tbody>{visibleRows.map(({ key, match, stage }) => <tr key={key} data-status={match.status}>
          <td className="admin-match-meta"><strong>{match.court || t("Court not set")}</strong><small>{stage}
            {match.scheduled_at && <> · <time dateTime={match.scheduled_at}>{dates.format(new Date(match.scheduled_at))}</time></>}
            {conflicts.has(key) && <> · {t("Schedule conflict")}</>}</small></td>
          <td className="admin-match-pairs"><strong>{pairMap.get(match.pair_one_id ?? "")?.name ?? "—"}</strong><strong>{pairMap.get(match.pair_two_id ?? "")?.name ?? "—"}</strong></td>
          {setColumns.map(i => <td key={i} className="admin-set-cell"><span>{t("Set")} {i + 1}</span>
            <b>{match.pair_one_sets[i] ?? "—"}</b><b>{match.pair_two_sets[i] ?? "—"}</b></td>)}
          <td className="admin-match-status"><span className="admin-status" data-status={match.status}>{t(match.status === "completed" ? "Finished" : match.status === "live" ? "Live" : "Upcoming")}</span></td>
          <td className="admin-match-open"><button className={match.status === "live" ? "admin-button is-primary" : "admin-button"} type="button" aria-pressed={current?.key === key} onClick={() => {
            setEditing(current?.key === key ? "" : key);
            setEditorView(match.status === "live" ? "Score" : match.status === "completed" ? "Result" : "Schedule");
          }}>
            {t(match.status === "live" ? "Update score" : match.status === "completed" ? "View result" : "Open match")}
          </button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {current && <div className="admin-day-editor" ref={element => { if (element) element.scrollIntoView?.({ block: "nearest" }); }}>
      <div className="admin-workspace-section-heading"><h3>{current.match.court || current.stage} · {t("Score")}</h3>
        <button type="button" className="admin-button" onClick={() => setEditing("")}>{t("Close")}</button></div>
      <nav className="admin-subnav" aria-label={t("Match")}>{(["Schedule", "Score", "Result"] as const).map(item =>
        <button key={item} type="button" aria-pressed={editorView === item} onClick={() => setEditorView(item)}>{t(item)}</button>)}</nav>
      {"group" in current && current.group && <AdminGroupMatch key={current.group.id + current.group.updated_at} match={current.group} pairMap={pairMap} groupCode={groups.find(group => group.id === current.group?.group_id)?.code ?? "?"} onSaved={onSaved} liveWorkspace view={editorView} onResult={() => setEditorView("Result")} />}
      {"knockout" in current && current.knockout && <AdminMatch key={current.knockout.id + current.knockout.updated_at} match={current.knockout} pairMap={pairMap} bracketSize={tournament.bracket_size} onSaved={onSaved} liveWorkspace view={editorView} onResult={() => setEditorView("Result")} />}
    </div>}
  </section>;
}

function GroupStageManager({ tournament, pairs, groups, members, matches, playoffMatches, pairMap, onSaved, onOpenMatches }: { tournament: Tournament; pairs: Pair[]; groups: TournamentGroup[]; members: GroupMember[]; matches: GroupMatch[]; playoffMatches: Match[]; pairMap: Map<string, Pair>; onSaved: () => void; onOpenMatches: () => void }) {
  const { confirm, t } = useAdminUI();
  const [view, setView] = useState<"Assignments" | "Standings" | "Playoff qualifiers">("Assignments");
  const memberGroup = useMemo(() => new Map(members.map((member) => [member.pair_id, groups.find((group) => group.id === member.group_id)?.code ?? "A"])), [groups, members]);
  const [assignments, setAssignments] = useState<Record<string, string>>(Object.fromEntries(pairs.map((pair) => [pair.id, memberGroup.get(pair.id) ?? "A"])));
  const suggestedQualifiers = useMemo(() => groups.flatMap((group) => calculateStandings(members.filter((member) => member.group_id === group.id), matches.filter((match) => match.group_id === group.id)).slice(0, group.qualify_count).map((row) => row.pairId)), [groups, matches, members]);
  const [draw, setDraw] = useState<string[]>(() => savedDraw(tournament.playoff_participant_count, playoffMatches) ?? suggestedQualifiers);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function saveAssignments() {
    const counts = Object.values(assignments).reduce<Record<string, number>>((total, code) => ({ ...total, [code]: (total[code] ?? 0) + 1 }), {});
    if (groups.some((group) => (counts[group.code] ?? 0) < 2)) { setMessage("Every group needs at least two pairs."); return; }
    if (matches.some((match) => match.scheduled_at || match.court) && !await confirm({ title: "Save group assignments?", detail: "Group matches will be recreated. Scheduled times and courts will be cleared.", action: "Save" })) return;
    setSaving(true); setMessage(null); const pairIds = pairs.map((pair) => pair.id); const { error } = await supabase.rpc("set_group_assignments", { p_tournament_id: tournament.id, p_pair_ids: pairIds, p_group_codes: pairIds.map((id) => assignments[id]) }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Groups saved and matches regenerated."); onSaved(); }
  }
  async function seedAnnouncedPairs() {
    if (!await confirm({ title: "Use the announced lineup?", detail: "This replaces the names of the 18 announced pairs and players.", action: "Save" })) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("seed_announced_group_pairs", { p_tournament_id: tournament.id });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("All 18 announced pairs were loaded into groups A–E."); onSaved(); }
  }
  const allCompleted = matches.length > 0 && matches.every((match) => match.status === "completed");
  const drawLocked = playoffMatches.some(match => match.status === "live" || match.pair_one_sets.length > 0 || match.pair_two_sets.length > 0);
  function toggleQualifier(pairId: string) { setDraw((current) => current.includes(pairId) ? current.filter((id) => id !== pairId) : current.length < tournament.playoff_participant_count ? [...current, pairId] : current); }
  async function confirmDraw() {
    if (draw.length !== tournament.playoff_participant_count) return; if (!await confirm({ title: "Confirm playoff draw?", detail: "Scheduled times and courts will be cleared. Played matches cannot be changed.", action: "Confirm playoff draw" })) return;
    setSaving(true); setMessage(null); const { error } = await supabase.rpc("confirm_group_qualifiers", { p_tournament_id: tournament.id, p_pair_ids: draw }); setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Playoff bracket confirmed and published."); onSaved(); }
  }

  if (tournament.format !== "group_knockout") return <div className="admin-group-setup"><p>{t("This tournament starts directly with the playoff bracket.")}</p></div>;
  return <div className="admin-group-manager admin-fill">
    <nav className="admin-subnav" aria-label={t("Group stage")}>
      {(["Assignments", "Standings", "Playoff qualifiers"] as const).map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{t(item)}</button>)}
    </nav>
    {view === "Assignments" && <section className="admin-group-assignments admin-fill"><div><h3>{t("Group assignments")}</h3><p>{t("Distribute all")} {pairs.length} {t("pairs between")} {groups.length} {t("groups. Every group must contain at least two pairs.")}</p></div><div className="setup-actions"><button type="button" disabled={saving || matches.some((match) => match.status !== "scheduled")} onClick={() => { const balanced = balancePairs(pairs.map((pair) => ({ name: pair.name, player_one: pair.player_one, player_two: pair.player_two, group: "A" })), groups.length); setAssignments(Object.fromEntries(pairs.map((pair, index) => [pair.id, balanced[index].group]))); }}>{t("Balance groups")}</button><span>{groupSummary(pairs.map((pair) => ({ name: pair.name, player_one: pair.player_one, player_two: pair.player_two, group: assignments[pair.id] ?? "A" })), groups.length).map((group) => `${group.code}: ${group.size} пар · ${group.matches} матчей`).join(" / ")}</span></div><div className="admin-group-pair-list">{pairs.map((pair) => <label className="admin-field" key={pair.id}><span>{pair.name} · {pair.player_one} / {pair.player_two}</span><select value={assignments[pair.id] ?? groups[0]?.code ?? "A"} onChange={(event) => setAssignments((current) => ({ ...current, [pair.id]: event.target.value }))}>{groups.map((group) => <option value={group.code} key={group.id}>{t("Group")} {group.code}</option>)}</select></label>)}</div><Feedback message={message} /><div className="admin-action-bar">{pairs.length === 18 && groups.map((group) => group.code).join("") === "ABCDE" && <button className="admin-save-button" type="button" onClick={() => void seedAnnouncedPairs()} disabled={saving}>{t("Load announced pairs")}</button>}<button className="admin-save-button" type="button" onClick={() => void saveAssignments()} disabled={saving}>{t("Save groups & regenerate matches")}</button></div></section>}
    {view === "Standings" && <div className="admin-round-groups admin-fill">{groups.map((group) => { const standings = calculateStandings(members.filter((member) => member.group_id === group.id), matches.filter((match) => match.group_id === group.id)); return <details className="admin-round-group" open key={group.id}><summary><h3>{t("Group")} {group.code}</h3><span>{matches.filter((match) => match.group_id === group.id && match.status === "completed").length}/{matches.filter((match) => match.group_id === group.id).length}</span></summary><div className="admin-group-standings">{standings.map((row) => <div className={row.place <= group.qualify_count ? "is-qualified" : ""} key={row.pairId}><b>{row.place}</b><strong>{pairMap.get(row.pairId)?.name}</strong><span>{row.won}W · {row.lost}L · {row.points} pts</span></div>)}</div><div className="admin-match-grid">{matches.filter((match) => match.group_id === group.id).map((match) => <AdminGroupMatch match={match} pairMap={pairMap} groupCode={group.code} onSaved={onSaved} key={`${match.id}-${match.updated_at}`} />)}</div></details>; })}<div className="admin-action-bar"><button type="button" className="admin-button" onClick={onOpenMatches}>{t("Open live matches")}</button></div></div>}
    {view === "Playoff qualifiers" && <section className="admin-qualifier-card admin-fill"><div><h3>{t("Playoff qualifiers")}</h3><p>{allCompleted ? `Select exactly ${tournament.playoff_participant_count} pairs, then arrange their seed order.` : t("Complete every group match to unlock qualifier selection.")}</p></div>{allCompleted && <div className="admin-group-pair-list">{groups.flatMap((group) => calculateStandings(members.filter((member) => member.group_id === group.id), matches.filter((match) => match.group_id === group.id)).map((row) => <label className="admin-field" key={row.pairId}><span>{t("Group")} {group.code} · #{row.place} · {pairMap.get(row.pairId)?.name}</span><input type="checkbox" disabled={saving || drawLocked} checked={draw.includes(row.pairId)} onChange={() => toggleQualifier(row.pairId)} /></label>))}</div>}{tournament.bracket_size > mainBracketSize(tournament.playoff_participant_count) && <p>{t("An older expanded bracket is saved. Confirm the new bracket with preliminary matches before any matches are played.")}</p>}{drawLocked && <p>{t("Reset playoff results before changing the draw.")}</p>}<KnockoutDraw draw={draw} pairMap={pairMap} onChange={setDraw} disabled={saving || !allCompleted || drawLocked} /><Feedback message={message} /><div className="admin-action-bar"><button className="admin-save-button" type="button" onClick={() => void confirmDraw()} disabled={!allCompleted || saving || drawLocked || draw.length !== tournament.playoff_participant_count}>{t("Confirm playoff draw")} · {draw.length}/{tournament.playoff_participant_count}</button>{!allCompleted && <button type="button" className="admin-button" onClick={onOpenMatches}>{t("Open live matches")}</button>}</div></section>}
  </div>;
}

function AdminBracketOverview({ matches, pairMap, size }: { matches: Match[]; pairMap: Map<string, Pair>; size: number }) {
  const { t } = useAdminUI();
  return <KnockoutBoard matches={matches} size={size} label={t("Current tournament bracket")} renderMatch={match => <article className={`draw-preview-match status-${match.status}`}><small>{t(knockoutRoundLabel(size, match.round))} · {match.position}</small>{[match.pair_one_id, match.pair_two_id].map((id, index) => <div className={`draw-match-pair${id && id === match.winner_id ? " is-winner" : ""}`} key={index}><strong>{id ? pairMap.get(id)?.name : t("Winner of the previous match")}</strong><span>{(index === 0 ? match.pair_one_sets : match.pair_two_sets).join(" · ") || "—"}</span></div>)}</article>} />;
}

function KnockoutOnlyDraw({ tournament, pairs, matches, pairMap, onSaved }: { tournament: Tournament; pairs: Pair[]; matches: Match[]; pairMap: Map<string, Pair>; onSaved: () => void }) {
  const { confirm, t } = useAdminUI();
  const [draw, setDraw] = useState(() => savedDraw(tournament.playoff_participant_count, matches) ?? pairs.map(pair => pair.id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const started = matches.some(match => match.status === "live" || match.pair_one_sets.length > 0 || match.pair_two_sets.length > 0);
  async function save() {
    if (!await confirm({ title: "Save the new draw?", detail: "Scheduled times and courts will be cleared. Played matches cannot be changed.", action: "Save" })) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("set_manual_draw", { p_tournament_id: tournament.id, p_pair_ids: draw });
    setSaving(false);
    if (error) setMessage(error.message); else { setMessage("Draw saved."); onSaved(); }
  }
  return <section className="admin-qualifier-card"><h3>{t("Manual playoff draw")}</h3>{started && <p>{t("Reset playoff results before changing the draw.")}</p>}<KnockoutDraw draw={draw} pairMap={pairMap} onChange={setDraw} disabled={saving || started} /><Feedback message={message} /><div className="admin-action-bar"><button type="button" className="admin-save-button" disabled={saving || started || draw.length !== tournament.playoff_participant_count} onClick={() => void save()}>{t("Save draw")}</button></div></section>;
}

function BasementManager({ tournament, matches, pairMap, onSaved }: { tournament: Tournament; matches: Match[]; pairMap: Map<string, Pair>; onSaved: () => void }) {
  const { t } = useAdminUI();
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const size = 2 ** Math.max(1, ...matches.map(match => match.round));
  async function create() {
    setSaving(true); setMessage(null);
    const { error } = await supabase.rpc("create_basement_bracket", { p_tournament_id: tournament.id });
    setSaving(false);
    if (error) setMessage(error.message); else onSaved();
  }
  return <details className="admin-collapsible admin-fill" open><summary><div><h2>{t("King of the Basement")}</h2></div><p>{t("Match scores, courts and results for the consolation bracket.")}</p></summary><div className="admin-collapsible-content admin-round-groups">
    {!matches.length ? <div><p>{t("The remaining pairs enter this bracket when the playoff draw is confirmed. You can also create it separately.")}</p><Feedback message={message} /><div className="admin-action-bar"><button type="button" className="admin-save-button" disabled={saving} onClick={() => void create()}>{t(saving ? "Creating…" : "Create consolation draw")}</button></div></div> : <><AdminBracketOverview matches={matches} pairMap={pairMap} size={size} />{[...new Set(matches.map(match => match.round))].sort((a,b) => a-b).map(round => <details className="admin-round-group" key={round} open><summary><h3>{knockoutRoundLabel(size, round)}</h3></summary><div className="admin-match-grid">{matches.filter(match => match.round === round).map(match => <AdminMatch key={`${match.id}-${match.updated_at}`} match={match} pairMap={pairMap} bracketSize={size} onSaved={onSaved} />)}</div></details>)}</>}
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
  const { t } = useAdminUI();
  return (
    <div className="admin-registration-player">
      <span className="admin-registration-player-label">{t("Player")} {number}</span>
      <strong>{firstName} {lastName}</strong>
      {email && <a href={`mailto:${email}`}>{email}</a>}
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`}>{phone}</a>}
      {messenger && <small><b>{t("Messenger")}</b>{messenger}</small>}
      <small><b>{t("Playing level")}</b>{level}</small>
      {(ratingSystem || ratingValue) && <small><b>{t("Rating")}</b>{[ratingSystem, ratingValue].filter(Boolean).join(" · ")}</small>}
    </div>
  );
}

function RegistrationCard({ registration, onSaved }: { registration: Registration; onSaved: () => void }) {
  const { t, locale } = useAdminUI();
  const [view, setView] = useState("Details");
  const [copied, setCopied] = useState(false);
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
    setIssuing(true); setCopied(false); setClaimCode(null); setClaimError("");
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
    <form className="admin-registration-card admin-fill" onSubmit={save}>
      <div className="admin-registration-head">
        <div><span>{t("Pair application")}</span><h3>{pairName}</h3></div>
        <strong className={`admin-registration-status status-${registration.status}`}>{t(registrationStatuses.find((item) => item.value === registration.status)?.label ?? "")}</strong>
      </div>
      <nav className="admin-subnav" aria-label={t("Pair application")}>
        {["Details", "Player accounts", "Pair link"].map(item => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)}>{t(item)}</button>)}
      </nav>
      <div className="admin-fill" hidden={view !== "Details"}>
      <div className="admin-registration-players">
        <RegistrationPlayer number={1} firstName={registration.player_one_first_name} lastName={registration.player_one_last_name} email={registration.player_one_email} phone={registration.player_one_phone} messenger={registration.player_one_messenger} level={registration.player_one_level} ratingSystem={registration.player_one_rating_system} ratingValue={registration.player_one_rating_value} />
        <RegistrationPlayer number={2} firstName={registration.player_two_first_name} lastName={registration.player_two_last_name} email={registration.player_two_email} phone={registration.player_two_phone} messenger={registration.player_two_messenger} level={registration.player_two_level} ratingSystem={registration.player_two_rating_system} ratingValue={registration.player_two_rating_value} />
      </div>
      <div className="admin-registration-meta">
        <span><b>{t("Submitted")}</b>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(registration.created_at))}</span>
        <span><b>{t("Language")}</b>{registration.locale.toUpperCase()}</span>
        <span><b>{t("News opt-in")}</b>{registration.marketing_opt_in ? t("Yes") : t("No")}</span>
        {registration.utm_source && <span><b>{t("Source")}</b>{registration.utm_source}{registration.utm_medium ? ` / ${registration.utm_medium}` : ""}</span>}
        {registration.utm_campaign && <span><b>{t("Campaign")}</b>{registration.utm_campaign}</span>}
      </div>
      {registration.comment && <div className="admin-registration-comment"><span>{t("Applicant message")}</span><p>{registration.comment}</p></div>}
      <div className="admin-registration-controls">
        <label className="admin-field"><span>{t("Status")}</span><select value={status} onChange={(event) => setStatus(event.target.value as RegistrationStatus)}>{registrationStatuses.map((item) => <option value={item.value} key={item.value}>{t(item.label)}</option>)}</select></label>
        <label className="admin-field"><span>{t("Admin notes")}</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} placeholder={t("Private note for the tournament team")} /></label>
      </div>
      <Feedback message={message} />
      <div className="admin-action-bar"><button className="admin-save-button" type="submit" disabled={saving}>{t(saving ? "Saving…" : "Save application")}</button></div>
      </div>
      <div className="admin-registration-claim admin-fill" hidden={view !== "Player accounts"}>
        <strong>{t("Connect player accounts")}</strong>
        <p>{t("Confirm the participant before sharing a code. The confirmed account email must match the application contact. A new code cancels the previous one and expires in 7 days.")}</p>
        {registration.submitted_by && <p>{t("Player 1 account connected.")}</p>}
        {registration.partner_user_id && <p>{t("Player 2 account connected.")}</p>}
        {!registration.player_two_email && <p>{t("Player 2 has no contact email in this application; a claim code cannot be issued.")}</p>}
        {claimCode && <p role="status">{t("One-time code for player")} {claimCode.role === "primary" ? "1" : "2"}: <code>{claimCode.code}</code> {t("Copy it now; it is not stored in readable form.")}</p>}
        {claimError && <p role="alert">{t(claimError)}</p>}
        <div className="admin-action-bar">
          {claimCode && <button type="button" className="admin-button is-primary" onClick={async () => {
            try { await navigator.clipboard.writeText(claimCode.code); setCopied(true); }
            catch { setClaimError("Could not copy the code. Select the code and copy it manually."); }
          }}>{t(copied ? "Copied" : "Copy code")}</button>}
        {!registration.submitted_by && <button type="button" disabled={issuing} onClick={() => void issueClaim("primary")}>{t("Create player 1 code")}</button>}
        {!registration.partner_user_id && registration.player_two_email && <button type="button" disabled={issuing} onClick={() => void issueClaim("partner")}>{t("Create player 2 code")}</button>}
        </div>
      </div>
      <div className="admin-fill" hidden={view !== "Pair link"}><RegistrationPairLink registration={registration} /></div>

    </form>
  );
}

function RegistrationManager({ tournamentId, pairs, registrations, error, onRefresh }: { tournamentId: string; pairs: Pair[]; registrations: Registration[]; error: string | null; onRefresh: () => void }) {
  const { t } = useAdminUI();
  const [opened, setOpened] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("all");
  const filtered = filter === "all" ? registrations : registrations.filter((registration) => registration.status === filter);
  const selected = registrations.find(item => item.id === opened && item.tournament_id === tournamentId);
  const [linksRefreshVersion, setLinksRefreshVersion] = useState(0);
  function refresh() {
    setLinksRefreshVersion(version => version + 1);
    onRefresh();
  }

  return (
    <RegistrationPairLinks tournamentId={tournamentId} pairs={pairs} refreshVersion={linksRefreshVersion}>
      <div className="admin-registration-manager admin-fill">
      {error && <Feedback message={error} />}
      {selected && <div className="admin-return"><button type="button" className="admin-button" onClick={() => setOpened(null)}>‹ {t("Registrations")}</button>
        <button type="button" className="admin-button" onClick={refresh}>{t("Refresh applications")}</button></div>}
      {registrations.filter(reg => reg.tournament_id === tournamentId).map(reg => <div className="admin-fill" hidden={opened !== reg.id} key={reg.id}>
        <RegistrationCard registration={reg} onSaved={onRefresh} />
      </div>)}
      {!selected && <>
        <label className="admin-field"><span>{t("Filter by status")}</span><select value={filter} onChange={event => setFilter(event.target.value as "all" | RegistrationStatus)}>
          <option value="all">{t("All applications")}</option>
          {registrationStatuses.map(item => <option key={item.value} value={item.value}>{t(item.label)} · {registrations.filter(reg => reg.status === item.value).length}</option>)}
        </select></label>
        {!error && !filtered.length && <div className="admin-muted-note">{t("No applications match this filter.")}</div>}
        <ul className="admin-record-list">{filtered.filter(reg => reg.tournament_id === tournamentId).map(reg => <li key={reg.id}>
          <button type="button" data-open-registration={reg.id} onClick={() => setOpened(reg.id)}><strong>{reg.pair_name?.trim() || `${reg.player_one_last_name} & ${reg.player_two_last_name}`}</strong>
            <span className="admin-status">{t(registrationStatuses.find(item => item.value === reg.status)?.label ?? "")}</span><span aria-hidden="true">›</span></button>
        </li>)}</ul>
        <div className="admin-action-bar"><button type="button" onClick={refresh}>{t("Refresh applications")}</button></div>
      </>}
      </div>
    </RegistrationPairLinks>
  );
}

const tournamentSections = [
  ["settings", "Settings"], ["registrations", "Registrations"], ["participants", "Participants"],
  ["groups", "Groups"], ["playoffs", "Playoffs"], ["basement", "King of the Basement"],
] as const;
type TournamentSection = (typeof tournamentSections)[number][0] | "more";

export default function AdminPage() {
  return <AdminUI><AdminWorkspace /></AdminUI>;
}

function AdminWorkspace() {
  const { locale, t } = useAdminUI();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tab, setTab] = useState<(typeof adminTabs)[number]["id"]>("tournaments");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadRequest = useRef(0);
  const dataRequest = useRef(0);
  const activeTournament = useRef<string | null>(null);
  const [loadedTournamentId, setLoadedTournamentId] = useState<string | null>(null);
  const [section, setSection] = useState<TournamentSection>("settings");
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
  const [galleryBusy, setGalleryBusy] = useState(false);

  function selectTournament(tournamentId: string | null) {
    dataRequest.current++;
    activeTournament.current = tournamentId;
    setSelectedId(tournamentId);
    setTab("tournaments");
    setSection("settings");
    setShowCreate(false);
  }

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
    const managed = visibleSportItems((result.data ?? []) as Omit<Tournament, "role">[]).map((item) => ({ ...item, role: "owner" as const }));
    setTournaments(managed);
    setSelectedId((current) => preferredId && managed.some((item) => item.id === preferredId) ? preferredId : current && managed.some((item) => item.id === current) ? current : null);
    setChecking(false);
  }, []);

  useEffect(() => { activeTournament.current = selectedId; }, [selectedId]);
  const loadTournamentData = useCallback(async () => {
    if (activeTournament.current !== selectedId) return;
    const request = ++dataRequest.current;
    if (!selectedId) { setLoadedTournamentId(null); setPairs([]); setMatches([]); setGroups([]); setGroupMembers([]); setGroupMatches([]); setRegistrations([]); setRegistrationError(null); return; }
    const groupsResult = await supabase.from("tournament_groups").select("id,code,qualify_count").eq("tournament_id", selectedId).order("code");
    const groupIds = (groupsResult.data ?? []).map((item) => item.id);
    const [pairsResult, matchesResult, groupMembersResult, groupMatchesResult, registrationsResult] = await Promise.all([
      supabase.from("pairs").select("id,tournament_id,name,player_one,player_two,seed,updated_at").eq("tournament_id", selectedId).order("seed"),
      supabase.from("matches").select("id,tournament_id,round,bracket_kind,position,next_match_id,next_slot,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at,updated_at").eq("tournament_id", selectedId).order("round").order("position"),
      groupIds.length ? supabase.from("group_members").select("group_id,pair_id,position").in("group_id", groupIds) : Promise.resolve({ data: [], error: null }),
      supabase.from("group_matches").select("id,tournament_id,group_id,position,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets,winner_id,status,court,scheduled_at,updated_at").eq("tournament_id", selectedId).order("group_id").order("position"),
      supabase.rpc("list_tournament_registrations", { p_tournament_id: selectedId }),
    ]);
    if (request !== dataRequest.current) return;
    setLoadedTournamentId(selectedId);
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
        dataRequest.current++;
        activeTournament.current = null;
        setSelectedId(null);
        setTab("tournaments");
        setSection("settings");
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
    if (lockedUntil > now) { setAuthMessage("Too many attempts. Try again in a minute."); return; }
    if (authSaving) return;
    setAuthSaving(true);
    try {
      const result = await supabase.functions.invoke("organizer-login", { body: { username: login.trim(), password } });
      if (result.error || !result.data?.access_token || !result.data?.refresh_token) {
        const failures = authFailures + 1;
        setAuthFailures(failures);
        if (failures >= 5) { setLockedUntil(now + 60_000); setAuthFailures(0); }
        setAuthMessage("Incorrect login or password.");
        return;
      }
      const session = await supabase.auth.setSession({ access_token: result.data.access_token, refresh_token: result.data.refresh_token });
      if (session.error) { setAuthMessage("Could not start your session. Please try again."); return; }
      setAuthFailures(0); setLockedUntil(0); setPassword("");
    } catch {
      setAuthMessage("Could not reach the sign-in service. Please try again.");
    } finally { setAuthSaving(false); }
  }

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Europe/Vienna" });
  const dateLabel = (item: Tournament) => item.starts_at
    ? item.ends_at && Date.parse(item.ends_at) > Date.parse(item.starts_at) && date.format(new Date(item.starts_at)) !== date.format(new Date(item.ends_at))
      ? date.formatRange(new Date(item.starts_at), new Date(item.ends_at))
      : date.format(new Date(item.starts_at))
    : "—";
  const heading = (label: string) => <div className="admin-workspace-section-heading"><h2>{t(label)}</h2></div>;
  const detailsReady = selected && loadedTournamentId === selected.id;

  return <main className="admin-page" lang={locale} translate="no" aria-busy={checking}>
    {checking ? null : !user ? <section className="admin-sign-in">
      <AdminLocale />
      <form onSubmit={submitAuth}>
        <h1>KYNG CUP</h1>
        <label className="admin-field"><span>{t("Login")}</span><input type="text" value={login}
          onChange={event => { setLogin(event.target.value); setAuthMessage(null); }} autoComplete="username"
          autoCapitalize="none" spellCheck={false} required aria-invalid={Boolean(authMessage)} /></label>
        <label className="admin-field"><span>{t("Password")}</span><input type="password" value={password}
          onChange={event => { setPassword(event.target.value); setAuthMessage(null); }} autoComplete="current-password"
          required minLength={8} aria-invalid={Boolean(authMessage)} /></label>
        <button className="admin-button is-primary" type="submit" disabled={authSaving}>{t(authSaving ? "Signing in…" : "Sign in")}</button>
        {authMessage && <p role="alert">{t(authMessage)}</p>}
      </form>
    </section> : <>
      <header className="admin-top">
        <div className="admin-top-inner">
          <strong className="admin-wordmark">KYNG CUP</strong>
          {selected && <div className="admin-selection">
            <div><strong>{selected.name}</strong><small>{[selected.location, dateLabel(selected)].filter(Boolean).join(" · ")}</small></div>
            <span className="admin-status" data-status={selected.status}>{t(tournamentStatusLabels[selected.status])}</span>
          </div>}
          {selected && <button className="admin-button is-primary admin-change-tournament" type="button" disabled={galleryBusy} onClick={() => selectTournament(null)}>{t("Change tournament")}</button>}
          <div className="admin-top-actions"><AdminLocale /><button type="button" disabled={galleryBusy} onClick={() => void supabase.auth.signOut()}>{t("Sign out")}</button></div>
        </div>
        {selected && <nav className="admin-workspace-tabs" aria-label={t("Tournament")}>
          {adminTabs.map(({ id, label }) => <button key={id} type="button" aria-pressed={tab === id}
            aria-controls={`admin-panel-${id}`} onClick={() => setTab(id)}>{t(label)}</button>)}
        </nav>}
      </header>
      <section className="admin-dashboard">
        {accessError ? <div role="alert" className="admin-muted-note">{t(accessError)} <button type="button" onClick={() => void loadTournaments(user)}>{t("Retry")}</button></div> :
          showCreate && !selected && canCreateTournament ? <CreateTournament key={user.id} userId={user.id}
            onClose={() => setShowCreate(false)} onCreated={id => { selectTournament(null); void loadTournaments(user, id); }} /> :
          !selected ? <section className={tournaments.length ? "admin-picker" : "admin-picker is-empty"}>
            <h1>{t("Tournaments")}</h1>
            {tournaments.length ? <div className="admin-picker-table">
              <div className="admin-picker-head" aria-hidden="true"><span>{t("Tournament")}</span><span>{t("Dates")}</span><span>{t("Status")}</span><span /></div>
              <ul>{tournaments.map(item => <li key={item.id}><button type="button" onClick={() => selectTournament(item.id)}>
                <strong>{item.name}</strong><span>{dateLabel(item)}</span>
                <span className="admin-status" data-status={item.status}>{t(tournamentStatusLabels[item.status])}</span>
                <span aria-hidden="true">›</span>
              </button></li>)}</ul>
            </div> : <><h2>{t("No tournaments yet")}</h2><p>{t("Create your first tournament to get started.")}</p></>}
            {canCreateTournament && <button className="admin-button is-primary admin-new-tournament" type="button" onClick={() => setShowCreate(true)}>{t("New tournament")}</button>}
          </section> : <>
          <section id="admin-panel-matches" hidden={tab !== "matches"}>
            {tab === "matches" && (detailsReady ? <TournamentDay key={selected.id} tournament={selected} matches={matches} groupMatches={groupMatches} groups={groups} pairMap={pairMap}
              onSaved={() => { void loadTournamentData(); void loadTournaments(user); }} /> : <p role="status">{t("Loading…")}</p>)}
          </section>
          <section id="admin-panel-photos" hidden={tab !== "photos"}>
            <GalleryManager key={selected.id} tournamentId={selected.id} tournamentSlug={selected.slug} active={tab === "photos"} onBusyChange={setGalleryBusy} />
          </section>
          <section id="admin-panel-tournaments" hidden={tab !== "tournaments"} className="admin-section-panel">
            <nav className="admin-subnav" aria-label={t("Tournament settings")}>
              {tournamentSections.filter(([id]) => id !== "basement" || selected.format === "group_knockout").map(([id,label]) =>
                <button type="button" key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{t(label)}</button>)}
            </nav>
            {section === "settings" && <>{heading("Tournament settings")}
              <TournamentSettings key={selected.id} tournament={selected} onSaved={() => void loadTournaments(user)} onMore={() => setSection("more")} />
            </>}
            {section === "more" && <>{heading("More actions")}
              <button type="button" className="admin-button admin-back" onClick={() => setSection("settings")}>{t("Back")}</button>
              <TournamentMaintenance tournament={selected} onReset={() => { void loadTournaments(user); void loadTournamentData(); }}
                onDeleted={() => { selectTournament(null); void loadTournaments(user); }} />
            </>}
            {section !== "settings" && section !== "more" && !detailsReady && <p role="status">{t("Loading…")}</p>}
            {detailsReady && section === "registrations" && <>{heading("Registrations")} <RegistrationManager key={selected.id} tournamentId={selected.id} pairs={pairs} registrations={registrations} error={registrationError} onRefresh={() => void loadTournamentData()} /></>}
            {detailsReady && section === "participants" && <>{heading("Participants")}
              <div className="admin-record-list">{pairs.map(pair => <details key={pair.id}>
                <summary>{pair.name} <small>{t("Edit pair")}</small></summary>
                <PairEditor pair={pair} onSaved={() => void loadTournamentData()} />
              </details>)}</div>
            </>}
            {detailsReady && section === "groups" && <>{heading("Group stage")} <GroupStageManager key={`${selected.id}-${pairs.length}-${groupMembers.map((member) => `${member.pair_id}:${member.group_id}:${member.position}`).join("|")}`} tournament={selected} pairs={pairs} groups={groups} members={groupMembers} matches={groupMatches} onOpenMatches={() => setTab("matches")} playoffMatches={matches.filter(match => match.bracket_kind !== "basement")} pairMap={pairMap} onSaved={() => { void loadTournamentData(); void loadTournaments(user); }} /></>}
            {detailsReady && section === "playoffs" && <>{heading("Playoffs")}<div className="admin-round-groups">{selected.format === "knockout" && <KnockoutOnlyDraw key={`${selected.id}-${pairs.length}`} tournament={selected} pairs={pairs} matches={matches.filter(match => match.bracket_kind !== "basement")} pairMap={pairMap} onSaved={() => { void loadTournamentData(); void loadTournaments(user); }} />}<AdminBracketOverview matches={matches.filter(match => match.bracket_kind !== "basement")} pairMap={pairMap} size={selected.bracket_size} />{matchesByRound.map(({ round, matches: roundMatches }) => <details className="admin-round-group" open key={round}><summary><h3>{roundLabel(selected.bracket_size, round)}</h3><span>{roundMatches.length}</span></summary><div className="admin-match-grid">{roundMatches.map((match) => <AdminMatch key={`${match.id}-${match.updated_at}`} match={match} pairMap={pairMap} bracketSize={selected.bracket_size} onSaved={() => void loadTournamentData()} />)}</div></details>)}</div></>}
            {detailsReady && section === "basement" && selected.format === "group_knockout" && <BasementManager tournament={selected} matches={matches.filter(match => match.bracket_kind === "basement")} pairMap={pairMap} onSaved={() => void loadTournamentData()} />}
          </section>
        </>}
      </section>
    </>}
  </main>;
}
