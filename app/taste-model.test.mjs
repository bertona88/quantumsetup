import assert from "node:assert/strict";
import test from "node:test";

import {
  TASTE_SCHEMA_VERSION,
  TASTE_TRAITS,
  applyTasteDecision,
  createTasteProfile,
  normalizeTasteProfile,
  tasteFeaturesForGenome,
  tasteFingerprint,
  tasteScoreForGenome,
  tasteStrength,
  tasteTraitLabels,
} from "./taste-model.js";

const FM_GENOME = Object.freeze({
  engine: "fm",
  algorithm: "split-cascade",
  ratioFamily: "odd",
  envelopeFamily: "pluck",
  ratios: Object.freeze([1, 3, 5, 7]),
  waves: Object.freeze(["sawtooth", "square", "triangle", "sine"]),
  attacks: Object.freeze([0.002, 0.004, 0.006, 0.008]),
  sustains: Object.freeze([0.18, 0.12, 0.08, 0.04]),
  releases: Object.freeze([0.12, 0.18, 0.1, 0.08]),
  modulationIndex: 5.8,
  feedback: 0.32,
  toneHz: 7600,
  filterQ: 5.4,
  lfoRateHz: 3.2,
  lfoDepthCents: 13,
  drive: 3.7,
  spread: 0.58,
  durationScale: 0.82,
});

const MODAL_GENOME = Object.freeze({
  engine: "modal",
  material: "wood",
  structure: "coupled",
  exciter: "soft-mallet",
  modeCount: 7,
  hardness: 0.28,
  noiseMix: 0.22,
  brightness: 0.38,
  inharmonicity: 0.06,
  stiffness: 0.32,
  damping: 0.36,
  decaySeconds: 1.9,
  coupling: 0.08,
  body: 0.82,
  spread: 0.66,
  drive: 1.5,
});

const STRING_GENOME = Object.freeze({
  engine: "string",
  exciter: "hard-pick",
  body: "metal",
  termination: "buzz",
  feedback: 0.96,
  decaySeconds: 2.8,
  brightness: 0.76,
  stiffness: 0.72,
  pickPosition: 0.22,
  exciterMass: 0.42,
  exciterDamping: 0.24,
  damperMass: 0.3,
  damperStiffness: 0.74,
  bodySize: 0.62,
  buzz: 0.52,
  spread: 0.48,
  drive: 2.7,
  releaseSeconds: 0.58,
});

test("schema-v1 profiles are neutral, normalized, bounded, and frozen", () => {
  const empty = createTasteProfile();
  assert.equal(empty.schemaVersion, TASTE_SCHEMA_VERSION);
  assert.deepEqual(
    empty,
    {
      schemaVersion: 1,
      weights: Object.fromEntries(TASTE_TRAITS.map((trait) => [trait, 0])),
      decisions: 0,
      likes: 0,
      passes: 0,
    },
  );
  assert.ok(Object.isFrozen(empty));
  assert.ok(Object.isFrozen(empty.weights));

  const normalized = normalizeTasteProfile({
    schemaVersion: 1,
    weights: {
      brightness: 4,
      warmth: -8,
      hardness: Number.NaN,
      grit: 0.25,
      ignored: 1,
    },
    decisions: 999,
    likes: 3.9,
    passes: 2.2,
  });
  assert.equal(normalized.weights.brightness, 1);
  assert.equal(normalized.weights.warmth, -1);
  assert.equal(normalized.weights.hardness, 0);
  assert.equal(normalized.weights.grit, 0.25);
  assert.equal(Object.hasOwn(normalized.weights, "ignored"), false);
  assert.deepEqual(
    [normalized.decisions, normalized.likes, normalized.passes],
    [5, 3, 2],
  );
});

test("all three valid-looking engine families produce bounded immutable features", () => {
  for (const genome of [FM_GENOME, MODAL_GENOME, STRING_GENOME]) {
    const features = tasteFeaturesForGenome(genome);
    assert.ok(features, genome.engine);
    assert.ok(Object.isFrozen(features));
    assert.deepEqual(Object.keys(features), [...TASTE_TRAITS]);
    assert.ok(
      Object.values(features).every(
        (value) => Number.isFinite(value) && value >= -1 && value <= 1,
      ),
    );
  }
});

test("Like and Pass apply opposite bounded evidence without mutating inputs", () => {
  const original = createTasteProfile();
  const originalSnapshot = structuredClone(original);
  const liked = applyTasteDecision(original, FM_GENOME, "Like");
  const passed = applyTasteDecision(original, FM_GENOME, "Pass");

  assert.deepEqual(original, originalSnapshot);
  assert.deepEqual(
    [liked.decisions, liked.likes, liked.passes],
    [1, 1, 0],
  );
  assert.deepEqual(
    [passed.decisions, passed.likes, passed.passes],
    [1, 0, 1],
  );
  for (const trait of TASTE_TRAITS) {
    assert.equal(liked.weights[trait], -passed.weights[trait]);
    assert.ok(Math.abs(liked.weights[trait]) <= 1);
  }
  assert.ok(Object.isFrozen(liked));
  assert.ok(Object.isFrozen(liked.weights));
});

test("decision strength stays neutral until three decisions and caps at one", () => {
  let profile = createTasteProfile();
  assert.equal(tasteStrength(profile), 0);
  profile = applyTasteDecision(profile, FM_GENOME, "like");
  assert.equal(tasteStrength(profile), 0);
  profile = applyTasteDecision(profile, MODAL_GENOME, "like");
  assert.equal(tasteStrength(profile), 0);
  profile = applyTasteDecision(profile, STRING_GENOME, "pass");
  assert.ok(tasteStrength(profile) > 0);
  assert.ok(tasteStrength(profile) < 1);

  for (let index = 0; index < 40; index += 1) {
    profile = applyTasteDecision(profile, FM_GENOME, "like");
  }
  assert.equal(tasteStrength(profile), 1);
  assert.ok(
    Object.values(profile.weights).every(
      (weight) => Number.isFinite(weight) && weight >= -1 && weight <= 1,
    ),
  );
});

test("taste scores are bounded raw affinities and follow learned polarity", () => {
  let liked = createTasteProfile();
  let passed = createTasteProfile();
  for (let index = 0; index < 12; index += 1) {
    liked = applyTasteDecision(liked, FM_GENOME, "like");
    passed = applyTasteDecision(passed, FM_GENOME, "pass");
  }

  assert.ok(tasteScoreForGenome(liked, FM_GENOME) > 0);
  assert.ok(tasteScoreForGenome(passed, FM_GENOME) < 0);
  for (const profile of [liked, passed]) {
    for (const genome of [FM_GENOME, MODAL_GENOME, STRING_GENOME]) {
      const score = tasteScoreForGenome(profile, genome);
      assert.ok(Number.isFinite(score));
      assert.ok(score >= -1 && score <= 1);
    }
  }

  const oneDecision = applyTasteDecision(
    createTasteProfile(),
    FM_GENOME,
    "like",
  );
  assert.ok(tasteScoreForGenome(oneDecision, FM_GENOME) > 0);
  assert.equal(tasteStrength(oneDecision), 0);
});

test("fingerprints canonicalize profiles and change with learned evidence", () => {
  const left = normalizeTasteProfile({
    schemaVersion: 1,
    weights: { warmth: 0.25, brightness: -0.5 },
    likes: 4,
    passes: 2,
  });
  const right = normalizeTasteProfile({
    passes: 2,
    likes: 4,
    weights: { brightness: -0.5, warmth: 0.25 },
    schemaVersion: 1,
  });
  assert.equal(tasteFingerprint(left), tasteFingerprint(right));

  const learned = applyTasteDecision(left, FM_GENOME, "like");
  assert.notEqual(tasteFingerprint(left), tasteFingerprint(learned));
  assert.match(tasteFingerprint(left), /^taste-v1-[0-9A-F]{8}$/);
});

test("trait labels are confidence-gated, deterministic, and limited to two", () => {
  const profile = normalizeTasteProfile({
    schemaVersion: 1,
    weights: {
      brightness: 0.92,
      warmth: -0.88,
      hardness: 0.7,
      grit: 0.6,
    },
    likes: 4,
    passes: 2,
  });
  assert.deepEqual(tasteTraitLabels(profile), ["Bright", "Cool"]);
  assert.equal(tasteTraitLabels(profile, 20).length, 2);
  assert.deepEqual(tasteTraitLabels(profile, 0), []);

  const undertrained = normalizeTasteProfile({
    schemaVersion: 1,
    weights: { brightness: 1 },
    likes: 2,
    passes: 0,
  });
  assert.deepEqual(tasteTraitLabels(undertrained), []);
});

test("corrupt profiles, genomes, and decisions fail closed without throwing", () => {
  for (const corrupt of [
    null,
    undefined,
    "bad",
    [],
    { schemaVersion: 99, weights: { brightness: 1 }, likes: 99 },
    {
      schemaVersion: 1,
      weights: { brightness: Infinity },
      likes: -10,
      passes: Number.NaN,
    },
  ]) {
    const normalized = normalizeTasteProfile(corrupt);
    assert.equal(normalized.schemaVersion, 1);
    assert.ok(Object.isFrozen(normalized));
    assert.doesNotThrow(() => tasteFingerprint(corrupt));
    assert.equal(tasteScoreForGenome(corrupt, { engine: "fm" }), 0);
  }

  const profile = createTasteProfile();
  for (const genome of [
    null,
    {},
    { engine: "fm", toneHz: Infinity },
    { engine: "modal", brightness: 0.5 },
    { engine: "string", feedback: 0.9 },
    { engine: "unknown" },
  ]) {
    assert.equal(tasteFeaturesForGenome(genome), null);
    assert.deepEqual(applyTasteDecision(profile, genome, "like"), profile);
  }
  assert.deepEqual(applyTasteDecision(profile, FM_GENOME, "maybe"), profile);
});
