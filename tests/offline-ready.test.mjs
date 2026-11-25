// Offline, an installed worker is enough: ready must not wait on the network.
import { test } from "node:test";
import assert from "node:assert/strict";

const posted = [];
globalThis.window = { parent: { postMessage: (msg) => posted.push(msg) }, addEventListener() {} };
globalThis.document = { referrer: "http://127.0.0.1:7439/embed.html" };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { serviceWorker: { register: async () => ({}), ready: Promise.resolve({}) } },
});
globalThis.fetch = async () => { throw new TypeError("offline"); };

test("ready is posted offline once a worker is active", async () => {
  await import("../frame.js");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posted, [{ kind: "ready", protocol: 1 }]);
});
