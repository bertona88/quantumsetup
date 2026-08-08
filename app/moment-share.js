import {
  DEFAULT_DIRECTION_CONTROLS,
  DEFAULT_MIX_CONTROLS,
  DIRECTION_KEYS,
  normalizeDirectionControls,
  normalizeMixControls,
} from "./performance-controls.js";
import {
  TASTE_TRAITS,
  normalizeTasteProfile,
  tasteFingerprint,
} from "./taste-model.js";
import {
  parseTrajectoryId,
  trajectoryIdForUrl,
} from "./trajectory-identity.js";

export const MOMENT_SCHEMA_VERSION = 1;
export const MOMENT_QUERY_PARAM = "moment";

const MAX_BAR = 10_000_000;
const MAX_EVENTS = 1_024;
const MAX_ENCODED_LENGTH = 48_000;
const VIBES = Object.freeze(["hypnotic", "dub", "detroit", "acid", "peak"]);
const TONALITIES = Object.freeze(["minor", "neutral", "major"]);

function boundedInteger(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function boundedNumber(value, minimum, maximum, fallback = minimum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function shortText(value, maximum = 96) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function normalizedSeed(value) {
  const parsed = parseTrajectoryId(value);
  return parsed === undefined ? null : trajectoryIdForUrl(parsed);
}

function normalizedVibe(value, fallback = "hypnotic") {
  return VIBES.includes(value) ? value : fallback;
}

function normalizedTonality(value, fallback = "minor") {
  return TONALITIES.includes(value) ? value : fallback;
}

function compactDirection(value) {
  const direction = normalizeDirectionControls(value);
  return [
    ...DIRECTION_KEYS.map((key) => direction[key]),
    direction.bassCharacter,
  ];
}

function expandDirection(value) {
  if (!Array.isArray(value)) return DEFAULT_DIRECTION_CONTROLS;
  return normalizeDirectionControls({
    ...Object.fromEntries(
      DIRECTION_KEYS.map((key, index) => [key, value[index]]),
    ),
    bassCharacter: value[DIRECTION_KEYS.length],
  });
}

function compactMix(value) {
  const mix = normalizeMixControls(value);
  return [mix.low, mix.mid, mix.high, mix.kickCut ? 1 : 0, mix.bassCut ? 1 : 0];
}

function expandMix(value) {
  if (!Array.isArray(value)) return DEFAULT_MIX_CONTROLS;
  return normalizeMixControls({
    low: value[0],
    mid: value[1],
    high: value[2],
    kickCut: value[3] === 1,
    bassCut: value[4] === 1,
  });
}

function compactTaste(value) {
  const taste = normalizeTasteProfile(value);
  return [
    taste.likes,
    taste.passes,
    ...TASTE_TRAITS.map((trait) => taste.weights[trait]),
  ];
}

function expandTaste(value) {
  if (!Array.isArray(value)) return normalizeTasteProfile(null);
  return normalizeTasteProfile({
    schemaVersion: 1,
    likes: value[0],
    passes: value[1],
    weights: Object.fromEntries(
      TASTE_TRAITS.map((trait, index) => [trait, value[index + 2]]),
    ),
  });
}

function normalizeSignalState(value, fallbackTaste) {
  const tasteProfile = normalizeTasteProfile(
    value?.tasteProfile || fallbackTaste,
  );
  return Object.freeze({
    schemaVersion: 1,
    deckSeed: boundedInteger(value?.deckSeed, 0, 0xffffffff, 0),
    cursor: boundedInteger(value?.cursor, 0, Number.MAX_SAFE_INTEGER, 0),
    revision: boundedInteger(value?.revision, 0, Number.MAX_SAFE_INTEGER, 0),
    recentIds: Object.freeze(
      Array.isArray(value?.recentIds)
        ? value.recentIds
            .filter((id) => typeof id === "string")
            .slice(-24)
            .map((id) => id.slice(0, 160))
        : [],
    ),
    tasteProfile,
  });
}

function compactSignal(value) {
  return [
    value.schemaVersion,
    value.deckSeed,
    value.cursor,
    value.revision,
    [...value.recentIds],
    compactTaste(value.tasteProfile),
  ];
}

function expandSignal(value, fallbackTaste) {
  if (!Array.isArray(value)) return normalizeSignalState(null, fallbackTaste);
  return normalizeSignalState(
    {
      schemaVersion: value[0],
      deckSeed: value[1],
      cursor: value[2],
      revision: value[3],
      recentIds: value[4],
      tasteProfile: expandTaste(value[5]),
    },
    fallbackTaste,
  );
}

function normalizeEvent(value, order = 0) {
  if (!value || typeof value !== "object") return null;
  const type = value.type;
  const base = {
    type,
    bar: boundedInteger(value.bar, 0, MAX_BAR, 0),
    step: boundedInteger(value.step, 0, 15, 0),
    planned: value.planned === true,
    order,
  };
  if (type === "vibe") {
    return Object.freeze({
      ...base,
      immediate: value.immediate === true,
      value: normalizedVibe(value.value),
    });
  }
  if (type === "tonality") {
    return Object.freeze({
      ...base,
      immediate: value.immediate === true,
      value: normalizedTonality(value.value),
    });
  }
  if (type === "direction") {
    return Object.freeze({
      ...base,
      immediate: value.immediate === true,
      value: normalizeDirectionControls(value.value),
    });
  }
  if (type === "taste") {
    return Object.freeze({
      ...base,
      value: normalizeTasteProfile(value.value),
    });
  }
  if (type === "seed") {
    const seed = normalizedSeed(value.value);
    return seed ? Object.freeze({ ...base, value: seed }) : null;
  }
  return null;
}

function compactEvent(event) {
  const base = [event.bar, event.step, event.planned ? 1 : 0];
  if (event.type === "vibe") {
    return ["v", ...base, event.immediate ? 1 : 0, event.value];
  }
  if (event.type === "tonality") {
    return ["h", ...base, event.immediate ? 1 : 0, event.value];
  }
  if (event.type === "direction") {
    return ["d", ...base, event.immediate ? 1 : 0, compactDirection(event.value)];
  }
  if (event.type === "taste") {
    return ["t", ...base, compactTaste(event.value)];
  }
  return ["s", ...base, event.value];
}

function expandEvent(value, order) {
  if (!Array.isArray(value)) return null;
  const common = {
    bar: value[1],
    step: value[2],
    planned: value[3] === 1,
  };
  if (value[0] === "v") {
    return normalizeEvent(
      { ...common, type: "vibe", immediate: value[4] === 1, value: value[5] },
      order,
    );
  }
  if (value[0] === "h") {
    return normalizeEvent(
      { ...common, type: "tonality", immediate: value[4] === 1, value: value[5] },
      order,
    );
  }
  if (value[0] === "d") {
    return normalizeEvent(
      {
        ...common,
        type: "direction",
        immediate: value[4] === 1,
        value: expandDirection(value[5]),
      },
      order,
    );
  }
  if (value[0] === "t") {
    return normalizeEvent(
      { ...common, type: "taste", value: expandTaste(value[4]) },
      order,
    );
  }
  if (value[0] === "s") {
    return normalizeEvent(
      { ...common, type: "seed", value: value[4] },
      order,
    );
  }
  return null;
}

function normalizeEvents(values) {
  const events = (Array.isArray(values) ? values : [])
    .slice(0, MAX_EVENTS)
    .map((event, index) => normalizeEvent(event, index))
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.bar - right.bar || left.step - right.step || left.order - right.order,
    )
    .map(({ order: _order, ...event }) => Object.freeze(event));
  return Object.freeze(events);
}

export function normalizeMomentCapsule(value) {
  const generatorVersion = shortText(value?.generatorVersion, 32);
  const initialSeed = normalizedSeed(value?.initial?.seed);
  const currentSeed = normalizedSeed(value?.current?.seed);
  if (!generatorVersion || !initialSeed || !currentSeed) return null;

  const initialTaste = normalizeTasteProfile(value?.initial?.tasteProfile);
  const initial = Object.freeze({
    seed: initialSeed,
    vibe: normalizedVibe(value?.initial?.vibe),
    tonality: normalizedTonality(value?.initial?.tonality),
    direction: normalizeDirectionControls(value?.initial?.direction),
    tasteProfile: initialTaste,
  });
  const currentTaste = normalizeTasteProfile(
    value?.signal?.tasteProfile || value?.current?.tasteProfile || initialTaste,
  );
  const current = Object.freeze({
    seed: currentSeed,
    bar: boundedInteger(value?.current?.bar, 0, MAX_BAR, 0),
    step: boundedInteger(value?.current?.step, 0, 15, 0),
    bpm: boundedNumber(value?.current?.bpm, 40, 260, 128),
    vibe: normalizedVibe(value?.current?.vibe, initial.vibe),
    tonality: normalizedTonality(value?.current?.tonality, initial.tonality),
    mix: normalizeMixControls(value?.current?.mix),
    section: shortText(value?.current?.section, 40),
    materialFingerprint: shortText(value?.current?.materialFingerprint, 160),
    materialGesture: shortText(value?.current?.materialGesture, 48),
    ensembleScene: shortText(value?.current?.ensembleScene, 80),
    tasteFingerprint:
      shortText(value?.current?.tasteFingerprint, 80) ||
      tasteFingerprint(currentTaste),
  });
  return Object.freeze({
    schemaVersion: MOMENT_SCHEMA_VERSION,
    generatorVersion,
    initial,
    events: normalizeEvents(value?.events),
    current,
    signal: normalizeSignalState(value?.signal, currentTaste),
  });
}

function compactCapsule(capsule) {
  return {
    v: MOMENT_SCHEMA_VERSION,
    g: capsule.generatorVersion,
    i: [
      capsule.initial.seed,
      capsule.initial.vibe,
      capsule.initial.tonality,
      compactDirection(capsule.initial.direction),
      compactTaste(capsule.initial.tasteProfile),
    ],
    e: capsule.events.map(compactEvent),
    c: [
      capsule.current.seed,
      capsule.current.bar,
      capsule.current.step,
      capsule.current.bpm,
      capsule.current.vibe,
      capsule.current.tonality,
      compactMix(capsule.current.mix),
      capsule.current.section,
      capsule.current.materialFingerprint,
      capsule.current.materialGesture,
      capsule.current.ensembleScene,
      capsule.current.tasteFingerprint,
    ],
    q: compactSignal(capsule.signal),
  };
}

function expandCapsule(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.v !== MOMENT_SCHEMA_VERSION ||
    !Array.isArray(value.i) ||
    !Array.isArray(value.c)
  ) {
    return null;
  }
  const initialTaste = expandTaste(value.i[4]);
  const signal = expandSignal(value.q, initialTaste);
  return normalizeMomentCapsule({
    generatorVersion: value.g,
    initial: {
      seed: value.i[0],
      vibe: value.i[1],
      tonality: value.i[2],
      direction: expandDirection(value.i[3]),
      tasteProfile: initialTaste,
    },
    events: (Array.isArray(value.e) ? value.e : [])
      .slice(0, MAX_EVENTS)
      .map(expandEvent)
      .filter(Boolean),
    current: {
      seed: value.c[0],
      bar: value.c[1],
      step: value.c[2],
      bpm: value.c[3],
      vibe: value.c[4],
      tonality: value.c[5],
      mix: expandMix(value.c[6]),
      section: value.c[7],
      materialFingerprint: value.c[8],
      materialGesture: value.c[9],
      ensembleScene: value.c[10],
      tasteFingerprint: value.c[11],
      tasteProfile: signal.tasteProfile,
    },
    signal,
  });
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(text) {
  const standard = text.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeMomentCapsule(value) {
  const capsule = normalizeMomentCapsule(value);
  if (!capsule) throw new TypeError("A complete moment capsule is required.");
  return `v${MOMENT_SCHEMA_VERSION}.${encodeBase64Url(
    JSON.stringify(compactCapsule(capsule)),
  )}`;
}

export function decodeMomentCapsule(text) {
  if (
    typeof text !== "string" ||
    text.length === 0 ||
    text.length > MAX_ENCODED_LENGTH ||
    !text.startsWith(`v${MOMENT_SCHEMA_VERSION}.`)
  ) {
    return null;
  }
  try {
    return expandCapsule(
      JSON.parse(decodeBase64Url(text.slice(text.indexOf(".") + 1))),
    );
  } catch {
    return null;
  }
}

export function createShareMomentUrl(href, value) {
  const capsule = normalizeMomentCapsule(value);
  if (!capsule) throw new TypeError("A complete moment capsule is required.");
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("seed", capsule.current.seed);
  url.searchParams.set(MOMENT_QUERY_PARAM, encodeMomentCapsule(capsule));
  return url.toString();
}

export function clearReplayStateUrl(href) {
  const url = new URL(href);
  url.searchParams.delete("seed");
  url.searchParams.delete(MOMENT_QUERY_PARAM);
  return url.toString();
}

function prepareForEvent(engine, event) {
  const phraseStart = Math.floor(event.bar / 8) * 8;
  if (event.planned) {
    engine.bar = phraseStart;
    engine.step = 0;
    engine.preparePlan(phraseStart);
    return;
  }
  if (phraseStart >= 8) {
    engine.bar = phraseStart - 8;
    engine.step = 0;
    engine.preparePlan(phraseStart - 8);
  }
}

export function restoreMomentEngine(engine, value) {
  const capsule = normalizeMomentCapsule(value);
  if (!capsule || !engine) return null;

  for (const event of capsule.events) {
    prepareForEvent(engine, event);
    engine.bar = event.bar;
    engine.step = event.step;
    if (event.type === "seed") {
      engine.applySeed(event.value);
      engine.preparePlan(event.bar);
      continue;
    }
    if (event.type === "taste") {
      engine.setTasteProfile(event.value);
      continue;
    }
    engine.running = !event.immediate;
    if (event.type === "vibe") engine.requestVibe(event.value);
    if (event.type === "tonality") engine.requestTonality(event.value);
    if (event.type === "direction") {
      engine.queueDirectionControls(event.value, "shared-moment");
    }
    engine.running = false;
  }

  engine.bar = capsule.current.bar;
  engine.step = capsule.current.step;
  engine.preparePlan(capsule.current.bar);
  engine.bar = capsule.current.bar;
  engine.step = capsule.current.step;
  engine.currentTempo = capsule.current.bpm;
  engine.mixControls = normalizeMixControls(capsule.current.mix);
  engine.pendingMixCuts = null;
  engine.running = false;
  return engine.getSnapshot();
}
