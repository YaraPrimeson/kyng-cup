"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await supabase.from("tournament_registrations")
          .select("id,status,pair_name,created_at,tournaments(name,sport,starts_at,location)")
          .eq("submitted_by", userId)
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
  </section>;
}
