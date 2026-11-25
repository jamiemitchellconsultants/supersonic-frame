import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTROLS = ["ready", "boot", "loadSynthDef", "allocSample", "clock", "info", "feedback", "purge", "selectDevice", "cueProbe", "osc"];

test("every B14 control is documented, and no other", async () => {
  const doc = await readFile(new URL("../protocol.md", import.meta.url), "utf8");
  for (const c of CONTROLS) assert.match(doc, new RegExp(`## ${c}\\b`), c);
  const headings = [...doc.matchAll(/^## ([a-zA-Z]+)$/gm)].map((m) => m[1]).filter((h) => !["Envelope", "Versions", "Origins", "Errors"].includes(h));
  assert.deepEqual(headings.sort(), [...CONTROLS].sort());
});
