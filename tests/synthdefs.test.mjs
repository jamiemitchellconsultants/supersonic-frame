import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Regression for the 2026-11-25 incident: SuperSonic fetches SynthDefs by their full
// catalogue names (sonic-pi-<name>), so the build must publish them under those names.
// A stripped name makes every catalogue boot 404 while a local boot of the short
// name still works, which is exactly how this once shipped unnoticed.
test("the build publishes every SynthDef under its sonic-pi name", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /supersonic\/synthdefs\/sonic-pi-\$\{def\}\.scsyndef/);
  assert.doesNotMatch(build, /supersonic\/synthdefs\/\$\{def\}\.scsyndef/);
});
