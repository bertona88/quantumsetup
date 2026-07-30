import { clamp, hash32, makeRng } from "./generative-utils.js";

export const SYNTH_GENOME_VERSION = "1.1.0";
export const SYNTH_REACHABILITY_TARGET = 170;
export const SYNTH_BASE_ARCHITECTURES = 208;

export const SYNTH_ENGINE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "fm", label: "MATRIX", detail: "4-OP FM", mutationOffset: 0 }),
  Object.freeze({ id: "modal", label: "RESONATOR", detail: "MODAL BODY", mutationOffset: 1 }),
  Object.freeze({ id: "string", label: "STRING", detail: "WAVEGUIDE", mutationOffset: 2 }),
]);

export const SYNTH_ENGINE_IDS = Object.freeze(
  SYNTH_ENGINE_DEFINITIONS.map((engine) => engine.id),
);

export const FM_ALGORITHMS = Object.freeze([
  Object.freeze({
    id: "cascade",
    label: "CASCADE",
    carriers: Object.freeze([0]),
    edges: Object.freeze([[3, 2], [2, 1], [1, 0]].map(Object.freeze)),
  }),
  Object.freeze({
    id: "branch",
    label: "BRANCH",
    carriers: Object.freeze([0]),
    edges: Object.freeze([[3, 1], [2, 1], [1, 0]].map(Object.freeze)),
  }),
  Object.freeze({
    id: "fork",
    label: "FORK",
    carriers: Object.freeze([0]),
    edges: Object.freeze([[3, 2], [3, 1], [2, 0], [1, 0]].map(Object.freeze)),
  }),
  Object.freeze({
    id: "dual",
    label: "DUAL",
    carriers: Object.freeze([0, 2]),
    edges: Object.freeze([[1, 0], [3, 2]].map(Object.freeze)),
  }),
  Object.freeze({
    id: "parallel",
    label: "PARALLEL",
    carriers: Object.freeze([0, 1, 2, 3]),
    edges: Object.freeze([]),
  }),
  Object.freeze({
    id: "tower-tone",
    label: "TOWER + TONE",
    carriers: Object.freeze([0, 3]),
    edges: Object.freeze([[2, 1], [1, 0]].map(Object.freeze)),
  }),
  Object.freeze({
    id: "trident",
    label: "TRIDENT",
    carriers: Object.freeze([0]),
    edges: Object.freeze([[3, 0], [2, 0], [1, 0]].map(Object.freeze)),
  }),
  Object.freeze({
    id: "split-cascade",
    label: "SPLIT CASCADE",
    carriers: Object.freeze([0, 1]),
    edges: Object.freeze([[3, 2], [2, 0]].map(Object.freeze)),
  }),
]);

const FM_RATIO_FAMILIES = Object.freeze({
  harmonic: Object.freeze([1, 2, 3, 4]),
  subharmonic: Object.freeze([1, 0.5, 1.5, 2.5]),
  odd: Object.freeze([1, 3, 5, 7]),
  cluster: Object.freeze([1, 1.5, 2.01, 3.97]),
});

const FM_ENVELOPE_FAMILIES = Object.freeze({
  pluck: Object.freeze({
    attack: Object.freeze([0.002, 0.001, 0.001, 0.001]),
    decay: Object.freeze([0.11, 0.16, 0.09, 0.07]),
    sustain: Object.freeze([0.14, 0.08, 0.04, 0.03]),
    release: Object.freeze([0.09, 0.12, 0.08, 0.06]),
  }),
  stab: Object.freeze({
    attack: Object.freeze([0.006, 0.003, 0.003, 0.002]),
    decay: Object.freeze([0.26, 0.31, 0.22, 0.18]),
    sustain: Object.freeze([0.42, 0.28, 0.2, 0.14]),
    release: Object.freeze([0.24, 0.3, 0.2, 0.16]),
  }),
  bloom: Object.freeze({
    attack: Object.freeze([0.045, 0.028, 0.02, 0.016]),
    decay: Object.freeze([0.72, 0.58, 0.46, 0.36]),
    sustain: Object.freeze([0.68, 0.46, 0.34, 0.24]),
    release: Object.freeze([0.82, 0.68, 0.54, 0.42]),
  }),
});

const MODAL_MATERIAL_RATIOS = Object.freeze({
  wood: Object.freeze([1, 2.61, 4.18, 6.43, 9.17, 12.31, 16.08, 20.36]),
  metal: Object.freeze([1, 2.02, 3.93, 5.47, 8.21, 11.42, 15.76, 20.84]),
  glass: Object.freeze([1, 2.32, 4.25, 6.63, 9.38, 12.78, 17.14, 22.04]),
  membrane: Object.freeze([1, 1.59, 2.14, 2.3, 2.65, 2.92, 3.5, 4.06]),
  stone: Object.freeze([1, 2.19, 3.68, 5.91, 8.74, 12.06, 16.52, 21.31]),
  ceramic: Object.freeze([1, 2.08, 3.76, 6.08, 8.96, 12.57, 16.94, 22.22]),
  plate: Object.freeze([1, 2.8, 5.15, 8.25, 12.1, 16.7, 22.05, 28.18]),
  tube: Object.freeze([1, 3, 5, 7, 9, 11, 13, 15]),
});

const WAVEFORMS = Object.freeze(["sine", "triangle", "sawtooth", "square"]);
const MODAL_EXCITERS = Object.freeze(["soft-mallet", "hard-mallet", "noise", "scrape"]);
const MODAL_STRUCTURES = Object.freeze(["parallel", "coupled"]);
const STRING_EXCITERS = Object.freeze(["soft-pick", "hard-pick", "hammer", "scrape"]);
const STRING_BODIES = Object.freeze(["wood", "metal", "glass", "hollow"]);
const STRING_TERMINATIONS = Object.freeze(["open", "damped", "buzz"]);
const DEFAULT_PROFILE = Object.freeze({
  density: 0.6,
  drive: 0.6,
  space: 0.5,
  swing: 0.2,
  acid: 0.4,
  chords: 0.4,
  texture: 0.5,
  metallic: 0.4,
  rumble: 0.5,
  warmth: 0.5,
  syncopation: 0.6,
});

function round(value, digits = 5) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizedProfile(profile) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULT_PROFILE)) {
    result[key] = clamp(
      Number.isFinite(profile?.[key]) ? profile[key] : fallback,
      0,
      1,
    );
  }
  return result;
}

function profileIdentity(profile) {
  return Object.entries(profile)
    .map(([key, value]) => `${key}:${round(value, 4)}`)
    .join("|");
}

function coordinateUnit(context, parameter, index = 0) {
  return makeRng(
    hash32(
      SYNTH_GENOME_VERSION,
      context.engine,
      context.seed,
      context.epoch,
      context.vibeId,
      parameter,
      index,
    ),
  )();
}

function pickAt(context, parameter, values, index = 0) {
  const unit = coordinateUnit(context, parameter, index);
  return values[Math.min(values.length - 1, Math.floor(unit * values.length))];
}

function rangedAt(context, parameter, minimum, maximum, index = 0) {
  return round(minimum + coordinateUnit(context, parameter, index) * (maximum - minimum));
}

function mutationEpoch(phraseIndex, offset) {
  return Math.floor((Math.max(0, phraseIndex) + (3 - offset)) / 3);
}

function genomeIdentity(context) {
  const digest = hash32(
    SYNTH_GENOME_VERSION,
    context.engine,
    context.seed,
    context.epoch,
    context.vibeId,
    context.profileIdentity,
  )
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
  return `${context.engine}-${digest}`;
}

function freezeGenome(genome) {
  for (const key of [
    "ratios",
    "levels",
    "waves",
    "attacks",
    "decays",
    "sustains",
    "releases",
  ]) {
    if (Array.isArray(genome[key])) Object.freeze(genome[key]);
  }
  return Object.freeze(genome);
}

function createFmGenome(seed, epoch, vibeId, sourceProfile) {
  const profile = normalizedProfile(sourceProfile);
  const context = {
    engine: "fm",
    seed,
    epoch,
    vibeId,
    profileIdentity: profileIdentity(profile),
  };
  const algorithm = pickAt(context, "algorithm", FM_ALGORITHMS);
  const ratioFamily = pickAt(
    context,
    "ratioFamily",
    Object.keys(FM_RATIO_FAMILIES),
  );
  const envelopeFamily = pickAt(
    context,
    "envelopeFamily",
    Object.keys(FM_ENVELOPE_FAMILIES),
  );
  const ratioBase = FM_RATIO_FAMILIES[ratioFamily];
  const envelopeBase = FM_ENVELOPE_FAMILIES[envelopeFamily];
  const ratios = ratioBase.map((ratio, index) => {
    const octave = pickAt(context, "ratioOctave", index === 0 ? [1] : [0.5, 1, 1, 2], index);
    return round(clamp(ratio * octave, 0.25, 16));
  });
  const waves = Array.from({ length: 4 }, (_, index) =>
    pickAt(
      context,
      "wave",
      index === 0 && profile.warmth > 0.62
        ? ["sine", "triangle", "sawtooth"]
        : WAVEFORMS,
      index,
    ),
  );
  const levels = [
    rangedAt(context, "level", 0.62, 1, 0),
    rangedAt(context, "level", 0.18, 0.94, 1),
    rangedAt(context, "level", 0.12, 0.88, 2),
    rangedAt(context, "level", 0.08, 0.82, 3),
  ];
  const envelope = (name, base, index, amount) =>
    round(
      clamp(
        base *
          (1 - amount + coordinateUnit(context, name, index) * amount * 2),
        0.001,
        1.2,
      ),
    );
  const attacks = envelopeBase.attack.map((base, index) =>
    envelope("attack", base, index, 0.38 + profile.space * 0.16),
  );
  const decays = envelopeBase.decay.map((base, index) =>
    envelope("decay", base, index, 0.34 + profile.space * 0.22),
  );
  const sustains = envelopeBase.sustain.map((base, index) =>
    round(clamp(base + (coordinateUnit(context, "sustain", index) - 0.5) * 0.18, 0.01, 0.92)),
  );
  const releases = envelopeBase.release.map((base, index) =>
    envelope("release", base, index, 0.34 + profile.space * 0.28),
  );
  return freezeGenome({
    id: genomeIdentity(context),
    engine: "fm",
    label: `MATRIX · ${algorithm.label}`,
    detail: `${ratioFamily.toUpperCase()} / ${envelopeFamily.toUpperCase()}`,
    epoch,
    algorithm: algorithm.id,
    ratioFamily,
    envelopeFamily,
    ratios,
    levels,
    waves,
    attacks,
    decays,
    sustains,
    releases,
    modulationIndex: rangedAt(
      context,
      "modulationIndex",
      0.22 + profile.warmth * 0.15,
      2.4 + profile.acid * 3.6 + profile.metallic * 1.8,
    ),
    feedback: rangedAt(context, "feedback", 0, 0.12 + profile.drive * 0.38),
    toneHz: round(
      clamp(
        1250 +
          profile.warmth * 900 +
          (profile.metallic + coordinateUnit(context, "toneHz")) * 3900,
        900,
        11200,
      ),
      2,
    ),
    filterQ: rangedAt(context, "filterQ", 0.55, 2.5 + profile.acid * 5.5),
    filterEnvelope: rangedAt(context, "filterEnvelope", 0.08, 0.35 + profile.acid * 0.65),
    detuneCents: rangedAt(context, "detuneCents", -9, 9),
    lfoRateHz: rangedAt(context, "lfoRateHz", 0.06, 0.8 + profile.texture * 4.2),
    lfoDepthCents: rangedAt(context, "lfoDepthCents", 0, 3 + profile.texture * 16),
    drive: rangedAt(context, "drive", 1.05, 1.7 + profile.drive * 2.8),
    spread: rangedAt(context, "spread", 0.02, 0.24 + profile.space * 0.62),
    durationScale: rangedAt(context, "durationScale", 0.52, 0.92 + profile.space * 1.08),
  });
}

function createModalGenome(seed, epoch, vibeId, sourceProfile) {
  const profile = normalizedProfile(sourceProfile);
  const context = {
    engine: "modal",
    seed,
    epoch,
    vibeId,
    profileIdentity: profileIdentity(profile),
  };
  const materials = Object.keys(MODAL_MATERIAL_RATIOS);
  const material = pickAt(context, "material", materials);
  const structure = pickAt(context, "structure", MODAL_STRUCTURES);
  const exciter = pickAt(context, "exciter", MODAL_EXCITERS);
  const modeCount = 4 + Math.floor(coordinateUnit(context, "modeCount") * 5);
  const inharmonicity = rangedAt(
    context,
    "inharmonicity",
    0.002,
    0.035 + profile.metallic * 0.19,
  );
  const stiffness = rangedAt(
    context,
    "stiffness",
    0.06,
    0.28 + profile.metallic * 0.7,
  );
  const ratios = MODAL_MATERIAL_RATIOS[material]
    .slice(0, modeCount)
    .map((ratio, index) =>
      round(
        ratio *
          (1 + inharmonicity * index * index * 0.045) *
          (1 + stiffness * index * 0.006),
      ),
    );
  const hardnessFloor = exciter === "soft-mallet" ? 0.04 : exciter === "hard-mallet" ? 0.58 : 0.12;
  const hardnessCeiling = exciter === "soft-mallet" ? 0.48 : 0.98;
  return freezeGenome({
    id: genomeIdentity(context),
    engine: "modal",
    label: `RESONATOR · ${material.toUpperCase()}`,
    detail: `${exciter.toUpperCase()} / ${structure.toUpperCase()}`,
    epoch,
    material,
    structure,
    exciter,
    modeCount,
    ratios,
    hardness: rangedAt(context, "hardness", hardnessFloor, hardnessCeiling),
    noiseMix: rangedAt(context, "noiseMix", 0.03, 0.28 + profile.texture * 0.65),
    strikePosition: rangedAt(context, "strikePosition", 0.06, 0.94),
    brightness: rangedAt(context, "brightness", 0.18, 0.5 + profile.metallic * 0.48),
    inharmonicity,
    stiffness,
    damping: rangedAt(context, "damping", 0.18, 0.55 + (1 - profile.space) * 0.4),
    decaySeconds: rangedAt(context, "decaySeconds", 0.16, 0.58 + profile.space * 1.9),
    coupling: rangedAt(context, "coupling", 0.04, 0.12),
    body: rangedAt(context, "body", 0.12, 0.52 + profile.warmth * 0.46),
    spread: rangedAt(context, "spread", 0.03, 0.22 + profile.space * 0.7),
    detuneCents: rangedAt(context, "detuneCents", -7, 7),
    drive: rangedAt(context, "drive", 1, 1.35 + profile.drive * 2.2),
  });
}

function createStringGenome(seed, epoch, vibeId, sourceProfile) {
  const profile = normalizedProfile(sourceProfile);
  const context = {
    engine: "string",
    seed,
    epoch,
    vibeId,
    profileIdentity: profileIdentity(profile),
  };
  const exciter = pickAt(context, "exciter", STRING_EXCITERS);
  const body = pickAt(context, "body", STRING_BODIES);
  const termination = pickAt(context, "termination", STRING_TERMINATIONS);
  const feedbackMaximum =
    termination === "damped" ? 0.955 : termination === "buzz" ? 0.973 : 0.985;
  return freezeGenome({
    id: genomeIdentity(context),
    engine: "string",
    label: `STRING · ${exciter.toUpperCase()}`,
    detail: `${body.toUpperCase()} / ${termination.toUpperCase()}`,
    epoch,
    exciter,
    body,
    termination,
    feedback: rangedAt(context, "feedback", 0.79, feedbackMaximum),
    decaySeconds: rangedAt(context, "decaySeconds", 0.48, 1.15 + profile.space * 2.4),
    brightness: rangedAt(context, "brightness", 0.12, 0.48 + profile.metallic * 0.5),
    stiffness: rangedAt(context, "stiffness", 0.03, 0.24 + profile.metallic * 0.65),
    pickPosition: rangedAt(context, "pickPosition", 0.08, 0.92),
    exciterMass: rangedAt(context, "exciterMass", 0.08, 0.95),
    exciterDamping: rangedAt(context, "exciterDamping", 0.06, 0.92),
    damperMass: rangedAt(context, "damperMass", 0.04, 0.86),
    damperStiffness: rangedAt(context, "damperStiffness", 0.04, 0.93),
    bodySize: rangedAt(context, "bodySize", 0.12, 0.96),
    buzz: rangedAt(
      context,
      "buzz",
      termination === "buzz" ? 0.16 : 0,
      termination === "buzz" ? 0.48 + profile.drive * 0.16 : 0.16,
    ),
    spread: rangedAt(context, "spread", 0.02, 0.18 + profile.space * 0.58),
    detuneCents: rangedAt(context, "detuneCents", -6, 6),
    drive: rangedAt(context, "drive", 1, 1.25 + profile.drive * 1.9),
    releaseSeconds: rangedAt(context, "releaseSeconds", 0.04, 0.22 + profile.space * 0.72),
    fixedPosition: coordinateUnit(context, "fixedPosition") < 0.56,
  });
}

export function createSynthPalette({
  seed,
  bar,
  vibeId = "hypnotic",
  profile = DEFAULT_PROFILE,
}) {
  const phraseIndex = Math.floor(Math.max(0, bar) / 8);
  return Object.freeze({
    phraseIndex,
    fm: createFmGenome(seed, mutationEpoch(phraseIndex, 0), vibeId, profile),
    modal: createModalGenome(seed, mutationEpoch(phraseIndex, 1), vibeId, profile),
    string: createStringGenome(seed, mutationEpoch(phraseIndex, 2), vibeId, profile),
  });
}

export function synthMutationEngineForPhrase(phraseIndex) {
  const index = Math.max(0, Math.floor(phraseIndex)) % SYNTH_ENGINE_IDS.length;
  return SYNTH_ENGINE_IDS[index];
}

export function stageSynthPalette(previous, candidate, phraseIndex) {
  const validCandidate = SYNTH_ENGINE_IDS.every((engine) =>
    validateSynthGenome(candidate?.[engine]),
  );
  if (!validCandidate) return null;
  const validPrevious = SYNTH_ENGINE_IDS.every((engine) =>
    validateSynthGenome(previous?.[engine]),
  );
  if (!validPrevious) return candidate;
  const mutationEngine = synthMutationEngineForPhrase(phraseIndex);
  return Object.freeze({
    phraseIndex: Math.max(0, Math.floor(phraseIndex)),
    ...Object.fromEntries(
      SYNTH_ENGINE_IDS.map((engine) => [
        engine,
        engine === mutationEngine ? candidate[engine] : previous[engine],
      ]),
    ),
  });
}

export function fmAlgorithmFor(id) {
  return FM_ALGORITHMS.find((algorithm) => algorithm.id === id) || null;
}

function finiteBetween(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function finiteArray(values, length, minimum, maximum) {
  return (
    Array.isArray(values) &&
    values.length === length &&
    values.every((value) => finiteBetween(value, minimum, maximum))
  );
}

export function validateSynthGenome(genome) {
  if (
    !genome ||
    typeof genome.id !== "string" ||
    typeof genome.label !== "string" ||
    !SYNTH_ENGINE_IDS.includes(genome.engine) ||
    !Number.isInteger(genome.epoch)
  ) {
    return false;
  }
  if (genome.engine === "fm") {
    return (
      Boolean(fmAlgorithmFor(genome.algorithm)) &&
      Object.hasOwn(FM_RATIO_FAMILIES, genome.ratioFamily) &&
      Object.hasOwn(FM_ENVELOPE_FAMILIES, genome.envelopeFamily) &&
      finiteArray(genome.ratios, 4, 0.25, 16) &&
      finiteArray(genome.levels, 4, 0, 1) &&
      Array.isArray(genome.waves) &&
      genome.waves.length === 4 &&
      genome.waves.every((wave) => WAVEFORMS.includes(wave)) &&
      finiteArray(genome.attacks, 4, 0.001, 1.2) &&
      finiteArray(genome.decays, 4, 0.001, 1.2) &&
      finiteArray(genome.sustains, 4, 0.001, 1) &&
      finiteArray(genome.releases, 4, 0.001, 1.2) &&
      finiteBetween(genome.modulationIndex, 0.1, 8) &&
      finiteBetween(genome.feedback, 0, 0.5) &&
      finiteBetween(genome.toneHz, 900, 11200) &&
      finiteBetween(genome.filterQ, 0.5, 8.1) &&
      finiteBetween(genome.filterEnvelope, 0, 1) &&
      finiteBetween(genome.detuneCents, -9, 9) &&
      finiteBetween(genome.lfoRateHz, 0.05, 5.1) &&
      finiteBetween(genome.lfoDepthCents, 0, 20) &&
      finiteBetween(genome.drive, 1, 4.6) &&
      finiteBetween(genome.spread, 0, 0.87) &&
      finiteBetween(genome.durationScale, 0.5, 2.01)
    );
  }
  if (genome.engine === "modal") {
    return (
      Object.hasOwn(MODAL_MATERIAL_RATIOS, genome.material) &&
      MODAL_STRUCTURES.includes(genome.structure) &&
      MODAL_EXCITERS.includes(genome.exciter) &&
      Number.isInteger(genome.modeCount) &&
      genome.modeCount >= 4 &&
      genome.modeCount <= 8 &&
      finiteArray(genome.ratios, genome.modeCount, 0.9, 40) &&
      finiteBetween(genome.hardness, 0, 1) &&
      finiteBetween(genome.noiseMix, 0, 1) &&
      finiteBetween(genome.strikePosition, 0, 1) &&
      finiteBetween(genome.brightness, 0, 1) &&
      finiteBetween(genome.inharmonicity, 0, 0.23) &&
      finiteBetween(genome.stiffness, 0, 1) &&
      finiteBetween(genome.damping, 0, 1) &&
      finiteBetween(genome.decaySeconds, 0.1, 2.5) &&
      finiteBetween(genome.coupling, 0, 0.12) &&
      finiteBetween(genome.body, 0, 1) &&
      finiteBetween(genome.spread, 0, 1) &&
      finiteBetween(genome.detuneCents, -7, 7) &&
      finiteBetween(genome.drive, 1, 3.6)
    );
  }
  return (
    STRING_EXCITERS.includes(genome.exciter) &&
    STRING_BODIES.includes(genome.body) &&
    STRING_TERMINATIONS.includes(genome.termination) &&
    finiteBetween(genome.feedback, 0.78, 0.986) &&
    finiteBetween(genome.decaySeconds, 0.4, 3.6) &&
    finiteBetween(genome.brightness, 0, 1) &&
    finiteBetween(genome.stiffness, 0, 1) &&
    finiteBetween(genome.pickPosition, 0.08, 0.92) &&
    finiteBetween(genome.exciterMass, 0, 1) &&
    finiteBetween(genome.exciterDamping, 0, 1) &&
    finiteBetween(genome.damperMass, 0, 1) &&
    finiteBetween(genome.damperStiffness, 0, 1) &&
    finiteBetween(genome.bodySize, 0, 1) &&
    finiteBetween(genome.buzz, 0, 0.65) &&
    finiteBetween(genome.spread, 0, 0.77) &&
    finiteBetween(genome.detuneCents, -6, 6) &&
    finiteBetween(genome.drive, 1, 3.2) &&
    finiteBetween(genome.releaseSeconds, 0.03, 1) &&
    typeof genome.fixedPosition === "boolean"
  );
}

export function synthStructuralSignature(genome) {
  if (!validateSynthGenome(genome)) return "";
  if (genome.engine === "fm") {
    return `fm/${genome.algorithm}/${genome.ratioFamily}/${genome.envelopeFamily}`;
  }
  if (genome.engine === "modal") {
    return `modal/${genome.exciter}/${genome.material}/${genome.structure}`;
  }
  return `string/${genome.exciter}/${genome.body}/${genome.termination}`;
}

export function synthGenomeSignature(genome) {
  if (!validateSynthGenome(genome)) return "";
  const entries = Object.entries(genome)
    .filter(([key]) => !["id", "label", "detail", "epoch"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(entries);
}
