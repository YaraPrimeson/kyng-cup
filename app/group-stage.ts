export type TournamentGroup = { id: string; code: string; qualify_count: number };
export type GroupMember = { group_id: string; pair_id: string; position: number };
export type GroupMatch = {
  id: string;
  tournament_id: string;
  group_id: string;
  position: number;
  pair_one_id: string;
  pair_two_id: string;
  pair_one_sets: number[];
  pair_two_sets: number[];
  winner_id: string | null;
  status: "scheduled" | "live" | "completed";
  court: string | null;
  scheduled_at: string | null;
  updated_at: string;
};

export type Standing = {
  pairId: string;
  played: number;
  won: number;
  lost: number;
  setsFor: number;
  setsAgainst: number;
  gamesFor: number;
  gamesAgainst: number;
  points: number;
  place: number;
};

export function calculateStandings(members: GroupMember[], matches: GroupMatch[]): Standing[] {
  const rows = new Map(members.map((member) => [member.pair_id, {
    pairId: member.pair_id, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0,
    gamesFor: 0, gamesAgainst: 0, points: 0, place: 0,
  }]));

  for (const match of matches.filter((item) => item.status === "completed" && item.winner_id)) {
    const one = rows.get(match.pair_one_id);
    const two = rows.get(match.pair_two_id);
    if (!one || !two) continue;
    one.played += 1; two.played += 1;
    const oneSets = match.pair_one_sets.reduce((total, score, index) => total + (score > (match.pair_two_sets[index] ?? 0) ? 1 : 0), 0);
    const twoSets = match.pair_two_sets.reduce((total, score, index) => total + (score > (match.pair_one_sets[index] ?? 0) ? 1 : 0), 0);
    const oneGames = match.pair_one_sets.reduce((total, score) => total + score, 0);
    const twoGames = match.pair_two_sets.reduce((total, score) => total + score, 0);
    one.setsFor += oneSets; one.setsAgainst += twoSets; one.gamesFor += oneGames; one.gamesAgainst += twoGames;
    two.setsFor += twoSets; two.setsAgainst += oneSets; two.gamesFor += twoGames; two.gamesAgainst += oneGames;
    if (match.winner_id === one.pairId) { one.won += 1; one.points += 1; two.lost += 1; }
    else { two.won += 1; two.points += 1; one.lost += 1; }
  }

  const headToHeadWinner = (a: Standing, b: Standing) => matches.find((match) =>
    match.status === "completed" && ((match.pair_one_id === a.pairId && match.pair_two_id === b.pairId) || (match.pair_one_id === b.pairId && match.pair_two_id === a.pairId))
  )?.winner_id;
  return Array.from(rows.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const tiedAtPoints = Array.from(rows.values()).filter((row) => row.points === a.points).length;
    if (tiedAtPoints === 2) {
      const winner = headToHeadWinner(a, b);
      if (winner === a.pairId) return -1;
      if (winner === b.pairId) return 1;
    }
    const setDifference = (b.setsFor - b.setsAgainst) - (a.setsFor - a.setsAgainst);
    if (setDifference) return setDifference;
    const gameDifference = (b.gamesFor - b.gamesAgainst) - (a.gamesFor - a.gamesAgainst);
    if (gameDifference) return gameDifference;
    return members.find((member) => member.pair_id === a.pairId)!.position - members.find((member) => member.pair_id === b.pairId)!.position;
  }).map((row, index) => ({ ...row, place: index + 1 }));
}

export function buildFairDraw(qualifiers: { pairId: string; groupCode: string; place: number }[]) {
  const winners = qualifiers.filter((item) => item.place === 1);
  const runners = qualifiers.filter((item) => item.place === 2);
  const shuffle = <T,>(items: T[]) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  };
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const order = shuffle([...winners, ...runners]);
    const valid = [0, 2, 4, 6].every((index) => order[index].groupCode !== order[index + 1].groupCode);
    if (valid) return order.map((item) => item.pairId);
  }
  return qualifiers.map((item) => item.pairId);
}
