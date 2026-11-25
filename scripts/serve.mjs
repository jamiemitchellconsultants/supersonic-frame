// Serves this repository on loopback for local development and Grooveloom's harness.
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.argv[2] ?? 7441);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".md": "text/markdown" };

createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://localhost").pathname)));
  if (!path.startsWith(root) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": MIME[extname(path)] ?? "application/octet-stream" });
  createReadStream(path).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`supersonic-frame at http://127.0.0.1:${port}/`));
