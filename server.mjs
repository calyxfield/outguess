import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4173);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
};

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = normalize(join(root, relative));
  if (!candidate.startsWith(root) || !existsSync(candidate) || statSync(candidate).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": contentTypes[extname(candidate)] ?? "application/octet-stream" });
  createReadStream(candidate).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Outguess listening on http://127.0.0.1:${port}`);
});
