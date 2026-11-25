import { test } from "node:test";
import assert from "node:assert/strict";

const posted = [];
const handlers = [];
globalThis.window = {
  parent: { postMessage: (msg, origin) => posted.push([msg, origin]) },
  addEventListener: (type, fn) => { if (type === "message") handlers.push(fn); },
};
globalThis.document = { referrer: "http://127.0.0.1:7439/embed.html" };
globalThis.location = { origin: "http://127.0.0.1:7441" };

const frame = await import("../frame.js");

let inHandler = null;
let purgeAcked = false;
const engine = {
  audioContext: { sampleRate: 48000, baseLatency: 0, outputLatency: 0, destination: { maxChannelCount: 2 } },
  async init() {},
  async loadSynthDefs() {},
  async loadSynthDef(bytes) { this.byBytes = bytes; },
  on(event, fn) { if (event === "in") inHandler = fn; },
  off() {},
  sendOSC(packet) { this.lastOsc = packet; },
  async purge() { purgeAcked = true; },
  async allocSample(id, frames, channels) { if (frames < 0) throw new Error("invalid frames"); this.alloc = [id, frames, channels]; return true; },
  createOscChannel() { return { now: () => 2 }; },
};
frame.__setEngineFactoryForTests(async () => engine);

async function request(data) {
  const before = posted.length;
  for (const h of handlers) await h({ origin: "http://127.0.0.1:7439", source: globalThis.window.parent, data });
  return posted.slice(before).map(([m]) => m);
}

test("feedback is pushed tagged with the boot epoch", async () => {
  await request({ kind: "boot", id: 1, names: [], epoch: 42 });
  posted.length = 0;
  inHandler(["/synced", 3]);
  const feedback = posted.map(([m]) => m).filter((m) => m.kind === "feedback");
  assert.equal(feedback.length, 1);
  assert.equal(feedback[0].epoch, 42);
  assert.deepEqual(feedback[0].facts, [["/synced", 3]]);
  assert.equal(feedback[0].overflow, false);
});

test("purge replies only after the engine acknowledges", async () => {
  purgeAcked = false;
  const replies = await request({ kind: "purge", id: 2 });
  assert.equal(purgeAcked, true);
  assert.equal(replies.find((m) => m.kind === "purge").ok, true);
});

test("allocSample allocates before any fill and returns the engine error", async () => {
  const ok = await request({ kind: "allocSample", id: 3, bufferId: 5, frames: 100, channels: 2 });
  assert.equal(ok.find((m) => m.kind === "allocSample").ok, true);
  assert.deepEqual(engine.alloc, [5, 100, 2]);
  const bad = await request({ kind: "allocSample", id: 4, bufferId: 5, frames: -1, channels: 2 });
  const badReply = bad.find((m) => m.kind === "allocSample");
  assert.equal(badReply.ok, false);
  assert.match(badReply.error, /invalid frames/);
});

test("loadSynthDef loads bytes and a bare Uint8Array goes to the engine as OSC", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const replies = await request({ kind: "loadSynthDef", id: 5, name: "gl_test", bytes });
  assert.equal(replies.find((m) => m.kind === "loadSynthDef").ok, true);
  assert.deepEqual([...engine.byBytes], [1, 2, 3]);
  const packet = new Uint8Array([9, 9]);
  for (const h of handlers) await h({ origin: "http://127.0.0.1:7439", source: globalThis.window.parent, data: packet });
  assert.deepEqual([...engine.lastOsc], [9, 9]);
});

test("the frame never overflows by total facts: it pushes each one and holds none", async () => {
  await request({ kind: "boot", id: 6, names: [], epoch: 43 });
  posted.length = 0;
  for (let i = 0; i < 5000; i++) inHandler(["/n_end", i]);
  const feedback = posted.map(([m]) => m).filter((m) => m.kind === "feedback");
  assert.equal(feedback.length, 5000);
  assert.ok(feedback.every((m) => m.overflow === false));
  assert.deepEqual(feedback.at(-1).facts, [["/n_end", 4999]]);
});
