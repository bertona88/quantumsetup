import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputRoot = join(repositoryRoot, "artifacts/reference-listener/audio/quantumsetup-after");
const port = 4175;
const maximumBytes = 16 * 1024 * 1024;
const types = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
});

function safePath(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, "");
  const target = join(repositoryRoot, relative || "tools/reference-listener/quantum-capture.html");
  return target.startsWith(repositoryRoot) ? target : null;
}

async function readBody(request, limit = maximumBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new RangeError("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (request.method === "POST" && url.pathname.startsWith("/__reference_capture/")) {
      const filename = decodeURIComponent(url.pathname.slice(21));
      if (!/^quantumsetup-[a-f0-9]{8}-bar-(32|128)-(full|bass|drums|non-anchors|harmony|synth|secondary-percussion)\.wav$/.test(filename)) {
        response.writeHead(400).end("invalid capture filename");
        return;
      }
      const body = await readBody(request);
      await mkdir(outputRoot, { recursive: true });
      await writeFile(join(outputRoot, filename), body);
      response.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ filename, bytes: body.length }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/__reference_manifest") {
      const body = await readBody(request, 64 * 1024);
      const incoming = JSON.parse(body.toString("utf8"));
      await mkdir(outputRoot, { recursive: true });
      let existing = { fixtures: [] };
      try {
        existing = JSON.parse(
          await readFile(join(outputRoot, "captures.json"), "utf8"),
        );
      } catch (_) {
        // The first capture batch has no prior manifest.
      }
      const fixtures = new Map(
        [...(existing.fixtures || []), ...(incoming.fixtures || [])].map(
          (fixture) => [fixture.filename, fixture],
        ),
      );
      const enrichedFixtures = await Promise.all(
        [...fixtures.values()].map(async (fixture) => {
          const audio = await readFile(join(outputRoot, fixture.filename));
          return {
            ...fixture,
            bytes: audio.length,
            sha256: createHash("sha256").update(audio).digest("hex"),
          };
        }),
      );
      const merged = {
        schema: "quantumsetup.reference-captures.v1",
        fixtures: enrichedFixtures.sort((left, right) =>
          left.filename.localeCompare(right.filename),
        ),
      };
      await writeFile(
        join(outputRoot, "captures.json"),
        `${JSON.stringify(merged, null, 2)}\n`,
      );
      response.writeHead(201).end("saved");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end("method not allowed");
      return;
    }
    const target = safePath(url.pathname);
    if (!target) {
      response.writeHead(403).end("forbidden");
      return;
    }
    const information = await stat(target);
    if (!information.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "content-type": types[extname(target)] || "application/octet-stream",
      "content-length": information.size,
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(target).pipe(response);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 404;
    response.writeHead(status).end(status === 413 ? error.message : "not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Reference capture server: http://127.0.0.1:${port}/tools/reference-listener/quantum-capture.html`);
});
