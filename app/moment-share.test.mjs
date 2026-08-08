import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  AudioContext: null,
  AudioWorkletNode: null,
  clearInterval() {},
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  setTimeout(callback) {
    callback();
    return 1;
  },
  crypto: globalThis.crypto,
};

const {
  createShareMomentUrl,
  clearReplayStateUrl,
  decodeMomentCapsule,
  encodeMomentCapsule,
  normalizeMomentCapsule,
  restoreMomentEngine,
} = await import("./moment-share.js");
const { InfiniteTechnoEngine } = await import("./audio-engine.js");

const INITIAL_SEED = "0123456789abcdeffedcba9876543210";
const CURRENT_SEED = "11111111111111111111111111111111";
const NEUTRAL_TASTE = {
  schemaVersion: 1,
  weights: {},
  likes: 0,
  passes: 0,
};

function fixture(overrides = {}) {
  return {
    generatorVersion: "2.2.0",
    initial: {
      seed: INITIAL_SEED,
      vibe: "hypnotic",
      tonality: "minor",
      direction: { energy: 0.12, bassCharacter: "rolling" },
      tasteProfile: NEUTRAL_TASTE,
    },
    events: [
      {
        type: "vibe",
        bar: 3,
        step: 7,
        planned: true,
        immediate: false,
        value: "acid",
      },
      {
        type: "seed",
        bar: 32,
        step: 0,
        planned: false,
        value: CURRENT_SEED,
      },
    ],
    current: {
      seed: CURRENT_SEED,
      bar: 72,
      step: 9,
      bpm: 131.25,
      vibe: "acid",
      tonality: "minor",
      mix: { low: -3, mid: 1, high: 2, kickCut: false, bassCut: true },
      section: "DRIVE",
      materialFingerprint: "phrase:9:ABCDEF",
      materialGesture: "displace",
      ensembleScene: "acid-relay",
      tasteFingerprint: "taste-v1-00000000",
    },
    signal: {
      schemaVersion: 1,
      deckSeed: 0x12345678,
      cursor: 8,
      revision: 8,
      recentIds: ["signal-one", "signal-two"],
      tasteProfile: NEUTRAL_TASTE,
    },
    ...overrides,
  };
}

test("moment capsules round-trip a complete replay state", () => {
  const capsule = normalizeMomentCapsule(fixture());
  const encoded = encodeMomentCapsule(capsule);
  const decoded = decodeMomentCapsule(encoded);

  assert.match(encoded, /^v1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decoded, capsule);
  assert.equal(decoded.initial.seed, INITIAL_SEED);
  assert.equal(decoded.current.seed, CURRENT_SEED);
  assert.equal(decoded.current.bar, 72);
  assert.equal(decoded.current.step, 9);
  assert.equal(decoded.current.mix.bassCut, true);
  assert.equal(decoded.events[0].planned, true);
  assert.equal(decoded.signal.cursor, 8);
});

test("share URLs expose the full current seed and contain only replay state", () => {
  const url = new URL(
    createShareMomentUrl(
      "https://quantumsetup.ai/?utm_source=test#controls",
      fixture(),
    ),
  );

  assert.equal(url.hash, "");
  assert.equal(url.searchParams.get("utm_source"), null);
  assert.equal(url.searchParams.get("seed"), CURRENT_SEED);
  assert.ok(decodeMomentCapsule(url.searchParams.get("moment")));
});

test("leaving replay mode removes seed and moment without dropping unrelated URL state", () => {
  const url = new URL(
    clearReplayStateUrl(
      "https://quantumsetup.ai/?seed=abc123&moment=v1.fake&utm_source=install#controls",
    ),
  );

  assert.equal(url.searchParams.get("seed"), null);
  assert.equal(url.searchParams.get("moment"), null);
  assert.equal(url.searchParams.get("utm_source"), "install");
  assert.equal(url.hash, "#controls");
});

test("invalid or incomplete capsules are rejected without throwing on decode", () => {
  assert.equal(decodeMomentCapsule(""), null);
  assert.equal(decodeMomentCapsule("v1.not-valid-base64"), null);
  assert.equal(normalizeMomentCapsule({ generatorVersion: "2.2.0" }), null);
});

test("restored engines replay intent, taste, seed, and skipped phrase history", () => {
  const events = [];
  const original = new InfiniteTechnoEngine(() => {}, {
    seed: INITIAL_SEED,
    vibe: "hypnotic",
    tonality: "minor",
    directionControls: { energy: 0.12, bassCharacter: "rolling" },
    tasteProfile: NEUTRAL_TASTE,
  });

  original.bar = 0;
  original.preparePlan(0);
  original.running = true;
  original.bar = 3;
  original.step = 7;
  original.requestVibe("acid");
  events.push({
    type: "vibe",
    bar: 3,
    step: 7,
    planned: true,
    immediate: false,
    value: "acid",
  });

  original.bar = 4;
  original.step = 4;
  original.queueDirectionControls(
    { energy: 0.35, density: 0.2, bassCharacter: "acid" },
    "test",
  );
  events.push({
    type: "direction",
    bar: 4,
    step: 4,
    planned: true,
    immediate: false,
    value: { energy: 0.35, density: 0.2, bassCharacter: "acid" },
  });

  for (const bar of [8, 16, 24]) {
    original.bar = bar;
    original.step = 0;
    original.preparePlan(bar);
  }
  original.running = false;
  original.bar = 24;
  original.requestTonality("major");
  events.push({
    type: "tonality",
    bar: 24,
    step: 0,
    planned: true,
    immediate: true,
    value: "major",
  });

  const learnedTaste = {
    schemaVersion: 1,
    likes: 4,
    passes: 1,
    weights: {
      brightness: 0.4,
      warmth: -0.2,
      hardness: 0.3,
      motion: 0.1,
      space: 0.25,
      sustain: -0.15,
      complexity: 0.2,
      grit: 0.35,
    },
  };
  original.setTasteProfile(learnedTaste);
  events.push({
    type: "taste",
    bar: 24,
    step: 0,
    planned: true,
    value: learnedTaste,
  });

  original.bar = 32;
  original.step = 0;
  original.applySeed(CURRENT_SEED);
  events.push({
    type: "seed",
    bar: 32,
    step: 0,
    planned: false,
    value: CURRENT_SEED,
  });
  for (const bar of [32, 40, 48, 56, 64, 72, 80]) {
    original.bar = bar;
    original.step = 0;
    original.preparePlan(bar);
  }
  original.bar = 82;
  original.step = 6;
  original.preparePlan(82);
  original.requestMixControl("low", -4);
  original.requestMixControl("bass", true);
  const originalSnapshot = original.getSnapshot();

  const capsule = normalizeMomentCapsule({
    generatorVersion: "2.2.0",
    initial: {
      seed: INITIAL_SEED,
      vibe: "hypnotic",
      tonality: "minor",
      direction: { energy: 0.12, bassCharacter: "rolling" },
      tasteProfile: NEUTRAL_TASTE,
    },
    events,
    current: {
      ...originalSnapshot,
      mix: originalSnapshot.performance.mix,
      materialFingerprint: originalSnapshot.material.phraseFingerprint,
      materialGesture: originalSnapshot.material.gesture,
      ensembleScene: originalSnapshot.ensembleScene?.id,
      tasteFingerprint: originalSnapshot.taste.fingerprint,
    },
    signal: {
      schemaVersion: 1,
      deckSeed: 1,
      cursor: 5,
      revision: 5,
      recentIds: [],
      tasteProfile: learnedTaste,
    },
  });

  const restored = new InfiniteTechnoEngine(() => {}, {
    seed: capsule.initial.seed,
    vibe: capsule.initial.vibe,
    tonality: capsule.initial.tonality,
    directionControls: capsule.initial.direction,
    tasteProfile: capsule.initial.tasteProfile,
  });
  const restoredSnapshot = restoreMomentEngine(restored, capsule);

  assert.equal(restored.bar, 82);
  assert.equal(restored.step, 6);
  assert.equal(restored.seed, CURRENT_SEED);
  assert.deepEqual(restored.materialState, original.materialState);
  assert.deepEqual(restored.runtimeEnsembleRoles, original.runtimeEnsembleRoles);
  assert.deepEqual(restored.runtimeSynthPalette, original.runtimeSynthPalette);
  assert.deepEqual(restored.phrasePlans, original.phrasePlans);
  assert.deepEqual(restoredSnapshot.material, originalSnapshot.material);
  assert.deepEqual(restoredSnapshot.performance.mix, originalSnapshot.performance.mix);
  assert.deepEqual(restored.tasteProfile, original.tasteProfile);
});
