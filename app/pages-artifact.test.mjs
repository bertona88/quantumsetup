import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.resolve(appDirectory, "../.github/workflows/pages.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");
const serviceWorker = fs.readFileSync(path.join(appDirectory, "sw.js"), "utf8");
const stagedModules = new Set(
  [...workflow.matchAll(/\bapp\/([\w.-]+\.js)\b/g)].map((match) => match[1]),
);
const stagedAssets = new Set(
  [...workflow.matchAll(/\bapp\/([\w./-]+)/g)].map((match) => match[1]),
);

const importPattern =
  /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']\.\/([^"'?]+\.js)(?:\?[^"']*)?["']/g;

function runtimeImports(entrypoint) {
  const pending = [entrypoint];
  const visited = new Set();
  const imports = [];

  while (pending.length > 0) {
    const moduleName = pending.shift();
    if (visited.has(moduleName)) continue;
    visited.add(moduleName);

    const source = fs.readFileSync(path.join(appDirectory, moduleName), "utf8");
    importPattern.lastIndex = 0;

    for (const match of source.matchAll(importPattern)) {
      const importedModule = match[1];
      imports.push({ importedBy: moduleName, moduleName: importedModule });
      pending.push(importedModule);
    }
  }

  return imports;
}

test("Pages artifact includes every browser runtime module", () => {
  const missingImports = runtimeImports("main.js").filter(
    ({ moduleName }) => !stagedModules.has(moduleName),
  );

  assert.deepEqual(missingImports, []);
});

test("Pages staging configuration includes the complete offline precache", () => {
  const sourceList = serviceWorker.match(
    /const APP_SHELL_PATHS = Object\.freeze\(\[(?<paths>[\s\S]*?)\]\);/,
  );
  assert.ok(sourceList?.groups?.paths);
  const precached = [
    ...sourceList.groups.paths.matchAll(/["']\.\/([^"']*)["']/g),
  ].map((match) => match[1] || "index.html");
  const missing = precached.filter(
    (asset) =>
      ![...stagedAssets].some(
        (staged) => asset === staged || asset.startsWith(`${staged}/`),
      ),
  );

  assert.deepEqual(missing, []);
  assert.ok(stagedAssets.has("sw.js"));
});
