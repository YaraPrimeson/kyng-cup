"use client";
import { useState } from "react";
import KnockoutBoard from "../knockout-board";
import { knockoutPlan } from "@/lib/knockout";

export default function KnockoutDraw({ draw, pairMap, onChange, disabled }: {
  draw: string[]; pairMap: Map<string, { name: string }>; onChange: (draw: string[]) => void; disabled: boolean;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  if (draw.length < 2) return <p>Выберите минимум две пары, чтобы увидеть сетку.</p>;
  const plan = knockoutPlan(draw.length);
  function swap(from: number, to: number) {
    if (disabled || from === to || from < 0 || to < 0 || from >= draw.length || to >= draw.length) return;
    const next = [...draw]; [next[from], next[to]] = [next[to], next[from]]; onChange(next);
  }
  return <div className="admin-draw-preview"><p>Перетащите пару на другую пару, чтобы поменять их местами. Выпадающий список работает и на телефоне.</p>
    {draw.length !== plan.size && <p>Предварительных игр: {draw.length - plan.size}. Основная сетка: {plan.size} пар.</p>}
    <KnockoutBoard matches={plan.matches} size={plan.size} label="Playoff draw preview" renderMatch={match => <article className="draw-preview-match"><small>{match.round === 0 ? "Предварительная игра" : "Матч"} {match.position}</small>{match.seeds.map((seed, slot) => seed ? <div key={slot} className={`draw-slot${dragged === seed - 1 ? " is-dragging" : ""}`}>
      <button type="button" draggable={!disabled} disabled={disabled} aria-label={`Перетащить ${pairMap.get(draw[seed - 1])?.name}`} onDragStart={event => { setDragged(seed - 1); event.dataTransfer.setData("text/plain", String(seed - 1)); }} onDragEnd={() => setDragged(null)} onDragOver={event => { if (!disabled) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (dragged !== null) swap(dragged, seed - 1); setDragged(null); }}>⠿</button>
      <select aria-label={`Пара на месте посева ${seed}`} value={draw[seed - 1]} disabled={disabled} onChange={event => swap(draw.indexOf(event.target.value), seed - 1)}>{draw.map(id => <option key={id} value={id}>{pairMap.get(id)?.name}</option>)}</select>
    </div> : <div className="draw-pending" key={slot}>Победитель {match.sources[slot]?.startsWith("0:") ? "предварительной игры" : "матча"} {match.sources[slot]?.split(":")[1]}</div>)}</article>} />
  </div>;
}
