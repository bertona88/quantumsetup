import { clamp, hash32 } from "./generative-utils.js";

export const TASTE_SCHEMA_VERSION = 1;

export const TASTE_TRAITS = Object.freeze([
  "brightness",
  "warmth",
  "hardness",
  "motion",
  "space",
  "sustain",
  "complexity",
  "grit",
]);

const MAX_COUNTER = Math.floor(Number.MAX_SAFE_INTEGER / 4);
const DECISIONS_BEFORE_BIAS = 3;
const DECISIONS_TO_FULL_STRENGTH = 12;

const TRAIT_LABELS = Object.freeze({
  brightness: Object.freeze(["Dark", "Bright"]),
  warmth: Object.freeze(["Cool", "Warm"]),
  hardness: Object.freeze(["Soft", "Hard"]),
  motion: Object.freeze(["Still", "Animated"]),
  space: Object.freeze(["Dry", "Spacious"]),
  sustain: Object.freeze(["Tight", "Lingering"]),
  complexity: Object.freeze(["Pure", "Complex"]),
  grit: Object.freeze(["Clean", "Gritty"]),
});

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function unit(value, minimum, maximum, fallback = 0.5) {
  if (!Number.isFinite(value) || maximum <= minimum) return fallback;
  return clamp((value - minimum) / (maximum - minimum), 0, 1);
}

function centered(value) {
  return clamp(value * 2 - 1, -1, 1);
}

function average(values, fallback = 0.5) {
  const usable = values.filter(Number.isFinite);
  if (usable.length === 0) return fallback;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function averageArray(values, minimum, maximum, fallback = 0.5) {
  if (!Array.isArray(values) || values.length === 0) return fallback;
  const normalized = values
    .filter(Number.isFinite)
    .map((value) => unit(value, minimum, maximum));
  return average(normalized, fallback);
}

function categoricalUnit(value, weights, fallback = 0.5) {
  if (typeof value !== "string") return fallback;
  return Object.hasOwn(weights, value) ? weights[value] : fallback;
}

function stringDiversity(values, expectedLength = 4) {
  if (!Array.isArray(values) || values.length === 0) return 0.5;
  const usable = values.filter((value) => typeof value === "string");
  if (usable.length === 0) return 0.5;
  return clamp(new Set(usable).size / Math.max(1, expectedLength), 0, 1);
}

function hasFiniteFields(value, fields) {
  return fields.every((field) => Number.isFinite(value?.[field]));
}

function freezeFeatures(features) {
  return Object.freeze(
    Object.fromEntries(
      TASTE_TRAITS.map((trait) => [
        trait,
        clamp(finite(features[trait]), -1, 1),
      ]),
    ),
  );
}

function fmFeatures(genome) {
  if (
    !hasFiniteFields(genome, [
      "modulationIndex",
      "feedback",
      "toneHz",
      "filterQ",
      "lfoRateHz",
      "lfoDepthCents",
      "drive",
      "spread",
      "durationScale",
    ]) ||
    !Array.isArray(genome.attacks) ||
    !Array.isArray(genome.sustains) ||
    !Array.isArray(genome.releases)
  ) {
    return null;
  }

  const tone = unit(genome.toneHz, 900, 11200);
  const modulation = unit(genome.modulationIndex, 0.1, 8);
  const feedback = unit(genome.feedback, 0, 0.5);
  const drive = unit(genome.drive, 1, 4.6);
  const attack = averageArray(genome.attacks, 0.001, 0.3);
  const sustain = averageArray(genome.sustains, 0.001, 1);
  const release = averageArray(genome.releases, 0.001, 1.2);
  const brightWaves = Array.isArray(genome.waves)
    ? genome.waves.filter((wave) => wave === "sawtooth" || wave === "square").length /
      Math.max(1, genome.waves.length)
    : 0.5;
  const warmWaves = Array.isArray(genome.waves)
    ? genome.waves.filter((wave) => wave === "sine" || wave === "triangle").length /
      Math.max(1, genome.waves.length)
    : 0.5;

  return freezeFeatures({
    brightness: centered(average([tone, unit(genome.filterQ, 0.5, 8.1), modulation])),
    warmth: centered(average([1 - tone, warmWaves, 1 - drive])),
    hardness: centered(average([1 - attack, modulation, drive])),
    motion: centered(
      average([
        unit(genome.lfoRateHz, 0.05, 5.1),
        unit(genome.lfoDepthCents, 0, 20),
        feedback,
      ]),
    ),
    space: centered(
      average([
        unit(genome.spread, 0, 0.87),
        unit(genome.durationScale, 0.5, 2.01),
        release,
      ]),
    ),
    sustain: centered(
      average([sustain, release, unit(genome.durationScale, 0.5, 2.01)]),
    ),
    complexity: centered(
      average([
        modulation,
        feedback,
        stringDiversity(genome.waves),
        stringDiversity(genome.ratios),
      ]),
    ),
    grit: centered(average([drive, feedback, brightWaves, modulation])),
  });
}

function modalFeatures(genome) {
  if (
    !hasFiniteFields(genome, [
      "modeCount",
      "hardness",
      "noiseMix",
      "brightness",
      "inharmonicity",
      "stiffness",
      "damping",
      "decaySeconds",
      "coupling",
      "body",
      "spread",
      "drive",
    ])
  ) {
    return null;
  }

  const brightness = unit(genome.brightness, 0, 1);
  const hardness = unit(genome.hardness, 0, 1);
  const stiffness = unit(genome.stiffness, 0, 1);
  const damping = unit(genome.damping, 0, 1);
  const inharmonicity = unit(genome.inharmonicity, 0, 0.23);
  const materialWarmth = categoricalUnit(genome.material, {
    wood: 1,
    membrane: 0.82,
    stone: 0.55,
    ceramic: 0.42,
    tube: 0.38,
    glass: 0.28,
    plate: 0.2,
    metal: 0.12,
  });
  const exciterHardness = categoricalUnit(genome.exciter, {
    "soft-mallet": 0.1,
    "hard-mallet": 0.9,
    noise: 0.66,
    scrape: 0.82,
  });

  return freezeFeatures({
    brightness: centered(average([brightness, hardness, inharmonicity])),
    warmth: centered(
      average([materialWarmth, unit(genome.body, 0, 1), 1 - brightness]),
    ),
    hardness: centered(average([hardness, stiffness, exciterHardness])),
    motion: centered(
      average([
        unit(genome.coupling, 0, 0.12),
        inharmonicity,
        stiffness,
      ]),
    ),
    space: centered(
      average([
        unit(genome.spread, 0, 1),
        unit(genome.decaySeconds, 0.1, 2.5),
        1 - damping,
      ]),
    ),
    sustain: centered(
      average([unit(genome.decaySeconds, 0.1, 2.5), 1 - damping]),
    ),
    complexity: centered(
      average([
        unit(genome.modeCount, 4, 8),
        inharmonicity,
        unit(genome.coupling, 0, 0.12),
      ]),
    ),
    grit: centered(
      average([
        unit(genome.drive, 1, 3.6),
        unit(genome.noiseMix, 0, 1),
        hardness,
      ]),
    ),
  });
}

function stringFeatures(genome) {
  if (
    !hasFiniteFields(genome, [
      "feedback",
      "decaySeconds",
      "brightness",
      "stiffness",
      "pickPosition",
      "exciterMass",
      "exciterDamping",
      "damperMass",
      "damperStiffness",
      "bodySize",
      "buzz",
      "spread",
      "drive",
      "releaseSeconds",
    ])
  ) {
    return null;
  }

  const brightness = unit(genome.brightness, 0, 1);
  const stiffness = unit(genome.stiffness, 0, 1);
  const buzz = unit(genome.buzz, 0, 0.65);
  const drive = unit(genome.drive, 1, 3.2);
  const bodyWarmth = categoricalUnit(genome.body, {
    wood: 1,
    hollow: 0.78,
    glass: 0.3,
    metal: 0.14,
  });
  const exciterHardness = categoricalUnit(genome.exciter, {
    "soft-pick": 0.1,
    "hard-pick": 0.76,
    hammer: 0.88,
    scrape: 0.94,
  });
  const terminationGrit = categoricalUnit(genome.termination, {
    open: 0.12,
    damped: 0.32,
    buzz: 1,
  });

  return freezeFeatures({
    brightness: centered(average([brightness, stiffness, terminationGrit])),
    warmth: centered(average([bodyWarmth, 1 - brightness, 1 - drive])),
    hardness: centered(
      average([
        exciterHardness,
        stiffness,
        unit(genome.damperStiffness, 0, 1),
      ]),
    ),
    motion: centered(
      average([
        stiffness,
        buzz,
        Math.abs(unit(genome.pickPosition, 0.08, 0.92) - 0.5) * 2,
      ]),
    ),
    space: centered(
      average([
        unit(genome.spread, 0, 0.77),
        unit(genome.decaySeconds, 0.4, 3.6),
        unit(genome.releaseSeconds, 0.03, 1),
      ]),
    ),
    sustain: centered(
      average([
        unit(genome.feedback, 0.78, 0.986),
        unit(genome.decaySeconds, 0.4, 3.6),
        unit(genome.releaseSeconds, 0.03, 1),
      ]),
    ),
    complexity: centered(
      average([
        stiffness,
        buzz,
        unit(genome.bodySize, 0, 1),
        Math.abs(
          unit(genome.exciterMass, 0, 1) - unit(genome.damperMass, 0, 1),
        ),
      ]),
    ),
    grit: centered(average([drive, buzz, exciterHardness, terminationGrit])),
  });
}

export function tasteFeaturesForGenome(genome) {
  try {
    if (!genome || typeof genome !== "object" || Array.isArray(genome)) return null;
    if (genome.engine === "fm") return fmFeatures(genome);
    if (genome.engine === "modal") return modalFeatures(genome);
    if (genome.engine === "string") return stringFeatures(genome);
    return null;
  } catch {
    return null;
  }
}

function safeCounter(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.floor(value), 0, MAX_COUNTER);
}

function emptyWeights() {
  return Object.fromEntries(TASTE_TRAITS.map((trait) => [trait, 0]));
}

function freezeProfile({ weights, likes, passes }) {
  const safeLikes = safeCounter(likes);
  const safePasses = safeCounter(passes);
  return Object.freeze({
    schemaVersion: TASTE_SCHEMA_VERSION,
    weights: Object.freeze(
      Object.fromEntries(
        TASTE_TRAITS.map((trait) => {
          const weight = clamp(finite(weights?.[trait]), -1, 1);
          return [trait, Object.is(weight, -0) ? 0 : weight];
        }),
      ),
    ),
    decisions: safeLikes + safePasses,
    likes: safeLikes,
    passes: safePasses,
  });
}

export function createTasteProfile() {
  return freezeProfile({ weights: emptyWeights(), likes: 0, passes: 0 });
}

export function normalizeTasteProfile(value) {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value.schemaVersion !== TASTE_SCHEMA_VERSION
    ) {
      return createTasteProfile();
    }
    return freezeProfile({
      weights: value.weights,
      likes: value.likes,
      passes: value.passes,
    });
  } catch {
    return createTasteProfile();
  }
}

export function applyTasteDecision(profile, genome, decision) {
  const current = normalizeTasteProfile(profile);
  const normalizedDecision =
    typeof decision === "string" ? decision.toLowerCase() : "";
  const direction =
    normalizedDecision === "like" ? 1 : normalizedDecision === "pass" ? -1 : 0;
  const features = tasteFeaturesForGenome(genome);
  if (!direction || !features) return current;

  const nextLikes = current.likes + (direction > 0 ? 1 : 0);
  const nextPasses = current.passes + (direction < 0 ? 1 : 0);
  const nextDecisions = current.decisions + 1;
  const weights = Object.fromEntries(
    TASTE_TRAITS.map((trait) => [
      trait,
      clamp(
        (current.weights[trait] * current.decisions +
          direction * features[trait]) /
          nextDecisions,
        -1,
        1,
      ),
    ]),
  );

  return freezeProfile({
    weights,
    likes: nextLikes,
    passes: nextPasses,
  });
}

export function tasteStrength(profile) {
  const { decisions } = normalizeTasteProfile(profile);
  if (decisions < DECISIONS_BEFORE_BIAS) return 0;
  return clamp(
    (decisions - (DECISIONS_BEFORE_BIAS - 1)) /
      (DECISIONS_TO_FULL_STRENGTH - (DECISIONS_BEFORE_BIAS - 1)),
    0,
    1,
  );
}

export function tasteScoreForGenome(profile, genome) {
  const normalized = normalizeTasteProfile(profile);
  const features = tasteFeaturesForGenome(genome);
  if (!features) return 0;

  const weightMass = TASTE_TRAITS.reduce(
    (total, trait) => total + Math.abs(normalized.weights[trait]),
    0,
  );
  if (weightMass <= Number.EPSILON) return 0;
  const affinity =
    TASTE_TRAITS.reduce(
      (total, trait) =>
        total + normalized.weights[trait] * features[trait],
      0,
    ) / weightMass;
  return clamp(affinity, -1, 1);
}

export function tasteFingerprint(profile) {
  const normalized = normalizeTasteProfile(profile);
  const canonical = [
    `v${normalized.schemaVersion}`,
    `d${normalized.decisions}`,
    `l${normalized.likes}`,
    `p${normalized.passes}`,
    ...TASTE_TRAITS.map(
      (trait) => `${trait}:${normalized.weights[trait].toFixed(6)}`,
    ),
  ].join("|");
  const digest = hash32(canonical)
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
  return `taste-v${TASTE_SCHEMA_VERSION}-${digest}`;
}

export function tasteTraitLabels(profile, maximum = 2) {
  const normalized = normalizeTasteProfile(profile);
  if (tasteStrength(normalized) <= 0) return Object.freeze([]);
  const limit = clamp(
    Number.isFinite(maximum) ? Math.floor(maximum) : 2,
    0,
    2,
  );
  const labels = TASTE_TRAITS
    .map((trait, index) => ({
      trait,
      index,
      weight: normalized.weights[trait],
    }))
    .filter(({ weight }) => Math.abs(weight) >= 0.08)
    .sort(
      (left, right) =>
        Math.abs(right.weight) - Math.abs(left.weight) ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map(({ trait, weight }) => TRAIT_LABELS[trait][weight < 0 ? 0 : 1]);
  return Object.freeze(labels);
}
