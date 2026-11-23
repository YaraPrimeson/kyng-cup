"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type DemoMatch = {
  status: "scheduled" | "live" | "completed";
  one: string;
  two: string;
  sets_one: number;
  sets_two: number;
  sets: [number, number][];
  active: { number: number; one: number; two: number; kind: "short" | "standard" | "super" } | null;
  format: "short" | "best_of_three";
  court?: string;
  winner: string | null;
};

type Scoreboard = {
  tournament: string;
  group_match: DemoMatch | null;
  final_match: DemoMatch | null;
  matches?: Partial<Record<"a" | "b" | "p" | "k", DemoMatch>>;
};

const labels = { scheduled: "Ожидает начала", live: "● LIVE", completed: "Завершён" };

function MatchCard({ title, match }: { title: string; match: DemoMatch | null }) {
  return <section style={{ border: "1px solid #59616a", borderRadius: 12, padding: "1rem", marginTop: "1rem" }}>
    <h2>{title}</h2>
    {match ? <>
      <p style={{ fontWeight: 700 }}>{labels[match.status]} · {match.court ?? "Корт 1"}</p>
      <p>{match.one} — {match.two}</p>
      <p><strong>Сеты · {match.sets_one}:{match.sets_two}</strong></p>
      {match.sets.map(([one, two], index) => <p key={index}>
        {index === 2 ? "Супер-тай-брейк" : `Сет ${index + 1}`} · {one}:{two} · завершён
      </p>)}
      {match.active && <p>
        {match.active.kind === "super" ? "Супер-тай-брейк" : `Сет ${match.active.number}`} ·{" "}
        <strong>{match.active.one}:{match.active.two}</strong>{" "}
        {match.active.kind === "super" ? "по очкам" : "по геймам"}
      </p>}
      {match.status === "live" && !match.active && <p>Ожидает подтверждения итога.</p>}
      {match.status === "scheduled" && <p>{match.format === "short"
        ? "Один сет до 3 выигранных геймов."
        : "До 2 выигранных сетов. При 1:1 — супер-тай-брейк до 10 очков с разницей в 2."}</p>}
      {match.winner && <p>Победитель · <strong>{match.winner}</strong></p>}
    </> : <p>Откроется после завершения группы и подтверждения состава.</p>}
  </section>;
}

export default function TelegramDemoPage() {
  const [board, setBoard] = useState<Scoreboard | null>(null);
  const [status, setStatus] = useState("Загружаем счёт…");
  useEffect(() => {
    let active = true;
    let timer: number;
    const endpoint = new URLSearchParams(window.location.search).get("mode") === "4"
      ? "telegram_cup_scoreboard" : "telegram_demo_scoreboard";
    async function refresh() {
      const { data, error } = await supabase.rpc(endpoint);
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
      {board.matches ? <>
        <MatchCard title="Группа A" match={board.matches.a ?? null} />
        <MatchCard title="Группа B" match={board.matches.b ?? null} />
        <MatchCard title="Основной финал" match={board.matches.p ?? null} />
        <MatchCard title="Короли подвала" match={board.matches.k ?? null} />
      </> : <>
        <MatchCard title="Группа A" match={board.group_match} />
        <MatchCard title="Финал" match={board.final_match} />
      </>}
    </div>}
  </main>;
}
