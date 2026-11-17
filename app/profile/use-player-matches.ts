"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PlayerMatch } from "@/lib/player-results";

export function usePlayerMatches(userId: string) {
  const [loaded, setLoaded] = useState<{ owner: string; revision: number; rows: PlayerMatch[]; error: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await supabase.rpc("get_my_match_history");
        if (result.error || !Array.isArray(result.data)) throw result.error ?? new Error("Invalid history response");
        if (active) setLoaded({ owner: userId, revision, rows: result.data as PlayerMatch[], error: false });
      } catch { if (active) setLoaded({ owner: userId, revision, rows: [], error: true }); }
    }
    void load();
    return () => { active = false; };
  }, [userId, revision]);
  const current = loaded?.owner === userId && loaded.revision === revision ? loaded : null;
  return { rows: current?.rows ?? [], loading: !current, error: current?.error ?? false, retry: () => setRevision(value => value + 1) };
}
