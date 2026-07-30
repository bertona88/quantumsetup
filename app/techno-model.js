import {
  clamp,
  hash32,
  lerp,
  makeRng,
  midiToHz,
} from "./generative-utils.js";
import {
  createSynthPalette,
  synthHandoffForForm,
} from "./synth-genomes.js";
import {
  FORM_RULES,
  derivePhraseState,
  traceEmergentForm,
} from "./emergent-form.js";
import { createTrackDNA } from "./track-dna.js";

export {
  FORM_RULES,
  clamp,
  derivePhraseState,
  hash32,
  lerp,
  makeRng,
  midiToHz,
};

export const GENERATOR_VERSION = "1.5.0";
export const STEPS_PER_BAR = 16;
export const PHRASE_BARS = 8;
export const MOVEMENT_BARS = 192;
const MOVEMENT_CACHE_LIMIT = 64;
const movementCache = new Map();
const MATERIAL_CACHE_LIMIT = 256;
const materialCache = new Map();

const PROFILE_KEYS = [
  "density",
  "drive",
  "space",
  "swing",
  "acid",
  "chords",
  "texture",
  "metallic",
  "rumble",
  "warmth",
  "syncopation",
  "breakDepth",
  "tempoDrift",
];

const PROFILE_DEFINITIONS = {
  hypnotic: {
    id: "hypnotic",
    label: "Hypnotic",
    note: "Patient polyrhythms, rolling low end, restrained peaks.",
    bpm: [127, 134],
    density: 0.68,
    drive: 0.62,
    space: 0.42,
    swing: 0.18,
    acid: 0.34,
    chords: 0.28,
    texture: 0.58,
    metallic: 0.42,
    rumble: 0.68,
    warmth: 0.48,
    syncopation: 0.64,
    breakDepth: 0.58,
    tempoDrift: 0.22,
  },
  dub: {
    id: "dub",
    label: "Dub",
    note: "Deep chords, filtered echoes, negative space, slow pressure.",
    bpm: [122, 130],
    density: 0.48,
    drive: 0.48,
    space: 0.9,
    swing: 0.26,
    acid: 0.12,
    chords: 0.82,
    texture: 0.82,
    metallic: 0.2,
    rumble: 0.76,
    warmth: 0.82,
    syncopation: 0.46,
    breakDepth: 0.72,
    tempoDrift: 0.3,
  },
  acid: {
    id: "acid",
    label: "Acid",
    note: "Elastic bass slides, resonant motion, bright percussion.",
    bpm: [128, 138],
    density: 0.72,
    drive: 0.78,
    space: 0.38,
    swing: 0.2,
    acid: 0.96,
    chords: 0.18,
    texture: 0.38,
    metallic: 0.46,
    rumble: 0.5,
    warmth: 0.38,
    syncopation: 0.78,
    breakDepth: 0.5,
    tempoDrift: 0.2,
  },
  detroit: {
    id: "detroit",
    label: "Detroit",
    note: "Machine funk, warmer chords, syncopated bass, human swing.",
    bpm: [124, 132],
    density: 0.62,
    drive: 0.58,
    space: 0.52,
    swing: 0.42,
    acid: 0.24,
    chords: 0.7,
    texture: 0.54,
    metallic: 0.34,
    rumble: 0.42,
    warmth: 0.86,
    syncopation: 0.8,
    breakDepth: 0.58,
    tempoDrift: 0.28,
  },
  peak: {
    id: "peak",
    label: "Peak",
    note: "Rolling pressure, rides, clipped rooms, decisive releases.",
    bpm: [132, 140],
    density: 0.82,
    drive: 0.9,
    space: 0.3,
    swing: 0.12,
    acid: 0.38,
    chords: 0.16,
    texture: 0.36,
    metallic: 0.72,
    rumble: 0.84,
    warmth: 0.24,
    syncopation: 0.62,
    breakDepth: 0.38,
    tempoDrift: 0.14,
  },
};

const GROOVE_VOCABULARIES = Object.freeze({
  "straight-pressure": Object.freeze({
    hats: Object.freeze([2, 6, 10, 14]),
    secondaryHats: Object.freeze([1, 3, 5, 7, 9, 11, 13, 15]),
    claps: Object.freeze([4, 12]),
    ghostClaps: Object.freeze([11]),
    bassDensityBias: 0.1,
  }),
  "rolling-syncopation": Object.freeze({
    hats: Object.freeze([2, 5, 6, 10, 13, 14]),
    secondaryHats: Object.freeze([1, 4, 7, 9, 12, 15]),
    claps: Object.freeze([4, 12]),
    ghostClaps: Object.freeze([10, 15]),
    bassDensityBias: 0.4,
  }),
  "triplet-weave": Object.freeze({
    hats: Object.freeze([2, 5, 8, 10, 13]),
    secondaryHats: Object.freeze([1, 4, 7, 11, 14]),
    claps: Object.freeze([4, 13]),
    ghostClaps: Object.freeze([9]),
    bassDensityBias: 0.15,
  }),
  "broken-machine": Object.freeze({
    hats: Object.freeze([1, 6, 9, 14]),
    secondaryHats: Object.freeze([3, 5, 7, 11, 13, 15]),
    claps: Object.freeze([4, 11]),
    ghostClaps: Object.freeze([14]),
    bassDensityBias: -0.15,
  }),
  "swung-motor": Object.freeze({
    hats: Object.freeze([3, 6, 11, 14]),
    secondaryHats: Object.freeze([1, 5, 7, 9, 13, 15]),
    claps: Object.freeze([4, 12]),
    ghostClaps: Object.freeze([7, 15]),
    bassDensityBias: 0.25,
  }),
});

const VIBE_ARRANGEMENT = Object.freeze({
  hypnotic: Object.freeze({
    hatRotation: 0,
    bassRotation: 0,
    preferredEngine: null,
    clapGhostBias: 0.08,
  }),
  dub: Object.freeze({
    hatRotation: 2,
    bassRotation: 3,
    preferredEngine: "string",
    clapGhostBias: -0.08,
  }),
  acid: Object.freeze({
    hatRotation: 1,
    bassRotation: 1,
    preferredEngine: "fm",
    clapGhostBias: 0.16,
  }),
  detroit: Object.freeze({
    hatRotation: 3,
    bassRotation: 2,
    preferredEngine: "modal",
    clapGhostBias: 0.22,
  }),
  peak: Object.freeze({
    hatRotation: 5,
    bassRotation: 5,
    preferredEngine: "fm",
    clapGhostBias: 0.3,
  }),
});

const PERCUSSION_KIT_TONE = Object.freeze({
  "dry-machine": Object.freeze({ hat: 0.35, clap: 0.42, rim: 0.52 }),
  "bright-club": Object.freeze({ hat: 0.84, clap: 0.72, rim: 0.68 }),
  "metallic-yard": Object.freeze({ hat: 0.7, clap: 0.58, rim: 0.86 }),
  "dusty-electro": Object.freeze({ hat: 0.18, clap: 0.24, rim: 0.34 }),
  "dub-chamber": Object.freeze({ hat: 0.42, clap: 0.5, rim: 0.44 }),
});

const PERCUSSION_KIT_DESIGN = Object.freeze({
  "dry-machine": Object.freeze({
    hatDecayScale: 0.5,
    hatBandScale: 0.7,
    hatNoiseRate: 0.72,
    hatDelay: 0,
    hatReverb: 0,
    clapBursts: 2,
    clapSpacing: 0.022,
    clapDecay: 0.1,
    clapDelay: 0,
    clapReverb: 0,
  }),
  "bright-club": Object.freeze({
    hatDecayScale: 0.8,
    hatBandScale: 1.34,
    hatNoiseRate: 1.5,
    hatDelay: 0.04,
    hatReverb: 0.08,
    clapBursts: 4,
    clapSpacing: 0.007,
    clapDecay: 0.17,
    clapDelay: 0.05,
    clapReverb: 0.12,
  }),
  "metallic-yard": Object.freeze({
    hatDecayScale: 1.3,
    hatBandScale: 1.04,
    hatNoiseRate: 0.82,
    hatDelay: 0.065,
    hatReverb: 0.24,
    clapBursts: 5,
    clapSpacing: 0.014,
    clapDecay: 0.29,
    clapDelay: 0.095,
    clapReverb: 0.28,
  }),
  "dusty-electro": Object.freeze({
    hatDecayScale: 0.74,
    hatBandScale: 0.76,
    hatNoiseRate: 0.88,
    hatDelay: 0.06,
    hatReverb: 0.09,
    clapBursts: 3,
    clapSpacing: 0.016,
    clapDecay: 0.2,
    clapDelay: 0.08,
    clapReverb: 0.14,
  }),
  "dub-chamber": Object.freeze({
    hatDecayScale: 1.05,
    hatBandScale: 0.84,
    hatNoiseRate: 0.96,
    hatDelay: 0.12,
    hatReverb: 0.2,
    clapBursts: 5,
    clapSpacing: 0.018,
    clapDecay: 0.3,
    clapDelay: 0.14,
    clapReverb: 0.32,
  }),
});

function percussionTimbreFor(trackDNA, profile) {
  const design =
    PERCUSSION_KIT_DESIGN[trackDNA.percussionKit] ||
    PERCUSSION_KIT_DESIGN["dry-machine"];
  return Object.freeze({
    ...design,
    hatDecayScale: clamp(
      design.hatDecayScale +
        profile.space * 0.16 -
        profile.drive * 0.06,
      0.5,
      1.4,
    ),
    hatBandScale: clamp(
      design.hatBandScale +
        (profile.metallic - 0.5) * 0.12 +
        (profile.acid - 0.5) * 0.16,
      0.68,
      1.34,
    ),
    hatNoiseRate: clamp(
      design.hatNoiseRate +
        (profile.metallic - 0.5) * 0.12 +
        (profile.acid - 0.5) * 0.18,
      0.7,
      1.5,
    ),
    hatDelay: clamp(
      design.hatDelay +
        profile.space * 0.08 -
        profile.acid * 0.025,
      0,
      0.24,
    ),
    hatReverb: clamp(
      design.hatReverb + profile.space * 0.08,
      0,
      0.34,
    ),
    clapDecay: clamp(
      design.clapDecay +
        profile.space * 0.06 -
        profile.acid * 0.025,
      0.1,
      0.38,
    ),
    clapBursts: clamp(
      design.clapBursts +
        (profile.acid > 0.7 ? 1 : 0) -
        (profile.space > 0.78 ? 1 : 0),
      2,
      5,
    ),
    clapSpacing: clamp(
      design.clapSpacing +
        profile.swing * 0.006 -
        profile.acid * 0.004,
      0.006,
      0.022,
    ),
    clapDelay: clamp(
      design.clapDelay +
        profile.space * 0.12 -
        profile.acid * 0.035,
      0,
      0.2,
    ),
    clapReverb: clamp(
      design.clapReverb + profile.space * 0.12,
      0,
      0.45,
    ),
  });
}

const SPECTRAL_OFFSETS = Object.freeze({
  "sub-dark": Object.freeze({
    drive: -0.2,
    metallic: -0.35,
    texture: -0.12,
    warmth: 0.35,
    acid: -0.12,
  }),
  "warm-tilt": Object.freeze({
    drive: -0.05,
    metallic: -0.08,
    texture: 0.08,
    warmth: 0.22,
    space: 0.04,
  }),
  "mid-forward": Object.freeze({
    drive: 0.1,
    metallic: 0.02,
    texture: -0.02,
    warmth: 0.02,
  }),
  "bright-metal": Object.freeze({
    drive: 0.2,
    metallic: 0.3,
    texture: 0.04,
    warmth: -0.2,
  }),
  "open-air": Object.freeze({
    drive: 0.02,
    metallic: 0.1,
    texture: 0.22,
    warmth: -0.08,
  }),
});

const SPATIAL_OFFSETS = Object.freeze({
  "dry-close": Object.freeze({
    space: -0.34,
    texture: -0.2,
    drive: -0.08,
  }),
  "short-room": Object.freeze({ space: -0.05, texture: 0 }),
  "mono-pressure": Object.freeze({
    space: -0.24,
    texture: -0.1,
    drive: 0.18,
    density: 0.12,
  }),
  "dub-depth": Object.freeze({ space: 0.26, texture: 0.18 }),
  "wide-haze": Object.freeze({ space: 0.18, texture: 0.26 }),
});

const HARMONY_OFFSETS = Object.freeze({
  "tonic-drone": Object.freeze({ chords: -0.08, texture: 0.08 }),
  "dub-stabs": Object.freeze({ chords: 0.22, space: 0.1 }),
  "modal-turns": Object.freeze({ chords: 0.1, syncopation: 0.04 }),
  "detroit-voicings": Object.freeze({
    chords: 0.2,
    warmth: 0.1,
    swing: 0.04,
  }),
  "suspended-space": Object.freeze({
    chords: 0.12,
    space: 0.16,
    texture: 0.1,
  }),
});

const GROOVE_OFFSETS = Object.freeze({
  "straight-pressure": Object.freeze({ swing: -0.08, syncopation: -0.04 }),
  "rolling-syncopation": Object.freeze({ swing: 0.02, syncopation: 0.14 }),
  "triplet-weave": Object.freeze({ swing: 0.1, syncopation: 0.12 }),
  "broken-machine": Object.freeze({ swing: 0.04, syncopation: 0.18 }),
  "swung-motor": Object.freeze({ swing: 0.2, syncopation: 0.1 }),
});

const FORM_PHENOTYPE_OFFSETS = Object.freeze({
  "patient-hypnosis": Object.freeze({
    density: -0.1,
    drive: -0.06,
    space: 0.08,
    breakDepth: 0.08,
  }),
  "pressure-ratchet": Object.freeze({
    density: 0.12,
    drive: 0.14,
    space: -0.1,
    breakDepth: -0.06,
  }),
  "peak-and-release": Object.freeze({
    density: 0.16,
    drive: 0.12,
    space: -0.04,
    breakDepth: 0.18,
  }),
  "negative-space": Object.freeze({
    density: -0.24,
    drive: -0.12,
    space: 0.24,
    breakDepth: 0.24,
  }),
  "machine-funk": Object.freeze({
    density: 0.02,
    swing: 0.14,
    syncopation: 0.18,
    chords: 0.08,
  }),
});

const FORM_RHYTHM_BIAS = Object.freeze({
  "patient-hypnosis": Object.freeze({ primary: -0.08, secondary: -0.06 }),
  "pressure-ratchet": Object.freeze({ primary: 0.08, secondary: 0.1 }),
  "peak-and-release": Object.freeze({ primary: 0.14, secondary: 0.12 }),
  "negative-space": Object.freeze({ primary: -0.2, secondary: -0.18 }),
  "machine-funk": Object.freeze({ primary: -0.12, secondary: 0.22 }),
});

function shapeProfileForTrack(profile, trackDNA) {
  const shaped = {
    ...profile,
    bpm: [...profile.bpm],
  };
  for (const offsets of [
    SPECTRAL_OFFSETS[trackDNA.spectralProfile],
    SPATIAL_OFFSETS[trackDNA.spatialProfile],
    HARMONY_OFFSETS[trackDNA.harmonyBehavior],
    GROOVE_OFFSETS[trackDNA.grooveFamily],
    FORM_PHENOTYPE_OFFSETS[trackDNA.formPhenotype],
  ]) {
    for (const [key, value] of Object.entries(offsets || {})) {
      shaped[key] = clamp(shaped[key] + value, 0, 1);
    }
  }
  if (trackDNA.bassBehavior === "acid-serpent") {
    shaped.acid = clamp(shaped.acid + 0.18, 0, 1);
  } else if (trackDNA.bassBehavior === "sub-sustain") {
    shaped.acid = clamp(shaped.acid - 0.16, 0, 1);
    shaped.rumble = clamp(shaped.rumble + 0.12, 0, 1);
  }
  return Object.freeze({
    ...shaped,
    bpm: Object.freeze(shaped.bpm),
  });
}

export const VIBES = Object.freeze(
  Object.values(PROFILE_DEFINITIONS).map((profile) => Object.freeze({ ...profile })),
);

export function profileForVibe(id) {
  return PROFILE_DEFINITIONS[id] || PROFILE_DEFINITIONS.hypnotic;
}

export function blendProfiles(fromId, toId, amount) {
  const from = profileForVibe(fromId);
  const to = profileForVibe(toId);
  return blendProfileObjects(from, to, amount);
}

export function blendProfileObjects(from, to, amount) {
  const mix = clamp(amount, 0, 1);
  const result = {
    id: mix < 0.5 ? from.id : to.id,
    label: mix < 0.5 ? from.label : to.label,
    note: mix < 0.5 ? from.note : to.note,
    bpm: [lerp(from.bpm[0], to.bpm[0], mix), lerp(from.bpm[1], to.bpm[1], mix)],
  };
  for (const key of PROFILE_KEYS) result[key] = lerp(from[key], to[key], mix);
  return result;
}

export function profileDistance(fromId, toId) {
  const from = profileForVibe(fromId);
  const to = profileForVibe(toId);
  const numericDistance =
    PROFILE_KEYS.reduce((total, key) => total + Math.abs(from[key] - to[key]), 0) /
    PROFILE_KEYS.length;
  const tempoDistance =
    Math.abs((from.bpm[0] + from.bpm[1]) / 2 - (to.bpm[0] + to.bpm[1]) / 2) / 20;
  return clamp(numericDistance * 0.82 + tempoDistance * 0.18, 0, 1);
}

export function transitionDurationFor(fromId, toId) {
  const distance = profileDistance(fromId, toId);
  if (distance < 0.17) return 64;
  if (distance < 0.31) return 96;
  return 128;
}

export function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function transitionProgress(bar, startBar, duration = 32) {
  if (bar < startBar) return 0;
  return smoothstep((bar - startBar) / Math.max(1, duration));
}

export function nextPhraseBoundary(bar, size = PHRASE_BARS) {
  return Math.ceil((Math.max(0, bar) + 1) / size) * size;
}

const MODES = {
  aeolian: { id: "aeolian", label: "Aeolian", tonality: "minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { id: "dorian", label: "Dorian", tonality: "minor", intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { id: "phrygian", label: "Phrygian", tonality: "minor", intervals: [0, 1, 3, 5, 7, 8, 10] },
  harmonicMinor: {
    id: "harmonicMinor",
    label: "Harmonic minor",
    tonality: "minor",
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  ionian: { id: "ionian", label: "Ionian", tonality: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  lydian: { id: "lydian", label: "Lydian", tonality: "major", intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: {
    id: "mixolydian",
    label: "Mixolydian",
    tonality: "major",
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  suspended: {
    id: "suspended",
    label: "Suspended",
    tonality: "neutral",
    intervals: [0, 2, 5, 7, 10],
  },
};

const MODE_POOLS = {
  minor: [MODES.aeolian, MODES.dorian, MODES.phrygian, MODES.harmonicMinor],
  major: [MODES.ionian, MODES.lydian, MODES.mixolydian],
  neutral: [MODES.suspended],
};

const ROOT_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const ROOTS = [34, 35, 36, 38, 41, 43, 46];

const SYNTH_ENGINE_IDS = Object.freeze(["fm", "modal", "string"]);

export const ARTISTIC_COUNCIL = Object.freeze([
  Object.freeze({
    id: "floor-authority",
    attribution: "Carl Cox",
    lens: "FLOOR AUTHORITY",
    principle: "Kick and bass remain the record; energy must read physically.",
  }),
  Object.freeze({
    id: "long-arc",
    attribution: "Sven Väth",
    lens: "LONG ARC",
    principle: "A change earns its place across sections, not just inside a bar.",
  }),
  Object.freeze({
    id: "radical-reduction",
    attribution: "Richie Hawtin",
    lens: "RADICAL REDUCTION",
    principle: "Remove activity until one foreground idea becomes inevitable.",
  }),
  Object.freeze({
    id: "machine-soul",
    attribution: "Derrick May",
    lens: "MACHINE SOUL",
    principle: "The machine needs identity, swing, memory, and emotional voltage.",
  }),
]);

const COUNCIL_DIRECTIVE = Object.freeze({
  "floor-authority": "FLOOR FIRST",
  "long-arc": "PLAY THE LONG ARC",
  "radical-reduction": "REMOVE UNTIL IT MATTERS",
  "machine-soul": "LET THE MACHINE SING",
});

const COUNCIL_LAYER_PRIORITY = Object.freeze({
  "floor-authority": Object.freeze([
    "ride",
    "metallic",
    "shaker",
    "rim",
    "chord",
    "pad",
    "texture",
  ]),
  "long-arc": Object.freeze([
    "texture",
    "pad",
    "chord",
    "shaker",
    "metallic",
    "rim",
    "ride",
  ]),
  "radical-reduction": Object.freeze([
    "rim",
    "texture",
    "shaker",
    "pad",
    "chord",
    "metallic",
    "ride",
  ]),
  "machine-soul": Object.freeze([
    "chord",
    "shaker",
    "rim",
    "pad",
    "texture",
    "metallic",
    "ride",
  ]),
});

function alternatingPattern(first, second) {
  return Array.from({ length: PHRASE_BARS }, (_, index) =>
    index % 2 === 0 ? first : second,
  );
}

function sparsePattern(entries) {
  return Array.from({ length: PHRASE_BARS }, (_, index) => entries[index] || []);
}

function freezeEnsembleRole(sceneId, role) {
  return Object.freeze({
    ...role,
    sourceSceneId: sceneId,
    range: Object.freeze([...role.range]),
    length: Object.freeze([...role.length]),
    pattern: Object.freeze(
      role.pattern.map((steps) => Object.freeze([...steps])),
    ),
  });
}

function defineEnsembleScene(scene) {
  const roles = Object.freeze(
    Object.fromEntries(
      scene.roles.map((role) => [
        role.engine,
        freezeEnsembleRole(scene.id, role),
      ]),
    ),
  );
  return Object.freeze({
    id: scene.id,
    label: scene.label,
    detail: scene.detail,
    roles,
  });
}

const ENSEMBLE_SCENE_DEFINITIONS = Object.freeze([
  defineEnsembleScene({
    id: "motor-weave",
    label: "MOTOR WEAVE",
    detail: "STRING MOTOR / MATRIX COUNTER / RESONATOR MARK",
    roles: [
      {
        engine: "string",
        id: "motor",
        label: "MOTOR",
        register: "mid",
        range: [65, 76],
        pattern: alternatingPattern([1, 6, 9, 14], [3, 7, 10, 15]),
        length: [1, 3],
        degreeOffset: 0,
        motifDirection: 1,
        densityScale: 0.92,
        velocityBias: 0.04,
        priority: 3,
        delaySend: 0.06,
        reverbSend: 0.08,
      },
      {
        engine: "fm",
        id: "counter",
        label: "COUNTER",
        register: "low",
        range: [53, 64],
        pattern: alternatingPattern([3, 11], [1, 9]),
        length: [1, 2],
        degreeOffset: 2,
        motifDirection: -1,
        densityScale: 0.84,
        velocityBias: 0.02,
        priority: 2,
        delaySend: 0.08,
        reverbSend: 0.05,
      },
      {
        engine: "modal",
        id: "mark",
        label: "MARK",
        register: "high",
        range: [77, 88],
        pattern: sparsePattern({ 3: [5], 7: [13] }),
        length: [1, 2],
        degreeOffset: 4,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.08,
        priority: 2,
        delaySend: 0.02,
        reverbSend: 0.22,
      },
    ],
  }),
  defineEnsembleScene({
    id: "acid-relay",
    label: "ACID RELAY",
    detail: "MATRIX CALL / STRING REPLY / RESONATOR PICKUP",
    roles: [
      {
        engine: "fm",
        id: "call",
        label: "CALL",
        register: "low",
        range: [53, 64],
        pattern: alternatingPattern([1, 9, 14], [3, 11]),
        length: [1, 2],
        degreeOffset: 0,
        motifDirection: 1,
        densityScale: 0.96,
        velocityBias: 0.05,
        priority: 3,
        delaySend: 0.05,
        reverbSend: 0.04,
      },
      {
        engine: "string",
        id: "reply",
        label: "REPLY",
        register: "mid",
        range: [65, 76],
        pattern: alternatingPattern([3, 11], [5, 13]),
        length: [1, 2],
        degreeOffset: 2,
        motifDirection: -1,
        densityScale: 0.86,
        velocityBias: -0.02,
        priority: 2,
        delaySend: 0.14,
        reverbSend: 0.1,
      },
      {
        engine: "modal",
        id: "pickup",
        label: "PICKUP",
        register: "high",
        range: [77, 88],
        pattern: sparsePattern({ 3: [7], 7: [15] }),
        length: [1, 1],
        degreeOffset: 4,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.06,
        priority: 2,
        delaySend: 0.03,
        reverbSend: 0.18,
      },
    ],
  }),
  defineEnsembleScene({
    id: "resonant-orbit",
    label: "RESONANT ORBIT",
    detail: "RESONATOR SIGNAL / STRING REPLY / MATRIX PICKUP",
    roles: [
      {
        engine: "modal",
        id: "signal",
        label: "SIGNAL",
        register: "high",
        range: [77, 88],
        pattern: alternatingPattern([3, 11], [5, 13]),
        length: [1, 2],
        degreeOffset: 4,
        motifDirection: 1,
        densityScale: 0.84,
        velocityBias: -0.04,
        priority: 3,
        delaySend: 0.03,
        reverbSend: 0.28,
      },
      {
        engine: "string",
        id: "reply",
        label: "REPLY",
        register: "mid",
        range: [65, 76],
        pattern: alternatingPattern([7, 15], [1, 9]),
        length: [2, 3],
        degreeOffset: 0,
        motifDirection: -1,
        densityScale: 0.78,
        velocityBias: -0.03,
        priority: 2,
        delaySend: 0.09,
        reverbSend: 0.16,
      },
      {
        engine: "fm",
        id: "pickup",
        label: "PICKUP",
        register: "low",
        range: [53, 64],
        pattern: sparsePattern({ 3: [6], 7: [14] }),
        length: [1, 2],
        degreeOffset: 2,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.08,
        priority: 2,
        delaySend: 0.12,
        reverbSend: 0.08,
      },
    ],
  }),
  defineEnsembleScene({
    id: "dub-afterimage",
    label: "DUB AFTERIMAGE",
    detail: "STRING CALL / MATRIX ECHO / RESONATOR TAIL",
    roles: [
      {
        engine: "string",
        id: "call",
        label: "CALL",
        register: "mid",
        range: [65, 76],
        pattern: sparsePattern({
          0: [3],
          2: [3],
          4: [3],
          6: [3],
        }),
        length: [2, 4],
        degreeOffset: 0,
        motifDirection: 1,
        densityScale: 0.78,
        velocityBias: -0.02,
        priority: 3,
        delaySend: 0.32,
        reverbSend: 0.22,
      },
      {
        engine: "fm",
        id: "afterimage",
        label: "AFTERIMAGE",
        register: "low",
        range: [53, 64],
        pattern: sparsePattern({
          1: [11],
          3: [15],
          5: [11],
          7: [15],
        }),
        length: [1, 2],
        degreeOffset: 2,
        motifDirection: -1,
        densityScale: 0.72,
        velocityBias: -0.08,
        priority: 2,
        delaySend: 0.26,
        reverbSend: 0.12,
      },
      {
        engine: "modal",
        id: "tail",
        label: "TAIL",
        register: "high",
        range: [77, 88],
        pattern: sparsePattern({ 3: [13], 7: [15] }),
        length: [1, 2],
        degreeOffset: 4,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.12,
        priority: 1,
        delaySend: 0.06,
        reverbSend: 0.38,
      },
    ],
  }),
  defineEnsembleScene({
    id: "peak-interlock",
    label: "PEAK INTERLOCK",
    detail: "MATRIX MOTOR / STRING WEAVE / RESONATOR CROWN",
    roles: [
      {
        engine: "fm",
        id: "motor",
        label: "MOTOR",
        register: "low",
        range: [53, 64],
        pattern: alternatingPattern([1, 5, 9, 13], [1, 5, 9, 13]),
        length: [1, 2],
        degreeOffset: 0,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: 0.07,
        priority: 3,
        delaySend: 0.03,
        reverbSend: 0.04,
      },
      {
        engine: "string",
        id: "weave",
        label: "WEAVE",
        register: "mid",
        range: [65, 76],
        pattern: sparsePattern({
          0: [3, 11],
          1: [3, 11],
          2: [3, 11],
          3: [3, 11],
          4: [7, 15],
          5: [7, 15],
          6: [7, 15],
          7: [7, 15],
        }),
        length: [1, 2],
        degreeOffset: 2,
        motifDirection: -1,
        densityScale: 0.9,
        velocityBias: 0.02,
        priority: 2,
        delaySend: 0.06,
        reverbSend: 0.08,
      },
      {
        engine: "modal",
        id: "crown",
        label: "CROWN",
        register: "high",
        range: [77, 88],
        pattern: sparsePattern({ 6: [6, 14], 7: [6, 14] }),
        length: [1, 2],
        degreeOffset: 4,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.02,
        priority: 2,
        delaySend: 0.02,
        reverbSend: 0.12,
      },
    ],
  }),
  defineEnsembleScene({
    id: "negative-space",
    label: "NEGATIVE SPACE",
    detail: "STRING TONE / RESONATOR TAIL / MATRIX PICKUP",
    roles: [
      {
        engine: "string",
        id: "tone",
        label: "TONE",
        register: "mid",
        range: [65, 76],
        pattern: sparsePattern({ 0: [1], 4: [9] }),
        length: [4, 4],
        degreeOffset: 0,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.08,
        priority: 3,
        delaySend: 0.18,
        reverbSend: 0.32,
      },
      {
        engine: "modal",
        id: "tail",
        label: "TAIL",
        register: "high",
        range: [77, 88],
        pattern: sparsePattern({ 3: [5], 7: [13] }),
        length: [1, 2],
        degreeOffset: 4,
        motifDirection: 1,
        densityScale: 1,
        velocityBias: -0.14,
        priority: 2,
        delaySend: 0.04,
        reverbSend: 0.42,
      },
      {
        engine: "fm",
        id: "pickup",
        label: "PICKUP",
        register: "low",
        range: [53, 64],
        pattern: sparsePattern({ 3: [7], 7: [15] }),
        length: [1, 1],
        degreeOffset: 2,
        motifDirection: -1,
        densityScale: 1,
        velocityBias: -0.1,
        priority: 1,
        delaySend: 0.22,
        reverbSend: 0.12,
      },
    ],
  }),
]);

export const ENSEMBLE_SCENES = ENSEMBLE_SCENE_DEFINITIONS;

function localEnsembleRecallSourceIndex(
  movement,
  currentSectionIndex,
  sceneMaterialId,
) {
  for (let index = currentSectionIndex - 1; index >= 0; index -= 1) {
    const section = movement.sections[index];
    const firstPhrase = Math.floor(section.startBar / PHRASE_BARS);
    const lastPhrase = Math.ceil(section.endBar / PHRASE_BARS);
    if (
      movement.formPhrases
        .slice(firstPhrase, lastPhrase)
        .some(
          (form) =>
            (form.sceneMaterialId ?? form.motifLineageId) ===
            sceneMaterialId,
        )
    ) {
      return index;
    }
  }
  return -1;
}

export function selectEnsembleScene(
  seed,
  movement,
  section,
  phraseIndex = null,
) {
  const localPhrase = Number.isFinite(phraseIndex)
    ? clamp(
        Math.floor(phraseIndex) -
          Math.floor(movement.startBar / PHRASE_BARS),
        0,
        movement.formPhrases.length - 1,
      )
    : clamp(
        Math.floor(section.startBar / PHRASE_BARS),
        0,
        movement.formPhrases.length - 1,
      );
  const form = movement.formPhrases[localPhrase];
  const sceneMaterialId =
    form.sceneMaterialId ?? form.motifLineageId;
  const foregroundRole =
    movement.trackDNA?.foregroundRole ||
    createTrackDNA(seed).foregroundRole;
  const preferredSceneIds = {
    motor: ["motor-weave", "peak-interlock"],
    "call-response": ["acid-relay", "dub-afterimage"],
    counterline: ["motor-weave", "resonant-orbit", "acid-relay"],
    punctuation: ["resonant-orbit", "negative-space"],
    "atmospheric-tail": ["dub-afterimage", "negative-space"],
  }[foregroundRole];
  const scenePool = ENSEMBLE_SCENE_DEFINITIONS.filter((scene) =>
    preferredSceneIds.includes(scene.id),
  );
  const selected =
    scenePool[
      hash32(
        seed,
        sceneMaterialId,
        foregroundRole,
        "ensemble-scene-material",
      ) % scenePool.length
    ];
  const recallSourceIndex =
    form.sceneOperation === "handoff"
      ? localEnsembleRecallSourceIndex(
          movement,
          section.index,
          sceneMaterialId,
        )
      : -1;
  const recalled = recallSourceIndex >= 0;
  const sourceSectionIndex = recalled
    ? recallSourceIndex
    : section.index;
  return Object.freeze({
    ...selected,
    recalled,
    sourceSectionIndex,
    lineageId: sceneMaterialId,
  });
}

export function conveneCouncil({
  seed,
  movement,
  section,
  phraseIndex,
  roles,
  profile = profileForVibe("hypnotic"),
}) {
  const localPhraseIndex = clamp(
    Math.floor(phraseIndex) -
      Math.floor(movement.startBar / PHRASE_BARS),
    0,
    movement.formPhrases.length - 1,
  );
  const form =
    movement.formPhrases[localPhraseIndex] ||
    derivePhraseState(seed, phraseIndex);
  const chair = form.chair;
  const phraseInSection = Math.max(0, form.labelResidency - 1);
  const phase =
    form.climaxOnset || form.chairResidency === 1
      ? "DECLARE"
      : form.release || form.allowFill
        ? "REVEAL"
        : Math.abs(form.energyDelta) > 0.045 ||
            Math.abs(form.tensionDelta) > 0.05 ||
            form.motifOperation !== "hold"
          ? "TURN"
          : "HOLD";
  const trackDNA = movement.trackDNA || createTrackDNA(seed);
  const vibeDirection = VIBE_ARRANGEMENT[profile.id] ||
    VIBE_ARRANGEMENT.hypnotic;
  const roleAffinity = {
    motor: ["motor"],
    "call-response": ["call", "reply"],
    counterline: ["counter", "afterimage", "weave"],
    punctuation: ["mark", "pickup", "crown", "signal"],
    "atmospheric-tail": ["tail", "tone"],
  }[trackDNA.foregroundRole];
  const engineScore = (engine) =>
    (roles[engine]?.priority || 0) * 100 +
    (engine === trackDNA.foregroundEngine ? 88 : 0) +
    (engine === vibeDirection.preferredEngine ? 142 : 0) +
    (roleAffinity.includes(roles[engine]?.id) ? 34 : 0);
  const rankedEngines = SYNTH_ENGINE_IDS.filter((engine) => roles?.[engine]).sort(
    (left, right) =>
      engineScore(right) - engineScore(left) ||
      (hash32(
        seed,
        form.motifLineageId,
        form.chair,
        left,
      ) >>> 0) -
        (hash32(
          seed,
          form.motifLineageId,
          form.chair,
          right,
        ) >>> 0),
  );
  const sparse =
    form.intentionalRest || form.density < 0.48 || form.space > 0.68;
  const intentionalRest = form.intentionalRest;
  const earnedDialogue = form.earnedDialogue;
  const phenotypeDialogue =
    ["call-response", "counterline"].includes(trackDNA.foregroundRole) &&
    form.density > 0.42 &&
    form.space < 0.78;
  const vibeDialogue =
    ["detroit", "peak"].includes(profile.id) &&
    form.density > 0.48 &&
    !sparse;
  const activeSynthEngines = intentionalRest
    ? []
    : rankedEngines.slice(
        0,
        profile.id === "dub"
          ? 1
          : earnedDialogue || phenotypeDialogue || vibeDialogue
            ? 2
            : 1,
      );
  const harmonyForeground = [
    "dub-stabs",
    "modal-turns",
    "detroit-voicings",
    "suspended-space",
  ].includes(trackDNA.harmonyBehavior);
  const optionalLayerBudget =
    chair === "radical-reduction"
      ? 1
      : earnedDialogue
        ? 2
        : sparse
          ? 1
          : harmonyForeground
            ? 3
            : 2;
  const foregroundStartBudget = {
    motor: 3,
    "call-response": 4,
    counterline: 3,
    punctuation: 2,
    "atmospheric-tail": 2,
  }[trackDNA.foregroundRole];
  const maxAdvancedStarts =
    activeSynthEngines.length === 0
      ? 0
      : earnedDialogue
        ? 4
        : sparse
          ? 1
          : clamp(
              foregroundStartBudget +
                (profile.id === "peak" ? 1 : 0) -
                (profile.id === "dub" ? 1 : 0),
              1,
              4,
            );
  const allowFill = form.allowFill;
  return Object.freeze({
    chair,
    directive: COUNCIL_DIRECTIVE[chair],
    phase,
    purpose:
      form.climaxOnset
        ? "PAYOFF"
        : form.motifOperation === "recall"
          ? "RECALL"
          : phase === "DECLARE"
            ? "ESTABLISH"
            : phase === "HOLD"
              ? "COMMIT"
              : phase === "TURN"
                ? "CONTRAST"
                : "PAYOFF",
    phraseInSection,
    formPhraseIndex: form.phraseIndex,
    activeSynthEngines: Object.freeze(activeSynthEngines),
    optionalLayerBudget,
    optionalLayerPriority: COUNCIL_LAYER_PRIORITY[chair],
    maxAdvancedStarts,
    allowFill,
  });
}

export function stageEnsembleRoles(previous, candidate, handoff = null) {
  if (!candidate) return previous;
  if (!previous) return candidate;
  const mutationEngine = handoff?.engine;
  if (!SYNTH_ENGINE_IDS.includes(mutationEngine)) return previous;
  return Object.freeze(
    Object.fromEntries(
      SYNTH_ENGINE_IDS.map((engine) => [
        engine,
        engine === mutationEngine ? candidate[engine] : previous[engine],
      ]),
    ),
  );
}

function createDegreeWalk(rng, length, scaleLength, rootGravity) {
  const degrees = [0];
  let current = 0;
  while (degrees.length < length) {
    const maximumLeap = Math.max(1, Math.min(4, scaleLength - 1));
    const distance = 1 + Math.floor(rng() ** 2 * maximumLeap);
    const direction = rng() >= 0.5 ? 1 : -1;
    const homeDistance =
      current === 0
        ? 0
        : current <= scaleLength / 2
          ? -current
          : scaleLength - current;
    const displacement =
      current !== 0 && rng() < rootGravity
        ? Math.sign(homeDistance) * Math.min(Math.abs(homeDistance), distance)
        : direction * distance;
    current =
      ((current + displacement) % scaleLength + scaleLength) %
      scaleLength;
    degrees.push(current);
  }
  return Object.freeze(degrees);
}

function trajectoryTimbre(seed, trackDNA = createTrackDNA(seed)) {
  const rng = makeRng(hash32(seed, "trajectory-timbre"));
  const kit =
    PERCUSSION_KIT_TONE[trackDNA.percussionKit] ||
    PERCUSSION_KIT_TONE["dry-machine"];
  const spectralTone = {
    "sub-dark": 0.12,
    "warm-tilt": 0.3,
    "mid-forward": 0.52,
    "bright-metal": 0.82,
    "open-air": 0.7,
  }[trackDNA.spectralProfile];
  return Object.freeze({
    kickTone: clamp((spectralTone ?? 0.5) * 0.78 + rng() * 0.22, 0, 1),
    kickDecay: clamp(
      {
        "short-punch": 0.12,
        "deep-round": 0.66,
        "click-forward": 0.28,
        "saturated-tail": 0.88,
        "sub-drop": 0.74,
      }[trackDNA.kickArchitecture] *
        0.84 +
        rng() * 0.16,
      0,
      1,
    ),
    hatColor: clamp(kit.hat * 0.86 + rng() * 0.14, 0, 1),
    clapTone: clamp(kit.clap * 0.86 + rng() * 0.14, 0, 1),
    rimTone: clamp(kit.rim * 0.86 + rng() * 0.14, 0, 1),
    filterBias: clamp((spectralTone ?? 0.5) * 0.82 + rng() * 0.18, 0, 1),
    swingBias: clamp(
      trackDNA.grooveFamily === "swung-motor"
        ? 0.72 + rng() * 0.28
        : 0.18 + rng() * 0.5,
      0,
      1,
    ),
    stereoBias: rng() * 2 - 1,
  });
}

function musicalIdentityForForm(seed, form, tonality) {
  const trackDNA = createTrackDNA(seed);
  const safeTonality = ["major", "neutral"].includes(tonality)
    ? tonality
    : "minor";
  const tonalMaterialId =
    form.tonalMaterialId ?? form.motifLineageId;
  const harmonyMaterialId =
    form.harmonyMaterialId ?? form.motifLineageId;
  const cacheKey = `${seed}:${tonalMaterialId}:${form.motifLineageId}:${harmonyMaterialId}:${safeTonality}:${trackDNA.harmonyBehavior}`;
  if (materialCache.has(cacheKey)) {
    const cached = materialCache.get(cacheKey);
    materialCache.delete(cacheKey);
    materialCache.set(cacheKey, cached);
    return cached;
  }
  const tonalRng = makeRng(
    hash32(seed, tonalMaterialId, safeTonality, "tonal-identity"),
  );
  const modePool = MODE_POOLS[safeTonality];
  const mode = modePool[Math.floor(tonalRng() * modePool.length)];
  const root =
    ROOTS[
      hash32(seed, tonalMaterialId, "material-root") % ROOTS.length
    ];
  const motifRng = makeRng(
    hash32(seed, form.motifLineageId, safeTonality, "motif-identity"),
  );
  const harmonyRng = makeRng(
    hash32(
      seed,
      harmonyMaterialId,
      safeTonality,
      trackDNA.harmonyBehavior,
      "harmony-identity",
    ),
  );
  const progressionGravity = {
    "tonic-drone": 0.78,
    "dub-stabs": 0.5,
    "modal-turns": 0.28,
    "detroit-voicings": 0.4,
    "suspended-space": 0.6,
  }[trackDNA.harmonyBehavior];
  const identity = Object.freeze({
    id: `${safeTonality}:${tonalMaterialId}:${form.motifLineageId}:${harmonyMaterialId}`,
    lineageId: form.motifLineageId,
    tonalMaterialId,
    harmonyMaterialId,
    mode,
    root,
    rootName: ROOT_NAMES[((root % 12) + 12) % 12],
    motif: createDegreeWalk(
      motifRng,
      5,
      mode.intervals.length,
      0.36,
    ),
    progression: createDegreeWalk(
      harmonyRng,
      4,
      mode.intervals.length,
      safeTonality === "neutral"
        ? Math.max(0.5, progressionGravity)
        : progressionGravity,
    ),
  });
  materialCache.set(cacheKey, identity);
  if (materialCache.size > MATERIAL_CACHE_LIMIT) {
    materialCache.delete(materialCache.keys().next().value);
  }
  return identity;
}

function decorateMovementWithIdentity(movement, identity) {
  if (movement.materialId === identity.id) return movement;
  return Object.freeze({
    ...movement,
    materialId: identity.id,
    materialLineageId: identity.lineageId,
    tonalMaterialId: identity.tonalMaterialId,
    harmonyMaterialId: identity.harmonyMaterialId,
    mode: identity.mode,
    root: identity.root,
    rootName: identity.rootName,
    motif: identity.motif,
    progression: identity.progression,
  });
}

function sectionsFromForm(seed, movementIndex, formPhrases) {
  const sections = [];
  let sectionStart = 0;
  for (let phrase = 1; phrase <= formPhrases.length; phrase += 1) {
    const continues =
      phrase < formPhrases.length &&
      formPhrases[phrase].label === formPhrases[sectionStart].label;
    if (continues) continue;
    const index = sections.length;
    const startBar = sectionStart * PHRASE_BARS;
    const endBar = phrase * PHRASE_BARS;
    const openingForm = formPhrases[sectionStart];
    sections.push(
      Object.freeze({
        index,
        kind: openingForm.label,
        duration: endBar - startBar,
        startBar,
        endBar,
        startPhrase: openingForm.phraseIndex,
        endPhrase: formPhrases[phrase - 1].phraseIndex + 1,
        seed: hash32(
          seed,
          movementIndex,
          openingForm.phraseIndex,
          openingForm.formEpochId,
          0x53454354,
        ),
      }),
    );
    sectionStart = phrase;
  }
  return Object.freeze(sections);
}

export function createMovement(seed, movementIndex, tonality = "minor") {
  if (
    !Number.isSafeInteger(movementIndex) ||
    movementIndex < 0
  ) {
    throw new RangeError("movementIndex must be a non-negative safe integer");
  }
  const safeTonality = ["major", "neutral"].includes(tonality) ? tonality : "minor";
  const cacheKey = `${seed}:${movementIndex}:${safeTonality}`;
  if (movementCache.has(cacheKey)) {
    const cached = movementCache.get(cacheKey);
    movementCache.delete(cacheKey);
    movementCache.set(cacheKey, cached);
    return cached;
  }
  const movementStartPhrase =
    movementIndex * (MOVEMENT_BARS / PHRASE_BARS);
  const formPhrases = traceEmergentForm(
    seed,
    movementStartPhrase,
    MOVEMENT_BARS / PHRASE_BARS,
  );
  const sections = sectionsFromForm(seed, movementIndex, formPhrases);
  const identity = musicalIdentityForForm(
    seed,
    formPhrases[0],
    safeTonality,
  );
  const trackDNA = createTrackDNA(seed);
  const movement = Object.freeze({
    index: movementIndex,
    startBar: movementIndex * MOVEMENT_BARS,
    endBar: (movementIndex + 1) * MOVEMENT_BARS,
    materialId: identity.id,
    materialLineageId: identity.lineageId,
    tonalMaterialId: identity.tonalMaterialId,
    harmonyMaterialId: identity.harmonyMaterialId,
    mode: identity.mode,
    root: identity.root,
    rootName: identity.rootName,
    motif: identity.motif,
    progression: identity.progression,
    trackDNA,
    formPhrases,
    sections,
    timbre: trajectoryTimbre(seed, trackDNA),
  });
  movementCache.set(cacheKey, movement);
  if (movementCache.size > MOVEMENT_CACHE_LIMIT) {
    movementCache.delete(movementCache.keys().next().value);
  }
  return movement;
}

export function sectionAtBar(movement, bar) {
  const localBar =
    ((bar - movement.startBar) % MOVEMENT_BARS + MOVEMENT_BARS) %
    MOVEMENT_BARS;
  return (
    movement.sections.find(
      (section) => localBar >= section.startBar && localBar < section.endBar,
    ) || movement.sections[movement.sections.length - 1]
  );
}

export function formAtBar(movement, bar) {
  const localBar =
    ((bar - movement.startBar) % MOVEMENT_BARS + MOVEMENT_BARS) %
    MOVEMENT_BARS;
  return movement.formPhrases[
    clamp(
      Math.floor(localBar / PHRASE_BARS),
      0,
      movement.formPhrases.length - 1,
    )
  ];
}

function formDynamicsAtBar(movement, bar) {
  const form = formAtBar(movement, bar);
  const barInPhrase =
    ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
  const progress = clamp(
    barInPhrase / Math.max(1, PHRASE_BARS - 1),
    0,
    1,
  );
  return {
    form,
    energy: lerp(form.energyFrom, form.energyTo, smoothstep(progress)),
    progress,
  };
}

function shuffled(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function degreeToMidi(root, intervals, degree, octave = 0) {
  const wrapped = ((degree % intervals.length) + intervals.length) % intervals.length;
  const octaves = Math.floor(degree / intervals.length);
  return root + intervals[wrapped] + (octaves + octave) * 12;
}

function makeChord(movement, degree, octave = 1, suspended = false) {
  const scale = movement.mode.intervals;
  const root = degreeToMidi(movement.root, scale, degree, octave);
  const third = suspended
    ? degreeToMidi(movement.root, scale, degree + 3, octave)
    : degreeToMidi(movement.root, scale, degree + 2, octave);
  const fifth = degreeToMidi(movement.root, scale, degree + 4, octave);
  const seventh = degreeToMidi(movement.root, scale, degree + 6, octave);
  return [root, third, fifth, seventh];
}

function emptyPattern(fill = 0) {
  return Array(STEPS_PER_BAR).fill(fill);
}

function fitMidiToRange(midi, minimum, maximum) {
  let result = midi;
  while (result < minimum) result += 12;
  while (result > maximum) result -= 12;
  return result;
}

function advancedStartsPerBar(councilVerdict = null) {
  if (Number.isFinite(councilVerdict?.maxAdvancedStarts)) {
    return clamp(Math.floor(councilVerdict.maxAdvancedStarts), 0, 4);
  }
  return 3;
}

function roleNoteCount(role, steps, profile, energy) {
  if (steps.length <= 1) return steps.length;
  const fullness = clamp(
    0.42 +
      profile.density * 0.3 +
      profile.syncopation * 0.1 +
      energy * 0.18,
    0.48,
    1,
  );
  return clamp(
    Math.round(steps.length * fullness * role.densityScale),
    0,
    steps.length,
  );
}

function resolveEnsembleOnsets(lanes, seed, phraseIndex, barOffset) {
  for (let step = 0; step < STEPS_PER_BAR; step += 1) {
    const attacks = SYNTH_ENGINE_IDS
      .map((engine) => ({ engine, note: lanes[engine][barOffset][step] }))
      .filter((entry) => entry.note)
      .sort(
        (left, right) =>
          right.note.priority - left.note.priority ||
          hash32(
            seed,
            phraseIndex,
            barOffset,
            step,
            left.engine,
            left.note.sourceSceneId,
          ) -
            hash32(
              seed,
              phraseIndex,
              barOffset,
              step,
              right.engine,
              right.note.sourceSceneId,
            ),
      );
    for (const collision of attacks.slice(1)) {
      lanes[collision.engine][barOffset][step] = null;
    }
  }
}

function enforceEnsembleStartBudget(
  lanes,
  seed,
  phraseIndex,
  barOffset,
  maximum,
) {
  const attacks = [];
  for (const engine of SYNTH_ENGINE_IDS) {
    for (let step = 0; step < STEPS_PER_BAR; step += 1) {
      const note = lanes[engine][barOffset][step];
      if (note) attacks.push({ engine, step, note });
    }
  }
  if (attacks.length <= maximum) return;
  const keep = new Set(
    attacks
      .sort(
        (left, right) =>
          right.note.priority - left.note.priority ||
          right.note.velocity - left.note.velocity ||
          hash32(
            seed,
            phraseIndex,
            barOffset,
            left.engine,
            left.step,
          ) -
            hash32(
              seed,
              phraseIndex,
              barOffset,
              right.engine,
              right.step,
            ),
      )
      .slice(0, maximum)
      .map((entry) => `${entry.engine}:${entry.step}`),
  );
  for (const attack of attacks) {
    if (!keep.has(`${attack.engine}:${attack.step}`)) {
      lanes[attack.engine][barOffset][attack.step] = null;
    }
  }
}

export function buildEnsemblePhrase({
  seed,
  phraseIndex,
  movement,
  section,
  profile,
  roles,
  activeEngines = SYNTH_ENGINE_IDS,
  councilVerdict = null,
}) {
  const lanes = {
    fm: Array.from({ length: PHRASE_BARS }, () =>
      Array(STEPS_PER_BAR).fill(null),
    ),
    modal: Array.from({ length: PHRASE_BARS }, () =>
      Array(STEPS_PER_BAR).fill(null),
    ),
    string: Array.from({ length: PHRASE_BARS }, () =>
      Array(STEPS_PER_BAR).fill(null),
    ),
  };
  const phraseStartBar = phraseIndex * PHRASE_BARS;
  const phraseForm = formAtBar(movement, phraseStartBar);
  for (let barOffset = 0; barOffset < PHRASE_BARS; barOffset += 1) {
    const targetBar = phraseStartBar + barOffset;
    const {
      form: targetForm,
      energy: formLevel,
    } = formDynamicsAtBar(movement, targetBar);
    const energy = clamp(
      formLevel * (0.5 + profile.drive * 0.64) +
        profile.density * 0.06 +
        (targetForm.climax ? 0.16 : 0) -
        (targetForm.release ? 0.1 : 0),
      0.12,
      1,
    );
    for (const engine of SYNTH_ENGINE_IDS) {
      if (!activeEngines.includes(engine)) continue;
      const role = roles[engine];
      if (!role) continue;
      const rng = makeRng(
        hash32(
          seed,
          phraseIndex,
          barOffset,
          phraseForm.motifLineageId,
          phraseForm.motifMutationCount,
          phraseForm.chair,
          role.sourceSceneId,
          role.id,
          engine,
        ),
      );
      const candidates = role.pattern[barOffset] || [];
      const count = roleNoteCount(role, candidates, profile, energy);
      const selected = shuffled(candidates, rng)
        .slice(0, count)
        .sort((left, right) => left - right);
      selected.forEach((step, index) => {
        const shiftedStep =
          (step +
            {
              hypnotic: 0,
              dub: 2,
              acid: 1,
              detroit: 3,
              peak: 0,
            }[profile.id]) %
          STEPS_PER_BAR;
        const renderStep = [0, 4, 8, 12].includes(shiftedStep)
          ? (shiftedStep + 1) % STEPS_PER_BAR
          : shiftedStep;
        const forwardIndex =
          (index + barOffset + phraseIndex) % movement.motif.length;
        const motifIndex =
          role.motifDirection < 0
            ? movement.motif.length - 1 - forwardIndex
            : forwardIndex;
        let degree = movement.motif[motifIndex] + role.degreeOffset;
        if (rng() < profile.syncopation * 0.12) {
          degree += rng() < 0.5 ? -1 : 1;
        }
        const midi = fitMidiToRange(
          degreeToMidi(
            movement.root,
            movement.mode.intervals,
            degree,
            1,
          ),
          role.range[0],
          role.range[1],
        );
        const length =
          role.length[0] +
          Math.floor(rng() * (role.length[1] - role.length[0] + 1));
        lanes[engine][barOffset][renderStep] = {
          midi,
          degree,
          velocity: clamp(
            0.24 +
              energy * 0.34 +
              role.velocityBias +
              rng() * 0.12,
            0.16,
            0.82,
          ),
          length: clamp(length, 1, 4),
          accent: rng() < 0.14 + profile.drive * 0.26,
          ensembleRole: role.id,
          register: role.register,
          sourceSceneId: role.sourceSceneId,
          priority: role.priority,
          delaySend: clamp(
            role.delaySend + profile.space * 0.08,
            0,
            0.42,
          ),
          reverbSend: clamp(
            role.reverbSend + profile.space * 0.12,
            0,
            0.55,
          ),
        };
      });
    }
    resolveEnsembleOnsets(lanes, seed, phraseIndex, barOffset);
    enforceEnsembleStartBudget(
      lanes,
      seed,
      phraseIndex,
      barOffset,
      advancedStartsPerBar(councilVerdict),
    );
  }
  return lanes;
}

function chordOccupiesNeighbour(chord, step) {
  return [step - 1, step, step + 1].some(
    (target) => target >= 0 && target < STEPS_PER_BAR && chord[target],
  );
}

function arrangementBlocksEnsembleNote({
  engine,
  role,
  step,
  bass,
  chord,
  metallic,
  ride,
}) {
  if (engine === "modal") return Boolean(metallic[step] || ride[step]);
  if (chordOccupiesNeighbour(chord, step)) return true;
  return role.register === "low" && Boolean(bass[step]);
}

function fitEnsembleToArrangement({
  phrase,
  barInPhrase,
  roles,
  seed,
  phraseIndex,
  bass,
  chord,
  metallic,
  ride,
}) {
  const result = Object.fromEntries(
    SYNTH_ENGINE_IDS.map((engine) => [
      engine,
      Array(STEPS_PER_BAR).fill(null),
    ]),
  );
  const occupied = new Set();
  const deferred = [];
  for (const engine of SYNTH_ENGINE_IDS) {
    const role = roles[engine];
    phrase[engine][barInPhrase].forEach((note, step) => {
      if (!note) return;
      if (
        occupied.has(step) ||
        arrangementBlocksEnsembleNote({
          engine,
          role,
          step,
          bass,
          chord,
          metallic,
          ride,
        })
      ) {
        deferred.push({ engine, role, note, step });
        return;
      }
      result[engine][step] = note;
      occupied.add(step);
    });
  }
  deferred.sort(
    (left, right) =>
      right.note.priority - left.note.priority ||
      hash32(
        seed,
        phraseIndex,
        barInPhrase,
        left.engine,
        left.step,
      ) -
        hash32(
          seed,
          phraseIndex,
          barInPhrase,
          right.engine,
          right.step,
        ),
  );
  let relocatedLead = false;
  for (const event of deferred) {
    if (relocatedLead || event.note.priority < 3) continue;
    const vocabulary = [
      ...new Set(event.role.pattern.flat()),
    ]
      .filter(
        (step) =>
          Math.abs(step - event.step) <= 2 &&
          ![0, 4, 8, 12].includes(step) &&
          !occupied.has(step) &&
          !arrangementBlocksEnsembleNote({
            engine: event.engine,
            role: event.role,
            step,
            bass,
            chord,
            metallic,
            ride,
          }),
      )
      .sort(
        (left, right) =>
          Math.abs(left - event.step) - Math.abs(right - event.step) ||
          hash32(
            seed,
            phraseIndex,
            barInPhrase,
            event.engine,
            left,
          ) -
            hash32(
              seed,
              phraseIndex,
              barInPhrase,
              event.engine,
              right,
            ),
      );
    const alternate = vocabulary[0];
    if (alternate === undefined) continue;
    result[event.engine][alternate] = event.note;
    occupied.add(alternate);
    relocatedLead = true;
  }
  return result;
}

function hasLaneEvents(lane) {
  return lane.some(Boolean);
}

function editOptionalLayers({
  councilVerdict,
  trackDNA,
  roles,
  activeSynthEngines,
  shaker,
  rim,
  ride,
  metallic,
  chord,
  pad,
  texture,
}) {
  const harmonyForeground = [
    "dub-stabs",
    "modal-turns",
    "detroit-voicings",
    "suspended-space",
  ].includes(trackDNA?.harmonyBehavior);
  const candidates = [
    { id: "shaker", active: hasLaneEvents(shaker), clear: () => shaker.fill(0) },
    { id: "rim", active: hasLaneEvents(rim), clear: () => rim.fill(0) },
    { id: "ride", active: hasLaneEvents(ride), clear: () => ride.fill(0) },
    {
      id: "metallic",
      active: hasLaneEvents(metallic),
      clear: () => metallic.fill(0),
    },
    { id: "chord", active: hasLaneEvents(chord), clear: () => chord.fill(null) },
    { id: "pad", active: Boolean(pad), clear: () => {} },
    { id: "texture", active: Boolean(texture), clear: () => {} },
  ];
  const priority = councilVerdict.optionalLayerPriority;
  const keep = new Set(
    candidates
      .filter((candidate) => candidate.active)
      .sort(
        (left, right) =>
          (harmonyForeground && ["chord", "pad"].includes(right.id) ? 1 : 0) -
            (harmonyForeground && ["chord", "pad"].includes(left.id) ? 1 : 0) ||
          priority.indexOf(left.id) - priority.indexOf(right.id),
      )
      .slice(0, councilVerdict.optionalLayerBudget)
      .map((candidate) => candidate.id),
  );
  for (const candidate of candidates) {
    if (candidate.active && !keep.has(candidate.id)) candidate.clear();
  }

  const activeRoles = activeSynthEngines
    .map((engine) => roles[engine])
    .filter(Boolean);
  if (activeRoles.some((role) => role.register === "high")) {
    metallic.fill(0);
    ride.fill(0);
  }
  if (
    councilVerdict.chair !== "machine-soul" &&
    !harmonyForeground &&
    activeRoles.some((role) => ["low", "mid"].includes(role.register))
  ) {
    chord.fill(null);
    if (councilVerdict.chair !== "long-arc") keep.delete("pad");
  }
  return {
    pad: keep.has("pad") ? pad : null,
    texture: keep.has("texture") ? texture : false,
  };
}

function buildInstrumentation({
  kick,
  clap,
  hat,
  openHat,
  shaker,
  rim,
  ride,
  metallic,
  tom,
  bass,
  bassVoice,
  chord,
  pad,
  texture,
  riser,
  downlifter,
  synth,
  synthPalette,
  activeSynthEngines,
  ensembleScene,
}) {
  const items = [];
  const add = (id, role, label, detail = "", engine = "", part = "") => {
    const item = { id, role, label, detail };
    if (engine) item.engine = engine;
    if (part) item.part = part;
    items.push(Object.freeze(item));
  };
  if (hasLaneEvents(kick)) add("foundation-kick", "foundation", "FOUR-FLOOR KICK");
  if (hasLaneEvents(bass)) {
    add(`bass-${bassVoice}`, "low-end", `${bassVoice.toUpperCase()} BASS`);
  }
  for (const engine of activeSynthEngines) {
    if (!hasLaneEvents(synth[engine])) continue;
    const genome = synthPalette[engine];
    const ensembleRole = ensembleScene.roles[engine];
    add(
      genome.id,
      "synth",
      genome.label,
      genome.detail,
      engine,
      ensembleRole?.label || "",
    );
  }
  if (hasLaneEvents(clap)) add("backbeat-clap", "backbeat", "MACHINE CLAP");
  if (hasLaneEvents(hat) || hasLaneEvents(openHat) || hasLaneEvents(ride)) {
    add("tops-cymbals", "tops", hasLaneEvents(ride) ? "RIDE / HATS" : "HAT ARRAY");
  }
  if (
    hasLaneEvents(shaker) ||
    hasLaneEvents(rim) ||
    hasLaneEvents(metallic) ||
    hasLaneEvents(tom)
  ) {
    add("secondary-percussion", "percussion", "SECONDARY PERCUSSION");
  }
  if (hasLaneEvents(chord)) add("harmony-stab", "harmony", "CHORD STAB");
  if (pad) add("harmony-pad", "harmony", "LONG PAD");
  if (texture) add("atmosphere-texture", "atmosphere", "NOISE TEXTURE");
  if (riser) add("transition-riser", "transition", "EIGHT-BAR RISER");
  if (downlifter) add("transition-downlifter", "transition", "DOWNLIFTER");
  return Object.freeze(items);
}

function unitHash(...values) {
  return (hash32(...values) >>> 0) / 0xffffffff;
}

function selectBassVoice(seed, movement, form, profile) {
  const materialId =
    form.bassVoiceMaterialId ?? form.motifLineageId;
  const voiceBias = movement.trackDNA?.bassVoiceBias;
  const bassBehavior = movement.trackDNA?.bassBehavior;
  const scores = {
    acid:
      movement.timbre.filterBias * 0.24 +
      unitHash(seed, materialId, "bass-acid") * 0.34 +
      (voiceBias === "acid" ? 0.3 : 0) +
      (bassBehavior === "acid-serpent" ? 0.24 : 0) +
      (profile.acid > 0.85 ? 0.38 : 0) +
      profile.acid * 0.2,
    sub:
      movement.timbre.kickDecay * 0.24 +
      unitHash(seed, materialId, "bass-sub") * 0.34 +
      (voiceBias === "sub" ? 0.3 : 0) +
      (bassBehavior === "sub-sustain" ? 0.3 : 0) +
      (profile.rumble + profile.warmth) * 0.1,
    pulse:
      movement.timbre.kickTone * 0.24 +
      unitHash(seed, materialId, "bass-pulse") * 0.34 +
      (voiceBias === "pulse" ? 0.3 : 0) +
      (["offbeat-pulse", "syncopated-stabs"].includes(bassBehavior)
        ? 0.16
        : 0) +
      (profile.id === "peak" ? 0.34 : 0) +
      (profile.syncopation + profile.drive) * 0.1,
  };
  return Object.keys(scores).reduce((winner, candidate) =>
    scores[candidate] > scores[winner] ? candidate : winner,
  );
}

function kickFamilyParameters(seed, familyId) {
  return Object.freeze({
    body: unitHash(seed, familyId, "kick-family-body"),
    attack: unitHash(seed, familyId, "kick-family-attack"),
    drop: unitHash(seed, familyId, "kick-family-drop"),
    decay: unitHash(seed, familyId, "kick-family-decay"),
    click: unitHash(seed, familyId, "kick-family-click"),
    clickLevel: unitHash(seed, familyId, "kick-family-click-level"),
    drive: unitHash(seed, familyId, "kick-family-drive"),
    rumble: unitHash(seed, familyId, "kick-family-rumble"),
    rumbleTone: unitHash(seed, familyId, "kick-family-rumble-tone"),
    feedback: unitHash(seed, familyId, "kick-family-feedback"),
  });
}

function buildKickTimbre(
  seed,
  phraseIndex,
  movement,
  form,
  profile,
  energy,
  phraseProgress,
) {
  const architectureId =
    movement.trackDNA?.kickArchitecture || "deep-round";
  const architecture = {
    "short-punch": {
      bodyHz: 51,
      pitchStartHz: 184,
      pitchDropSeconds: 0.03,
      decaySeconds: 0.32,
      clickHz: 5200,
      clickLevel: 0.12,
      drive: 2.35,
      rumbleScale: 0.55,
    },
    "deep-round": {
      bodyHz: 45,
      pitchStartHz: 146,
      pitchDropSeconds: 0.052,
      decaySeconds: 0.56,
      clickHz: 3400,
      clickLevel: 0.065,
      drive: 1.72,
      rumbleScale: 1,
    },
    "click-forward": {
      bodyHz: 48,
      pitchStartHz: 198,
      pitchDropSeconds: 0.028,
      decaySeconds: 0.39,
      clickHz: 6900,
      clickLevel: 0.15,
      drive: 2.2,
      rumbleScale: 0.62,
    },
    "saturated-tail": {
      bodyHz: 46,
      pitchStartHz: 172,
      pitchDropSeconds: 0.044,
      decaySeconds: 0.66,
      clickHz: 4200,
      clickLevel: 0.09,
      drive: 3.15,
      rumbleScale: 1.18,
    },
    "sub-drop": {
      bodyHz: 40.5,
      pitchStartHz: 128,
      pitchDropSeconds: 0.068,
      decaySeconds: 0.61,
      clickHz: 2700,
      clickLevel: 0.045,
      drive: 1.48,
      rumbleScale: 1.12,
    },
  }[architectureId];
  const currentFamily = kickFamilyParameters(seed, form.kickFamilyId);
  const priorFamily = kickFamilyParameters(
    seed,
    form.priorKickFamilyId ?? form.kickFamilyId,
  );
  const familyMorph = form.kickFamilyMorph
    ? clamp(phraseProgress, 0, 1)
    : 1;
  const familyValue = (key) =>
    lerp(priorFamily[key], currentFamily[key], familyMorph);
  const climaxDepth = form.climax
    ? clamp(
        form.climaxAge / FORM_RULES.climax.maximumPhrases,
        0,
        1,
      )
    : 0;
  return Object.freeze({
    bodyHz: clamp(
      architecture.bodyHz +
        (familyValue("body") - 0.5) * 3.2 +
        (profile.warmth - 0.5) * 2.2 +
        (form.floorTrust - 0.5) * 2.5 -
        climaxDepth * 1.4,
      38,
      55,
    ),
    pitchStartHz: clamp(
      architecture.pitchStartHz +
        (familyValue("attack") - 0.5) * 18 +
        (profile.acid - 0.5) * 28 +
        energy * 8 +
        climaxDepth * 8,
      120,
      212,
    ),
    pitchDropSeconds: clamp(
      architecture.pitchDropSeconds +
        (familyValue("drop") - 0.5) * 0.009,
      0.022,
      0.076,
    ),
    decaySeconds: clamp(
      architecture.decaySeconds +
        (familyValue("decay") - 0.5) * 0.075 +
        (profile.warmth - 0.5) * 0.075 +
        form.space * 0.055 +
        climaxDepth * 0.045,
      0.27,
      0.72,
    ),
    clickHz: clamp(
      architecture.clickHz +
        (familyValue("click") - 0.5) * 720 +
        (profile.metallic - 0.5) * 1250 +
        (profile.acid - 0.5) * 1000 +
        form.brightness * 760,
      2400,
      7600,
    ),
    clickLevel: clamp(
      architecture.clickLevel +
        (familyValue("clickLevel") - 0.5) * 0.024 +
        (profile.drive - 0.5) * 0.045 +
        (profile.acid - 0.5) * 0.03 +
        form.brightness * 0.032 +
        unitHash(seed, phraseIndex, "kick-click-articulation") * 0.012,
      0.025,
      0.18,
    ),
    drive: clamp(
      architecture.drive +
        (familyValue("drive") - 0.5) * 0.32 +
        energy * 0.18 +
        profile.drive * 0.52 +
        form.floorTrust * 0.34 +
        climaxDepth * 0.28,
      1.2,
      3.5,
    ),
    rumbleSend: clamp(
      (0.015 +
        profile.rumble * 0.075 +
        familyValue("rumble") * 0.035 +
        climaxDepth * 0.018) *
        architecture.rumbleScale *
        (form.kickPolicy === "withdraw" ? 0.15 : 1),
      0,
      0.14,
    ),
    rumbleCutoffHz: clamp(
      84 +
        familyValue("rumbleTone") * 58 +
        profile.rumble * 29 +
        form.space * 12,
      84,
      176,
    ),
    rumbleFeedback: clamp(
      0.12 +
        familyValue("feedback") * 0.25 +
        profile.rumble * 0.13 +
        form.space * 0.04 +
        climaxDepth * 0.055,
      0.12,
      0.58,
    ),
  });
}

function buildBassLine({
  seed,
  bar,
  movement,
  form,
  profile,
  energy,
  kick,
}) {
  const bass = Array(STEPS_PER_BAR).fill(null);
  const trackDNA = movement.trackDNA || createTrackDNA(seed);
  const bassBehavior = trackDNA.bassBehavior;
  const groove =
    GROOVE_VOCABULARIES[trackDNA.grooveFamily] ||
    GROOVE_VOCABULARIES["straight-pressure"];
  const vibeDirection =
    VIBE_ARRANGEMENT[profile.id] || VIBE_ARRANGEMENT.hypnotic;
  const barInCell = ((bar % 2) + 2) % 2;
  const cellRotation =
    hash32(
      form.motifLineageId,
      bassBehavior,
      trackDNA.grooveFamily,
      "bass-cell",
    ) % 32;
  const baseEventsPerHalf = {
    "offbeat-pulse": 4,
    "rolling-cell": 6,
    "acid-serpent": 6,
    "sub-sustain": 3,
    "syncopated-stabs": 5,
  }[bassBehavior];
  const renderedEventsPerHalf = clamp(
    Math.round(
      1 +
        form.density * 2.2 +
        profile.density * 1.5 +
        groove.bassDensityBias -
        (form.kickPolicy === "thin" ? 0.6 : 0) -
        (form.kickPolicy === "withdraw" ? 1.2 : 0),
    ),
    1,
    baseEventsPerHalf,
  );
  const lineageSyncopation = unitHash(
    form.motifLineageId,
    "bass-syncopation",
  );
  const motifRotation =
    hash32(form.motifLineageId, "bass-motif-rotation") %
    movement.motif.length;
  const degreeForCellStep = (cellStep) =>
    movement.motif[
      (motifRotation +
        Math.floor(cellStep / 4) +
        (cellStep % 3 === 0 ? 1 : 0)) %
        movement.motif.length
    ];
  const scoreCellStep = (cellStep) => {
    const step = cellStep % STEPS_PER_BAR;
    const rotated = (cellStep + cellRotation) % 32;
    const threePulse =
      0.5 + Math.cos((rotated / 32) * Math.PI * 2 * 3) * 0.5;
    const fivePulse =
      0.5 + Math.sin((rotated / 32) * Math.PI * 2 * 5) * 0.5;
    const behaviorPulse = {
      "offbeat-pulse":
        step % 4 === 2 ? 1 : step % 4 === 3 ? 0.55 : 0,
      "rolling-cell": threePulse * 0.62 + fivePulse * 0.38,
      "acid-serpent": step % 2 ? 0.78 : fivePulse * 0.46,
      "sub-sustain":
        [2, 6, 10, 14].includes(step) ? 1 : step % 4 === 0 ? 0.18 : 0,
      "syncopated-stabs":
        [3, 7, 11, 15].includes(step) ? 1 : fivePulse * 0.35,
    }[bassBehavior];
    const groovePulse =
      groove.secondaryHats.includes(step) ? 0.22 : 0;
    const offbeat =
      step % 4 === 0 ? 0 : 0.2 + lineageSyncopation * 0.12;
    return (
      unitHash(
        seed,
        form.motifLineageId,
        cellStep,
        "bass-onset",
      ) *
        0.44 +
      threePulse * 0.1 +
      fivePulse * 0.08 +
      behaviorPulse * 0.34 +
      groovePulse +
      offbeat +
      (step % 2 ? 0.045 : 0)
    );
  };
  const baseCell = [0, 1].flatMap((cellBar) =>
    Array.from({ length: STEPS_PER_BAR }, (_, step) => {
      const cellStep = cellBar * STEPS_PER_BAR + step;
      return { cellStep, score: scoreCellStep(cellStep) };
    })
      .sort((left, right) => right.score - left.score)
      .slice(0, baseEventsPerHalf)
      .sort((left, right) => left.cellStep - right.cellStep)
      .map((candidate) => ({
        step: candidate.cellStep,
        degree: degreeForCellStep(candidate.cellStep),
      })),
  );
  const mutatedCell = baseCell.map((event) => ({ ...event }));
  const firstMutationTarget =
    hash32(form.motifLineageId, "bass-mutation-target") %
    mutatedCell.length;
  for (
    let mutation = 0;
    mutation < form.motifMutationCount;
    mutation += 1
  ) {
    const targetIndex =
      (firstMutationTarget + mutation * 3) % mutatedCell.length;
    const target = mutatedCell[targetIndex];
    const preferOnset =
      hash32(form.motifLineageId, mutation, "bass-mutation-kind") % 2 ===
      0;
    const direction =
      hash32(form.motifLineageId, mutation, "bass-mutation-direction") %
        2 ===
      0
        ? -1
        : 1;
    const halfStart = Math.floor(target.step / STEPS_PER_BAR) * STEPS_PER_BAR;
    const candidateStep = clamp(
      target.step + direction,
      halfStart,
      halfStart + STEPS_PER_BAR - 1,
    );
    const onsetAvailable = !mutatedCell.some(
      (event, index) =>
        index !== targetIndex && event.step === candidateStep,
    );
    if (preferOnset && candidateStep !== target.step && onsetAvailable) {
      target.step = candidateStep;
    } else {
      target.degree += direction;
    }
  }
  const canonicalCell = Object.freeze(
    mutatedCell
      .sort((left, right) => left.step - right.step)
      .map((event) => Object.freeze(event)),
  );
  const candidates = form.intentionalRest
    ? []
    : canonicalCell
        .map((event) => ({
          ...event,
          cellStep: event.step,
          renderedStep:
            (event.step + vibeDirection.bassRotation) % 32,
        }))
        .filter(
          (event) =>
            Math.floor(event.renderedStep / STEPS_PER_BAR) === barInCell,
        )
        .sort(
          (left, right) =>
            (unitHash(
              form.motifLineageId,
              right.cellStep,
              profile.id,
              "bass-render-vibe-priority",
            ) *
              0.34 +
              (right.renderedStep % 2 ? profile.syncopation * 0.2 : 0) +
              (right.renderedStep % 4 === 2 ? profile.acid * 0.18 : 0) +
              (right.renderedStep % 4 === 0 ? profile.rumble * 0.12 : 0)) -
            (unitHash(
              form.motifLineageId,
              left.cellStep,
              profile.id,
              "bass-render-vibe-priority",
            ) *
              0.34 +
              (left.renderedStep % 2 ? profile.syncopation * 0.2 : 0) +
              (left.renderedStep % 4 === 2 ? profile.acid * 0.18 : 0) +
              (left.renderedStep % 4 === 0 ? profile.rumble * 0.12 : 0)),
        )
        .slice(0, renderedEventsPerHalf)
        .filter(
          (event) => !kick[event.renderedStep % STEPS_PER_BAR],
        )
        .sort((left, right) => left.renderedStep - right.renderedStep)
        .map((event) => ({
          step: event.renderedStep % STEPS_PER_BAR,
          cellStep: event.cellStep,
          degree: event.degree,
        }));

  candidates.forEach(({ step, cellStep, degree }) => {
    let midi = degreeToMidi(
      movement.root,
      movement.mode.intervals,
      degree,
    );
    if (
      unitHash(form.motifLineageId, cellStep, "bass-octave") <
      0.04 + profile.acid * 0.1
    ) {
      midi += 12;
    }
    midi = fitMidiToRange(midi, 34, 55);
    bass[step] = {
      midi,
      degree,
      accent:
        unitHash(form.motifLineageId, cellStep, "bass-accent") <
        0.16 + profile.acid * 0.3 + energy * 0.08,
      velocity: clamp(
        0.48 +
          energy * 0.26 +
          unitHash(form.motifLineageId, cellStep, "bass-velocity") * 0.12,
        0.42,
        0.9,
      ),
      length:
        unitHash(form.motifLineageId, cellStep, "bass-length") <
        0.22 + form.space * 0.22
          ? 2
          : 1,
      slideTo: null,
      slideSteps: 0,
      lineageId: form.motifLineageId,
    };
  });
  candidates.forEach(({ step }, index) => {
    const note = bass[step];
    const nextStep = candidates[index + 1]?.step;
    const gap =
      nextStep === undefined ? STEPS_PER_BAR - step : nextStep - step;
    note.length = Math.min(note.length, Math.max(1, gap));
    if (
      nextStep !== undefined &&
      gap <= 3 &&
      unitHash(
        form.motifLineageId,
        bar,
        step,
        "bass-slide",
      ) <
        0.06 + profile.acid * 0.36
    ) {
      note.slideTo = bass[nextStep]?.midi ?? null;
      note.slideSteps = gap;
      note.length = gap;
    }
  });
  return {
    bass,
    count: candidates.length,
    cell: canonicalCell,
    cellSignature: canonicalCell
      .map((event) => `${event.step}:${event.degree}`)
      .join("|"),
  };
}

export function buildBarPlan({
  seed,
  bar,
  vibeId = "hypnotic",
  tonality = "minor",
  profile = profileForVibe(vibeId),
  instrumentProfile = profile,
  ensembleRoles = null,
  tasteProfile = null,
}) {
  if (!Number.isSafeInteger(bar) || bar < 0) {
    throw new RangeError("bar must be a non-negative safe integer");
  }
  const movementIndex = Math.floor(Math.max(0, bar) / MOVEMENT_BARS);
  const movementWindow = createMovement(seed, movementIndex, tonality);
  const trackDNA = movementWindow.trackDNA || createTrackDNA(seed);
  profile = shapeProfileForTrack(profile, trackDNA);
  instrumentProfile = shapeProfileForTrack(
    instrumentProfile,
    trackDNA,
  );
  const groove =
    GROOVE_VOCABULARIES[trackDNA.grooveFamily] ||
    GROOVE_VOCABULARIES["straight-pressure"];
  const formRhythmBias =
    FORM_RHYTHM_BIAS[trackDNA.formPhenotype] ||
    FORM_RHYTHM_BIAS["patient-hypnosis"];
  const vibeArrangement =
    VIBE_ARRANGEMENT[vibeId] || VIBE_ARRANGEMENT.hypnotic;
  const percussionTimbre = percussionTimbreFor(trackDNA, profile);
  const section = sectionAtBar(movementWindow, bar);
  const localBar =
    ((bar - movementWindow.startBar) % MOVEMENT_BARS + MOVEMENT_BARS) %
    MOVEMENT_BARS;
  const { form, energy: formLevel, progress: phraseProgress } =
    formDynamicsAtBar(movementWindow, bar);
  const movement = decorateMovementWithIdentity(
    movementWindow,
    musicalIdentityForForm(seed, form, tonality),
  );
  const phraseIndex = Math.floor(bar / PHRASE_BARS);
  const barInPhrase = bar % PHRASE_BARS;
  const barInSection =
    Math.max(0, form.labelResidency - 1) * PHRASE_BARS +
    barInPhrase;
  const sectionProgress = smoothstep(
    clamp(
      barInSection / (PHRASE_BARS * 4 - 1),
      0,
      1,
    ),
  );
  const phraseRng = makeRng(
    hash32(seed, phraseIndex, form.motifLineageId, 0x50485241),
  );
  const barRng = makeRng(
    hash32(seed, bar, form.motifLineageId, 0x42415221),
  );
  const energy = clamp(
    formLevel * (0.5 + profile.drive * 0.64) +
      profile.density * 0.06 +
      (form.climax ? 0.16 : 0) -
      (form.release ? 0.1 : 0),
    0.12,
    1,
  );
  const effectiveDensity =
    form.density * 0.66 + profile.density * 0.34;
  const effectiveSpace =
    form.space * 0.7 + profile.space * 0.3;
  const sparse =
    form.intentionalRest ||
    effectiveDensity < 0.48 ||
    effectiveSpace > 0.68;
  const peak = form.climax;
  const phraseEnd = barInPhrase === PHRASE_BARS - 1;
  const sectionStart =
    barInPhrase === 0 && form.labelResidency === 1;
  const sectionEnd =
    phraseEnd &&
    derivePhraseState(seed, phraseIndex + 1).formEpochId !==
      form.formEpochId;
  const targetEnsembleScene = selectEnsembleScene(
    seed,
    movement,
    section,
    phraseIndex,
  );
  const effectiveEnsembleRoles =
    ensembleRoles || targetEnsembleScene.roles;
  const councilVerdict = conveneCouncil({
    seed,
    movement,
    section,
    phraseIndex,
    roles: effectiveEnsembleRoles,
    profile,
  });
  const activeSynthEngines = councilVerdict.activeSynthEngines;

  const kick = emptyPattern();
  const kickCandidates = Array.from(
    { length: STEPS_PER_BAR / 4 },
    (_, index) => index * 4,
  );
  const kickCount =
    form.kickPolicy === "withdraw"
      ? 0
      : form.kickPolicy === "thin"
        ? clamp(
            Math.round(
              1 +
                form.floorTrust * 1.5 -
                profile.breakDepth * 0.65,
            ),
            1,
            3,
          )
        : kickCandidates.length;
  kickCandidates
    .map((step) => ({
      step,
      score:
        (hash32(seed, phraseIndex, step, form.motifLineageId, "kick") >>> 0) /
          0xffffffff +
        (step === 0 ? 0.42 : 0) +
        form.floorTrust * 0.18,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, kickCount)
    .sort((left, right) => left.step - right.step)
    .forEach(({ step }, index) => {
      kick[step] =
        0.73 +
        energy * 0.18 +
        (step === 0 ? 0.055 : 0) +
        (index % 2) * 0.012;
    });
  if (councilVerdict.allowFill && phraseEnd && energy > 0.62) {
    kick[14] = 0.52 + profile.drive * 0.2;
    if (profile.syncopation > 0.58) kick[15] = 0.44 + profile.drive * 0.22;
  }

  const clap = emptyPattern();
  if (energy > 0.46 && !form.intentionalRest) {
    const clapSteps =
      vibeId === "dub" && profile.space > 0.72
        ? [groove.claps[(phraseIndex + barInPhrase) % groove.claps.length]]
        : groove.claps;
    clapSteps.forEach((step, index) => {
      clap[step] =
        0.46 + energy * 0.28 + (index === clapSteps.length - 1 ? 0.05 : 0);
    });
    const ghostChance = clamp(
      0.08 +
        vibeArrangement.clapGhostBias +
        profile.syncopation * 0.18,
      0,
      0.55,
    );
    if (!sparse && barRng() < ghostChance) {
      const ghostStep =
        groove.ghostClaps[
          hash32(seed, phraseIndex, barInPhrase, "ghost-clap") %
            groove.ghostClaps.length
        ];
      clap[ghostStep] = Math.max(clap[ghostStep], 0.16 + energy * 0.12);
    }
    if (councilVerdict.allowFill && phraseEnd && profile.density > 0.7) {
      clap[11] = 0.2;
    }
  }

  const hat = emptyPattern();
  const openHat = emptyPattern();
  const primaryHatSteps = groove.hats.map(
    (step) => (step + vibeArrangement.hatRotation) % STEPS_PER_BAR,
  );
  primaryHatSteps.forEach((step, index) => {
    if (
      barRng() <
      0.48 + energy * 0.45 + formRhythmBias.primary
    ) {
      hat[step] = 0.34 + energy * 0.32 + (index % 2) * 0.05;
    }
  });
  for (const sourceStep of groove.secondaryHats) {
    const step =
      (sourceStep + vibeArrangement.hatRotation) % STEPS_PER_BAR;
    if (
      barRng() <
      energy * (0.2 + profile.density * 0.34) +
        formRhythmBias.secondary
    ) {
      hat[step] = Math.max(hat[step], 0.16 + barRng() * 0.24);
    }
  }
  if (!sparse && barRng() < 0.24 + profile.density * 0.5) {
    const openCandidates =
      primaryHatSteps.length > 1
        ? primaryHatSteps.filter((_, index) => index % 2 === 1)
        : primaryHatSteps;
    const step =
      openCandidates[Math.floor(barRng() * openCandidates.length)];
    openHat[step] = 0.34 + energy * 0.25;
    hat[step] = 0;
  }

  const shaker = emptyPattern();
  if (profile.swing + profile.space > 0.42 && energy > 0.45) {
    const rotation = Math.floor(phraseRng() * 4);
    for (let step = 0; step < STEPS_PER_BAR; step += 1) {
      if ((step + rotation) % 3 === 0 && barRng() < 0.48 + profile.density * 0.32) {
        shaker[step] = 0.12 + energy * 0.18;
      }
    }
  }

  const rim = emptyPattern();
  [3, 7, 11, 15].forEach((step) => {
    if (!sparse && barRng() < energy * (0.12 + profile.syncopation * 0.28)) {
      rim[step] = 0.2 + barRng() * 0.28;
    }
  });

  const ride = emptyPattern();
  if (
    peak &&
    profile.density > 0.58 &&
    form.climaxAge >= 2 &&
    barRng() < 0.28 + form.density * 0.5
  ) {
    [2, 6, 10, 14].forEach((step) => {
      if (barRng() < 0.46 + energy * 0.36) ride[step] = 0.18 + energy * 0.24;
    });
  }

  const metallic = emptyPattern();
  if (profile.metallic > 0.3 && !sparse) {
    const candidates = shuffled([1, 3, 5, 7, 9, 11, 13, 15], phraseRng);
    const count = Math.floor(profile.metallic * energy * 4);
    candidates.slice(0, count).forEach((step) => {
      metallic[step] = 0.16 + barRng() * 0.28;
    });
  }

  const tom = emptyPattern();
  if (councilVerdict.allowFill && phraseEnd && energy > 0.54) {
    const fillLength = profile.metallic > 0.6 ? 4 : 3;
    for (let offset = 0; offset < fillLength; offset += 1) {
      tom[STEPS_PER_BAR - fillLength + offset] = 0.28 + offset * 0.1;
    }
  }

  const bassLine = buildBassLine({
    seed,
    bar,
    movement,
    form,
    profile,
    energy,
    kick,
  });
  const bass = bassLine.bass;
  const bassCount = bassLine.count;

  const chord = Array(STEPS_PER_BAR).fill(null);
  const harmonyPosition =
    ((form.harmonyPosition % movement.progression.length) +
      movement.progression.length) %
    movement.progression.length;
  const progressionDegree =
    movement.progression[harmonyPosition];
  const harmonyDesign = {
    "tonic-drone": {
      chordBias: -0.12,
      eventsPerPhrase: 1,
      padChance: 0.58,
      tonic: true,
      suspended: false,
    },
    "dub-stabs": {
      chordBias: 0.24,
      eventsPerPhrase: 2,
      padChance: 0.18,
      tonic: false,
      suspended: false,
    },
    "modal-turns": {
      chordBias: 0.1,
      eventsPerPhrase: 1,
      padChance: 0.3,
      tonic: false,
      suspended: false,
    },
    "detroit-voicings": {
      chordBias: 0.2,
      eventsPerPhrase: 2,
      padChance: 0.26,
      tonic: false,
      suspended: false,
    },
    "suspended-space": {
      chordBias: 0.08,
      eventsPerPhrase: 1,
      padChance: 0.68,
      tonic: false,
      suspended: true,
    },
  }[trackDNA.harmonyBehavior];
  const audibleHarmonyDegree =
    harmonyDesign.tonic || vibeId === "dub"
      ? 0
      : vibeId === "detroit"
        ? progressionDegree + 2
        : vibeId === "acid"
          ? progressionDegree + 1
          : progressionDegree;
  const vibeChordBias = {
    hypnotic: 0.1,
    dub: 0.3,
    acid: -0.2,
    detroit: 0.26,
    peak: -0.24,
  }[vibeId];
  const chordChance = clamp(
    profile.chords * (sparse ? 0.82 : 0.62) +
      harmonyDesign.chordBias +
      vibeChordBias +
      (form.climax ? 0.12 : 0),
    0.06,
    0.96,
  );
  const firstChordBar =
    hash32(
      seed,
      phraseIndex,
      form.motifLineageId,
      trackDNA.harmonyBehavior,
      "chord-bar",
    ) % PHRASE_BARS;
  const chordBars = new Set([firstChordBar]);
  if (
    harmonyDesign.eventsPerPhrase > 1 ||
    vibeId === "detroit"
  ) {
    chordBars.add((firstChordBar + 3 + (phraseIndex % 2)) % PHRASE_BARS);
  }
  if (
    chordBars.has(barInPhrase) &&
    barRng() < chordChance
  ) {
    const chordSteps =
      trackDNA.harmonyBehavior === "dub-stabs"
        ? [3, 7, 11, 15]
        : groove.ghostClaps;
    const step = chordSteps[Math.floor(barRng() * chordSteps.length)];
    chord[step] = {
      notes: makeChord(
        movement,
        audibleHarmonyDegree,
        1,
        harmonyDesign.suspended ||
          barRng() < profile.space * 0.24,
      ),
      length: 0.16 + profile.space * 0.48,
      velocity: 0.42 + energy * 0.28,
    };
  }

  let pad =
    barInPhrase === 0 &&
    (form.release ||
      form.space > 0.62 ||
      (form.chair === "machine-soul" && form.motifSalience > 0.58) ||
      unitHash(
        seed,
        phraseIndex,
        trackDNA.harmonyBehavior,
        "track-pad",
      ) <
        clamp(
          harmonyDesign.padChance +
            {
              hypnotic: 0.08,
              dub: 0.35,
              acid: -0.26,
              detroit: -0.12,
              peak: -0.42,
            }[vibeId],
          0,
          0.9,
        ))
      ? {
          notes: makeChord(
            movement,
            audibleHarmonyDegree,
            2,
            harmonyDesign.suspended || profile.space > 0.7,
          ),
          durationBars: clamp(Math.round(2 + profile.space * 4), 2, 6),
          velocity: 0.12 + profile.chords * 0.14,
        }
      : null;

  const bassVoice = selectBassVoice(seed, movement, form, profile);

  const synthProfile = instrumentProfile;
  const synthHandoff = synthHandoffForForm(seed, form);
  const synthPalette = createSynthPalette({
    seed,
    bar,
    vibeId,
    profile: synthProfile,
    tasteProfile,
    form,
  });
  const ensembleScene = Object.freeze({
    id: targetEnsembleScene.id,
    label: targetEnsembleScene.label,
    detail: targetEnsembleScene.detail,
    recalled: targetEnsembleScene.recalled,
    sourceSectionIndex: targetEnsembleScene.sourceSectionIndex,
    mutationEngine: synthHandoff?.engine ?? null,
    hybrid: activeSynthEngines.some(
      (engine) =>
        effectiveEnsembleRoles[engine].sourceSceneId !==
        targetEnsembleScene.id,
    ),
    roles: effectiveEnsembleRoles,
    members: Object.freeze(
      activeSynthEngines.map((engine) =>
        Object.freeze({
          engine,
          role: effectiveEnsembleRoles[engine].id,
          label: effectiveEnsembleRoles[engine].label,
          register: effectiveEnsembleRoles[engine].register,
          sourceSceneId: effectiveEnsembleRoles[engine].sourceSceneId,
        }),
      ),
    ),
  });
  let texture =
    barInPhrase === 0 &&
    !form.intentionalRest &&
    barRng() <
      0.08 + profile.texture * 0.44 + form.space * 0.18;
  const editedLayers = editOptionalLayers({
    councilVerdict,
    trackDNA,
    roles: effectiveEnsembleRoles,
    activeSynthEngines,
    shaker,
    rim,
    ride,
    metallic,
    chord,
    pad,
    texture,
  });
  pad = editedLayers.pad;
  texture = editedLayers.texture;
  const ensemblePhrase = buildEnsemblePhrase({
    seed,
    phraseIndex,
    movement,
    section,
    profile: synthProfile,
    roles: effectiveEnsembleRoles,
    activeEngines: activeSynthEngines,
    councilVerdict,
  });
  const synth = fitEnsembleToArrangement({
    phrase: ensemblePhrase,
    barInPhrase,
    roles: effectiveEnsembleRoles,
    seed,
    phraseIndex,
    bass,
    chord,
    metallic,
    ride,
  });
  const spatialWidth = {
    "dry-close": 0.35,
    "short-room": 0.52,
    "mono-pressure": 0.12,
    "dub-depth": 0.72,
    "wide-haze": 1,
  }[trackDNA.spatialProfile];
  const texturePan =
    (movement.timbre.stereoBias * 0.55 + barRng() * 0.35 - 0.175) *
    spatialWidth;
  const riser = barInPhrase === 0 && form.allowRiser === true;
  const downlifter =
    barInPhrase === 0 && form.release;
  const kickTimbre = buildKickTimbre(
    seed,
    phraseIndex,
    movement,
    form,
    profile,
    energy,
    phraseProgress,
  );
  const lowEnd = Object.freeze({
    motifLineageId: form.motifLineageId,
    decision: form.motifOperation,
    motifOperation: form.motifOperation,
    motifMutationCount: form.motifMutationCount,
    kickPolicy: form.kickPolicy,
    kickReason: form.kickReason,
    kickFamilyId: form.kickFamilyId,
    priorKickFamilyId: form.priorKickFamilyId,
    kickFamilyMorph: form.kickFamilyMorph,
    kickFamilyMorphProgress: form.kickFamilyMorph
      ? clamp(phraseProgress, 0, 1)
      : 1,
    bassDensity: bassCount,
    bassBehavior: trackDNA.bassBehavior,
    bassCell: bassLine.cell,
    bassCellSignature: bassLine.cellSignature,
    canonicalBassDensity: bassLine.cell.length,
    bassVoice,
    musicDuckDepth: clamp(
      0.39 +
        energy * 0.14 +
        (trackDNA.spatialProfile === "mono-pressure" ? 0.08 : 0) -
        (trackDNA.spatialProfile === "wide-haze" ? 0.06 : 0),
      0.32,
      0.66,
    ),
    bassDuckDepth: clamp(
      0.62 +
        (1 - form.floorTrust) * 0.1 +
        (trackDNA.bassBehavior === "sub-sustain" ? -0.1 : 0) +
        (trackDNA.bassBehavior === "acid-serpent" ? 0.06 : 0),
      0.5,
      0.8,
    ),
    rumbleSend: kickTimbre.rumbleSend,
  });
  const instrumentation = buildInstrumentation({
    kick,
    clap,
    hat,
    openHat,
    shaker,
    rim,
    ride,
    metallic,
    tom,
    bass,
    bassVoice,
    chord,
    pad,
    texture,
    riser,
    downlifter,
    synth,
    synthPalette,
    synthHandoff,
    activeSynthEngines,
    ensembleScene,
  });

  return {
    bar,
    trackDNA,
    movement,
    section,
    form,
    sectionProgress,
    sectionStart,
    sectionEnd,
    phraseIndex,
    barInPhrase,
    phraseEnd,
    vibeId,
    tonality,
    energy,
    profile,
    kick,
    kickTimbre,
    percussionTimbre,
    clap,
    hat,
    openHat,
    shaker,
    rim,
    ride,
    metallic,
    tom,
    bass,
    bassVoice,
    lowEnd,
    harmonyDegree: progressionDegree,
    harmonyPosition,
    chord,
    pad,
    synth,
    synthPalette,
    synthHandoff,
    activeSynthEngines,
    ensembleScene,
    councilVerdict,
    ensembleTargetRoles: targetEnsembleScene.roles,
    instrumentation,
    texture,
    texturePan,
    riser,
    riserBars: 8,
    downlifter,
    downlifterBars: 4,
    filterOpen: clamp(
      0.14 +
        form.brightness * 0.55 +
        energy * 0.2 -
        form.space * 0.08 +
        profile.drive * 0.08 +
        profile.metallic * 0.05 +
        profile.acid * 0.1 -
        profile.space * 0.06 +
        {
          "sub-dark": -0.14,
          "warm-tilt": -0.07,
          "mid-forward": 0,
          "bright-metal": 0.08,
          "open-air": 0.12,
        }[trackDNA.spectralProfile] +
        {
          "dry-close": 0.03,
          "short-room": 0.01,
          "mono-pressure": -0.08,
          "dub-depth": -0.05,
          "wide-haze": 0.06,
        }[trackDNA.spatialProfile] +
        phraseProgress * Math.max(0, form.energyDelta) * 0.18,
      0.14,
      1,
    ),
    fingerprint: `${trackDNA.grooveFamily}:${trackDNA.kickArchitecture}:${trackDNA.formPhenotype}:${movement.index}:${form.label}:${form.chair}:${form.motifLineageId}:${phraseIndex}:${bassCount}:${bassVoice}:${ensembleScene.id}:${activeSynthEngines
      .map(
        (engine) =>
          `${engine}:${effectiveEnsembleRoles[engine].sourceSceneId}:${effectiveEnsembleRoles[engine].id}`,
      )
      .join("+")}`,
  };
}

export function planNotesBelongToMode(plan) {
  const pitchClasses = new Set(
    plan.movement.mode.intervals.map(
      (interval) => ((plan.movement.root + interval) % 12 + 12) % 12,
    ),
  );
  const notes = [
    ...plan.bass.filter(Boolean).map((note) => note.midi),
    ...plan.chord.filter(Boolean).flatMap((event) => event.notes),
    ...(plan.pad?.notes || []),
    ...Object.values(plan.synth || {})
      .flat()
      .filter(Boolean)
      .map((note) => note.midi),
  ];
  return notes.every((note) => pitchClasses.has(((note % 12) + 12) % 12));
}

function laneMask(lane) {
  return lane.reduce((mask, value, index) => (value ? mask | (1 << index) : mask), 0);
}

export function planPatternSignature(plan) {
  const bassDegrees = plan.bass
    .filter(Boolean)
    .map((note) => `${note.degree}:${note.accent ? 1 : 0}:${note.length}`)
    .join(",");
  const chordPitchClasses = plan.chord
    .filter(Boolean)
    .map((event) => event.notes.map((note) => ((note % 12) + 12) % 12).join("."))
    .join("|");
  return [
    plan.ensembleScene?.id || "",
    ...SYNTH_ENGINE_IDS.map((engine) => {
      const role = plan.ensembleScene?.roles?.[engine];
      return role
        ? `${engine}:${role.sourceSceneId}:${role.id}:${role.register}`
        : `${engine}:`;
    }),
    laneMask(plan.kick),
    laneMask(plan.clap),
    laneMask(plan.hat),
    laneMask(plan.openHat),
    laneMask(plan.shaker),
    laneMask(plan.rim),
    laneMask(plan.ride),
    laneMask(plan.metallic),
    laneMask(plan.tom),
    laneMask(plan.bass),
    laneMask(plan.synth?.fm || []),
    laneMask(plan.synth?.modal || []),
    laneMask(plan.synth?.string || []),
    bassDegrees,
    plan.bassVoice,
    chordPitchClasses,
  ].join("/");
}

export function planInstrumentSignature(plan) {
  return [
    plan.ensembleScene?.id || "",
    ...SYNTH_ENGINE_IDS.map((engine) => {
      const role = plan.ensembleScene?.roles?.[engine];
      return role
        ? `${engine}:${role.sourceSceneId}:${role.id}`
        : `${engine}:`;
    }),
    plan.synthPalette?.fm?.id || "",
    plan.synthPalette?.modal?.id || "",
    plan.synthPalette?.string?.id || "",
    ...(plan.instrumentation || []).map((item) => item.id),
  ].join("/");
}
