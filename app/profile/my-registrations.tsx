"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Registration = {
  id: string;
  status: "new" | "reviewing" | "confirmed" | "waitlist" | "rejected";
  pair_name: string | null;
  created_at: string;
  tournaments: { name: string; sport: "tennis" | "padel"; starts_at: string | null; location: string | null } | null;
};

const statusLabel: Record<Registration["status"], string> = {
  new: "Заявка получена", reviewing: "На рассмотрении", confirmed: "Подтверждена", waitlist: "Лист ожидания", rejected: "Не подтверждена",
};

export default function MyRegistrations({ userId }: { userId: string }) {
  const [items, setItems] = useState<Registration[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [claimError, setClaimError] = useState("");

  async function redeem(event: FormEvent) {
    event.preventDefault();
    if (claiming) return;
    const token = code.trim();
    if (!/^[0-9a-f]{64}$/i.test(token)) { setClaimError("Проверьте код и попробуйте ещё раз."); return; }
    setClaiming(true); setClaimError(""); setClaimMessage("");
    try {
      const result = await supabase.rpc("redeem_registration_claim_code", { p_code: token });
      if (result.error) throw result.error;
      setCode(""); setClaimMessage("Заявка связана с вашим аккаунтом.");
      setItems(null); setAttempt(value => value + 1);
    } catch { setClaimError("Не удалось привязать заявку. Проверьте код и адрес аккаунта или обратитесь к организатору."); }
    finally { setClaiming(false); }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await supabase.from("tournament_registrations")
          .select("id,status,pair_name,created_at,tournaments(name,sport,starts_at,location)")
          .or(`submitted_by.eq.${userId},partner_user_id.eq.${userId}`)
          .order("created_at", { ascending: false });
        if (!active) return;
        if (result.error) throw result.error;
        setItems((result.data ?? []).map(row => ({ ...row, tournaments: Array.isArray(row.tournaments) ? row.tournaments[0] ?? null : row.tournaments })) as Registration[]); setError(false);
      } catch {
        if (active) { setItems(null); setError(true); }
      }
    })();
    return () => { active = false; };
  }, [attempt, userId]);

  return <section className="kv-section" aria-label="Мои заявки">
    <h2>Мои заявки</h2>
    {error ? <><p role="alert">Не удалось загрузить заявки. Попробуйте ещё раз.</p><button type="button" className="kv-secondary" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Повторить загрузку</button></>
      : items === null ? <p role="status">Загружаем ваши заявки…</p>
      : items.length === 0 ? <p className="kv-note">Пока нет ваших заявок. Старые заявки без входа в аккаунт здесь не отображаются.</p>
      : <div className="player-event-list">{items.map(item => <article className="kv-box" key={item.id}>
        <span className="kv-badge">{statusLabel[item.status] ?? "Заявка получена"}</span>
        <h3>{item.tournaments?.name ?? "Турнир недоступен"}</h3>
        {item.pair_name && <p>{item.pair_name}</p>}
        {item.tournaments?.sport && <p className="kv-muted">{item.tournaments.sport === "tennis" ? "Теннис" : "Падел"}{item.tournaments.location ? ` · ${item.tournaments.location}` : ""}</p>}
        <p className="kv-muted kv-small">Заявка отправлена {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Vienna" }).format(new Date(item.created_at))}</p>
      </article>)}</div>}
    <form className="kv-fields kv-section" data-claim-application onSubmit={event => void redeem(event)}>
      <h3>Привязать прежнюю заявку</h3>
      <p className="kv-muted kv-small">Если вы регистрировались без аккаунта или как партнёр, запросите одноразовый код у организатора. Код действует 7 дней; email в заявке должен совпадать с подтверждённым адресом аккаунта.</p>
      <label>Код от организатора<input name="claim_code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" spellCheck={false} maxLength={64} required disabled={claiming} /></label>
      <button className="kv-secondary" type="submit" disabled={claiming}>{claiming ? "Проверяем…" : "Привязать заявку"}</button>
      {claimError && <p role="alert" className="kv-message player-error">{claimError}</p>}
      {claimMessage && <p role="status" className="kv-message">{claimMessage}</p>}
    </form>
  </section>;
}
