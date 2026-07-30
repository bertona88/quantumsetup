import { clamp, hash32, makeRng } from "./generative-utils.js";
import {
  tasteScoreForGenome,
  tasteStrength,
} from "./taste-model.js";

export const SYNTH_GENOME_VERSION = "1.2.0";
export const SYNTH_REACHABILITY_TARGET = 170;
export const SYNTH_BASE_ARCHITECTURES = 208;
const SYNTH_HANDOFF_OPERATIONS = Object.freeze([
  "mutate",
  "replace",
  "recall",
]);

function hasTasteSignal(profile) {
  return tasteStrength(profile) > 0;
}

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
  const candidateCoordinate =
    context.candidateIndex > 0
      ? ["candidate", context.candidateIndex]
      : [];
  return makeRng(
    hash32(
      SYNTH_GENOME_VERSION,
      context.engine,
      context.seed,
      context.epoch,
      context.vibeId,
      ...candidateCoordinate,
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

function genomeIdentity(context) {
  const candidateCoordinate =
    context.candidateIndex > 0
      ? ["candidate", context.candidateIndex]
      : [];
  const digest = hash32(
    SYNTH_GENOME_VERSION,
    context.engine,
    context.seed,
    context.epoch,
    context.vibeId,
    context.profileIdentity,
    ...candidateCoordinate,
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

function createFmGenome(
  seed,
  epoch,
  vibeId,
  sourceProfile,
  candidateIndex = 0,
) {
  const profile = normalizedProfile(sourceProfile);
  const context = {
    engine: "fm",
    seed,
    epoch,
    vibeId,
    profileIdentity: profileIdentity(profile),
    candidateIndex,
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

function createModalGenome(
  seed,
  epoch,
  vibeId,
  sourceProfile,
  candidateIndex = 0,
) {
  const profile = normalizedProfile(sourceProfile);
  const context = {
    engine: "modal",
    seed,
    epoch,
    vibeId,
    profileIdentity: profileIdentity(profile),
    candidateIndex,
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
        clamp(
          ratio *
            (1 + inharmonicity * index * index * 0.045) *
            (1 + stiffness * index * 0.006),
          0.9,
          40,
        ),
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

function createStringGenome(
  seed,
  epoch,
  vibeId,
  sourceProfile,
  candidateIndex = 0,
) {
  const profile = normalizedProfile(sourceProfile);
  const context = {
    engine: "string",
    seed,
    epoch,
    vibeId,
    profileIdentity: profileIdentity(profile),
    candidateIndex,
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

export function createSynthCandidates({
  seed,
  engine,
  epoch = 0,
  vibeId = "hypnotic",
  profile = DEFAULT_PROFILE,
  candidateCount = 8,
}) {
  if (!SYNTH_ENGINE_IDS.includes(engine)) return Object.freeze([]);
  const count = clamp(Math.floor(candidateCount), 1, 8);
  const factory =
    engine === "fm"
      ? createFmGenome
      : engine === "modal"
        ? createModalGenome
        : createStringGenome;
  return Object.freeze(
    Array.from({ length: count }, (_, candidateIndex) =>
      factory(
        seed,
        Math.max(0, Math.floor(epoch)),
        vibeId,
        profile,
        candidateIndex,
      ),
    ),
  );
}

export function selectSynthCandidate({
  candidates,
  tasteProfile = null,
  selectionSeed = 0,
}) {
  const valid = (Array.isArray(candidates) ? candidates : []).filter(
    validateSynthGenome,
  );
  if (valid.length === 0) return null;
  if (!hasTasteSignal(tasteProfile)) return valid[0];
  const strength = tasteStrength(tasteProfile);
  return [...valid].sort((left, right) => {
    const leftScore =
      tasteScoreForGenome(tasteProfile, left) * strength +
      (((hash32(selectionSeed, left.id, "explore") >>> 0) / 4294967295) -
        0.5) *
        (1 - strength) *
        0.16;
    const rightScore =
      tasteScoreForGenome(tasteProfile, right) * strength +
      (((hash32(selectionSeed, right.id, "explore") >>> 0) / 4294967295) -
        0.5) *
        (1 - strength) *
        0.16;
    return rightScore - leftScore || left.id.localeCompare(right.id);
  })[0];
}

export function createSynthPalette({
  seed,
  bar = 0,
  vibeId = "hypnotic",
  profile = DEFAULT_PROFILE,
  tasteProfile = null,
  form = null,
}) {
  const phraseIndex = Number.isFinite(form?.phraseIndex)
    ? Math.max(0, Math.floor(form.phraseIndex))
    : Math.floor(Math.max(0, Number(bar) || 0) / 8);
  const lineageId = form?.motifLineageId;
  const mutationCount = Number.isFinite(form?.motifMutationCount)
    ? Math.max(0, Math.floor(form.motifMutationCount))
    : 0;
  const handoff = form ? synthHandoffForForm(seed, form) : null;
  const select = (engine) => {
    const epoch =
      lineageId !== undefined && lineageId !== null
        ? hash32(
            SYNTH_GENOME_VERSION,
            seed,
            lineageId,
            mutationCount,
            engine,
            "form-palette-epoch",
          ) >>> 0
        : hash32(
            SYNTH_GENOME_VERSION,
            seed,
            engine,
            "standalone-palette-origin",
          ) >>> 0;
    const tasteAuthorized =
      handoff?.engine === engine && hasTasteSignal(tasteProfile);
    return selectSynthCandidate({
      candidates: createSynthCandidates({
        seed,
        engine,
        epoch,
        vibeId,
        profile,
        candidateCount: tasteAuthorized ? 8 : 1,
      }),
      tasteProfile: tasteAuthorized ? tasteProfile : null,
      selectionSeed: hash32(
        SYNTH_GENOME_VERSION,
        seed,
        lineageId ?? "standalone",
        mutationCount,
        engine,
        "form-taste-selection",
      ),
    });
  };
  return Object.freeze({
    phraseIndex,
    fm: select("fm"),
    modal: select("modal"),
    string: select("string"),
  });
}

export function synthHandoffForForm(seed, form) {
  const operation = form?.motifOperation;
  if (!SYNTH_HANDOFF_OPERATIONS.includes(operation)) return null;
  const lineageId = form?.motifLineageId;
  if (lineageId === undefined || lineageId === null) return null;
  const mutationCount = Number.isFinite(form?.motifMutationCount)
    ? Math.max(0, Math.floor(form.motifMutationCount))
    : 0;
  const phraseIndex = Number.isFinite(form?.phraseIndex)
    ? Math.max(0, Math.floor(form.phraseIndex))
    : 0;
  const scores = Object.fromEntries(
    SYNTH_ENGINE_IDS.map((engine) => [
      engine,
      hash32(
        SYNTH_GENOME_VERSION,
        seed,
        lineageId,
        mutationCount,
        operation,
        engine,
        "form-handoff-engine",
      ) >>> 0,
    ]),
  );
  const engine = SYNTH_ENGINE_IDS.reduce((winner, candidate) =>
    scores[candidate] > scores[winner] ? candidate : winner,
  );
  const digest = hash32(
    SYNTH_GENOME_VERSION,
    seed,
    lineageId,
    mutationCount,
    operation,
    phraseIndex,
    engine,
    "form-handoff-id",
  )
    .toString(16)
    .toUpperCase()
    .padStart(8, "0");
  return Object.freeze({
    id: `synth-handoff-${digest}`,
    engine,
    operation,
    lineageId,
    mutationCount,
    phraseIndex,
  });
}

export function stageSynthPalette(previous, candidate, handoff = null) {
  const validCandidate = SYNTH_ENGINE_IDS.every((engine) =>
    validateSynthGenome(candidate?.[engine]),
  );
  if (!validCandidate) return null;
  const validPrevious = SYNTH_ENGINE_IDS.every((engine) =>
    validateSynthGenome(previous?.[engine]),
  );
  if (!validPrevious) return candidate;
  if (
    !handoff ||
    !SYNTH_ENGINE_IDS.includes(handoff.engine) ||
    !SYNTH_HANDOFF_OPERATIONS.includes(handoff.operation)
  ) {
    return previous;
  }
  return Object.freeze({
    phraseIndex: Number.isFinite(handoff.phraseIndex)
      ? Math.max(0, Math.floor(handoff.phraseIndex))
      : previous.phraseIndex,
    ...Object.fromEntries(
      SYNTH_ENGINE_IDS.map((engine) => [
        engine,
        engine === handoff.engine ? candidate[engine] : previous[engine],
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
