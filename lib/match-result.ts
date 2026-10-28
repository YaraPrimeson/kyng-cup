export function parseScore(value: string) {
  const sets = value.split(",").map(set => set.trim()).filter(Boolean);
  if (!sets.length) return null;
  const pairOne: number[] = [], pairTwo: number[] = [];
  for (const set of sets) {
    const match = /^(\d{1,2})\s*[-:]\s*(\d{1,2})$/.exec(set);
    if (!match) return null;
    pairOne.push(Number(match[1])); pairTwo.push(Number(match[2]));
  }
  return { pairOne, pairTwo };
}

export function resultError(score: string, winner: string, one?: { id: string; name: string }, two?: { id: string; name: string }) {
  if (!one || !two) return "Дождитесь определения обеих пар.";
  const parsed = parseScore(score);
  if (!parsed) return "Укажите счёт в формате 1-0 или 6-4, 3-6, 10-8. Сначала идёт счёт верхней пары.";
  if (!winner || ![one.id, two.id].includes(winner)) return "Выберите победившую пару.";
  if (parsed.pairOne.some((value, index) => value === parsed.pairTwo[index])) return "В итоговом счёте не может быть ничейного сета. Завершите счёт перед сохранением.";
  const wins = parsed.pairOne.reduce((total, value, index) => total + (value > parsed.pairTwo[index] ? 1 : -1), 0);
  if (!wins) return "По указанному счёту ничья по сетам. Укажите решающий сет.";
  const actual = wins > 0 ? one : two;
  return actual.id !== winner ? `По счёту ${score} победила пара «${actual.name}», но выбрана другая пара. Исправьте победителя или счёт. Счёт записывается сверху вниз.` : null;
}
