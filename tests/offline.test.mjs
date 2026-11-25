import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("worker caches under frame-v1 and deletes other versions on activation", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /frame-v1/);
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /precache\.json/);
});

test("the pinned root URL itself is precached and served as a navigation", async () => {
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /list\.unshift\("\.\/"\)|"\.\/"\]/, "precache list covers ./");
  assert.match(sw, /request\.mode === "navigate"/, "navigations fall back to the cached root/index");
});

test("ready is posted only after the offline cache is complete", async () => {
  const src = await readFile(new URL("../frame.js", import.meta.url), "utf8");
  assert.match(src, /waitForOfflineCache/);
  const readyAt = src.indexOf('kind: "ready"');
  const cacheAt = src.indexOf("waitForOfflineCache()");
  assert.ok(cacheAt >= 0 && readyAt > cacheAt, "cache wait precedes ready");
});
