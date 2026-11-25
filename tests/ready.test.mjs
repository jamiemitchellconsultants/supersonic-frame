import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("frame posts ready with protocol 1 and no other control", async () => {
  const src = await readFile(new URL("../frame.js", import.meta.url), "utf8");
  assert.match(src, /kind:\s*"ready",\s*protocol:/);
  assert.match(src, /PROTOCOL_VERSION = 1/);
  assert.doesNotMatch(src, /kind:\s*"boot"/);
});

test("frame posts ready only to its embedder origin, never *", async () => {
  const src = await readFile(new URL("../frame.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /postMessage\([^)]*,\s*"\*"/);
});
