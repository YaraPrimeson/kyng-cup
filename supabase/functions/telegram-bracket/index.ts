const ADMIN_TELEGRAM_ID = 169658777;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number };
    from?: { id?: number };
    text?: string;
  };
};

type Tournament = { id: string; slug: string; name: string; status: string };
type Pair = { id: string; name: string };
type Match = {
  id: string;
  round: number;
  position: number;
  status: string;
  pair_one_id: string | null;
  pair_two_id: string | null;
  pair_one_sets: number[];
  pair_two_sets: number[];
};

type DenoRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const deno = (globalThis as unknown as { Deno: DenoRuntime }).Deno;
const botToken = deno.env.get("TELEGRAM_BOT_TOKEN");
const webhookSecret = deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const supabaseUrl = deno.env.get("SUPABASE_URL");
const serviceRoleKey = deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const helpText = [
  "Управление сеткой KYNG CUP",
  "",
  "/tournaments — активные турниры",
  "/matches <slug> — матчи турнира",
  "/result <slug> <раунд> <матч> <1|2> <счёт>",
  "/reset <slug> <раунд> <матч>",
  "",
  "Пример:",
  "/result vienna-2026 1 3 1 6-4,3-6,10-8",
  "",
  "1 или 2 — победившая пара в карточке матча.",
].join("\n");

function jsonResponse(status = 200) {
  return new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function telegram(method: string, payload: Record<string, unknown>) {
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Telegram API returned ${response.status}`);
}

async function reply(chatId: number, text: string) {
  await telegram("sendMessage", { chat_id: chatId, text });
}

async function supabase(path: string, init?: RequestInit) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase server credentials are not configured");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    const message = body ? JSON.parse(body).message ?? body : `Supabase returned ${response.status}`;
    throw new Error(String(message));
  }
  return body ? JSON.parse(body) : null;
}

async function findTournament(slug: string) {
  const rows = await supabase(`tournaments?select=id,slug,name,status&slug=eq.${encodeURIComponent(slug)}&limit=1`) as Tournament[];
  return rows[0] ?? null;
}

async function findMatch(tournamentId: string, round: number, position: number) {
  const params = new URLSearchParams({
    select: "id,round,position,status,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets",
    tournament_id: `eq.${tournamentId}`,
    round: `eq.${round}`,
    position: `eq.${position}`,
    limit: "1",
  });
  const rows = await supabase(`matches?${params}`) as Match[];
  return rows[0] ?? null;
}

async function pairNames(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await supabase(`pairs?select=id,name&id=in.(${ids.join(",")})`) as Pair[];
  return new Map(rows.map((pair) => [pair.id, pair.name]));
}

function parsePositiveInteger(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const result = Number(value);
  return result > 0 ? result : null;
}

function parseScore(value: string | undefined, winnerSlot: number) {
  if (!value) return null;
  const sets = value.split(",").map((set) => set.trim()).filter(Boolean);
  if (!sets.length || sets.length > 5) return null;
  const pairOne: number[] = [];
  const pairTwo: number[] = [];
  let pairOneWins = 0;
  let pairTwoWins = 0;
  for (const set of sets) {
    const match = set.match(/^(\d{1,2})[-:](\d{1,2})$/);
    if (!match) return null;
    const one = Number(match[1]);
    const two = Number(match[2]);
    if (one === two) return null;
    pairOne.push(one);
    pairTwo.push(two);
    if (one > two) pairOneWins += 1;
    else pairTwoWins += 1;
  }
  if ((winnerSlot === 1 && pairOneWins <= pairTwoWins) || (winnerSlot === 2 && pairTwoWins <= pairOneWins)) return null;
  return { pairOne, pairTwo };
}

async function listTournaments(chatId: number) {
  const rows = await supabase("tournaments?select=id,slug,name,status&status=in.(published,live)&order=starts_at.desc.nullslast") as Tournament[];
  const text = rows.length
    ? ["Активные турниры:", ...rows.map((item) => `• ${item.name} — ${item.slug} (${item.status})`)].join("\n")
    : "Опубликованных или активных турниров нет.";
  await reply(chatId, text);
}

async function listMatches(chatId: number, slug: string | undefined) {
  if (!slug) {
    await reply(chatId, "Укажи slug турнира: /matches <slug>");
    return;
  }
  const tournament = await findTournament(slug);
  if (!tournament) throw new Error("Турнир не найден");
  const params = new URLSearchParams({
    select: "id,round,position,status,pair_one_id,pair_two_id,pair_one_sets,pair_two_sets",
    tournament_id: `eq.${tournament.id}`,
    order: "round.asc,position.asc",
  });
  const matches = await supabase(`matches?${params}`) as Match[];
  const ids = [...new Set(matches.flatMap((match) => [match.pair_one_id, match.pair_two_id]).filter((id): id is string => Boolean(id)))];
  const names = await pairNames(ids);
  const lines = matches.map((match) => {
    const first = match.pair_one_id ? names.get(match.pair_one_id) ?? "Пара 1" : "ожидается";
    const second = match.pair_two_id ? names.get(match.pair_two_id) ?? "Пара 2" : "ожидается";
    const score = match.pair_one_sets.length ? ` ${match.pair_one_sets.map((set, index) => `${set}-${match.pair_two_sets[index]}`).join(",")}` : "";
    return `R${match.round} M${match.position}: ${first} — ${second} [${match.status}]${score}`;
  });
  await reply(chatId, [`${tournament.name}:`, ...lines].join("\n").slice(0, 4000));
}

async function recordResult(chatId: number, args: string[]) {
  const [slug, roundValue, positionValue, winnerValue, scoreValue] = args;
  const round = parsePositiveInteger(roundValue);
  const position = parsePositiveInteger(positionValue);
  const winnerSlot = Number(winnerValue);
  const score = parseScore(scoreValue, winnerSlot);
  if (!slug || !round || !position || ![1, 2].includes(winnerSlot) || !score) {
    await reply(chatId, "Формат: /result <slug> <раунд> <матч> <1|2> <счёт>\nПример: /result vienna-2026 1 3 1 6-4,3-6,10-8");
    return;
  }
  const tournament = await findTournament(slug);
  if (!tournament) throw new Error("Турнир не найден");
  const match = await findMatch(tournament.id, round, position);
  if (!match) throw new Error("Матч не найден");
  const winnerId = winnerSlot === 1 ? match.pair_one_id : match.pair_two_id;
  if (!winnerId) throw new Error("В выбранной позиции ещё нет пары");
  await supabase("rpc/telegram_record_match_result", {
    method: "POST",
    body: JSON.stringify({
      p_telegram_user_id: ADMIN_TELEGRAM_ID,
      p_match_id: match.id,
      p_pair_one_sets: score.pairOne,
      p_pair_two_sets: score.pairTwo,
      p_winner_id: winnerId,
    }),
  });
  await reply(chatId, `Готово: ${tournament.name}, раунд ${round}, матч ${position}. Сетка обновлена.`);
}

async function resetResult(chatId: number, args: string[]) {
  const [slug, roundValue, positionValue] = args;
  const round = parsePositiveInteger(roundValue);
  const position = parsePositiveInteger(positionValue);
  if (!slug || !round || !position) {
    await reply(chatId, "Формат: /reset <slug> <раунд> <матч>");
    return;
  }
  const tournament = await findTournament(slug);
  if (!tournament) throw new Error("Турнир не найден");
  const match = await findMatch(tournament.id, round, position);
  if (!match) throw new Error("Матч не найден");
  await supabase("rpc/telegram_reset_match_result", {
    method: "POST",
    body: JSON.stringify({ p_telegram_user_id: ADMIN_TELEGRAM_ID, p_match_id: match.id }),
  });
  await reply(chatId, `Результат сброшен: ${tournament.name}, раунд ${round}, матч ${position}.`);
}

async function handleUpdate(update: TelegramUpdate) {
  const userId = update.message?.from?.id;
  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim();
  if (userId !== ADMIN_TELEGRAM_ID || !chatId || !text) return;

  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.toLowerCase().split("@")[0];
  try {
    if (command === "/start" || command === "/help") await reply(chatId, helpText);
    else if (command === "/tournaments") await listTournaments(chatId);
    else if (command === "/matches") await listMatches(chatId, args[0]);
    else if (command === "/result") await recordResult(chatId, args);
    else if (command === "/reset") await resetResult(chatId, args);
    else await reply(chatId, `Неизвестная команда.\n\n${helpText}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    await reply(chatId, `Не удалось изменить сетку: ${message}`);
  }
}

deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(405);
  if (!webhookSecret || request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) return jsonResponse(401);
  try {
    const update = await request.json() as TelegramUpdate;
    await handleUpdate(update);
    return jsonResponse();
  } catch (error) {
    console.error(error);
    return jsonResponse(500);
  }
});
