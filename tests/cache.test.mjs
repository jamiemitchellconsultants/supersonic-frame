// The worker and the build stamp, driven against fake Cache Storage.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stampWorker } from "../scripts/stamp.mjs";

const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");

function fakeCaches() {
  const stores = new Map();
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      entries,
      addAll: async (requests) => { for (const request of requests) entries.set(request.url, request); },
      match: async (request) => entries.get(request.url ?? request),
    };
  };
  return {
    stores, open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const entries of stores.values()) if (entries.has(request.url ?? request)) return entries.get(request.url ?? request);
    },
  };
}

function loadWorker(script, caches = fakeCaches()) {
  const handlers = {};
  const fetched = [];
  let skipped = false;
  const self = {
    location: { origin: "https://frame.example" },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => { skipped = true; },
    clients: { claim: async () => {} },
  };
  class FakeRequest {
    constructor(url, init = {}) { this.url = url; this.cache = init.cache; this.method = "GET"; this.mode = "cors"; }
  }
  const fetch = async (input) => {
    const request = typeof input === "string" ? new FakeRequest(input) : input;
    fetched.push(request);
    return { json: async () => ["./", "frame.js"], from: "network" };
  };
  new Function("self", "caches", "fetch", "Request", script)(self, caches, fetch, FakeRequest);
  const run = async (type, event = {}) => {
    let waiting;
    handlers[type]({ ...event, waitUntil: (p) => { waiting = p; }, respondWith: (p) => { waiting = p; } });
    return waiting;
  };
  return { run, caches, fetched, skipped: () => skipped };
}

test("each build changes the worker and names its own cache", async () => {
  const a = stampWorker(source, [["frame.js", "one"]]);
  const b = stampWorker(source, [["frame.js", "two"]]);
  assert.notEqual(a, b);
  assert.equal(a, stampWorker(source, [["frame.js", "one"]]));
  const first = loadWorker(a), second = loadWorker(b);
  await first.run("install");
  await second.run("install");
  assert.notEqual([...first.caches.stores.keys()][0], [...second.caches.stores.keys()][0]);
  assert.match([...first.caches.stores.keys()][0], /^frame-v1-[0-9a-f]{12}$/);
});

test("stamping fails loudly when the worker has no build placeholder", () => {
  assert.throws(() => stampWorker("const x = 1;", []), /placeholder/);
});

test("install bypasses the HTTP cache, so a new build never caches old files", async () => {
  const worker = loadWorker(source);
  await worker.run("install");
  assert.deepEqual(worker.fetched.map((r) => [r.url, r.cache]), [["precache.json", "reload"]]);
  const [entries] = worker.caches.stores.values();
  assert.deepEqual([...entries.values()].map((r) => [r.url, r.cache]), [["./", "reload"], ["frame.js", "reload"]]);
});

test("a new build waits for open frames to close before taking over", async () => {
  const worker = loadWorker(source);
  await worker.run("install");
  assert.equal(worker.skipped(), false);
});

test("a worker answers only from its own cache, never from a waiting build's", async () => {
  const caches = fakeCaches();
  (await caches.open("frame-v1-newer")).entries.set("https://frame.example/frame.js", { from: "newer" });
  const worker = loadWorker(source, caches);
  const reply = await worker.run("fetch", { request: { method: "GET", mode: "cors", url: "https://frame.example/frame.js" } });
  assert.equal(reply.from, "network");
});

test("activation deletes every other frame cache, the unstamped one included", async () => {
  const worker = loadWorker(stampWorker(source, []));
  for (const name of ["frame-v1", "frame-v1-old", "unrelated"]) await worker.caches.open(name);
  await worker.run("install");
  await worker.run("activate");
  const left = await worker.caches.keys();
  assert.equal(left.length, 2);
  assert.ok(left.includes("unrelated"));
});
