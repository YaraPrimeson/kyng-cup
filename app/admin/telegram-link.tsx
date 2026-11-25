"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TelegramLink({ authorised }: { authorised: boolean }) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("telegram");
    if (token && /^[a-f0-9]{48}$/.test(token)) {
      setCode(token);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    if (!authorised || !code) return;
    let current = true;
    void supabase.rpc("telegram_link_info", { p_code: code }).then(({ data, error }) => {
      if (!current) return;
      setLabel(typeof data === "string" ? data : "");
      if (error || !data) setMessage("The Telegram link has expired or is unavailable. Open /admin in Telegram for a new link.");
    });
    return () => { current = false; };
  }, [authorised, code]);

  if (!code) return null;

  async function confirm() {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("telegram_confirm_link", { p_code: code });
      setLabel("");
      setMessage(error || data !== true
        ? "Could not link Telegram. Open /admin in Telegram for a new link."
        : "Telegram is linked. Open /admin in the bot to manage your tournaments.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-state" aria-label="Connect Telegram">
    <strong>Connect Telegram</strong>
    <p role="status">{message || (!authorised ? "Sign in as an organiser to confirm the Telegram account." : label || "Checking the Telegram request…")}</p>
    {authorised && label && !message && <div className="admin-session">
      <button type="button" disabled={busy} onClick={() => void confirm()}>Confirm this Telegram account</button>
      <button type="button" disabled={busy} onClick={() => setCode("")}>Cancel</button>
    </div>}
  </section>;
}
