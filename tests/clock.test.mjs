// The clock must keep pushing while the frame is silent. Chrome slows the page timers of a
// silent hidden frame to about once a second; a worker's timer keeps its pace.
import { test } from "node:test";
import assert from "node:assert/strict";

const posted = [];
const handlers = [];
globalThis.window = {
  parent: { postMessage: (msg) => posted.push(msg) },
  addEventListener: (type, fn) => { if (type === "message") handlers.push(fn); },
};
globalThis.document = { referrer: "http://127.0.0.1:7439/embed.html" };
const workers = [];
globalThis.Worker = class {
  constructor(url) { this.url = url; this.terminated = false; workers.push(this); }
  terminate() { this.terminated = true; }
};
const pageTimers = [];
globalThis.setInterval = (fn, ms) => { pageTimers.push(ms); return { unref() {} }; };

const frame = await import("../frame.js");
let seconds = 1;
frame.__setEngineFactoryForTests(async () => ({
  audioContext: { sampleRate: 48000, destination: { maxChannelCount: 2 } },
  async loadSynthDefs() {}, on() {}, off() {},
  createOscChannel: () => ({ now: () => seconds++ }),
}));

const boot = async (id) => {
  for (const h of handlers) await h({ origin: "http://127.0.0.1:7439", source: globalThis.window.parent, data: { kind: "boot", id, names: [], epoch: id } });
};
const clocks = () => posted.filter((m) => m.kind === "clock").map((m) => m.seconds);

test("a worker's 100 ms timer drives the clock, not the page's", async () => {
  await boot(1);
  assert.equal(workers.length, 1);
  assert.match(await (await fetch(workers[0].url)).text(), /setInterval\(.*100\)/);
  assert.deepEqual(pageTimers, []);
  posted.length = 0;
  workers[0].onmessage();
  workers[0].onmessage();
  assert.equal(clocks().length, 2);
  assert.ok(clocks()[1] > clocks()[0]);
});

test("a new boot stops the previous clock worker", async () => {
  await boot(2);
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal(workers[1].terminated, false);
});
