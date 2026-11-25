import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const functionDir = new URL("../supabase/functions/telegram-bracket/", import.meta.url);
const [entry, demo, organiser, groupStage] = await Promise.all(["index.ts", "demo.ts", "organiser.ts", "group-stage.ts"].map(file => readFile(new URL(file, functionDir), "utf8")));
const code = stripTypeScriptTypes([
  demo.replaceAll(/^export (?=type|function)/gm, ""),
  groupStage.replaceAll(/^export (?=type|function)/gm, ""),
  "\n{\n" + organiser.replaceAll(/^import .*;\n/gm, "").replace("export function telegramOrganiser", "globalThis.telegramOrganiser = function telegramOrganiser") + "\n}\n",
  entry.replaceAll(/^import .*;\n/gm, ""),
].join("\n"));

function webhook(demoControl, cupControl, organiserControl) {
  let handler;
  const calls = [], replies = [];
  runInNewContext(code, {
    Request, Response, URLSearchParams, console, crypto: globalThis.crypto,
    Deno: {
      env: { get: name => ({ SUPABASE_URL: "https://database.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key" })[name] },
      serve: value => { handler = value; },
    },
    fetch: async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url === "https://database.test/rest/v1/rpc/telegram_bot_secrets") return Response.json([{ bot_token: "900:test", webhook_secret: "test-webhook" }]);
      if (url === "https://database.test/rest/v1/rpc/telegram_demo_control" && demoControl) {
        return Response.json(demoControl(JSON.parse(init.body)));
      }
      if (url === "https://database.test/rest/v1/rpc/telegram_cup_control" && cupControl) {
        return Response.json(cupControl(JSON.parse(init.body)));
      }
      if (url === "https://database.test/rest/v1/rpc/telegram_organiser" && organiserControl) {
        return Response.json(organiserControl(JSON.parse(init.body)));
      }
      if (url.startsWith("https://api.telegram.org/bot900:test/")) {
        replies.push(JSON.parse(init.body));
        return Response.json({ ok: true });
      }
      if (url.startsWith("https://database.test/rest/v1/tournaments?")) return Response.json([{ id: "test-tournament", slug: "test-cup", name: "Test cup", status: "published" }]);
      if (url.startsWith("https://database.test/rest/v1/matches?")) return Response.json([]);
      throw new Error(`Unexpected network request: ${url}`);
    },
  });
  return {
    calls, replies,
    update: (body, secret = "test-webhook") => handler(new Request("https://bot.test", {
      method: "POST", headers: { "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify(body),
    })),
    send: (text, secret = "test-webhook") => handler(new Request("https://bot.test", {
      method: "POST", headers: { "x-telegram-bot-api-secret-token": secret },
      body: JSON.stringify({ message: { from: { id: 123 }, chat: { id: 456 }, text } }),
    })),
  };
}

for (const command of ["/result test-cup 1 1 1 6-4,6-2", "/reset test-cup 1 1", "/RESULT@KyngBot test-cup 1 1 1 6-4", "/RESET@KyngBot test-cup 1 1", "/result", "/reset"]) {
  test(`valid Telegram webhook cannot modify results: ${command}`, async () => {
    const bot = webhook();
    assert.equal((await bot.send(command)).status, 200);
    assert.equal(bot.replies.length, 1);
    assert.match(bot.replies[0].text, /временно отключено/);
    assert.deepEqual(bot.calls.filter(call => call.url.startsWith("https://database.test")), [
      { url: "https://database.test/rest/v1/rpc/telegram_bot_secrets", method: "POST" },
    ]);
  });
}

test("help advertises read-only commands and explains disabled editing", async () => {
  const bot = webhook();
  await bot.send("/help");
  assert.match(bot.replies[0].text, /\/tournaments/);
  assert.match(bot.replies[0].text, /\/matches/);
  assert.match(bot.replies[0].text, /временно отключено/);
  assert.doesNotMatch(bot.replies[0].text, /\/result|\/reset/);
});

test("tournament and match viewing still work", async () => {
  const bot = webhook();
  assert.equal((await bot.send("/tournaments")).status, 200);
  assert.match(bot.replies.at(-1).text, /Test cup/);
  assert.equal((await bot.send("/matches test-cup")).status, 200);
  assert.match(bot.replies.at(-1).text, /Test cup/);
  assert.ok(bot.calls.some(call => call.url.includes("/matches?")));
});

test("invalid webhook secret is rejected before command handling", async () => {
  const bot = webhook();
  assert.equal((await bot.send("/result test-cup 1 1 1 6-4", "wrong-secret")).status, 401);
  assert.equal(bot.replies.length, 0);
});

test("demo opens only in a private chat and stale buttons cannot change the score", async () => {
  const calls = [];
  const bot = webhook(action => {
    calls.push(action);
    return {
      revision: 3, tournament: "Demo", group_match: {
        status: "live", one: "Pair one", two: "Pair two", sets: [], sets_one: 0, sets_two: 0,
        active: { number: 1, kind: "short", one: 1, two: 0 },
      },
    };
  });
  const from = { id: 123 };
  const chat = { id: 123, type: "private" };
  await bot.update({ message: { from, chat: { ...chat, type: "group" }, text: "/start demo_test" } });
  assert.equal(calls.length, 0);
  await bot.update({ message: { from, chat, text: "/start demo_test" } });
  assert.match(bot.replies.at(-1).text, /Группа A/);
  const tap = data => bot.update({ callback_query: { id: "callback", from, message: { chat, message_id: 5 }, data } });
  await tap("kd:g:plus1:2");
  assert.match(bot.replies.at(-1).text, /уже обновился/);
  assert.equal(calls.at(-1).p_action, "view");
  await tap("kd:g:input0:3");
  const prompt = bot.replies.at(-1);
  assert.equal(prompt.reply_markup.force_reply, true);
  await bot.update({ message: { from, chat, text: "6:4", reply_to_message: { from: { id: 900 }, text: prompt.text } } });
  assert.equal(bot.replies.at(-1).reply_markup.inline_keyboard[0][0].callback_data, "kd:g:s0x6x4:3");
  assert.equal(calls.at(-1).p_action, "view");
  await tap("kd:g:s0x6x4:3");
  assert.deepEqual(calls.at(-1), { p_user_id: 123, p_action: "score", p_stage: "g", p_revision: 3, p_one: 6, p_two: 4 });
});

test("a game, set and match are confirmed separately before qualification", async () => {
  const match = { status: "live", one: "Pair one", two: "Pair two", sets: [], sets_one: 0, sets_two: 0,
    active: { number: 1, kind: "short", one: 2, two: 1 } };
  const board = { revision: 3, group_match: match };
  const bot = webhook(request => {
    if (request.p_action === "plus1") {
      match.active.one += 1;
      board.revision += 1;
    }
    if (request.p_action === "set") {
      match.sets = [[match.active.one, match.active.two]];
      match.sets_one = 1;
      match.active = null;
      board.revision += 1;
    }
    if (request.p_action === "finish") {
      match.status = "completed";
      match.winner = match.one;
      board.revision += 1;
    }
    return board;
  });
  const tap = data => bot.update({ callback_query: { id: "callback", from: { id: 123 },
    message: { chat: { id: 123, type: "private" }, message_id: 5 }, data } });
  const buttons = () => bot.replies.at(-1).reply_markup.inline_keyboard.flat();
  await tap("kd:g:open:3");
  assert.deepEqual(buttons().slice(0, 2).map(({text, callback_data}) => [text, callback_data]), [
    ["+1 гейм · Pair one", "kd:g:plus1:3"],
    ["+1 гейм · Pair two", "kd:g:plus2:3"],
  ]);
  assert.ok(buttons().some(button => button.text === "Завершить матч"));
  await tap("kd:g:review:3");
  assert.match(bot.replies.at(-1).text, /Выберите итоговый счёт по сетам/);
  assert.equal(buttons()[0].callback_data, "kd:g:finishwithset:3");
  await tap("kd:g:plus1:3");
  assert.match(bot.replies.at(-1).text, /3:1/);
  assert.match(bot.replies.at(-1).text, /Сеты: 0:0/);
  assert.ok(buttons().some(button => button.callback_data?.includes(":plus")));
  assert.ok(buttons().some(button => button.text === "Завершить сет"));
  await tap("kd:g:setreview:4");
  assert.equal(buttons()[0].callback_data, "kd:g:set:4");
  await tap("kd:g:set:4");
  assert.match(bot.replies.at(-1).text, /Сеты: 1:0/);
  await tap("kd:g:review:5");
  assert.equal(buttons()[0].callback_data, "kd:g:finish:5");
  await tap("kd:g:finish:5");
  assert.ok(buttons().some(button => button.text === "Посмотреть состав финала"));
});

test("any completed set can be selected for correction", async () => {
  const board = { revision: 9, final_match: { status: "live", one: "Pair one", two: "Pair two",
    sets: [[6, 4], [3, 6]], sets_one: 1, sets_two: 1, active: { number: 3, kind: "super", one: 8, two: 8 } } };
  const bot = webhook(() => board);
  const tap = data => bot.update({ callback_query: { id: "callback", from: { id: 123 },
    message: { chat: { id: 123, type: "private" }, message_id: 5 }, data } });
  await tap("kd:f:open:9");
  assert.match(bot.replies.at(-1).text, /Сеты: 1:1/);
  assert.match(bot.replies.at(-1).text, /Сет 3 · геймы 8:8/);
  await tap("kd:f:edit:9");
  assert.equal(bot.replies.at(-1).reply_markup.inline_keyboard[0][0].callback_data, "kd:f:input1:9");
});

test("a set may finish at 7:5, and an equal score can be resolved manually", async () => {
  const active = { number: 1, one: 7, two: 5 };
  const board = { revision: 12, final_match: { status: "live", one: "Север", two: "Юг",
    sets: [], sets_one: 0, sets_two: 0, active } };
  const bot = webhook(() => board);
  const chat = { id: 123, type: "private" };
  const tap = data => bot.update({ callback_query: { id: "tap", from: { id: 123 }, message: { chat, message_id: 1 }, data } });
  const buttons = () => bot.replies.at(-1).reply_markup.inline_keyboard.flat();
  await tap("kd:f:open:12");
  assert.equal(buttons()[0].callback_data, "kd:f:plus1:12");
  assert.equal(buttons()[1].callback_data, "kd:f:plus2:12");
  assert.ok(buttons().some(button => button.callback_data === "kd:f:setreview:12"));
  await tap("kd:f:setreview:12");
  assert.match(bot.replies.at(-1).text, /7:5[\s\S]*Выиграли: Север/);
  assert.equal(buttons()[0].callback_data, "kd:f:set:12");
  active.two = 7;
  await tap("kd:f:setreview:12");
  assert.match(bot.replies.at(-1).text, /Счёт геймов равный/);
});

test("cup supports both set buttons and manual aggregate set entry", async () => {
  const match = { status: "live", one: "Север", two: "Юг", revision: 3, court: "Корт 1",
    sets: [[1, 0, true]], sets_one: 1, sets_two: 0, active: { number: 2, one: 0, two: 0 } };
  const calls = [];
  const bot = webhook(undefined, body => {
    calls.push(body);
    return { revision: 3, matches: { a: match } };
  });
  const chat = { id: 123, type: "private" };
  const from = { id: 123 };
  const tap = data => bot.update({ callback_query: { id: "tap", from, message: { chat, message_id: 1 }, data } });
  await tap("kc:a:open:3");
  assert.match(bot.replies.at(-1).text, /Север · без счёта по геймам/);
  for (const action of ["setplus1", "setplus2", "setminus1", "setminus2"]) {
    assert.ok(bot.replies.at(-1).reply_markup.inline_keyboard.flat().some(button => button.callback_data === "kc:a:" + action + ":3"));
    await tap("kc:a:" + action + ":3");
    assert.equal(calls.at(-1).p_action, action);
  }
  await tap("kc:a:input999:3");
  const prompt = bot.replies.at(-1);
  await bot.update({ message: { from, chat, text: "2:1", reply_to_message: { from: { id: 900 }, text: prompt.text } } });
  const save = bot.replies.at(-1).reply_markup.inline_keyboard[0][0].callback_data;
  await tap(save);
  assert.deepEqual(calls.at(-1), { p_user_id: 123, p_action: "setsscore", p_stage: "a", p_revision: 3, p_one: 2, p_two: 1 });
});

test("eight-pair dashboard edits each court with its own revision and previews both draws", async () => {
  const calls = [];
  const state = { revision: 10, draw_ready: false, matches: {
    a: { revision: 7, court: "Корт 1", status: "completed", one: "Север", two: "Юг", winner: "Север",
      sets: [[3, 1]], sets_one: 1, sets_two: 0, active: null },
    b: { revision: 3, court: "Корт 2", status: "live", one: "Восток", two: "Запад",
      sets: [[2, 3]], sets_one: 0, sets_two: 1, active: null },
    c: { revision: 4, court: "Корт 3", status: "completed", one: "Альфа", two: "Бета", winner: "Альфа",
      sets: [[3, 0]], sets_one: 1, sets_two: 0, active: null },
    d: { revision: 6, court: "Корт 4", status: "completed", one: "Омега", two: "Сигма", winner: "Сигма",
      sets: [[2, 3]], sets_one: 0, sets_two: 1, active: null },
  } };
  const bot = webhook(undefined, request => {
    calls.push(request);
    if (request.p_action === "finish") {
      state.matches.b.status = "completed";
      state.matches.b.winner = "Запад";
      state.matches.b.revision = 4;
      state.revision = 11;
      state.draw_ready = true;
    }
    return state;
  });
  const chat = { id: 123, type: "private" };
  const from = { id: 123 };
  await bot.update({ message: { from, chat, text: "/cup" } });
  assert.match(bot.replies.at(-1).text, /Корт 1[\s\S]*Корт 2[\s\S]*Корт 3[\s\S]*Корт 4/);
  const tap = data => bot.update({ callback_query: { id: "tap", from, message: { chat, message_id: 1 }, data } });
  await tap("kc:b:review:3");
  assert.match(bot.replies.at(-1).text, /Победитель: Запад/);
  await tap("kc:b:finish:3");
  assert.equal(calls.at(-1).p_stage, "b");
  assert.equal(calls.at(-1).p_revision, 3);
  await tap("kc:b:qualifiers:11");
  assert.match(bot.replies.at(-1).text, /Основная сетка\nСевер · Запад · Альфа · Сигма[\s\S]*Короли подвала\nЮг · Восток · Бета · Омега/);
});

test("organiser starts in private chat, links through the website and opens a three-pair group", async () => {
  const id = 123;
  let linked = false;
  let panel;
  let pendingLink;
  const group = {
    id: "group", code: "A", qualify_count: 1,
    members: ["a","b","c"].map((pair_id, position) => ({ pair_id, position, group_id: "group" })),
  };
  const tournament = { id: "tournament", name: "Three-pair groups", status: "published" };
  const matches = [["a","b"],["a","c"],["b","c"]].map(([pair_one_id,pair_two_id], index) => ({
    id: "match"+index, group_id: group.id, position:index+1, status:"scheduled", court:"Court 1",
    pair_one_id, pair_two_id, pair_one_sets:[], pair_two_sets:[], winner_id:null, updated_at:"v1",
    play:{one:0,two:0,sets:[]},
  }));
  const bot = webhook(undefined, undefined, ({ p_telegram_id, p_action, p_payload }) => {
    assert.equal(p_telegram_id, id);
    if (p_action === "link") {
      pendingLink = p_payload.code;
      return { linked, tournaments: [tournament] };
    }
    if (p_action === "save_panel") { panel = p_payload; return { ok:true }; }
    if (p_action === "button") {
      if (panel?.key !== p_payload.key) return { error:"Карточка устарела." };
      const command = panel.buttons[p_payload.index]; panel = undefined; return { command };
    }
    if (p_action === "board") return {
      tournament, matches, groups:[group],
      pairs: ["a","b","c"].map(id=>({id,name:id.toUpperCase()})),
    };
    assert.fail(p_action);
  });
  const start = () => bot.update({ message:{ from:{id,first_name:"Test"}, chat:{id,type:"private"}, text:"/start" } });
  await start();
  assert.match(pendingLink,/^[0-9a-f]{48}$/);
  assert.equal(bot.replies.at(-1).reply_markup.inline_keyboard[0][0].url,"https://kyngcup.com/admin/#telegram="+pendingLink);
  linked = true;
  await start();
  const tap = (data, chatType = "private") => bot.update({ callback_query:{ id:"click", from:{id}, message:{message_id:1,chat:{id,type:chatType}},data } });
  const button = () => bot.replies.at(-1).reply_markup.inline_keyboard.flat()[0].callback_data;
  const home = button();
  await tap(home,"group");
  assert.equal(bot.replies.at(-1).callback_query_id,"click");
  await tap(home);
  const groupButton = bot.replies.at(-1).reply_markup.inline_keyboard.flat().find(item=>item.text.includes("0/3"));
  assert.ok(groupButton);
  await tap(groupButton.callback_data);
  assert.match(bot.replies.at(-1).text,/3\. C/);
  assert.equal(bot.replies.at(-1).reply_markup.inline_keyboard.flat().filter(item=>item.text.includes(" — ")).length,3);
  await tap(groupButton.callback_data);
  assert.match(bot.replies.at(-1).text,/устарела/);
});
