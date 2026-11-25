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

let sinkId = "default";
let refuseDevice = true;
const probeSinks = [];
globalThis.AudioContext = class {
  constructor() { this.destination = { maxChannelCount: 6 }; probeSinks.push(this); }
  async setSinkId(id) { this.sinkId = id; }
  async close() {}
};

const engine = {
  audioContext: {
    sampleRate: 48000, baseLatency: 0, outputLatency: 0,
    destination: { maxChannelCount: 2 },
    async setSinkId(id) { if (refuseDevice) throw new Error("device refused by browser"); sinkId = id; },
    get sinkId() { return sinkId; },
  },
  async init() {}, async loadSynthDefs() {}, on() {}, off() {},
  createOscChannel() { return { now: () => 0 }; },
};

const frame = await import("../frame.js");
frame.__setEngineFactoryForTests(async () => engine);

async function request(data) {
  const before = posted.length;
  for (const h of handlers) await h({ origin: "http://127.0.0.1:7439", source: globalThis.window.parent, data });
  return posted.slice(before).map(([m]) => m);
}

test("a refused device keeps the previous device", async () => {
  await request({ kind: "boot", id: 1, names: [], epoch: 1 });
  const replies = await request({ kind: "selectDevice", id: 2, deviceId: "usb" });
  const reply = replies.find((m) => m.kind === "selectDevice");
  assert.equal(reply.ok, false);
  assert.match(reply.error, /device refused/);
  assert.equal(sinkId, "default");
});

test("probe reports the true channel count and routes nothing", async () => {
  const replies = await request({ kind: "cueProbe", id: 3 });
  const reply = replies.find((m) => m.kind === "cueProbe");
  assert.equal(reply.ok, true);
  assert.equal(reply.maxChannelCount, 6);
  assert.equal(reply.fourOutputDeliverable, true);
});

test("the probe runs on the selected device, not a default context", async () => {
  refuseDevice = false;
  const selected = await request({ kind: "selectDevice", id: 4, deviceId: "usb-interface" });
  assert.equal(selected.find((m) => m.kind === "selectDevice").ok, true);
  probeSinks.length = 0;
  const replies = await request({ kind: "cueProbe", id: 5 });
  assert.equal(replies.find((m) => m.kind === "cueProbe").ok, true);
  assert.equal(probeSinks.at(-1).sinkId, "usb-interface");
});
