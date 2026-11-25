// Assembles the static site into dist/: the frame page plus SuperSonic 0.88.0 from npm
// (the same packages and SynthDef list Grooveloom's vendoring script used), so a frame
// build carries its engine exactly as the in-page build did.
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "0.88.0";
const SYNTHDEFS = [
  "beep", "saw", "square", "tri", "pulse", "dsaw", "pluck", "tb303", "prophet", "fm",
  "sc808_bassdrum", "sc808_snare", "sc808_clap", "sc808_closed_hihat", "sc808_open_hihat",
  "sc808_rimshot", "sc808_cowbell", "sc808_claves", "sc808_maracas", "sc808_tomlo",
  "sc808_tommid", "sc808_tomhi", "sc808_cymbal",
];

const dist = new URL("../dist/", import.meta.url);
rmSync(dist, { recursive: true, force: true });
mkdirSync(new URL("supersonic/core", dist), { recursive: true });
mkdirSync(new URL("supersonic/synthdefs", dist), { recursive: true });

const work = mkdtempSync(join(tmpdir(), "supersonic-frame-"));
for (const pkg of ["supersonic-scsynth", "supersonic-scsynth-core", "supersonic-scsynth-synthdefs"]) {
  const dir = join(work, pkg);
  mkdirSync(dir, { recursive: true });
  execFileSync("npm", ["pack", `${pkg}@${VERSION}`, "--silent"], { cwd: dir, stdio: "inherit" });
  execFileSync("tar", ["xzf", `${pkg}-${VERSION}.tgz`], { cwd: dir });
}

cpSync(join(work, "supersonic-scsynth/package/dist"), new URL("supersonic", dist).pathname, { recursive: true });
cpSync(join(work, "supersonic-scsynth/package/LICENSE"), new URL("supersonic/LICENSE", dist).pathname);
cpSync(join(work, "supersonic-scsynth-core/package/wasm"), new URL("supersonic/core/wasm", dist).pathname, { recursive: true });
cpSync(join(work, "supersonic-scsynth-core/package/workers"), new URL("supersonic/core/workers", dist).pathname, { recursive: true });
cpSync(join(work, "supersonic-scsynth-core/package/LICENSE"), new URL("supersonic/core/LICENSE", dist).pathname);
for (const def of SYNTHDEFS)
  cpSync(join(work, `supersonic-scsynth-synthdefs/package/synthdefs/sonic-pi-${def}.scsyndef`), new URL(`supersonic/synthdefs/sonic-pi-${def}.scsyndef`, dist).pathname);
cpSync(join(work, "supersonic-scsynth-synthdefs/package/LICENSE"), new URL("supersonic/synthdefs/LICENSE", dist).pathname);
writeFileSync(new URL("supersonic/VERSION", dist), `${VERSION}\n`);

for (const file of ["index.html", "frame.js", "sw.js"]) cpSync(new URL(`../${file}`, import.meta.url), new URL(file, dist));

const { readdirSync, statSync } = await import("node:fs");
const list = [];
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`);
    else list.push(`${prefix}${name}`);
  }
};
walk(dist.pathname, "");
list.sort();
writeFileSync(new URL("precache.json", dist), `${JSON.stringify(list, null, 2)}\n`);
console.log(`built dist/ with supersonic-scsynth@${VERSION}, ${SYNTHDEFS.length} SynthDefs and ${list.length} precached files`);
