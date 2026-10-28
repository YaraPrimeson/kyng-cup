"use client";
import { ReactNode } from "react";
import { knockoutRoundLabel } from "@/lib/knockout";

export default function KnockoutBoard<T extends { id: string; round: number; position: number; next_match_id?: string | null; next_slot?: number | null }>({ matches, size, renderMatch, label = "Tournament bracket", activeRound, roundLabel }: {
  matches: T[]; size: number; renderMatch: (match: T) => ReactNode; label?: string; activeRound?: number; roundLabel?: (round: number) => string;
}) {
  const rounds = [...new Set(matches.map(match => match.round))].sort((a, b) => a - b);
  const rowHeight = matches.some(match => match.round === 1 && matches.filter(feeder => feeder.round === 0 && feeder.next_match_id === match.id).length > 1) ? 344 : 184;
  const height = Math.max(184, size / 2 * rowHeight);
  function center(match: T): number {
    if (match.round > 0) return (match.position - .5) * 2 ** (match.round - 1) * rowHeight;
    const next = matches.find(candidate => candidate.id === match.next_match_id);
    if (!next) return (match.position - .5) * rowHeight;
    const siblings = matches.filter(candidate => candidate.round === 0 && candidate.next_match_id === next.id);
    return center(next) + (siblings.length > 1 ? (match.next_slot === 1 ? -1 : 1) * rowHeight / 4 : 0);
  }
  return <div className={`knockout-scroll${activeRound !== undefined ? " public-knockout" : ""}`} role="region" aria-label={label}>
    <div className="knockout-board" style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(260px, 1fr))` }}>
      {rounds.map(round => <section className={`knockout-round${round === activeRound ? " is-active" : ""}`} key={round}><h4>{roundLabel?.(round) ?? knockoutRoundLabel(size, round)}</h4><div style={{ height }}>{matches.filter(match => match.round === round).map(match => {
        const y = center(match), next = matches.find(candidate => candidate.id === match.next_match_id), nextY = next ? center(next) : y;
        const linkHeight = Math.max(1, Math.abs(nextY - y)), startY = y <= nextY ? 0 : linkHeight, endY = linkHeight - startY;
        return <div className="knockout-node" key={match.id} style={{ top: y - 77 }}>{renderMatch(match)}{next && <svg className="knockout-link" aria-hidden="true" width="32" height={linkHeight + 2} style={{ top: 77 + Math.min(0, nextY - y) - 1 }}><path d={`M0 ${startY + 1} H16 V${endY + 1} H32`} fill="none" stroke="#90aa99" /></svg>}</div>;
      })}</div></section>)}
    </div>
  </div>;
}
