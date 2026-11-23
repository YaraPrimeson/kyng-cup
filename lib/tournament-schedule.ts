type ScheduledTournament = {
  slug: string;
  starts_at: string | null;
  ends_at: string | null;
  status: "live" | "published" | "completed";
};

const viennaCalendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Vienna",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function viennaDate(value: string | Date) {
  return viennaCalendar.format(typeof value === "string" ? new Date(value) : value);
}

export function isTestTournament(slug: string) {
  return /^(?:kyng|kyngcup)-qa-/.test(slug);
}

export function lastTournamentDay(tournament: ScheduledTournament) {
  const date = tournament.ends_at ?? tournament.starts_at;
  return date ? viennaDate(date) : null;
}

export function bracketTournamentLists<T extends ScheduledTournament>(tournaments: T[], now = new Date()) {
  const today = viennaDate(now);
  const active: T[] = [];
  const archive: T[] = [];

  for (const tournament of tournaments) {
    if (isTestTournament(tournament.slug)) continue;
    const lastDay = lastTournamentDay(tournament);
    if (tournament.status === "completed" || (tournament.status === "published" && lastDay && lastDay < today)) {
      archive.push(tournament);
    } else {
      active.push(tournament);
    }
  }

  const start = (tournament: T, fallback: number) => {
    const value = tournament.starts_at ?? tournament.ends_at;
    return value ? Date.parse(value) : fallback;
  };
  active.sort((a, b) =>
    Number(b.status === "live") - Number(a.status === "live") ||
    start(a, Infinity) - start(b, Infinity));
  archive.sort((a, b) => start(b, -Infinity) - start(a, -Infinity));
  return { active, archive };
}
