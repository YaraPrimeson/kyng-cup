export type SetupPair = { name: string; player_one: string; player_two: string; group: string };
export function groupCode(index: number) { return String.fromCharCode(65 + index); }
export function balancePairs(pairs: SetupPair[], count: number): SetupPair[] {
  return pairs.map((pair, index) => ({ ...pair, group: groupCode(index % count) }));
}
export function blankPairs(count: number): SetupPair[] {
  return Array.from({ length: count }, () => ({ name: "", player_one: "", player_two: "", group: "A" }));
}
export function parsePairList(value: string): SetupPair[] {
  // Keep edge tabs: trimming the whole row can turn a missing player into a valid two-column pair.
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2 || lines.length > 64) throw new Error("Добавьте от 2 до 64 пар.");
  const seen = new Set<string>();
  return lines.map((line, index) => {
    const parts = line.split(/\t|\|/).map((part) => part.trim());
    const players = parts.length === 1 ? line.split(/\s*\/\s*/).map((part) => part.trim()) : parts;
    const [name, one, two] = players.length === 3 ? players : ["", ...players];
    if ((players.length !== 2 && players.length !== 3) || !one || !two) throw new Error(`Строка ${index + 1}: укажите двух игроков через / или табуляцию.`);
    const key = [one.toLocaleLowerCase(), two.toLocaleLowerCase()].sort().join("\t");
    if (seen.has(key)) throw new Error(`Строка ${index + 1}: эта пара уже есть в списке.`);
    seen.add(key);
    return { name, player_one: one, player_two: two, group: "A" };
  });
}
export function groupSummary(pairs: SetupPair[], count: number) {
  return Array.from({ length: count }, (_, index) => {
    const code = groupCode(index);
    const size = pairs.filter((pair) => pair.group === code).length;
    return { code, size, matches: size * (size - 1) / 2 };
  });
}
export function tournamentSlug(name: string) {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type TournamentSetup = {
  name: string; slug: string; fallbackSlug: string; location: string;
  date: string; endDate: string; sport: string; status: string; format: string;
  pairs: SetupPair[]; groups: number; qualifiers: Record<string, number>;
};

// Shared by the form and behavioral tests; this is the payload actually sent to the RPC.
export function buildTournamentSetup(input: TournamentSetup) {
  const { name, slug, fallbackSlug, location, date, endDate, sport, status, format, pairs, groups, qualifiers } = input;
  const summaries = groupSummary(pairs, groups);
  const playoffCount = format === "knockout" ? pairs.length : summaries.reduce((total, group) => total + (qualifiers[group.code] ?? 2), 0);
  const invalidGroups = format === "group_knockout" && summaries.some((group) => group.size < 2 || (qualifiers[group.code] ?? 2) > group.size);
  if (!name.trim() || !date) throw new Error("Укажите название и дату турнира.");
  if (endDate && endDate < date) throw new Error("Дата завершения не может быть раньше начала.");
  if (invalidGroups || playoffCount < 2) throw new Error("В каждой группе нужно минимум 2 пары. Проверьте число выходящих в плей-офф.");
  if (pairs.some((pair) => Boolean(pair.player_one.trim()) !== Boolean(pair.player_two.trim()))) throw new Error("Укажите обоих игроков пары или оставьте оба имени на потом.");
  const actualSlug = slug || tournamentSlug(name) || fallbackSlug;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(actualSlug)) throw new Error("Проверьте адрес турнира: латинские буквы, цифры и дефисы.");
  return {
    p_name: name.trim(), p_slug: actualSlug, p_location: location.trim(),
    p_starts_at: new Date(`${date}T12:00:00`).toISOString(),
    p_ends_at: new Date(`${endDate || date}T12:00:00`).toISOString(),
    p_sport: sport, p_status: status, p_format: format,
    p_pairs: pairs.map((pair) => ({ ...pair, name: pair.name.trim(), player_one: pair.player_one.trim(), player_two: pair.player_two.trim() })),
    p_groups: format === "group_knockout" ? summaries.map((group) => ({ code: group.code, qualify_count: qualifiers[group.code] ?? 2 })) : [],
  };
}
