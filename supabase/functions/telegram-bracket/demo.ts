export type Message = {
  message_id?: number;
  chat?: { id?: number; type?: string };
  from?: { id?: number };
  text?: string;
  reply_to_message?: Message;
};
type Callback = { id: string; from: { id: number }; message?: Message; data?: string };
const cupGroups = ["a", "b", "c", "d"] as const;
const cupStages = [...cupGroups, "m", "n", "p", "x", "y", "k"] as const;
type Stage = "g" | "f" | typeof cupStages[number];
type Segment = { number: number; one: number; two: number };
type Match = {
  status: "scheduled" | "live" | "completed";
  one: string;
  two: string;
  winner: string | null;
  sets_one: number;
  sets_two: number;
  sets: [number, number, boolean?][];
  active: Segment | null;
  revision?: number;
  court?: string;
  can_undo?: boolean;
};
type Board = {
  tournament?: string;
  group_match?: Match | null;
  final_match?: Match | null;
  matches?: Partial<Record<Stage, Match>>;
  draw_ready?: boolean;
  revision?: number;
  undo_stage?: Stage;
  error?: string;
};
type Button = { text: string; callback_data: string } | { text: string; url: string };
type Payload = Record<string, unknown>;

const stageLabel = (stage: Stage) => ({
  g: "Группа A", f: "Финал", a: "Группа A", b: "Группа B", c: "Группа C", d: "Группа D",
  m: "Основная сетка · Полуфинал 1", n: "Основная сетка · Полуфинал 2", p: "Основной финал",
  x: "Короли подвала · Полуфинал 1", y: "Короли подвала · Полуфинал 2", k: "Короли подвала · Финал",
})[stage];
const matchFor = (board: Board, stage: Stage) => stage === "g" ? board.group_match
  : stage === "f" ? board.final_match : board.matches?.[stage];
const isGroup = (stage: Stage) => stage === "g" || stage === "a" || stage === "b" || stage === "c" || stage === "d";
const status = (match: Match) => ({ scheduled: "Ожидает начала", live: "🔴 LIVE", completed: "Завершён" })[match.status];
const setLabel = (number: number) => "Сет " + number;
const setScore = (match: Match) => match.sets_one + ":" + match.sets_two;
const manualIndex = 999;
const editPageSize = 8;

function setDetail(match: Match, index: number) {
  const [one, two, awarded] = match.sets[index];
  return setLabel(index + 1) + " · " + (awarded ? (one > two ? match.one : match.two) + " · без счёта по геймам" : one + ":" + two);
}

function button(text: string, stage: Stage, action: string, revision: number): Button {
  return { text, callback_data: [stage === "g" || stage === "f" ? "kd" : "kc", stage, action, revision].join(":") };
}

function matchLines(match: Match) {
  const lines = [
    match.one + " — " + match.two,
    "Сеты: " + setScore(match),
  ];
  const first = Math.max(0, match.sets.length - editPageSize);
  if (first) lines.push("Предыдущих сетов: " + first);
  for (let index = first; index < match.sets.length; index += 1) lines.push(setDetail(match, index));
  if (match.active) {
    const { number, one, two } = match.active;
    lines.push(setLabel(number) + " · геймы " + one + ":" + two);
  }
  return lines;
}

export function telegramDemo(
  control: (userId: number, action: string, params?: Payload) => Promise<unknown>,
  telegram: (method: string, payload: Payload) => Promise<void>,
  getBotId: () => Promise<number>,
  cup = false,
) {
  const request = (userId: number, action: string, params?: Payload) => control(userId, action, params) as Promise<Board>;
  const reply = (chatId: number, text: string) => telegram("sendMessage", { chat_id: chatId, text });

  async function card(chatId: number, text: string, keyboard: Button[][], messageId?: number) {
    await telegram(messageId === undefined ? "sendMessage" : "editMessageText", {
      chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: keyboard },
    });
  }

  async function panel(chatId: number, board: Board, stage?: Stage, messageId?: number) {
    const match = stage && matchFor(board, stage);
    const revision = (match && match.revision) ?? board.revision;
    if (revision === undefined) return reply(chatId, board.error ?? "Демо пока недоступно.");
    const keyboard: Button[][] = [];
    const error = board.error ? board.error + "\n\n" : "";
    if (stage && match) {
      if (match.status === "scheduled") keyboard.push([button("▶️ Начать матч", stage, "start", revision)]);
      if (match.status === "live") {
        const active = match.active;
        if (active) {
          keyboard.push([button("+1 гейм · " + match.one, stage, "plus1", revision), button("+1 гейм · " + match.two, stage, "plus2", revision)]);
          keyboard.push([button("Ввести геймы вручную", stage, "input0", revision), button("Завершить сет", stage, "setreview", revision)]);
        }
        for (const [index, name] of [match.one, match.two].entries()) {
          const side = index + 1;
          keyboard.push([button("+1 сет · " + name, stage, "setplus" + side, revision), button("−1 сет · " + name, stage, "setminus" + side, revision)]);
        }
        keyboard.push([button("Ввести счёт по сетам вручную", stage, "input" + manualIndex, revision)]);
        const edits: Button[] = [];
        if (match.sets.length) edits.push(button("Исправить завершённый сет", stage, "edit", revision));
        if (match.can_undo || board.undo_stage === stage) edits.push(button("Отменить последнее", stage, "undo", revision));
        if (edits.length) keyboard.push(edits);
        keyboard.push([button("Завершить матч", stage, "review", revision)]);
      }
      if (stage === "g" && match.status === "completed" && !board.final_match) {
        keyboard.push([button("Посмотреть состав финала", stage, "qualifiers", revision)]);
      }
      if (cup && isGroup(stage) && board.draw_ready && board.revision !== undefined) {
        keyboard.push([button("Посмотреть обе сетки", stage, "qualifiers", board.revision)]);
      }
      keyboard.push([button("← К матчам", stage, "home", revision)]);
      return card(chatId, error + [
        stageLabel(stage) + " · " + (match.court ?? "Корт 1") + " · " + status(match),
        ...matchLines(match),
        match.winner ? "Победитель: " + match.winner : "Счётом и завершением управляет администратор.",
      ].join("\n"), keyboard, messageId);
    }
    if (cup) {
      const lines = [board.tournament ?? "KYNG CUP · Демо на восемь пар"];
      for (const slot of cupStages) {
        const game = matchFor(board, slot);
        if (!game) continue;
        const label = stageLabel(slot) + " · " + game.court;
        keyboard.push([button(label, slot, "open", game.revision ?? revision)]);
        lines.push(label + " · " + status(game) + " · сеты " + setScore(game)
          + (game.active ? " · " + setLabel(game.active.number) + " " + game.active.one + ":" + game.active.two : ""),
          game.one + " — " + game.two + (game.winner ? " · победитель: " + game.winner : ""));
      }
      if (board.draw_ready) keyboard.push([button("Посмотреть обе сетки", "a", "qualifiers", revision)]);
      keyboard.push([button("Обновить пульт", "a", "home", revision)]);
      keyboard.push([{ text: "Открыть тестовую сетку", url: "https://kyngcup.com/telegram-demo/?mode=8" }]);
      return card(chatId, error + lines.join("\n"), keyboard, messageId);
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
    const data = update.data?.match(cup ? /^kc:([abcdmnpxyk]):([a-z0-9]+):(\d{1,10})$/ : /^kd:([gf]):([a-z0-9]+):(\d{1,10})$/);
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
    const match = matchFor(board, stage);
    const currentRevision = action === "qualifiers" || action === "advance" ? board.revision : match?.revision ?? board.revision;
    if (currentRevision !== revision) {
      return panel(userId, { ...board, error: "Счёт уже обновился. Вот свежая карточка." }, stage, messageId);
    }
    const back = [button("← К матчу", stage, "open", revision)];
    if (action === "game") return panel(userId, board, stage, messageId);
    const edit = action.match(/^edit(\d{0,2})$/);
    if (edit && match?.status === "live") {
      const first = Number(edit[1]) * editPageSize;
      const page = match.sets.slice(first, first + editPageSize);
      const navigation = [];
      if (first > 0) navigation.push(button("← Предыдущие", stage, "edit" + (Number(edit[1]) - 1), revision));
      if (first + editPageSize < match.sets.length) navigation.push(button("Следующие →", stage, "edit" + (Number(edit[1]) + 1), revision));
      return card(userId, "Какой завершённый сет исправить?", [
        ...page.map((_, index) => [button(setDetail(match, first + index), stage, "input" + (first + index + 1), revision)]),
        ...(navigation.length ? [navigation] : []),
        back,
      ], messageId);
    }
    const input = action.match(/^input(\d{1,3})$/);
    if (input && match?.status === "live") {
      const index = Number(input[1]);
      const number = index || match.active?.number;
      if (index === manualIndex || (number && (index === 0 || index <= match.sets.length))) {
        const example = index === manualIndex ? "2:1" : "7:5";
        return telegram("sendMessage", {
          chat_id: userId,
          text: (index === manualIndex ? "Счёт по сетам" : setLabel(number!)) + " · " + match.one + " — " + match.two + "\nВведите "
            + (index === manualIndex ? "выигранные сеты" : "геймы") + " в порядке пар, например " + example + ".\n#" + (cup ? "kc" : "kd") + ":" + stage + ":" + index + ":" + revision,
          reply_markup: { force_reply: true, input_field_placeholder: example },
        });
      }
    }
    if (action === "setreview" && match?.active) {
      const active = match.active;
      if (active.one === active.two) return panel(userId, { ...board, error: "Счёт геймов равный. Измените счёт или начислите сет победившей паре кнопкой «+1 сет»." }, stage, messageId);
      const winner = active.one > active.two ? match.one : match.two;
      return card(userId, setLabel(active.number) + " · " + active.one + ":" + active.two + "\nВыиграли: " + winner, [
        [button("Подтвердить счёт сета", stage, "set", revision)],
        back,
      ], messageId);
    }
    if (action === "review" && match?.status === "live") {
      const active = match.active;
      if (active && (active.one || active.two)) {
        const choices: Button[][] = [];
        const newOne = match.sets_one + Number(active.one > active.two);
        const newTwo = match.sets_two + Number(active.two > active.one);
        if (active.one !== active.two && newOne !== newTwo) {
          choices.push([button("Учесть текущий сет · " + newOne + ":" + newTwo, stage, "finishwithset", revision)]);
        }
        if (match.sets_one !== match.sets_two) {
          choices.push([button("Только завершённые сеты · " + setScore(match), stage, "finishsets", revision)]);
        }
        if (choices.length) return card(userId, ["Завершить матч", ...matchLines(match), "Выберите итоговый счёт по сетам."].join("\n"), [...choices, back], messageId);
      }
      if (match.sets_one === match.sets_two) return panel(userId, { ...board, error: "Для завершения матча одна пара должна вести по сетам. Добавьте решающий сет." }, stage, messageId);
      const winner = match.sets_one > match.sets_two ? match.one : match.two;
      return card(userId, [stageLabel(stage) + " · Итог", ...matchLines(match), "Победитель: " + winner].join("\n"), [
        [button("Подтвердить итог матча", stage, "finish", revision)],
        back,
      ], messageId);
    }
    if (action === "qualifiers" && stage === "g" && match?.winner && !board.final_match) {
      const runnerUp = match.winner === match.one ? match.two : match.one;
      return card(userId, ["Группа A завершена", "1. " + match.winner, "2. " + runnerUp, "",
        "Обе пары выходят в финал."].join("\n"), [
        [button("Подтвердить состав финала", stage, "advance", revision)],
        [button("← К матчам", stage, "home", revision)],
      ], messageId);
    }
    if (action === "qualifiers" && cup && board.draw_ready) {
      const games = cupGroups.map(slot => matchFor(board, slot)).filter(game => game != null);
      const main = games.map(game => game.winner).join(" · ");
      const basement = games.map(game => game.winner === game.one ? game.two : game.one).join(" · ");
      return card(userId, ["Групповой этап завершён", "", "Основная сетка", main,
        "", "Короли подвала", basement, "", "В каждой сетке — полуфиналы и финал."].join("\n"), [
        [button("Подтвердить обе сетки", stage, "advance", revision)],
        [button("← К матчам", stage, "home", revision)],
      ], messageId);
    }
    const manual = action.match(/^s(\d{1,3})x(\d{1,2})x(\d{1,2})$/);
    const writeAction = manual ? Number(manual[1]) === manualIndex ? "setsscore" : manual[1] === "0" ? "score" : "edit" + manual[1] : action;
    const saved = await request(userId, writeAction, {
      p_stage: stage, p_revision: revision,
      ...(manual ? { p_one: Number(manual[2]), p_two: Number(manual[3]) } : {}),
    });
    const next = !saved.error && action === "advance" ? (cup ? undefined : "f")
      : !saved.error && !isGroup(stage) && action.startsWith("finish") ? undefined : stage;
    return panel(userId, saved, next, messageId);
  }

  async function textReply(userId: number, message: Message, text: string) {
    const original = message.reply_to_message;
    const context = original?.text?.match(cup ? /\n#kc:([abcdmnpxyk]):(\d{1,3}):(\d{1,10})$/ : /\n#kd:([gf]):(\d{1,3}):(\d{1,10})$/);
    if (!context || original?.from?.id !== await getBotId()) return false;
    const stage = context[1] as Stage;
    const index = Number(context[2]);
    const board = await request(userId, "view");
    const match = matchFor(board, stage);
    if (board.revision === undefined || (match?.revision ?? board.revision) !== Number(context[3]) || match?.status !== "live") {
      await panel(userId, { ...board, error: board.error ?? "Счёт уже обновился. Откройте свежую карточку." }, stage);
      return true;
    }
    const number = index || match.active?.number;
    const recorded = index === manualIndex ? [match.sets_one, match.sets_two]
      : index ? match.sets[index - 1]?.slice(0, 2) : match.active && [match.active.one, match.active.two];
    if (!number || !recorded) return false;
    const values = text.match(/^(\d{1,2})\s*[:–-]\s*(\d{1,2})$/);
    if (!values) {
      await reply(userId, "Введите счёт как два числа через двоеточие в ответ на запрос бота.");
      return true;
    }
    await card(userId, (index === manualIndex ? "Счёт по сетам" : setLabel(number)) + " · " + match.one + " — " + match.two
      + "\nИзменить счёт с " + recorded.join(":") + " на " + values[1] + ":" + values[2] + "?", [
      [button("Сохранить счёт", stage, "s" + index + "x" + values[1] + "x" + values[2], match.revision ?? board.revision)],
      [button("← К матчу", stage, "open", match.revision ?? board.revision)],
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
