"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type DemoMatch = {
  status: "scheduled" | "live" | "completed";
  one: string;
  two: string;
  score_one: number | null;
  score_two: number | null;
  winner: string | null;
};

type Scoreboard = {
  tournament: string;
  group_match: DemoMatch | null;
  final_match: DemoMatch | null;
};

const labels = { scheduled: "Ожидает начала", live: "● LIVE", completed: "Завершён" };

function MatchCard({ title, match }: { title: string; match: DemoMatch | null }) {
  return <section style={{ border: "1px solid #59616a", borderRadius: 12, padding: "1rem", marginTop: "1rem" }}>
    <h2>{title}</h2>
    {match ? <>
      <p style={{ fontWeight: 700 }}>{labels[match.status]} · Корт 1</p>
      <p>{match.one} <strong style={{ float: "right" }}>{match.score_one ?? "—"}</strong></p>
      <p>{match.two} <strong style={{ float: "right" }}>{match.score_two ?? "—"}</strong></p>
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
    async function refresh() {
      const { data, error } = await supabase.rpc("telegram_demo_scoreboard");
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
      <MatchCard title="Группа A" match={board.group_match} />
      <MatchCard title="Финал" match={board.final_match} />
    </div>}
  </main>;
}
