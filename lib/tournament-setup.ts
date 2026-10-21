export type SetupPair = { name: string; player_one: string; player_two: string; group: string };
export function groupCode(index: number) { return String.fromCharCode(65 + index); }
export function balancePairs(pairs: SetupPair[], count: number): SetupPair[] {
  return pairs.map((pair, index) => ({ ...pair, group: groupCode(index % count) }));
}
export function blankPairs(count: number): SetupPair[] {
  return Array.from({ length: count }, () => ({ name: "", player_one: "", player_two: "", group: "A" }));
}
export function parsePairList(value: string): SetupPair[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
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
