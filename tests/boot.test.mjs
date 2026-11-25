import { test } from "node:test";
import assert from "node:assert/strict";

// Fake browser surface frame.js touches at import and boot time.
const posted = [];
const messageHandlers = [];
globalThis.window = {
  parent: { postMessage: (msg, origin) => posted.push([msg, origin]) },
  addEventListener: (type, fn) => { if (type === "message") messageHandlers.push(fn); },
};
globalThis.document = { referrer: "http://127.0.0.1:7439/embed.html" };
globalThis.location = { origin: "http://127.0.0.1:7441" };

const frame = await import("../frame.js");

function fakeEngine({ failOn } = {}) {
  return {
    audioContext: { sampleRate: 48000, baseLatency: 0.01, outputLatency: 0.02, destination: { maxChannelCount: 2 } },
    async init() {},
    async loadSynthDefs(names) { if (failOn && names.includes(failOn)) throw new Error(`missing synthdef ${failOn}`); this.loaded = names; },
    async loadSynthDef() {},
    on() {}, off() {},
    sendOSC() {},
    async purge() {},
    async allocSample() { return true; },
    createOscChannel() { return { now: () => 1.5 }; },
  };
}

async function request(data) {
  const before = posted.length;
  for (const handler of messageHandlers) await handler({ origin: "http://127.0.0.1:7439", source: globalThis.window.parent, data });
  return posted.slice(before).map(([m]) => m);
}

test("boot loads names and replies with info", async () => {
  frame.__setEngineFactoryForTests(async () => fakeEngine());
  const replies = await request({ kind: "boot", id: 1, names: ["beep"], epoch: 7 });
  const reply = replies.find((m) => m.kind === "boot");
  assert.equal(reply.ok, true);
  assert.equal(reply.sampleRate, 48000);
  assert.equal(reply.maxChannelCount, 2);
});

test("boot with an unknown name fails naming it, no partial ready", async () => {
  frame.__setEngineFactoryForTests(async () => fakeEngine({ failOn: "nope" }));
  const replies = await request({ kind: "boot", id: 2, names: ["beep", "nope"], epoch: 7 });
  const reply = replies.find((m) => m.kind === "boot");
  assert.equal(reply.ok, false);
  assert.match(reply.error, /boot-failed:.*nope/);
});

test("info returns four numbers", async () => {
  frame.__setEngineFactoryForTests(async () => fakeEngine());
  await request({ kind: "boot", id: 30, names: ["beep"], epoch: 7 });
  const replies = await request({ kind: "info", id: 3 });
  const reply = replies.find((m) => m.kind === "info");
  assert.deepEqual([reply.sampleRate, reply.baseLatencyMs, reply.outputLatencyMs, reply.maxChannelCount], [48000, 10, 20, 2]);
});
