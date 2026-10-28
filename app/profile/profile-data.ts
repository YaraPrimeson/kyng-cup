export const achievements = [
  { id: "debut", name: "Дебют", open: true, rule: "Завершить свой первый турнир KYNG CUP. Одной заявки недостаточно.", progress: "Получено · 30 августа 2026" },
  { id: "first-win", name: "Первая победа", open: true, rule: "Выиграть первый официальный матч KYNG CUP. Технический проход без игры не засчитывается.", progress: "Получено · 30 августа 2026" },
  { id: "group", name: "Из группы", open: true, rule: "Пройти из группового этапа в основной плей-офф по результатам матчей.", progress: "Получено · 5 октября 2026" },
  { id: "top8", name: "Топ-8", open: true, rule: "Дойти до четвертьфинала основного плей-офф, сыграв хотя бы один официальный матч в турнире.", progress: "Получено · 5 октября 2026" },
  { id: "semi", name: "Полуфинал", open: false, rule: "Дойти до полуфинала основного плей-офф KYNG CUP. Утешительная сетка учитывается отдельно.", progress: "Лучший результат в примере · четвертьфинал" },
  { id: "final", name: "Финалист", open: false, rule: "Сыграть в финале основного плей-офф KYNG CUP.", progress: "Ещё не получено" },
  { id: "champion", name: "Чемпион", open: false, rule: "Победить в основном турнире KYNG CUP. Результат подтверждает организатор.", progress: "Ещё не получено" },
  { id: "second-chance", name: "Второй шанс", open: false, rule: "Выиграть утешительную сетку турнира. Доступно только в турнирах с таким этапом.", progress: "Награда за утешительную сетку" },
  { id: "ten-wins", name: "10 побед", open: true, rule: "Набрать 10 побед в сыгранных официальных матчах KYNG CUP. Победы в разных турнирах суммируются.", progress: "Получено · 15 побед в примере" },
  { id: "streak", name: "Три подряд", open: false, rule: "Выиграть три официальных матча подряд. Поражение прерывает серию; технический проход её не увеличивает.", progress: "Текущая серия в примере · 0 из 3" },
  { id: "duo", name: "Сыгранная пара", open: true, rule: "Завершить три турнира с одним партнёром. Пара определяется по аккаунтам обоих игроков.", progress: "Получено · 6 турниров с Daniel Horvat в примере" },
  { id: "ten-events", name: "10 турниров", open: false, rule: "Завершить десять турниров KYNG CUP. Отменённые заявки и неявки не засчитываются.", progress: "Остался 1 турнир · 9 из 10 в примере" },
] as const;

export const exampleHistory = [
  { id: "autumn", name: "KYNG Autumn Open", date: "5 октября 2026", day: "05", month: "окт", result: "Четвертьфинал", partner: "Daniel Horvat", wins: 2, matches: [
    { rivals: "M. Weiss / T. Berger", score: "6:4 · 6:3", stage: "Победа · группа" },
    { rivals: "P. Novak / I. Costa", score: "6:2 · 6:4", stage: "Победа · группа" },
    { rivals: "L. Graf / N. König", score: "4:6 · 6:7", stage: "Поражение · четвертьфинал" },
  ] },
  { id: "summer", name: "KYNG Summer Cup", date: "30 августа 2026", day: "30", month: "авг", result: "Групповой этап", partner: "Daniel Horvat", wins: 1, matches: [
    { rivals: "M. Weiss / T. Berger", score: "6:4 · 6:3", stage: "Победа · группа" },
    { rivals: "L. Graf / N. König", score: "4:6 · 6:7", stage: "Поражение · группа" },
  ] },
] as const;

export type PlayerCardResult = { name: string; date: string; result: string; partner: string; wins: number; matches: number; topEight: boolean };
