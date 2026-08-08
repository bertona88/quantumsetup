import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));

async function text(file) {
  return readFile(path.join(APP_DIR, file), "utf8");
}

function localPath(specifier) {
  return specifier.split(/[?#]/, 1)[0].replace(/^\.\//, "");
}

function moduleDependencies(source) {
  const dependencies = new Set();
  const staticImport = /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["'](\.\/[^"']+)["']/gs;
  const workletUrl = /new\s+URL\(\s*["'](\.\/[^"']+)["']/gs;

  for (const pattern of [staticImport, workletUrl]) {
    for (const match of source.matchAll(pattern)) {
      dependencies.add(localPath(match[1]));
    }
  }
  return dependencies;
}

async function runtimeModuleGraph(entry) {
  const pending = [entry];
  const visited = new Set();

  while (pending.length) {
    const modulePath = pending.pop();
    if (visited.has(modulePath)) continue;
    visited.add(modulePath);
    const source = await text(modulePath);
    pending.push(...moduleDependencies(source));
  }
  return visited;
}

function precachePaths(serviceWorker) {
  const list = serviceWorker.match(
    /const APP_SHELL_PATHS = Object\.freeze\(\[(?<paths>[\s\S]*?)\]\);/,
  );
  assert.ok(list?.groups?.paths, "service worker exposes a static app-shell list");
  return new Set(
    [...list.groups.paths.matchAll(/["'](\.\/[^"']*)["']/g)].map(
      (match) => match[1],
    ),
  );
}

async function expectedContentVersion(paths) {
  const digest = createHash("sha256");
  for (const asset of [...paths].filter((path) => path !== "./").sort()) {
    digest.update(`${asset}\0`);
    digest.update(await readFile(path.join(APP_DIR, localPath(asset))));
  }
  return `content-${digest.digest("hex").slice(0, 16)}`;
}

async function pngDimensions(relativePath) {
  const bytes = await readFile(path.join(APP_DIR, relativePath));
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${relativePath} is a PNG`,
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

async function loadServiceWorker({
  scope = "https://example.test/quantum/",
  cacheNames = [],
  fetch: fetchImplementation = async () => {
    throw new Error("offline");
  },
} = {}) {
  const listeners = new Map();
  const cacheEntries = new Map();
  const cacheWrites = [];
  const cacheDeletes = [];
  const precacheCalls = [];
  const cache = {
    async addAll(paths) {
      precacheCalls.push([...paths]);
    },
    async match(key) {
      return cacheEntries.get(typeof key === "string" ? key : key.url);
    },
    async put(key, response) {
      const cacheKey = typeof key === "string" ? key : key.url;
      cacheEntries.set(cacheKey, response);
      cacheWrites.push(cacheKey);
    },
  };
  const caches = {
    async open() {
      return cache;
    },
    async keys() {
      return [...cacheNames];
    },
    async delete(key) {
      cacheDeletes.push(key);
      return true;
    },
  };
  const self = {
    registration: { scope },
    location: { origin: new URL(scope).origin },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };
  const context = vm.createContext({
    URL,
    caches,
    fetch: fetchImplementation,
    Response: { error: () => ({ type: "error" }) },
    self,
  });
  vm.runInContext(await text("sw.js"), context, { filename: "sw.js" });

  function dispatchFetch(request) {
    let response = null;
    listeners.get("fetch")({
      request,
      respondWith(value) {
        response = Promise.resolve(value);
      },
    });
    return response;
  }

  function dispatchLifecycle(type) {
    let completion = null;
    listeners.get(type)({
      waitUntil(value) {
        completion = Promise.resolve(value);
      },
    });
    return completion;
  }

  return {
    cacheDeletes,
    cacheEntries,
    cacheWrites,
    dispatchFetch,
    dispatchLifecycle,
    precacheCalls,
    scope,
  };
}

test("manifest describes an installable standalone app with valid icons", async () => {
  const manifest = JSON.parse(await text("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.theme_color, "#070609");
  assert.equal(manifest.background_color, "#070609");

  const expectedIcons = new Map([
    ["icons/quantumsetup-192.png", 192],
    ["icons/quantumsetup-512.png", 512],
    ["icons/quantumsetup-maskable-512.png", 512],
  ]);
  for (const icon of manifest.icons) {
    const iconPath = localPath(icon.src);
    if (!expectedIcons.has(iconPath)) continue;
    const size = expectedIcons.get(iconPath);
    assert.equal(icon.sizes, `${size}x${size}`);
    assert.deepEqual(await pngDimensions(iconPath), { width: size, height: size });
    expectedIcons.delete(iconPath);
  }
  assert.equal(expectedIcons.size, 0, "manifest includes every required icon size");
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
});

test("document advertises the manifest, Apple metadata, icons, and service worker", async () => {
  const html = await text("index.html");
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"\s*\/?>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/quantumsetup-192\.png"\s*\/?>/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"\s*\/?>/);
  assert.match(html, /navigator\.serviceWorker\.register\("\.\/sw\.js", \{ scope: "\.\/" \}\)/);
});

test("precache covers the complete page, module, worklet, manifest, and icon graph", async () => {
  const html = await text("index.html");
  const entry = localPath(
    html.match(/<script type="module" src="(?<src>\.\/[^"']+)"/)?.groups?.src || "",
  );
  assert.equal(entry, "main.js");

  const runtimeModules = await runtimeModuleGraph(entry);
  const serviceWorker = await text("sw.js");
  const cached = precachePaths(serviceWorker);
  const required = new Set([
    "./",
    "./index.html",
    "./styles.css",
    "./manifest.webmanifest",
    "./icons/quantumsetup-mark.svg",
    "./icons/quantumsetup-192.png",
    "./icons/quantumsetup-512.png",
    "./icons/quantumsetup-maskable-512.png",
    ...[...runtimeModules].map((modulePath) => `./${modulePath}`),
  ]);

  assert.deepEqual(
    [...required].filter((asset) => !cached.has(asset)),
    [],
    "every runtime dependency is precached",
  );
  for (const asset of cached) {
    if (asset === "./") continue;
    await stat(path.join(APP_DIR, localPath(asset)));
  }
});

test("the cache version is derived from every precached shell asset", async () => {
  const serviceWorker = await text("sw.js");
  const paths = precachePaths(serviceWorker);
  const actual = serviceWorker.match(/CACHE_VERSION = ["']([^"']+)["']/)?.[1];

  assert.equal(actual, await expectedContentVersion(paths));
});

test("service worker keeps cache ownership and URL handling bounded", async () => {
  const serviceWorker = await text("sw.js");
  assert.match(serviceWorker, /CACHE_VERSION = ["'][^"']+["']/);
  assert.match(serviceWorker, /key\.startsWith\(`\$\{CACHE_NAMESPACE\}-`\) && key !== CACHE_NAME/);
  assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /cache\.match\(APP_SHELL_URL\)/);
  assert.match(serviceWorker, /url\.search = ""/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request\s*,/);
  assert.doesNotMatch(serviceWorker, /caches\.delete\(key\)[\s\S]*filter\(\(key\) => key !== CACHE_NAME/);
});

test("service worker updates wait for old pages before taking control", async () => {
  const serviceWorker = await text("sw.js");

  assert.doesNotMatch(serviceWorker, /skipWaiting\s*\(/);
  assert.doesNotMatch(serviceWorker, /clients\.claim\s*\(/);
  assert.match(
    serviceWorker,
    /self\.addEventListener\("install",[\s\S]*cache\.addAll\(APP_SHELL_PATHS\)/,
    "a first install still precaches the complete offline shell",
  );
  assert.match(
    serviceWorker,
    /self\.addEventListener\("activate",[\s\S]*caches\.delete\(key\)/,
    "the replacement worker cleans old caches only after normal activation",
  );
});

test("install and activate execute bounded versioned-cache lifecycle work", async () => {
  const serviceWorker = await text("sw.js");
  const namespace = serviceWorker.match(/CACHE_NAMESPACE = ["']([^"']+)["']/)?.[1];
  const version = serviceWorker.match(/CACHE_VERSION = ["']([^"']+)["']/)?.[1];
  const current = `${namespace}-${version}`;
  const stale = `${namespace}-content-stale`;
  const worker = await loadServiceWorker({
    cacheNames: [stale, current, "another-site-cache"],
  });

  await worker.dispatchLifecycle("install");
  assert.deepEqual(worker.precacheCalls, [[...precachePaths(serviceWorker)]]);

  await worker.dispatchLifecycle("activate");
  assert.deepEqual(worker.cacheDeletes, [stale]);
});

test("service worker leaves unrelated same-origin and API requests untouched", async () => {
  for (const scope of [
    "https://example.test/quantum/",
    "https://example.test/",
  ]) {
    let networkCalls = 0;
    const worker = await loadServiceWorker({
      scope,
      fetch: async () => {
        networkCalls += 1;
        return { ok: true, clone() { return this; } };
      },
    });

    assert.equal(
      worker.dispatchFetch({
        method: "GET",
        mode: "cors",
        url: `${worker.scope}api/session`,
      }),
      null,
    );
    assert.equal(
      worker.dispatchFetch({
        method: "GET",
        mode: "navigate",
        url: `${worker.scope}account`,
      }),
      null,
    );
    assert.equal(networkCalls, 0);
    assert.deepEqual(worker.cacheWrites, []);
  }
});

test("service worker handles allowlisted assets and uncached replay navigations", async () => {
  const onlineResponse = {
    ok: true,
    clone() {
      return this;
    },
  };
  const worker = await loadServiceWorker({ fetch: async () => onlineResponse });

  const assetResponse = worker.dispatchFetch({
    method: "GET",
    mode: "cors",
    url: `${worker.scope}main.js?v=release-2`,
  });
  assert.ok(assetResponse);
  assert.equal(await assetResponse, onlineResponse);
  assert.ok(worker.cacheWrites.includes(`${worker.scope}main.js`));

  const replayResponse = worker.dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: `${worker.scope}?seed=01234567&moment=v1.example`,
  });
  assert.ok(replayResponse);
  assert.equal(await replayResponse, onlineResponse);
  assert.ok(worker.cacheWrites.includes(`${worker.scope}index.html`));
});

test("an active worker pins replay navigation to its own cached release", async () => {
  let networkCalls = 0;
  const networkRelease = { ok: true, release: "v2", clone() { return this; } };
  const cachedRelease = { ok: true, release: "v1" };
  const worker = await loadServiceWorker({
    fetch: async () => {
      networkCalls += 1;
      return networkRelease;
    },
  });
  worker.cacheEntries.set(`${worker.scope}index.html`, cachedRelease);

  const response = worker.dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: `${worker.scope}?seed=01234567&moment=v1.cached`,
  });

  assert.equal(await response, cachedRelease);
  assert.equal(networkCalls, 0);
  assert.deepEqual(worker.cacheWrites, []);
});

test("offline seed and moment navigation falls back to the cached shell", async () => {
  const worker = await loadServiceWorker();
  const cachedShell = { ok: true, source: "offline-shell" };
  worker.cacheEntries.set(`${worker.scope}index.html`, cachedShell);

  const response = worker.dispatchFetch({
    method: "GET",
    mode: "navigate",
    url: `${worker.scope}index.html?seed=01234567&moment=v1.offline`,
  });
  assert.ok(response);
  assert.equal(await response, cachedShell);
  assert.deepEqual(worker.cacheWrites, []);
});

test("the running claim is one tap and ordinary trajectory changes stay fresh", async () => {
  const html = await text("index.html");
  const main = await text("main.js");
  const styles = await text("styles.css");
  assert.match(html, /id="claim-moment-button"/);
  assert.match(styles, /\.is-running \.moment-claim/);

  const claimStart = main.indexOf("async function claimCurrentMoment()");
  const claimEnd = main.indexOf("\nfunction selectTarget", claimStart);
  const claimSource = main.slice(claimStart, claimEnd);
  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  assert.match(claimSource, /const moment = audibleClaimMoment/);
  assert.match(claimSource, /renderHistoricClaimIfNeeded\(\)/);
  assert.doesNotMatch(claimSource, /engine\.getSnapshot\(\)/);
  assert.doesNotMatch(claimSource, /engine\.(?:start|stop|request)/);

  const stepStart = main.lastIndexOf('if (event.type === "step")');
  const stepEnd = main.indexOf("\n}\n\nasync function toggleTransport", stepStart);
  const stepSource = main.slice(stepStart, stepEnd);
  assert.match(stepSource, /audibleClaimMoment = Object\.freeze/);
  assert.match(stepSource, /bar: event\.bar/);
  assert.match(stepSource, /step: event\.step/);
  assert.match(stepSource, /material: event\.claimMaterial/);

  const audioEngine = await text("audio-engine.js");
  const scheduledStep = audioEngine.slice(
    audioEngine.indexOf("this.queueVisual(eventTime, {"),
    audioEngine.indexOf("\n  queueVisual(time, event)", audioEngine.indexOf("this.queueVisual(eventTime, {")),
  );
  assert.match(scheduledStep, /seed: this\.seed/);
  assert.match(scheduledStep, /claimMaterial: Object\.freeze/);

  const seedStart = main.lastIndexOf('if (event.type === "seed")');
  const seedEnd = main.indexOf("\n  if (event.type ===", seedStart + 1);
  const seedSource = main.slice(seedStart, seedEnd);
  assert.match(seedSource, /clearReplayUrl\(\)/);
  assert.match(seedSource, /updateSeed\(event\.seed, \{ writeUrl: false \}\)/);

  assert.match(main, /offlineShellReady = Boolean\(registration\.active\)/);
});
