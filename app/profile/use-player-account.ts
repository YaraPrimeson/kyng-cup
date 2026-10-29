"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { accountError, type AccountProfile } from "@/lib/player-account";
import { getPlayerProfile } from "@/lib/player-account-client";
import { clearVerification } from "@/lib/player-security";

export function usePlayerAccount() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef({ id: 0 });
  const currentId = useRef<string | null>(null);
  const active = useRef(false);
  const reload = useCallback(async (): Promise<boolean> => {
    const request = ++generation.current.id;
    try {
      const result = await supabase.auth.getUser();
      if (!active.current || request !== generation.current.id) return false;
      if (result.error && result.error.name !== "AuthSessionMissingError") throw result.error;
      const next = result.data.user;
      if (!next) {
        currentId.current = null;
        setUser(null); setProfile(null); setError(""); setLoading(false);
        return false;
      }
      if (currentId.current !== next.id) { setProfile(null); currentId.current = next.id; }
      setUser(next);
      const data = next.email_confirmed_at ? await getPlayerProfile(next.id) : null;
      if (!active.current || request !== generation.current.id) return false;
      setProfile(data); setError(""); setLoading(false);
      return true;
    } catch (cause) {
      if (active.current && request === generation.current.id) { setError(accountError(cause)); setLoading(false); }
      return false;
    }
  }, []);
  const acceptProfile = useCallback((value: AccountProfile) => {
    generation.current.id++; setProfile(value); setError(""); setLoading(false);
  }, []);
  useEffect(() => {
    active.current = true;
    const requests = generation.current;
    let timer: number | undefined;
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void reload(), 50); };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (id !== null && id !== currentId.current)) {
        generation.current.id++; currentId.current = id;
        setUser(null); setProfile(null); setError(""); setLoading(Boolean(id));
        // Keep a freshly completed OAuth reauthentication in this same session.
        if (event === "SIGNED_OUT") clearVerification();
      }
      // Never await a Supabase call from inside its auth lock.
      schedule();
    });
    const visible = () => { if (document.visibilityState === "visible") schedule(); };
    window.addEventListener("focus", schedule);
    document.addEventListener("visibilitychange", visible);
    schedule();
    return () => { active.current = false; requests.id++; window.clearTimeout(timer); data.subscription.unsubscribe(); window.removeEventListener("focus", schedule); document.removeEventListener("visibilitychange", visible); };
  }, [reload]);
  return { user, profile, loading, error, reload, acceptProfile };
}
