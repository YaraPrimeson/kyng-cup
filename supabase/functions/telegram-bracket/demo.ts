export type Message = {
  message_id?: number;
  chat?: { id?: number; type?: string };
  from?: { id?: number };
  text?: string;
  reply_to_message?: Message;
};
type Callback = { id: string; from: { id: number }; message?: Message; data?: string };
type Stage = "g" | "f";
type Match = {
  status: "scheduled" | "live" | "completed";
  one: string;
  two: string;
  score_one: number | null;
  score_two: number | null;
  winner: string | null;
};
type Board = {
  tournament?: string;
  group_match?: Match | null;
  final_match?: Match | null;
  group_target?: 3 | 6;
  final_target?: 3 | 6;
  revision?: number;
  undo_stage?: Stage;
  error?: string;
};
type Button = { text: string; callback_data: string } | { text: string; url: string };
type Payload = Record<string, unknown>;

const stageLabel = (stage: Stage) => stage === "g" ? "Группа A" : "Финал";
const matchFor = (board: Board, stage: Stage) => stage === "g" ? board.group_match : board.final_match;
const score = (match: Match) => match.score_one === null ? "—" : match.score_one + ":" + match.score_two;
const status = (match: Match) => ({ scheduled: "Ожидает начала", live: "🔴 LIVE", completed: "Завершён" })[match.status];
const targetFor = (board: Board, stage: Stage) => (stage === "g" ? board.group_target : board.final_target) ?? 6;
const format = (target: 3 | 6) => target === 3 ? "До 3 выигранных геймов" : "Обычный сет до 6 геймов";

function isFinal(match: Match, target: 3 | 6) {
  const high = Math.max(match.score_one ?? 0, match.score_two ?? 0);
  const low = Math.min(match.score_one ?? 0, match.score_two ?? 0);
  if (target === 3) return high === 3 && low < 3;
  return (high === 6 && low <= 4) || (high === 7 && (low === 5 || low === 6));
}

function button(text: string, stage: Stage, action: string, revision: number): Button {
  return { text, callback_data: ["kd", stage, action, revision].join(":") };
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
      const target = targetFor(board, stage);
      if (match.status === "scheduled") {
        keyboard.push([button("▶️ Начать матч", stage, "start", revision)]);
        keyboard.push([button("Выбрать формат", stage, "format", revision)]);
      }
      if (match.status === "live") {
        if (!isFinal(match, target)) {
          const text = target === 6 && score(match) === "6:6" ? "Завершить тай-брейк" : "Завершить гейм";
          keyboard.push([button(text, stage, "game", revision)]);
        }
        const edits = [button("Ввести счёт", stage, "input", revision)];
        if (board.undo_stage === stage) edits.push(button("Отменить последнее", stage, "undo", revision));
        keyboard.push(edits);
        keyboard.push([button("Завершить матч", stage, "review", revision)]);
      }
      if (stage === "g" && match.status === "completed" && !board.final_match) {
        keyboard.push([button("Посмотреть состав финала", stage, "qualifiers", revision)]);
      }
      keyboard.push([button("← К матчам", stage, "home", revision)]);
      return card(chatId, error + [
        stageLabel(stage) + " · Корт 1 · " + status(match),
        match.one + " — " + match.two,
        "Счёт: " + score(match),
        match.winner ? "Победитель: " + match.winner : "Формат: " + format(target),
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
      board.group_match ? "Группа A · " + status(board.group_match) + " · " + score(board.group_match) : "",
      board.final_match ? "Финал · " + status(board.final_match) + " · " + score(board.final_match) : "Финал откроется после группы.",
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
    const target = targetFor(board, stage);
    if (action === "format" && match?.status === "scheduled") {
      return card(userId, stageLabel(stage) + " · Формат матча\nСейчас: " + format(target), [
        [button("До 3 геймов", stage, "short", revision)],
        [button("Обычный сет", stage, "standard", revision)],
        [button("← К матчу", stage, "open", revision)],
      ], messageId);
    }
    if (action === "game" && match?.status === "live" && !isFinal(match, target)) {
      const tiebreak = target === 6 && score(match) === "6:6";
      return card(userId, stageLabel(stage) + " · " + score(match) + "\nКто выиграл " + (tiebreak ? "тай-брейк" : "гейм") + "?", [
        [button(match.one, stage, "plus1", revision)],
        [button(match.two, stage, "plus2", revision)],
        [button("← К матчу", stage, "open", revision)],
      ], messageId);
    }
    if (action === "input" && match?.status === "live") {
      return telegram("sendMessage", {
        chat_id: userId,
        text: stageLabel(stage) + " · " + match.one + " — " + match.two
          + "\nВведите счёт матча, например 3:2.\n#kd:" + stage + ":" + revision,
        reply_markup: { force_reply: true, input_field_placeholder: "3:2" },
      });
    }
    if (action === "review" && match?.status === "live") {
      if (match.score_one === match.score_two) {
        return panel(userId, { ...board, error: "Счёт равный. Сначала внесите решающий гейм или исправьте счёт." }, stage, messageId);
      }
      const early = !isFinal(match, target);
      const winner = (match.score_one ?? 0) > (match.score_two ?? 0) ? match.one : match.two;
      return card(userId, stageLabel(stage) + " · Итог " + score(match) + "\nПобедитель: " + winner
        + (early ? "\nМатч ещё не достиг лимита по формату. Сохранить этот счёт как итог?" : ""), [
        [button(early ? "Завершить досрочно" : "Подтвердить итог", stage, early ? "finishearly" : "finish", revision)],
        [button("← К матчу", stage, "open", revision)],
      ], messageId);
    }
    if (action === "qualifiers" && stage === "g" && match?.winner && !board.final_match) {
      const runnerUp = match.winner === match.one ? match.two : match.one;
      return card(userId, ["Группа A завершена", "1. " + match.winner, "2. " + runnerUp, "", "Обе пары выходят в финал."].join("\n"), [
        [button("Подтвердить состав финала", stage, "advance", revision)],
        [button("← К матчам", stage, "home", revision)],
      ], messageId);
    }
    const manual = action.match(/^s([0-7])([0-7])$/);
    const saved = await request(userId, manual ? "score" : action, {
      p_stage: stage, p_revision: revision,
      ...(manual ? { p_one: Number(manual[1]), p_two: Number(manual[2]) } : {}),
    });
    if (stage === "f" && (action === "finish" || action === "finishearly") && !saved.error) {
      return panel(userId, saved, undefined, messageId);
    }
    return panel(userId, saved, action === "advance" && !saved.error ? "f" : stage, messageId);
  }

  async function textReply(userId: number, message: Message, text: string) {
    const original = message.reply_to_message;
    const context = original?.text?.match(/\n#kd:([gf]):(\d{1,10})$/);
    if (!context || original?.from?.id !== await getBotId()) return false;
    const stage = context[1] as Stage;
    const board = await request(userId, "view");
    const match = matchFor(board, stage);
    if (board.revision !== Number(context[2]) || !match || match.status !== "live" || board.revision === undefined) {
      await panel(userId, { ...board, error: board.error ?? "Счёт уже обновился. Откройте свежую карточку." }, stage);
      return true;
    }
    const values = text.match(/^([0-7])\s*[:–-]\s*([0-7])$/);
    if (!values) {
      await reply(userId, "Введите счёт матча, например 3:2, ответом на запрос бота.");
      return true;
    }
    await card(userId, stageLabel(stage) + " · " + match.one + " — " + match.two
      + "\nИзменить счёт с " + score(match) + " на " + values[1] + ":" + values[2] + "?", [
      [button("Сохранить счёт", stage, "s" + values[1] + values[2], board.revision)],
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
