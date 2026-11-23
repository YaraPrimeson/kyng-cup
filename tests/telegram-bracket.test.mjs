import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const functionDir = new URL("../supabase/functions/telegram-bracket/", import.meta.url);
const [entry, demo] = await Promise.all(["index.ts", "demo.ts"].map(file => readFile(new URL(file, functionDir), "utf8")));
const code = stripTypeScriptTypes([
  demo.replaceAll(/^export (?=type|function)/gm, ""),
  entry.replace(/^import .*"\.\/demo\.ts";\n/m, ""),
].join("\n"));

function webhook(demoControl) {
  let handler;
  const calls = [], replies = [];
  runInNewContext(code, {
    Request, Response, URLSearchParams, console,
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
        status: "live", one: "Pair one", two: "Pair two", score_one: 1, score_two: 0,
      },
    };
  });
  const from = { id: 123 };
  const chat = { id: 123, type: "private" };
  await bot.update({ message: { from, chat: { ...chat, type: "group" }, text: "/demo" } });
  assert.equal(calls.length, 0);
  await bot.update({ message: { from, chat, text: "/demo" } });
  assert.match(bot.replies.at(-1).text, /Группа A/);
  const tap = data => bot.update({ callback_query: { id: "callback", from, message: { chat, message_id: 5 }, data } });
  await tap("kd:g:plus1:2");
  assert.match(bot.replies.at(-1).text, /уже обновился/);
  assert.equal(calls.at(-1).p_action, "view");
  await tap("kd:g:input:3");
  const prompt = bot.replies.at(-1);
  assert.equal(prompt.reply_markup.force_reply, true);
  await bot.update({ message: { from, chat, text: "6:4", reply_to_message: { from: { id: 900 }, text: prompt.text } } });
  assert.equal(bot.replies.at(-1).reply_markup.inline_keyboard[0][0].callback_data, "kd:g:s64:3");
  assert.equal(calls.at(-1).p_action, "view");
  await tap("kd:g:s64:3");
  assert.deepEqual(calls.at(-1), { p_user_id: 123, p_action: "score", p_stage: "g", p_revision: 3, p_one: 6, p_two: 4 });
});
