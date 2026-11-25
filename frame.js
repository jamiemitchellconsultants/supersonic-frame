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
    const engine = await createEngine();
    await engine.loadSynthDefs(Array.from(message.names ?? []));
    sonic = engine;
    sessionEpoch = message.epoch ?? null;
    startClockPush();
    reply("boot", message.id, { ok: true, ...infoFields() });
  } catch (error) {
    sonic = null;
    reply("boot", message.id, { ok: false, error: `boot-failed:${error.message}` });
  }
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

if (embedded && embedderOrigin) post({ kind: "ready", protocol: PROTOCOL_VERSION });

export function __setEngineFactoryForTests(factory) {
  engineFactory = factory;
  sonic = null;
  stopClockPush();
}
