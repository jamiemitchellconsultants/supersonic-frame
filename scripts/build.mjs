// Assembles the static site into dist/. The skeleton copies the page as-is; the
// SuperSonic payload joins it when the frame boots the engine (engine-frame Task 5).
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
mkdirSync(new URL("../dist", import.meta.url), { recursive: true });
for (const file of ["index.html", "frame.js"]) cpSync(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
console.log("built dist/");
