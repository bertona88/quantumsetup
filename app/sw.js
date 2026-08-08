const CACHE_NAMESPACE = "quantumsetup-app-shell";
// This content-derived value is verified by pwa-shell.test.mjs. Any shell asset
// change must create a new cache, so an installing worker cannot overwrite the
// cache still serving an older open page.
const CACHE_VERSION = "content-a8e8a33e239aa09b";
const CACHE_NAME = `${CACHE_NAMESPACE}-${CACHE_VERSION}`;

// Keep these paths query-free. Runtime requests carry release query strings, but
// they map to the same canonical cache entries so shared moment URLs never create
// one navigation entry per musical state.
const APP_SHELL_PATHS = Object.freeze([
  "./",
  "./index.html",
  "./styles.css",
  "./main.js",
  "./audio-engine.js",
  "./generative-utils.js",
  "./instrument-preview.js",
  "./signal-deck.js",
  "./performance-controls.js",
  "./trajectory-identity.js",
  "./moment-share.js",
  "./local-claims.js",
  "./quantum-visual.js",
  "./spectrum-mountain.js",
  "./visual-grammar.js",
  "./techno-model.js",
  "./track-dna.js",
  "./emergent-form.js",
  "./material-planner.js",
  "./pulse-bass-timbres.js",
  "./taste-model.js",
  "./synth-genomes.js",
  "./synth-dsp.js",
  "./synth-worklet.js",
  "./manifest.webmanifest",
  "./icons/quantumsetup-mark.svg",
  "./icons/quantumsetup-192.png",
  "./icons/quantumsetup-512.png",
  "./icons/quantumsetup-maskable-512.png",
]);

const APP_ROOT_URL = new URL("./", self.registration.scope).href;
const APP_SHELL_URL = new URL("./index.html", self.registration.scope).href;
const APP_SHELL_URLS = new Set(
  APP_SHELL_PATHS.map((path) => new URL(path, self.registration.scope).href),
);

function canonicalCacheKey(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.href;
}

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(APP_SHELL_URL);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(APP_SHELL_URL, response.clone());
    }
    return response;
  } catch (_error) {
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = canonicalCacheKey(request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(cacheKey, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  // Do not force a waiting worker to activate: an update must not replace the
  // already-open page, because that could mix modules from two release caches.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_PATHS)),
  );
});

self.addEventListener("activate", (event) => {
  // Normal lifecycle activation happens after old clients close. Avoid
  // immediate client claiming so first control begins at a later navigation.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(`${CACHE_NAMESPACE}-`) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const navigationUrl = canonicalCacheKey(request);
    if (navigationUrl !== APP_ROOT_URL && navigationUrl !== APP_SHELL_URL) return;
    event.respondWith(navigationResponse(request));
    return;
  }

  if (!APP_SHELL_URLS.has(canonicalCacheKey(request))) return;
  event.respondWith(cacheFirst(request));
});
