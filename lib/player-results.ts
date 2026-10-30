export type PlayerMatch = {
  id: string; tournament_id: string; tournament_name: string; tournament_slug: string; sport: string;
  tournament_status: string; tournament_date: string | null; pair_id: string;
  partner_user_id: string | null; partner_name: string; opponent_name: string;
  stage: "group" | "playoffs" | "basement"; round: number | null; final_round: number | null;
  is_final: boolean; status: string; winner_id: string | null;
  pair_one_id: string | null; pair_two_id: string | null;
  pair_one_sets: number[]; pair_two_sets: number[];
  completed_at: string | null; scheduled_at: string | null;
};

export const playerAwards = [
  { id: "debut", name: "Дебют", rule: "Сыграть официальный матч в завершённом турнире KYNG CUP." },
  { id: "first-win", name: "Первая победа", rule: "Выиграть официальный матч. Технический проход без игры не учитывается." },
  { id: "group", name: "Из группы", rule: "Сыграть в группе и выйти в основной плей-офф, не в предварительный раунд." },
  { id: "top8", name: "Топ-8", rule: "Сыграть в четвертьфинале основного плей-офф или более позднем раунде." },
  { id: "semi", name: "Полуфинал", rule: "Сыграть в полуфинале основного плей-офф или финале." },
  { id: "final", name: "Финалист", rule: "Сыграть в финале основного плей-офф." },
  { id: "champion", name: "Чемпион", rule: "Выиграть сыгранный финал основного плей-офф завершённого турнира." },
  { id: "second-chance", name: "Второй шанс", rule: "Выиграть сыгранный финал утешительной сетки завершённого турнира." },
  { id: "ten-wins", name: "10 побед", rule: "Выиграть десять официальных матчей KYNG CUP." },
  { id: "streak", name: "Три подряд", rule: "Выиграть три официальных матча подряд. Поражение прерывает серию." },
  { id: "duo", name: "Сыгранная пара", rule: "Сыграть в трёх завершённых турнирах с одним партнёром. Оба аккаунта должны быть связаны с заявками." },
  { id: "ten-events", name: "10 турниров", rule: "Сыграть в десяти завершённых турнирах KYNG CUP." },
] as const;

function played(match: PlayerMatch) {
  if (match.status !== "completed" || !match.pair_one_id || !match.pair_two_id || match.pair_one_id === match.pair_two_id
    || ![match.pair_one_id, match.pair_two_id].includes(match.pair_id)
    || ![match.pair_one_id, match.pair_two_id].includes(match.winner_id ?? "")) return false;
  const a = match.pair_one_sets, b = match.pair_two_sets;
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length
    || [...a, ...b].some(value => !Number.isInteger(value) || value < 0 || value > 99)
    || a.some((value, index) => value === b[index])) return false;
  const one = a.filter((value, index) => value > b[index]).length;
  const two = b.length - one;
  return one !== two && match.winner_id === (one > two ? match.pair_one_id : match.pair_two_id);
}
function timestamp(match: PlayerMatch) { return Date.parse(match.completed_at ?? match.scheduled_at ?? match.tournament_date ?? "") || 0; }
export function playerResults(rows: PlayerMatch[]) {
  const unique = [...new Map(rows.map(match => [match.id, match])).values()];
  const matches = unique.filter(played).sort((a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id));
  const wins = matches.filter(match => match.winner_id === match.pair_id).length;
  const completed = new Set(matches.filter(match => match.tournament_status === "completed").map(match => match.tournament_id));
  // Only distinct, valid completion times establish an order for streaks.
  // Fallback dates and id tie-breakers remain useful for history display only.
  const completionTimes = matches.map(match => Date.parse(match.completed_at ?? ""));
  const streakReliable = completionTimes.every(Number.isFinite) && new Set(completionTimes).size === matches.length;
  let currentStreak = 0, bestStreak = 0;
  if (streakReliable) for (const match of matches) { currentStreak = match.winner_id === match.pair_id ? currentStreak + 1 : 0; bestStreak = Math.max(bestStreak, currentStreak); }
  const stats = { played: matches.length, wins, losses: matches.length - wins, winRate: matches.length ? Math.round(wins / matches.length * 100) : 0, completedTournaments: completed.size, currentStreak, bestStreak };
  const history = [...new Set(matches.map(match => match.tournament_id))].map(id => {
    const games = matches.filter(match => match.tournament_id === id).reverse();
    return { id, name: games[0].tournament_name, sport: games[0].sport, date: games[0].tournament_date, status: games[0].tournament_status, partner: games[0].partner_name, matches: games, wins: games.filter(match => match.winner_id === match.pair_id).length };
  }).sort((a, b) => timestamp(a.matches[0]) < timestamp(b.matches[0]) ? 1 : -1);
  const earned = new Set<string>();
  if (completed.size) earned.add("debut");
  if (wins) earned.add("first-win");
  if (wins >= 10) earned.add("ten-wins");
  if (completed.size >= 10) earned.add("ten-events");
  if (bestStreak >= 3) earned.add("streak");
  if (matches.some(match => match.stage === "group" && unique.some(other => other.tournament_id === match.tournament_id && other.pair_id === match.pair_id && other.stage === "playoffs" && (other.round ?? 0) > 0))) earned.add("group");
  for (const match of matches) {
    const distance = match.final_round !== null && match.round !== null ? match.final_round - match.round : -1;
    if (match.stage === "playoffs" && (match.round ?? 0) > 0) {
      if (distance >= 0 && distance <= 2) earned.add("top8");
      if (distance >= 0 && distance <= 1) earned.add("semi");
      if (match.is_final) earned.add("final");
      if (match.is_final && match.winner_id === match.pair_id && match.tournament_status === "completed") earned.add("champion");
    }
    if (match.stage === "basement" && match.is_final && match.winner_id === match.pair_id && match.tournament_status === "completed") earned.add("second-chance");
  }
  const partners = new Map<string, Set<string>>();
  for (const match of matches) {
    if (!match.partner_user_id || !completed.has(match.tournament_id)) continue;
    const events = partners.get(match.partner_user_id) ?? new Set<string>();
    events.add(match.tournament_id); partners.set(match.partner_user_id, events);
  }
  const duo = Math.max(0, ...[...partners.values()].map(events => events.size));
  if (duo >= 3) earned.add("duo");
  const progress: Record<string, string> = { "ten-wins": `${Math.min(wins, 10)} из 10 побед`, "ten-events": `${Math.min(completed.size, 10)} из 10 турниров`, streak: streakReliable ? `${Math.min(bestStreak, 3)} из 3 побед подряд` : "Недостаточно данных о порядке матчей", duo: `${Math.min(duo, 3)} из 3 турниров с одним партнёром` };
  return { stats, streakReliable, history, achievements: playerAwards.map(award => ({ ...award, earned: earned.has(award.id), progress: earned.has(award.id) ? "Получено" : progress[award.id] ?? "Ещё не получено" })) };
}

export function matchScore(match: PlayerMatch) {
  const oursFirst = match.pair_id === match.pair_one_id;
  const a = oursFirst ? match.pair_one_sets : match.pair_two_sets;
  const b = oursFirst ? match.pair_two_sets : match.pair_one_sets;
  return a.map((value, index) => `${value}:${b[index]}`).join(" · ");
}
export function matchStage(match: PlayerMatch) {
  if (match.stage === "group") return "Групповой этап";
  if (match.round === null || match.round < 0) return match.stage === "basement" ? "Утешительная сетка" : "Плей-офф";
  const distance = match.final_round !== null ? match.final_round - match.round : null;
  const label = match.round === 0 ? "Предварительный раунд" : match.is_final ? "Финал" : distance === 1 ? "Полуфинал" : distance === 2 ? "Четвертьфинал" : `Раунд ${match.round}`;
  return match.stage === "basement" ? `${label} · утешительная сетка` : label;
}
