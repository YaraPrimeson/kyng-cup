export type Message = {
  message_id?: number;
  chat?: { id?: number; type?: string };
  from?: { id?: number };
  text?: string;
  reply_to_message?: Message;
};
type Callback = { id: string; from: { id: number }; message?: Message; data?: string };
type Stage = "g" | "f";
type Segment = { number: number; one: number; two: number; kind: "short" | "standard" | "super" };
type Match = {
  status: "scheduled" | "live" | "completed";
  one: string;
  two: string;
  winner: string | null;
  sets_one: number;
  sets_two: number;
  sets: [number, number][];
  active: Segment | null;
};
type Board = {
  tournament?: string;
  group_match?: Match | null;
  final_match?: Match | null;
  revision?: number;
  undo_stage?: Stage;
  error?: string;
};
type Button = { text: string; callback_data: string } | { text: string; url: string };
type Payload = Record<string, unknown>;

const stageLabel = (stage: Stage) => stage === "g" ? "Группа A" : "Финал";
const matchFor = (board: Board, stage: Stage) => stage === "g" ? board.group_match : board.final_match;
const status = (match: Match) => ({ scheduled: "Ожидает начала", live: "🔴 LIVE", completed: "Завершён" })[match.status];
const format = (stage: Stage) => stage === "g" ? "Один сет до 3 выигранных геймов"
  : "До 2 выигранных сетов. При 1:1 — супер-тай-брейк до 10 очков с разницей в 2.";
const setLabel = (number: number) => number === 3 ? "Супер-тай-брейк" : "Сет " + number;
const setScore = (match: Match) => match.sets_one + ":" + match.sets_two;

function segmentDone({ kind, one, two }: Segment) {
  const high = Math.max(one, two);
  const low = Math.min(one, two);
  if (kind === "short") return high === 3 && low < 3;
  if (kind === "super") return (high === 10 && low <= 8) || (high > 10 && high - low === 2);
  return (high === 6 && low <= 4) || (high === 7 && (low === 5 || low === 6));
}

function button(text: string, stage: Stage, action: string, revision: number): Button {
  return { text, callback_data: ["kd", stage, action, revision].join(":") };
}

function matchLines(match: Match) {
  const lines = [
    match.one + " — " + match.two,
    "Сеты: " + setScore(match),
    ...match.sets.map(([one, two], index) => setLabel(index + 1) + " — " + one + ":" + two + " · завершён"),
  ];
  if (match.active) {
    const { number, kind, one, two } = match.active;
    const unit = kind === "super" ? "по очкам" : "по геймам";
    lines.push(setLabel(number) + " — " + one + ":" + two + " " + unit + (segmentDone(match.active) ? " · подтвердите сет" : " · идёт"));
  }
  return lines;
}

export function telegramDemo(
  control: (userId: number, action: string, params?: Payload) => Promise<unknown>,
  telegram: (method: string, payload: Payload) => Promise<void>,
  getBotId: () => Promise<number>,
) {
  const request = (userId: number, action: string, params?: Payload) => control(userId, action, params) as Promise<Board>;
  const reply = (chatId: number, text: string) => telegram("sendMessage", { chat_id: chatId, text });

  async function card(chatId: number, text: string, keyboard: Button[][], messageId?: number) {
    await telegram(messageId === undefined ? "sendMessage" : "editMessageText", {
      chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: keyboard },
    });
  }

  async function panel(chatId: number, board: Board, stage?: Stage, messageId?: number) {
    const revision = board.revision;
    if (revision === undefined) return reply(chatId, board.error ?? "Демо пока недоступно.");
    const keyboard: Button[][] = [];
    const error = board.error ? board.error + "\n\n" : "";
    const match = stage && matchFor(board, stage);
    if (stage && match) {
      if (match.status === "scheduled") keyboard.push([button("▶️ Начать матч", stage, "start", revision)]);
      if (match.status === "live") {
        const active = match.active;
        if (active) {
          const superBreak = active.kind === "super";
          const tiebreak = active.kind === "standard" && active.one === 6 && active.two === 6;
          if (!segmentDone(active)) {
            const text = superBreak ? "Записать очко" : tiebreak ? "Завершить тай-брейк" : "Завершить гейм";
            keyboard.push([button(text, stage, "game", revision)]);
          }
          keyboard.push([button(superBreak ? "Ввести очки" : "Ввести геймы сета " + active.number, stage, "input0", revision)]);
          keyboard.push([button(superBreak ? "Завершить супер-тай-брейк" : "Завершить сет " + active.number, stage, "setreview", revision)]);
        }
        const edits: Button[] = [];
        if (match.sets.length) edits.push(button("Исправить завершённый сет", stage, "edit", revision));
        if (board.undo_stage === stage) edits.push(button("Отменить последнее", stage, "undo", revision));
        if (edits.length) keyboard.push(edits);
        keyboard.push([button("Завершить матч", stage, "review", revision)]);
      }
      if (stage === "g" && match.status === "completed" && !board.final_match) {
        keyboard.push([button("Посмотреть состав финала", stage, "qualifiers", revision)]);
      }
      keyboard.push([button("← К матчам", stage, "home", revision)]);
      return card(chatId, error + [
        stageLabel(stage) + " · Корт 1 · " + status(match),
        ...matchLines(match),
        match.winner ? "Победитель: " + match.winner : "Формат: " + format(stage),
      ].join("\n"), keyboard, messageId);
    }
    if (board.group_match) keyboard.push([button("Группа A · Корт 1", "g", "open", revision)]);
    if (board.final_match) keyboard.push([button("Финал · Корт 1", "f", "open", revision)]);
    if (board.group_match?.status === "completed" && !board.final_match) {
      keyboard.push([button("Посмотреть состав финала", "g", "qualifiers", revision)]);
    }
    keyboard.push([{ text: "Открыть тестовую сетку", url: "https://kyngcup.com/telegram-demo/" }]);
    return card(chatId, error + [
      board.tournament ?? "KYNG CUP · Демо",
      board.group_match ? "Группа A · " + status(board.group_match) + " · сеты " + setScore(board.group_match) : "",
      board.final_match ? "Финал · " + status(board.final_match) + " · сеты " + setScore(board.final_match) : "Финал откроется после группы.",
      board.final_match?.winner ? "Чемпионы: " + board.final_match.winner : "",
    ].filter(Boolean).join("\n"), keyboard, messageId);
  }

  async function callback(update: Callback) {
    const data = update.data?.match(/^kd:([gf]):([a-z0-9]+):(\d{1,10})$/);
    const message = update.message;
    await telegram("answerCallbackQuery", { callback_query_id: update.id });
    if (!data || message?.chat?.type !== "private" || message.chat.id !== update.from.id) return;
    const userId = update.from.id;
    const stage = data[1] as Stage;
    const action = data[2];
    const revision = Number(data[3]);
    const board = await request(userId, "view");
    const messageId = message.message_id;
    if (board.revision === undefined || action === "home") return panel(userId, board, undefined, messageId);
    if (action === "open") return panel(userId, board, stage, messageId);
    if (board.revision !== revision) {
      return panel(userId, { ...board, error: "Счёт уже обновился. Вот свежая карточка." }, stage, messageId);
    }
    const match = matchFor(board, stage);
    const back = [button("← К матчу", stage, "open", revision)];
    if (action === "game" && match?.active && !segmentDone(match.active)) {
      const active = match.active;
      const question = active.kind === "super" ? "Кто выиграл очко?"
        : active.kind === "standard" && active.one === 6 && active.two === 6 ? "Кто выиграл тай-брейк?" : "Кто выиграл гейм?";
      return card(userId, setLabel(active.number) + " · " + active.one + ":" + active.two + "\n" + question, [
        [button(match.one, stage, "plus1", revision)],
        [button(match.two, stage, "plus2", revision)],
        back,
      ], messageId);
    }
    if (action === "edit" && match?.status === "live") {
      return card(userId, "Какой завершённый сет исправить?", [
        ...match.sets.map(([one, two], index) => [button(setLabel(index + 1) + " · " + one + ":" + two, stage, "input" + (index + 1), revision)]),
        back,
      ], messageId);
    }
    const input = action.match(/^input([0-3])$/);
    if (input && match?.status === "live") {
      const index = Number(input[1]);
      const number = index || match.active?.number;
      if (number && (index === 0 || index <= match.sets.length)) {
        const example = number === 3 ? "10:8" : stage === "g" ? "3:2" : "6:4";
        return telegram("sendMessage", {
          chat_id: userId,
          text: setLabel(number) + " · " + match.one + " — " + match.two + "\nВведите "
            + (number === 3 ? "очки" : "геймы") + " в порядке пар, например " + example + ".\n#kd:" + stage + ":" + index + ":" + revision,
          reply_markup: { force_reply: true, input_field_placeholder: example },
        });
      }
    }
    if (action === "setreview" && match?.active) {
      const active = match.active;
      if (!segmentDone(active)) return panel(userId, { ...board, error: "Сначала внесите итоговый счёт этого сета." }, stage, messageId);
      const winner = active.one > active.two ? match.one : match.two;
      return card(userId, setLabel(active.number) + " · " + active.one + ":" + active.two + "\nВыиграли: " + winner, [
        [button("Подтвердить счёт сета", stage, "set", revision)],
        back,
      ], messageId);
    }
    if (action === "review" && match?.status === "live") {
      if (match.active) return panel(userId, { ...board, error: "Сначала сыграйте и подтвердите оставшиеся сеты." }, stage, messageId);
      const winner = match.sets_one > match.sets_two ? match.one : match.two;
      return card(userId, [stageLabel(stage) + " · Итог", ...matchLines(match), "Победитель: " + winner].join("\n"), [
        [button("Подтвердить итог матча", stage, "finish", revision)],
        back,
      ], messageId);
    }
    if (action === "qualifiers" && stage === "g" && match?.winner && !board.final_match) {
      const runnerUp = match.winner === match.one ? match.two : match.one;
      return card(userId, ["Группа A завершена", "1. " + match.winner, "2. " + runnerUp, "",
        "Обе пары выходят в финал.", "Формат финала: " + format("f")].join("\n"), [
        [button("Подтвердить состав финала", stage, "advance", revision)],
        [button("← К матчам", stage, "home", revision)],
      ], messageId);
    }
    const manual = action.match(/^s([0-3])x(\d{1,2})x(\d{1,2})$/);
    const writeAction = manual ? manual[1] === "0" ? "score" : "edit" + manual[1] : action;
    const saved = await request(userId, writeAction, {
      p_stage: stage, p_revision: revision,
      ...(manual ? { p_one: Number(manual[2]), p_two: Number(manual[3]) } : {}),
    });
    const next = !saved.error && action === "advance" ? "f" : !saved.error && stage === "f" && action === "finish" ? undefined : stage;
    return panel(userId, saved, next, messageId);
  }

  async function textReply(userId: number, message: Message, text: string) {
    const original = message.reply_to_message;
    const context = original?.text?.match(/\n#kd:([gf]):([0-3]):(\d{1,10})$/);
    if (!context || original?.from?.id !== await getBotId()) return false;
    const stage = context[1] as Stage;
    const index = Number(context[2]);
    const board = await request(userId, "view");
    const match = matchFor(board, stage);
    if (board.revision === undefined || board.revision !== Number(context[3]) || match?.status !== "live") {
      await panel(userId, { ...board, error: board.error ?? "Счёт уже обновился. Откройте свежую карточку." }, stage);
      return true;
    }
    const number = index || match.active?.number;
    const recorded = index ? match.sets[index - 1] : match.active && [match.active.one, match.active.two];
    if (!number || !recorded) return false;
    const values = text.match(/^(\d{1,2})\s*[:–-]\s*(\d{1,2})$/);
    if (!values) {
      await reply(userId, "Введите счёт как два числа через двоеточие в ответ на запрос бота.");
      return true;
    }
    await card(userId, setLabel(number) + " · " + match.one + " — " + match.two
      + "\nИзменить счёт с " + recorded.join(":") + " на " + values[1] + ":" + values[2] + "?", [
      [button("Сохранить счёт", stage, "s" + index + "x" + values[1] + "x" + values[2], board.revision)],
      [button("← К матчу", stage, "open", board.revision)],
    ]);
    return true;
  }

  return {
    open: async (userId: number, invite?: string) => panel(userId, await request(userId,
      invite === undefined ? "view" : "claim", invite === undefined ? {} : { p_invite: invite })),
    callback,
    textReply,
  };
}
