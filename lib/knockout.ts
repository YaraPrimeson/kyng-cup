export function mainBracketSize(count: number) {
  if (!Number.isInteger(count) || count < 2 || count > 64) throw new Error("Нужно от 2 до 64 пар.");
  return 2 ** Math.floor(Math.log2(count));
}
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) order = order.flatMap(seed => [seed, order.length * 2 + 1 - seed]);
  return order;
}
export function knockoutRoundLabel(size: number, round: number) {
  if (round === 0) return "Preliminary";
  const remaining = Math.log2(size) - round;
  return remaining === 0 ? "Final" : remaining === 1 ? "Semifinal" : remaining === 2 ? "Quarterfinal" : `Round of ${2 ** (remaining + 1)}`;
}
export type DrawMatch = {
  id: string; round: number; position: number;
  seeds: [number | null, number | null]; sources: [string | null, string | null];
  next_match_id?: string | null; next_slot?: number | null;
};
export function knockoutPlan(count: number) {
  const size = mainBracketSize(count), extra = count - size, order = seedOrder(size);
  const matches: DrawMatch[] = [];
  for (let i = 0; i < extra; i++) matches.push({ id: `0:${i + 1}`, round: 0, position: i + 1, seeds: [size - extra + 1 + i, count - i], sources: [null, null] });
  for (let round = 1; round <= Math.log2(size); round++) {
    for (let position = 1; position <= size / 2 ** round; position++) {
      const seeds: DrawMatch["seeds"] = [null, null], sources: DrawMatch["sources"] = [null, null];
      for (let slot = 0; slot < 2; slot++) {
        if (round > 1) sources[slot] = `${round - 1}:${position * 2 - 1 + slot}`;
        else {
          const seed = order[(position - 1) * 2 + slot];
          if (seed > size - extra) sources[slot] = `0:${seed - (size - extra)}`;
          else seeds[slot] = seed;
        }
      }
      matches.push({ id: `${round}:${position}`, round, position, seeds, sources });
    }
  }
  for (const match of matches) {
    const next = matches.find(candidate => candidate.sources.includes(match.id));
    match.next_match_id = next?.id ?? null;
    match.next_slot = next ? next.sources.indexOf(match.id) + 1 : null;
  }
  return { size, matches };
}

export function savedDraw(count: number, matches: { round: number; position: number; pair_one_id: string | null; pair_two_id: string | null }[]) {
  const ids: (string | null)[] = Array(count).fill(null);
  for (const planned of knockoutPlan(count).matches) {
    const match = matches.find(row => row.round === planned.round && row.position === planned.position);
    if (!match) continue;
    planned.seeds.forEach((seed, index) => { if (seed) ids[seed - 1] = index === 0 ? match.pair_one_id : match.pair_two_id; });
  }
  return ids.every((id): id is string => Boolean(id)) && new Set(ids).size === count ? ids as string[] : null;
}
