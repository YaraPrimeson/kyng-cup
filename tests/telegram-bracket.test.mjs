import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

const source = await readFile(new URL("../supabase/functions/telegram-bracket/index.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", target: "es2022", format: "iife" });

function webhook() {
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
      if (url === "https://database.test/rest/v1/rpc/telegram_bot_secrets") return Response.json([{ bot_token: "test-bot", webhook_secret: "test-webhook" }]);
      if (url === "https://api.telegram.org/bottest-bot/sendMessage") {
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
