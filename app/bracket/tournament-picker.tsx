"use client";

import { useRef, type KeyboardEvent } from "react";
import type { Language } from "../i18n";
import { formatTournamentDate } from "../public-tournaments";

type Choice = Parameters<typeof formatTournamentDate>[0] & {
  id: string;
  slug: string;
  name: string;
  status: "published" | "live" | "completed";
};

const copy = {
  en: { choose: "Choose tournament", archive: "Tournament archive", live: "Live" },
  uk: { choose: "Оберіть турнір", archive: "Архів турнірів", live: "Наживо" },
  de: { choose: "Turnier auswählen", archive: "Turnierarchiv", live: "Live" },
  ru: { choose: "Выбрать турнир", archive: "Архив турниров", live: "В эфире" },
};

export default function TournamentPicker({ active, archive, currentSlug, language, onSelect }: {
  active: Choice[];
  archive: Choice[];
  currentSlug?: string;
  language: Language;
  onSelect: (slug: string) => void;
}) {
  const picker = useRef<HTMLDetailsElement>(null);
  const archivePanel = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const labels = copy[language];

  function closePicker() {
    if (picker.current) picker.current.open = false;
    if (archivePanel.current) archivePanel.current.open = false;
    trigger.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && picker.current?.open) {
      event.preventDefault();
      closePicker();
    }
  }

  function renderChoice(item: Choice, archived = false) {
    const date = formatTournamentDate(item, language, archived);
    const name = item.name.replace(/^KYNG CUP (?:Padel|Tennis) Vienna · /, "");
    return <li key={item.id}>
      <button type="button" onKeyDown={handleKeyDown} aria-current={item.slug === currentSlug ? "true" : undefined} onClick={() => {
        closePicker();
        if (item.slug !== currentSlug) onSelect(item.slug);
      }}>
        {date !== "—" && <span>{date} · </span>}{name}
        {item.status === "live" && <span className="bracket-selector__live"> · {labels.live}</span>}
      </button>
    </li>;
  }

  return <details className="bracket-selector" ref={picker}>
    <summary ref={trigger} onKeyDown={handleKeyDown}>{labels.choose}</summary>
    <div className="bracket-selector__panel">
      {active.length > 0 && <ul>{active.map((item) => renderChoice(item))}</ul>}
      {archive.length > 0 && <details className="bracket-selector__archive" ref={archivePanel}>
        <summary onKeyDown={handleKeyDown}>{labels.archive}</summary>
        <ul>{archive.map((item) => renderChoice(item, true))}</ul>
      </details>}
    </div>
  </details>;
}
