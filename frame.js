// supersonic-frame: SuperSonic behind the FrameProtocol (protocol.md).
// The frame acts only on messages from the page that embedded it.

export const PROTOCOL_VERSION = 1;
const OUTPUT_BUS_CHANNELS = 2;

const embedded = window.parent !== window;
const embedderOrigin = document.referrer ? new URL(document.referrer).origin : null;

let sonic = null;
let engineFactory = null;
let sessionEpoch = null;
let clockTimer = null;

function post(message) {
  if (embedded && embedderOrigin) window.parent.postMessage(message, embedderOrigin);
}

function reply(kind, id, fields) {
  post({ kind, id, ...fields });
}

function infoFields() {
  const context = sonic.audioContext;
  return {
    sampleRate: context.sampleRate,
    baseLatencyMs: (context.baseLatency || 0) * 1000,
    outputLatencyMs: (context.outputLatency || 0) * 1000,
    maxChannelCount: context.destination.maxChannelCount,
  };
}

async function createEngine() {
  if (engineFactory) return engineFactory();
  const { SuperSonic } = await import("./supersonic/supersonic.js");
  const engine = new SuperSonic({
    baseURL: "supersonic/",
    coreBaseURL: "supersonic/core/",
    synthdefBaseURL: "supersonic/synthdefs/",
    scsynthOptions: { numOutputBusChannels: OUTPUT_BUS_CHANNELS },
  });
  await engine.init();
  return engine;
}

async function boot(message) {
  try {
    stopSession();
    const engine = await createEngine();
    await engine.loadSynthDefs(Array.from(message.names ?? []));
    sonic = engine;
    sessionEpoch = message.epoch ?? null;
    startSession();
    startClockPush();
    reply("boot", message.id, { ok: true, ...infoFields() });
  } catch (error) {
    sonic = null;
    reply("boot", message.id, { ok: false, error: `boot-failed:${error.message}` });
  }
}

// Epoch-scoped feedback, ported from Grooveloom's engine-host: raw decoded facts,
// at most FEEDBACK_LIMIT records held; beyond that the overflow flag is pushed once.
const FEEDBACK_LIMIT = 4096;
const RECORD_LIMIT_BYTES = 65536;
let feedbackCount = 0;
let overflowNotified = false;
let inHandler = null;

function startSession() {
  feedbackCount = 0;
  overflowNotified = false;
  if (!sonic) return;
  const captured = sessionEpoch;
  inHandler = (message) => {
    if (captured !== sessionEpoch) return;
    if (feedbackCount >= FEEDBACK_LIMIT) {
      if (!overflowNotified) { overflowNotified = true; post({ kind: "feedback", epoch: sessionEpoch, overflow: true, facts: [] }); }
      return;
    }
    feedbackCount++;
    post({ kind: "feedback", epoch: sessionEpoch, overflow: false, facts: [capRecord(message)] });
  };
  sonic.on("in", inHandler);
}

function stopSession() {
  if (sonic && inHandler) {
    try { sonic.off("in", inHandler); } catch { /* the engine is gone */ }
  }
  inHandler = null;
  sessionEpoch = null;
  feedbackCount = 0;
  overflowNotified = false;
}

function capRecord(message) {
  if (!Array.isArray(message) || message.length === 0 || typeof message[0] !== "string") return [];
  const record = [message[0]];
  for (let i = 1; i < message.length; i++) {
    const arg = message[i];
    record.push(typeof arg === "bigint" ? Number(arg) : ArrayBuffer.isView(arg) ? Array.from(arg) : arg);
    let text;
    try { text = JSON.stringify(record); } catch { return []; }
    if (text.length > RECORD_LIMIT_BYTES) { record.pop(); break; }
  }
  return record;
}

function startClockPush() {
  stopClockPush();
  if (!sonic || typeof sonic.createOscChannel !== "function") return;
  let channel = null;
  const push = () => {
    try {
      if (!sonic) return;
      channel ??= sonic.createOscChannel({ sourceId: 0 });
      const now = channel.now();
      if (typeof now === "number" && Number.isFinite(now)) post({ kind: "clock", seconds: now });
    } catch { /* a dead engine stops the clock; the embedder fails closed */ }
  };
  clockTimer = setInterval(push, 100);
  clockTimer.unref?.();
  push();
}

function stopClockPush() {
  if (clockTimer !== null) clearInterval(clockTimer);
  clockTimer = null;
}

async function handle(message) {
  switch (message.kind) {
    case "boot": return boot(message);
    case "info":
      if (!sonic) return reply("info", message.id, { ok: false, error: "boot-failed:engine is not booted" });
      return reply("info", message.id, { ok: true, ...infoFields() });
    case "loadSynthDef":
      if (!sonic) return reply("loadSynthDef", message.id, { ok: false, error: "engine is not booted" });
      try { await sonic.loadSynthDef(message.bytes); return reply("loadSynthDef", message.id, { ok: true }); }
      catch (error) { return reply("loadSynthDef", message.id, { ok: false, error: error.message }); }
    case "allocSample":
      if (!sonic) return reply("allocSample", message.id, { ok: false, error: "engine is not booted" });
      try { await sonic.allocSample(message.bufferId, message.frames, message.channels); return reply("allocSample", message.id, { ok: true }); }
      catch (error) { return reply("allocSample", message.id, { ok: false, error: error.message }); }
    case "purge":
      if (!sonic) return reply("purge", message.id, { ok: false, error: "engine is not booted" });
      try { await sonic.purge(); return reply("purge", message.id, { ok: true }); }
      catch (error) { return reply("purge", message.id, { ok: false, error: error.message }); }
    default:
      return reply(message.kind, message.id, { ok: false, error: `unknown control ${message.kind}` });
  }
}

window.addEventListener("message", (event) => {
  if (!embedded || event.origin !== embedderOrigin || event.source !== window.parent) return;
  const message = event.data;
  if (!message || typeof message.kind !== "string") return;
  if (message instanceof Uint8Array) return;
  return handle(message);
});

// OSC packets arrive as bare Uint8Array messages, distinct from control objects.
window.addEventListener("message", (event) => {
  if (!embedded || event.origin !== embedderOrigin || event.source !== window.parent) return;
  if (event.data instanceof Uint8Array) sonic?.sendOSC(event.data);
});

async function waitForOfflineCache() {
  if (!("serviceWorker" in navigator)) return;
  await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const list = await (await fetch("precache.json")).json();
  const cache = await caches.open("frame-v1");
  const deadline = Date.now() + 15000;
  for (;;) {
    let complete = true;
    for (const path of list) if (!(await cache.match(path))) { complete = false; break; }
    if (complete) return;
    if (Date.now() > deadline) throw new Error("offline cache incomplete");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

if (embedded && embedderOrigin) {
  waitForOfflineCache().then(
    () => post({ kind: "ready", protocol: PROTOCOL_VERSION }),
    () => { /* cache incomplete: no ready, the embedder reports unreachable */ },
  );
}

export function __setEngineFactoryForTests(factory) {
  engineFactory = factory;
  sonic = null;
  stopClockPush();
}
