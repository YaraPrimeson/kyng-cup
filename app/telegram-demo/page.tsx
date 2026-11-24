"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type DemoMatch = {
  status: "scheduled" | "live" | "completed";
  one: string;
  two: string;
  sets_one: number;
  sets_two: number;
  sets: [number, number, boolean?][];
  active: { number: number; one: number; two: number; kind: "short" | "standard" | "super" | "manual" } | null;
  format: "short" | "best_of_three" | "manual";
  court?: string;
  winner: string | null;
};

type Scoreboard = {
  tournament: string;
  matches: Record<string, DemoMatch>;
};

const labels = { scheduled: "Ожидает начала", live: "● LIVE", completed: "Завершён" };
const sections = [
  ["Групповой этап", [["a", "Группа A"], ["b", "Группа B"], ["c", "Группа C"], ["d", "Группа D"]]],
  ["Основная сетка", [["m", "Полуфинал 1"], ["n", "Полуфинал 2"], ["p", "Финал"]]],
  ["Короли подвала", [["x", "Полуфинал 1"], ["y", "Полуфинал 2"], ["k", "Финал"]]],
] as const;

function MatchCard({ title, match }: { title: string; match: DemoMatch | null }) {
  return <section style={{ border: "1px solid #59616a", borderRadius: 12, padding: "1rem", marginTop: "1rem" }}>
    <h3>{title}</h3>
    {match ? <>
      <p style={{ fontWeight: 700 }}>{labels[match.status]} · {match.court ?? "Корт 1"}</p>
      <p>{match.one} — {match.two}</p>
      <p><strong>Сеты · {match.sets_one}:{match.sets_two}</strong></p>
      {match.sets.map(([one, two, awarded], index) => <p key={index}>
        {index === 2 && match.format !== "manual" ? "Супер-тай-брейк" : `Сет ${index + 1}`} ·{" "}
        {awarded ? `${one > two ? match.one : match.two} · без счёта по геймам` : `${one}:${two} · завершён`}
      </p>)}
      {match.active && (match.format !== "manual" || match.active.one !== 0 || match.active.two !== 0 || !match.sets.length) && <p>
        {match.active.kind === "super" ? "Супер-тай-брейк" : `Сет ${match.active.number}`} ·{" "}
        <strong>{match.active.one}:{match.active.two}</strong>{" "}
        {match.active.kind === "super" ? "по очкам" : "по геймам"}
      </p>}
      {match.status === "live" && !match.active && <p>Ожидает подтверждения итога.</p>}
      {match.status === "scheduled" && <p>{match.format === "short"
        ? "Один сет до 3 выигранных геймов."
        : match.format === "manual" ? "Счётом и завершением управляет администратор."
          : "До 2 выигранных сетов. При 1:1 — супер-тай-брейк до 10 очков с разницей в 2."}</p>}
      {match.winner && <p>Победитель · <strong>{match.winner}</strong></p>}
    </> : <p>Ожидает участников.</p>}
  </section>;
}

export default function TelegramDemoPage() {
  const [board, setBoard] = useState<Scoreboard | null>(null);
  const [status, setStatus] = useState("Загружаем счёт…");
  useEffect(() => {
    let active = true;
    let timer: number;
    async function refresh() {
      const { data, error } = await supabase.rpc("telegram_cup_scoreboard");
      if (!active) return;
      if (error) setStatus("Связь потеряна. Переподключаемся…");
      else {
        setBoard(data as Scoreboard | null);
        setStatus(data ? "Счёт обновляется автоматически" : "Демо пока недоступно.");
      }
      timer = window.setTimeout(refresh, 2000);
    }
    void refresh();
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  return <main style={{ maxWidth: 560, margin: "auto", padding: "2rem 1rem", minHeight: "60vh" }}>
    <h1>{board?.tournament ?? "KYNG CUP · Telegram-демо"}</h1>
    <p role="status">{status}</p>
    {board && <div aria-live="polite">
      {sections.map(([heading, slots]) =>
        <section key={heading} style={{ marginTop: "2rem" }}>
          <h2>{heading}</h2>
          {slots.map(([slot, title]) => <MatchCard key={slot} title={title} match={board.matches[slot] ?? null} />)}
        </section>
      )}
    </div>}
  </main>;
}
