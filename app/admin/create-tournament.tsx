"use client";
import { useAdminUI } from "./admin-ui";
import { isSportVisible } from "@/lib/sports";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { balancePairs, blankPairs, buildTournamentSetup, groupSummary, parsePairList, SetupPair, tournamentSlug } from "@/lib/tournament-setup";
import { clearTournamentDraft, newTournamentDraft, readTournamentDraft, saveTournamentDraft } from "@/lib/tournament-draft";

export default function CreateTournament({ userId, onCreated, onClose }: { userId: string; onCreated: (id: string) => void; onClose: () => void }) {
  const { t } = useAdminUI();
  const [initial] = useState(() => readTournamentDraft(userId) ?? newTournamentDraft());
  const [step, setStep] = useState(initial.step ?? 0);
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [slugEdited, setSlugEdited] = useState(initial.slugEdited);
  const [fallbackSlug] = useState(initial.fallbackSlug);
  const [location, setLocation] = useState(initial.location);
  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState(initial.endDate || initial.date);
  const [endDateEdited, setEndDateEdited] = useState(initial.endDateEdited ?? Boolean(initial.endDate && initial.endDate !== initial.date));
  const [sport, setSport] = useState(initial.sport);
  const [status, setStatus] = useState(initial.status);
  const [format, setFormat] = useState(initial.format);
  const [groups, setGroups] = useState(initial.groups);
  const [pairs, setPairs] = useState<SetupPair[]>(initial.pairs);
  const [qualifiers, setQualifiers] = useState<Record<string, number>>(initial.qualifiers);
  const [list, setList] = useState(initial.list);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    saveTournamentDraft(userId, { name, slug, slugEdited, fallbackSlug, location, date, endDate, endDateEdited, sport, status, format, groups, pairs, qualifiers, list, step });
  }, [userId, name, slug, slugEdited, fallbackSlug, location, date, endDate, endDateEdited, sport, status, format, groups, pairs, qualifiers, list, step]);
  const summaries = groupSummary(pairs, groups);
  const playoffCount = format === "knockout" ? pairs.length : summaries.reduce((total, group) => total + (qualifiers[group.code] ?? 2), 0);
  const invalidGroups = format === "group_knockout" && summaries.some((group) => group.size < 2 || (qualifiers[group.code] ?? 2) > group.size);
  function redistribute(next: SetupPair[], count: number) {
    const actual = Math.max(1, Math.min(count, Math.floor(next.length / 2), 26));
    const balanced = balancePairs(next, actual);
    setPairs(balanced); setGroups(actual);
    setQualifiers((current) => Object.fromEntries(groupSummary(balanced, actual).map((group) => [group.code, Math.min(current[group.code] ?? 2, group.size)])));
  }
  function updatePair(index: number, key: keyof SetupPair, value: string) {
    setPairs((current) => current.map((pair, row) => row === index ? { ...pair, [key]: value } : pair));
  }
  function importList() {
    try { redistribute(parsePairList(list), groups); setMessage(null); }
    catch (error) { setMessage((error as Error).message); }
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    if (step === 0 && (!isSportVisible(sport) || endDate < date)) {
      setMessage(!isSportVisible(sport) ? "Select an available sport." : "End date cannot be earlier than start date.");
      return;
    }
    if (step < 3) { setStep(step + 1); return; }
    if (!isSportVisible(sport)) { setMessage("Select an available sport."); return; }
    let payload;
    try { payload = buildTournamentSetup({ name, slug, fallbackSlug, location, date, endDate, sport, status, format, pairs, groups, qualifiers }); }
    catch (error) { setMessage((error as Error).message); return; }
    setSaving(true); setMessage(null);
    try {
      const { data, error } = await supabase.rpc("create_tournament_setup", payload);
      if (error) { setMessage(error.message); return; }
      clearTournamentDraft(userId);
      onCreated(data as string);
    } catch { setMessage("Could not save the tournament. Try again."); }
    finally { setSaving(false); }
  }
  const stepLabels = ["Details", "Pairs", "Format", "Review"];
  const headings = ["New tournament", "Add pairs", "Tournament format", "Review tournament"];
  const actions = ["Continue to pairs", "Continue to format", "Review tournament", "Create tournament"];
  return <form className="admin-create-card quick-tournament" onSubmit={create}>
    <div className="admin-workspace-section-heading"><h2>{t(headings[step])}</h2></div>
    <ol className="admin-step-list">{stepLabels.map((label, i) => <li key={label} aria-current={step === i ? "step" : undefined}>{t(label)}</li>)}</ol>
    <fieldset key={step} disabled={saving}>
      {step === 0 && <>
        <div className="admin-form-grid">
          <label className="admin-field"><span>{t("Tournament name")}</span><input value={name} onChange={event => { setName(event.target.value); if (!slugEdited) setSlug(tournamentSlug(event.target.value)); }} placeholder="KYNG Padel Cup" required /></label>
          <label className="admin-field"><span>{t("Location")}</span><input value={location} onChange={event => setLocation(event.target.value)} /></label>
          <label className="admin-field"><span>{t("Start date")}</span><input type="date" value={date} onChange={event => {
            setDate(event.target.value);
            if (!endDateEdited) setEndDate(event.target.value);
          }} required /></label>
          <label className="admin-field"><span>{t("End date")}</span><input type="date" value={endDate} min={date || undefined} onChange={event => {
            setEndDate(event.target.value || date);
            setEndDateEdited(Boolean(event.target.value && event.target.value !== date));
          }} /></label>
          <label className="admin-field"><span>{t("Sport")}</span><select value={isSportVisible(sport) ? sport : ""} onChange={event => setSport(event.target.value)} required>
            {!isSportVisible(sport) && <option value="" disabled>{t("Select an available sport.")}</option>}
            {isSportVisible("padel") && <option value="padel">{t("Padel")}</option>}
            {isSportVisible("tennis") && <option value="tennis">{t("Tennis")}</option>}
          </select></label>
        </div>
        <details className="setup-step"><summary>{t("Additional settings")}</summary>
          <label className="admin-field"><span>{t("Tournament address")}</span><input value={slug} placeholder={tournamentSlug(name) || fallbackSlug}
            onChange={event => { setSlugEdited(true); setSlug(event.target.value.toLowerCase()); }} /></label>
        </details>
      </>}
      {step === 1 && <section className="setup-step"><h3>{t("Pairs")}</h3><p>{t("One pair per line. You can paste two or three columns from a spreadsheet.")}</p>
        <label className="admin-field"><span>{t("Pair list")}</span><textarea value={list} onChange={(event) => setList(event.target.value)} rows={4} placeholder={"Alex Novak / Daniel Meyer\nMaria Keller / Anna Stein"} /></label>
        <div className="setup-actions"><button type="button" onClick={importList} disabled={!list.trim()}>{t("Apply list")}</button><span>{t("Applying the list replaces the current pairs.")}</span></div>
        <div className="setup-actions"><label className="admin-field"><span>{t("Number of pairs")}</span><input type="number" min={2} max={64} value={pairs.length} onChange={(event) => { const count = Math.max(2, Math.min(64, Number(event.target.value))); redistribute(Array.from({ length: count }, (_, index) => pairs[index] ?? blankPairs(1)[0]), groups); }} /></label><button type="button" disabled={pairs.length >= 64} onClick={() => redistribute([...pairs, ...blankPairs(1)], groups)}>{t("Add pair")}</button></div>
        <details className="setup-edit-pairs"><summary>{t("Player names")} · {pairs.length}</summary><div className="setup-pair-table">{pairs.map((pair, index) => <div key={index}><b>{index + 1}</b><input aria-label={`${t("Pair name")} ${index + 1}`} value={pair.name} placeholder={t("Pair name")} onChange={(event) => updatePair(index, "name", event.target.value)} /><input aria-label={`${t("Player one")} · ${index + 1}`} value={pair.player_one} placeholder={t("Player one")} onChange={(event) => updatePair(index, "player_one", event.target.value)} /><input aria-label={`${t("Player two")} · ${index + 1}`} value={pair.player_two} placeholder={t("Player two")} onChange={(event) => updatePair(index, "player_two", event.target.value)} /><button type="button" disabled={pairs.length <= 2} aria-label={`${t("Remove pair")} ${index + 1}`} onClick={() => redistribute(pairs.filter((_, row) => row !== index), groups)}>×</button></div>)}</div></details>
      </section>}
      {step === 2 && <section className="setup-step"><h3>{t("Tournament format")}</h3><div className="admin-form-grid"><label className="admin-field"><span>{t("Format")}</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="group_knockout">{t("Groups → playoffs")}</option><option value="knockout">{t("Playoffs only")}</option></select></label>{format === "group_knockout" && <label className="admin-field"><span>{t("Number of groups")}</span><input type="number" min={1} max={Math.min(26, Math.floor(pairs.length / 2))} value={groups} onChange={(event) => redistribute(pairs, Number(event.target.value))} /></label>}</div>
        {format === "group_knockout" && <><div className="setup-actions"><button type="button" onClick={() => redistribute(pairs, groups)}>{t("Balance groups")}</button><span>{t("Distribute pairs evenly across the selected groups.")}</span></div><div className="setup-group-grid">{summaries.map((group) => <article className={group.size < 2 ? "is-invalid" : ""} key={group.code}><header><h4>{t("Group")} {group.code}</h4><span>{group.size} {t("Pairs").toLowerCase()} · {group.matches} {t("Matches").toLowerCase()}</span></header><label className="admin-field"><span>{t("Qualifiers")}</span><input type="number" min={0} max={group.size} value={qualifiers[group.code] ?? 2} onChange={(event) => setQualifiers((current) => ({ ...current, [group.code]: Math.max(0, Math.min(group.size, Number(event.target.value))) }))} /></label>{pairs.map((pair, index) => pair.group === group.code ? <div className="setup-group-pair" key={index}><span><strong>{pair.name || (pair.player_one && pair.player_two ? `${pair.player_one} / ${pair.player_two}` : `${t("Pair")} ${String(index + 1).padStart(2, "0")}`)}</strong></span><select aria-label={`${t("Group")} · ${t("Pair")} ${index + 1}`} value={pair.group} onChange={(event) => updatePair(index, "group", event.target.value)}>{summaries.map((target) => <option value={target.code} key={target.code}>{target.code}</option>)}</select></div> : null)}</article>)}</div></>}
      </section>}
      {step === 3 && <section className="setup-step">
        <dl className="admin-create-review">
          <div><dt>{t("Tournament name")}</dt><dd>{name}</dd></div>
          <div><dt>{t("Location")}</dt><dd>{location || "—"}</dd></div>
          <div><dt>{t("Dates")}</dt><dd>{date}{endDate && endDate !== date && <> – {endDate}</>}</dd></div>
          <div><dt>{t("Format")}</dt><dd>{t(format === "group_knockout" ? "Groups → playoffs" : "Playoffs only")}</dd></div>
          <div><dt>{t("Number of pairs")}</dt><dd>{pairs.length}</dd></div>
          <div><dt>{t("Qualifiers")}</dt><dd>{playoffCount}</dd></div>
          {format === "group_knockout" && <div><dt>{t("Number of groups")}</dt><dd>{groups}</dd></div>}
        </dl>
        <label className="admin-field"><span>{t("Visibility")}</span><select value={status} onChange={event => setStatus(event.target.value)}>
          <option value="draft">{t("Save as draft")}</option><option value="published">{t("Publish on website")}</option>
        </select></label>
      </section>}
    </fieldset>
    {step >= 2 && invalidGroups && <p role="alert" className="setup-error">{t("Check groups: at least two pairs per group and no more qualifiers than pairs.")}</p>}
    {message && <p role="alert" className="setup-error">{t(message)}</p>}
    <div className="admin-action-bar">
      <button className="admin-button is-primary" type="submit" disabled={saving || (step >= 2 && (invalidGroups || playoffCount < 2))}>{t(saving ? "Creating…" : actions[step])}</button>
      <button className="admin-button" type="button" disabled={saving} onClick={() => {
        setMessage(null);
        if (step === 0) onClose();
        else setStep(step - 1);
      }}>{t(step === 0 ? "Close" : "Back")}</button>
    </div>
  </form>;
}
