"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

type Pair = { id: string; tournament_id: string; name: string; player_one: string; player_two: string };
type Link = { registration_id: string; pair_id: string };
type LinkContext = {
  pairs: Pair[]; links: Link[]; loading: boolean; loadError: string | null; busy: boolean;
  retry: () => void;
  change: (registrationId: string, pairId: string | null) => Promise<void>;
};
const Context = createContext<LinkContext | null>(null);

async function readLinks(tournamentId: string): Promise<Link[]> {
  const { data, error } = await supabase.rpc("get_registration_pair_links", { p_tournament_id: tournamentId });
  if (error || !Array.isArray(data)) throw new Error("Pair links unavailable");
  return data;
}

export function RegistrationPairLinks({ tournamentId, pairs, refreshVersion, children }: { tournamentId: string; pairs: Pair[]; refreshVersion: number; children: ReactNode }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lifecycle = useRef({ version: 0, saving: false, refreshPending: false });
  const load = useCallback(async () => {
    // A refresh must not invalidate an in-flight write or its verification read.
    if (lifecycle.current.saving) { lifecycle.current.refreshPending = true; return; }
    lifecycle.current.refreshPending = false;
    const current = ++lifecycle.current.version;
    setLoading(true); setLoadError(null);
    try {
      const data = await readLinks(tournamentId);
      if (current === lifecycle.current.version) setLinks(data);
    } catch {
      if (current === lifecycle.current.version) setLoadError("Could not load pair links. Please retry.");
    } finally {
      if (current === lifecycle.current.version) setLoading(false);
    }
  }, [tournamentId]);
  useEffect(() => {
    const state = lifecycle.current;
    return () => { state.version++; };
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); };
  }, [load, refreshVersion]);

  const tournamentPairs = pairs.filter(pair => pair.tournament_id === tournamentId);
  async function change(registrationId: string, pairId: string | null) {
    if (lifecycle.current.saving || loading || loadError) return;
    if (pairId !== null && (links.some(link => link.registration_id === registrationId || link.pair_id === pairId) || !tournamentPairs.some(pair => pair.id === pairId))) return;
    lifecycle.current.saving = true; setBusy(true);
    const version = ++lifecycle.current.version;
    try {
      const { error } = await supabase.rpc("link_registration_pair", { p_registration_id: registrationId, p_pair_id: pairId });
      if (error) throw error;
      try {
        const saved = await readLinks(tournamentId);
        const actual = saved.find(link => link.registration_id === registrationId)?.pair_id ?? null;
        if (actual !== pairId) throw new Error("Pair link mismatch");
        if (version === lifecycle.current.version) setLinks(saved);
      } catch {
        if (version === lifecycle.current.version) setLoadError("Could not verify pair link. Retry pair links before making another change.");
        throw new Error("Could not verify pair link");
      }
    } finally {
      lifecycle.current.saving = false;
      if (version === lifecycle.current.version) {
        setBusy(false);
        if (lifecycle.current.refreshPending) void load();
      }
    }
  }
  return <Context.Provider value={{ pairs: tournamentPairs, links, loading, loadError, busy, retry: () => { if (!lifecycle.current.saving) void load(); }, change }}>{children}</Context.Provider>;
}

export default function RegistrationPairLink({ registration }: { registration: { id: string; status: string } }) {
  const context = useContext(Context)!;
  const [selected, setSelected] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  async function change(pairId: string | null) {
    setOperationError(null);
    try { await context.change(registration.id, pairId); if (pairId === null) setSelected(""); }
    catch { setOperationError(`Could not ${pairId === null ? "unlink" : "link"} pair. Refresh pair links and try again.`); }
  }
  const link = context.links.find(item => item.registration_id === registration.id);
  const available = (id: string) => context.pairs.some(item => item.id === id) && !context.links.some(item => item.pair_id === id);
  const pair = context.pairs.find(item => item.id === link?.pair_id);
  if (context.loading || context.loadError) return <div className="admin-registration-claim" data-registration-pair-link={registration.id}>
    {context.loading ? <p role="status">Loading pair links…</p> : <><p role="alert">{context.loadError}</p><button type="button" disabled={context.busy} onClick={() => { setOperationError(null); context.retry(); }}>Retry pair links</button></>}
  </div>;
  return <div className="admin-registration-claim" data-registration-pair-link={registration.id}>
    <strong>Tournament pair link</strong>
    {registration.status !== "confirmed" && <p>Only confirmed applications can be linked.</p>}
    {link ? <><p>Linked tournament pair: {pair?.name ?? link.pair_id}{pair && <> · {pair.player_one} / {pair.player_two}</>}</p><p>Unlink this pair before choosing a different pair.</p><button type="button" disabled={context.busy} onClick={() => void change(null)}>Unlink pair</button></> : registration.status === "confirmed" ? <>
      <label className="admin-field"><span>Tournament pair</span><select value={selected} disabled={context.busy} onChange={event => { setSelected(event.target.value); setOperationError(null); }}><option value="">Choose a tournament pair</option>{context.pairs.map(item => <option key={item.id} value={item.id} disabled={!available(item.id)}>{item.name} · {item.player_one} / {item.player_two}{!available(item.id) ? " · Already linked" : ""}</option>)}</select></label>
      {!context.pairs.length && <p>No tournament pairs available.</p>}
      <button type="button" disabled={context.busy || !available(selected)} onClick={() => { if (available(selected)) void change(selected); }}>Link pair</button>
    </> : null}
    {context.busy && <p role="status">Saving pair link…</p>}
    {operationError && <><p role="alert">{operationError}</p><button type="button" disabled={context.busy} onClick={() => { setOperationError(null); context.retry(); }}>Refresh pair links</button></>}
  </div>;
}
