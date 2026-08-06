import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const output = fileURLToPath(new URL("../artifacts/pattern-audit/", import.meta.url));
const port = 4174;
const maximumCaptureBytes = 16 * 1024 * 1024;
const types = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
});

function safeStaticPath(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const target = join(root, relative || "pattern-audit-samples.html");
  return target.startsWith(root) ? target : null;
}

async function capture(request, response, filename) {
  if (!/^quantumsetup-[a-z0-9-]+\.wav$/i.test(filename)) {
    response.writeHead(400).end("invalid capture filename");
    return;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumCaptureBytes) {
      response.writeHead(413).end("capture too large");
      return;
    }
    chunks.push(chunk);
  }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, filename), Buffer.concat(chunks));
  response.writeHead(201, { "content-type": "application/json" });
  response.end(JSON.stringify({ filename, bytes }));
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "POST" && url.pathname.startsWith("/__capture/")) {
      await capture(request, response, decodeURIComponent(url.pathname.slice(11)));
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end("method not allowed");
      return;
    }
    const target = safeStaticPath(url.pathname);
    if (!target) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "content-type": types[extname(target)] || "application/octet-stream",
      "content-length": info.size,
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Pattern capture server: http://127.0.0.1:${port}/pattern-audit-samples.html`);
});
