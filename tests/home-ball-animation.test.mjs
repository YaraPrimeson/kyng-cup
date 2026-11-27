import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const html = readFileSync(new URL("../public/assets/kyng-ball.html", import.meta.url), "utf8");

function lifecycle() {
  const listeners = new Map();
  const pending = new Set();
  let counter = 0;
  let frameClock = -1;
  const parent = { postMessage() {} };
  const document = { hidden: false, addEventListener: (name, fn) => listeners.set(name, fn) };
  const context = vm.createContext({
    parent, document, location: { origin: "https://kyngcup.com" },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => { const id = ++counter; pending.add(id); return id; },
    cancelAnimationFrame: id => pending.delete(id),
    addEventListener: (name, fn) => listeners.set(name, fn),
    frame() {},
    scene: { traverse() {} },
    seam: { dispose() {} }, ink: { dispose() {} }, nz: { dispose() {} }, R: { dispose() {} },
    setClock(value) { frameClock = value; },
  });
  const start = html.indexOf("let visible=false,raf=0,disposed=false;");
  const end = html.indexOf("}catch(e)", start);
  assert.ok(start > 0 && end > start);
  vm.runInContext("let last=0,acc=0,cnt=0,drag=false;\n" + html.slice(start, end) +
    "\nfunction readClock(){setClock(last)}", context);
  const send = (visible, overrides = {}) => listeners.get("message")({
    source: parent, origin: "https://kyngcup.com",
    data: { type: "kyng-ball-visibility", visible }, ...overrides,
  });
  return { pending, send, listeners, document, context, clock: () => {
    vm.runInContext("readClock()", context);
    return frameClock;
  } };
}

test("offscreen ball has no scheduled frame; returning starts one loop with a fresh clock", () => {
  const l = lifecycle();
  assert.equal(l.pending.size, 0);
  l.send(true);
  assert.equal(l.pending.size, 1);
  assert.equal(l.clock(), 1000);
  l.send(true);
  assert.equal(l.pending.size, 1);
  l.send(false);
  assert.equal(l.pending.size, 0);
  l.send(true);
  assert.equal(l.pending.size, 1);
});

test("hidden tab cancels rendering and only resumes when the ball is visible", () => {
  const l = lifecycle();
  l.send(true);
  l.document.hidden = true;
  l.listeners.get("visibilitychange")();
  assert.equal(l.pending.size, 0);
  l.send(false);
  l.document.hidden = false;
  l.listeners.get("visibilitychange")();
  assert.equal(l.pending.size, 0);
  l.send(true);
  assert.equal(l.pending.size, 1);
});

test("unrelated windows cannot start the loop and disposed scenes cannot resume", () => {
  const l = lifecycle();
  l.send(true, { origin: "https://example.com" });
  l.send(true, { source: {} });
  assert.equal(l.pending.size, 0);
  l.send(true);
  l.listeners.get("pagehide")({ persisted: false });
  assert.equal(l.pending.size, 0);
  l.send(true);
  assert.equal(l.pending.size, 0);
});
