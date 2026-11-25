// Gives each build its own worker bytes and cache name. A browser installs a new worker
// only when sw.js itself changes, so without this a changed frame.js would never arrive.
import { createHash } from "node:crypto";

const PLACEHOLDER = 'const BUILD = "dev";';

/** The worker source stamped with a hash of itself and of every [path, content] it caches. */
export function stampWorker(source, files) {
  if (!source.includes(PLACEHOLDER)) throw new Error("sw.js has no build placeholder to stamp");
  const hash = createHash("sha256").update(source);
  for (const [path, content] of files) hash.update(path).update("\0").update(content).update("\0");
  return source.replace(PLACEHOLDER, `const BUILD = "${hash.digest("hex").slice(0, 12)}";`);
}
