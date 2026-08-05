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
import {
  advanceMaterialState,
  createMaterialState,
  summarizeMaterialState,
} from "./material-planner.js";
import { createTrackDNA } from "./track-dna.js";

export {
  FORM_RULES,
  advanceMaterialState,
  clamp,
  createMaterialState,
  derivePhraseState,
  hash32,
  lerp,
  makeRng,
  midiToHz,
  summarizeMaterialState,
};

export const GENERATOR_VERSION = "2.2.0";
export const STEPS_PER_BAR = 16;
export const PHRASE_BARS = 8;
export const MOVEMENT_BARS = 192;
export const ECHO_ASCENT_VARIANTS = Object.freeze({
  restrained: Object.freeze({
    label: "RESTRAINED ECHO ASCENT",
    startBar: 4,
    delaySteps: 3,
    feedback: 0.32,
    wet: 0.64,
    maxSend: 0.46,
  }),
  widening: Object.freeze({
    label: "WIDENING ECHO ASCENT",
    startBar: 4,
    delaySteps: 2,
    feedback: 0.43,
    wet: 0.7,
    maxSend: 0.54,
  }),
  "late-throw": Object.freeze({
    label: "LATE ECHO THROW",
    startBar: 6,
    delaySteps: 3,
    feedback: 0.55,
    wet: 0.74,
    maxSend: 0.6,
  }),
});
const MOVEMENT_CACHE_LIMIT = 64;
const movementCache = new Map();
const MATERIAL_CACHE_LIMIT = 256;
const materialCache = new Map();
const PHRASE_MATERIAL_CACHE_LIMIT = 8;
const phraseMaterialCache = new Map();

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

const VIBE_ARRANGEMENT = Object.freeze({
  hypnotic: Object.freeze({
    preferredEngine: null,
  }),
  dub: Object.freeze({
    preferredEngine: "string",
  }),
  acid: Object.freeze({
    preferredEngine: "fm",
  }),
  detroit: Object.freeze({
    preferredEngine: "modal",
  }),
  peak: Object.freeze({
    preferredEngine: "fm",
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

function cachedMaterialStateForPhrase({
  seed,
  phraseIndex,
  vibeId,
  tonality,
  trackDNA,
}) {
  const safeVibe = profileForVibe(vibeId).id;
  const safeTonality = ["major", "neutral"].includes(tonality)
    ? tonality
    : "minor";
  const cacheKey = `${seed}:${safeVibe}:${safeTonality}`;
  let entry = phraseMaterialCache.get(cacheKey);
  if (!entry) {
    entry = { states: [] };
    phraseMaterialCache.set(cacheKey, entry);
  } else {
    phraseMaterialCache.delete(cacheKey);
    phraseMaterialCache.set(cacheKey, entry);
  }
  const materialProfile = shapeProfileForTrack(
    profileForVibe(safeVibe),
    trackDNA,
  );
  if (entry.states.length === 0) {
    entry.states.push(
      createMaterialState({
        seed,
        phraseIndex: 0,
        trackDNA,
        form: derivePhraseState(seed, 0),
        profile: materialProfile,
        tonality: safeTonality,
      }),
    );
  }
  while (entry.states.length <= phraseIndex) {
    const nextPhraseIndex = entry.states.length;
    entry.states.push(
      advanceMaterialState(entry.states.at(-1), {
        phraseIndex: nextPhraseIndex,
        form: derivePhraseState(seed, nextPhraseIndex),
        profile: materialProfile,
        tonality: safeTonality,
      }),
    );
  }
  if (phraseMaterialCache.size > PHRASE_MATERIAL_CACHE_LIMIT) {
    phraseMaterialCache.delete(phraseMaterialCache.keys().next().value);
  }
  return entry.states[phraseIndex];
}

function materialBarSlice(lane, barInPhrase) {
  const start = barInPhrase * STEPS_PER_BAR;
  return lane.slice(start, start + STEPS_PER_BAR);
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

function freezeEnsembleRole(sceneId, role) {
  return Object.freeze({
    ...role,
    sourceSceneId: sceneId,
    range: Object.freeze([...role.range]),
    length: Object.freeze([...role.length]),
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
  const foregroundEngines = form.allowEchoAscent
    ? rankedEngines.filter((engine) => roles[engine]?.register !== "high")
    : rankedEngines;
  const activeSynthEngines = intentionalRest
    ? []
    : foregroundEngines.slice(
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
  const optionalLayerBudget = form.allowEchoAscent
    ? 1
    : chair === "radical-reduction"
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
    echoAscent: form.allowEchoAscent,
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
  materialState = null,
}) {
  const phraseMaterial =
    materialState ||
    cachedMaterialStateForPhrase({
      seed,
      phraseIndex,
      vibeId: profile.id,
      tonality: movement.mode.tonality,
      trackDNA: movement.trackDNA || createTrackDNA(seed),
    });
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
      const onsetSlice = materialBarSlice(
        phraseMaterial.phrase.patterns.synth[engine],
        barOffset,
      );
      const degreeSlice = materialBarSlice(
        phraseMaterial.phrase.degrees.synth[engine],
        barOffset,
      );
      onsetSlice.forEach((active, step) => {
        if (!active) return;
        const absoluteStep = barOffset * STEPS_PER_BAR + step;
        const coordinate = (...labels) =>
          unitHash(
            seed,
            phraseIndex,
            phraseMaterial.motif.lineageId,
            role.sourceSceneId,
            role.id,
            engine,
            absoluteStep,
            ...labels,
          );
        const degree =
          (degreeSlice[step] ?? movement.motif[absoluteStep % movement.motif.length]) +
          role.degreeOffset;
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
          Math.floor(
            coordinate("length") *
              (role.length[1] - role.length[0] + 1),
          );
        lanes[engine][barOffset][step] = {
          midi,
          degree,
          velocity: clamp(
            0.24 +
              energy * 0.34 +
              role.velocityBias +
              coordinate("velocity") * 0.12,
            0.16,
            0.82,
          ),
          length: clamp(length, 1, 4),
          accent: coordinate("accent") < 0.14 + profile.drive * 0.26,
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
  kick,
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
      ...new Set(
        phrase[event.engine].flatMap((barLane) =>
          barLane.flatMap((note, step) => (note ? [step] : [])),
        ),
      ),
    ]
      .filter(
        (step) =>
          Math.abs(step - event.step) <= 2 &&
          !kick[step] &&
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

export function buildEchoAscentPlan({
  seed,
  phraseIndex,
  barInPhrase,
  form,
}) {
  const variant = form.allowEchoAscent
    ? ECHO_ASCENT_VARIANTS[form.echoAscentVariant]
    : null;
  if (!variant) return null;

  const active = barInPhrase >= variant.startBar;
  const progress = active
    ? smoothstep(
        clamp(
          (barInPhrase - variant.startBar + 1) /
            (PHRASE_BARS - variant.startBar),
          0,
          1,
        ),
      )
    : 0;
  const hits = emptyPattern(null);
  if (active) {
    const relativeBar = barInPhrase - variant.startBar;
    const occupied = new Set();
    const add = (voice, step, velocity, sendScale, pan) => {
      if (occupied.has(step)) return;
      occupied.add(step);
      hits[step] = Object.freeze({
        voice,
        velocity: clamp(velocity, 0.06, 0.42),
        brightness: clamp(
          0.72 +
            progress * 0.22 +
            unitHash(
              seed,
              phraseIndex,
              barInPhrase,
              step,
              voice,
              "echo-ascent-brightness",
            ) *
              0.06,
          0,
          1,
        ),
        send: clamp(variant.maxSend * progress * sendScale, 0, 0.6),
        pan: clamp(pan, -0.68, 0.68),
      });
    };

    const rimSteps =
      form.echoAscentVariant === "restrained" && relativeBar === 0
        ? [7, 14]
        : form.echoAscentVariant === "restrained" && relativeBar === 1
          ? [3, 11, 14]
          : [3, 7, 11, 14];
    rimSteps.forEach((step, index) =>
      add(
        "rim",
        step,
        0.18 + progress * 0.08,
        0.82,
        index % 2 ? 0.38 : -0.38,
      ),
    );

    [6, 13].forEach((step, index) =>
      add(
        "metallic",
        step,
        0.17 + progress * 0.1,
        1,
        index % 2 ? -0.48 : 0.48,
      ),
    );

    const shakerSteps = progress > 0.5 ? [1, 5, 9] : [1, 9];
    shakerSteps.forEach((step, index) =>
      add(
        "shaker",
        step,
        0.08 + progress * 0.04,
        0.52,
        index % 2 ? 0.58 : -0.58,
      ),
    );

    const admitsRide =
      barInPhrase >= 6 &&
      (form.echoAscentVariant !== "restrained" || barInPhrase === 7);
    if (admitsRide) {
      [2, 10].forEach((step, index) =>
        add(
          "ride",
          step,
          0.085 + progress * 0.05,
          0.72,
          index % 2 ? -0.24 : 0.24,
        ),
      );
    }
  }

  return Object.freeze({
    id: "echo-ascent",
    label: variant.label,
    variant: form.echoAscentVariant,
    authorized: true,
    active,
    progress,
    startBar: variant.startBar,
    delaySteps: variant.delaySteps,
    feedback: variant.feedback,
    wet: variant.wet,
    maxSend: variant.maxSend,
    hits: Object.freeze(hits),
  });
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
  echoAscent,
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
  if (echoAscent?.active && hasLaneEvents(echoAscent.hits)) {
    add("transition-echo-ascent", "transition", echoAscent.label);
  }
  return Object.freeze(items);
}

function unitHash(...values) {
  return (hash32(...values) >>> 0) / 0xffffffff;
}

function selectBassVoice(seed, movement, form, profile) {
  const requestedCharacter = profile.performanceBassCharacter;
  if (requestedCharacter === "sub") return "sub";
  if (requestedCharacter === "rolling") return "pulse";
  if (requestedCharacter === "acid") return "acid";
  if (requestedCharacter === "syncopated") return "pulse";
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

function hasDenseBassIdentity(profile, trackDNA) {
  const bassCharacter = profile.performanceBassCharacter || "auto";
  return (
    ["rolling", "acid", "syncopated"].includes(bassCharacter) ||
    ["rolling-cell", "acid-serpent", "syncopated-stabs"].includes(
      trackDNA?.bassBehavior,
    )
  );
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
  const rumbleMode =
    movement.trackDNA?.kickRumbleMode || "off";
  const denseBass = hasDenseBassIdentity(profile, movement.trackDNA);
  const rumbleBassProtection = denseBass
    ? rumbleMode === "deep"
      ? 0.46
      : 0.64
    : 1;
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
    rumbleSend:
      rumbleMode === "off"
        ? 0
        : clamp(
            (0.015 +
              profile.rumble * 0.075 +
              familyValue("rumble") * 0.035 +
              climaxDepth * 0.018) *
              architecture.rumbleScale *
              (rumbleMode === "short" ? 0.42 : 1) *
              rumbleBassProtection *
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
      denseBass ? 112 : 176,
    ),
    rumbleFeedback:
      rumbleMode === "off"
        ? 0
        : clamp(
            (0.12 +
              familyValue("feedback") * 0.25 +
              profile.rumble * 0.13 +
              form.space * 0.04 +
              climaxDepth * 0.055) *
              (rumbleMode === "short" ? 0.5 : 1) *
              (denseBass ? 0.7 : 1),
            0.06,
            rumbleMode === "short" ? 0.29 : 0.58,
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
  materialState,
  lowEndDropout = false,
}) {
  const bass = Array(STEPS_PER_BAR).fill(null);
  const trackDNA = movement.trackDNA || createTrackDNA(seed);
  const bassBehavior = trackDNA.bassBehavior;
  const barInPhrase = ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS;
  const onsetSlice = materialBarSlice(
    materialState.phrase.patterns.bass,
    barInPhrase,
  );
  const degreeSlice = materialBarSlice(
    materialState.phrase.degrees.bass,
    barInPhrase,
  );
  const vacatedOnsetSlice = materialBarSlice(
    materialState.phrase.patterns.bassVacatedByAnchor,
    barInPhrase,
  );
  const vacatedDegreeSlice = materialBarSlice(
    materialState.phrase.degrees.bassVacatedByAnchor,
    barInPhrase,
  );
  const phraseOffset = barInPhrase * STEPS_PER_BAR;
  const residentCandidates = onsetSlice.flatMap((active, step) => {
    if (!active || kick[step] || form.intentionalRest || lowEndDropout) return [];
    return [
      {
        step,
        cellStep: phraseOffset + step,
        degree: degreeSlice[step] ?? 0,
        provenance: "resident",
      },
    ];
  });
  const restoredCandidates = vacatedOnsetSlice.flatMap((active, step) => {
    if (!active || kick[step] || form.intentionalRest || lowEndDropout) return [];
    return [
      {
        step,
        cellStep: phraseOffset + step,
        degree: vacatedDegreeSlice[step] ?? 0,
        provenance: "restored-vacated-anchor",
      },
    ];
  });
  const candidates = [...residentCandidates, ...restoredCandidates].sort(
    (left, right) => left.step - right.step,
  );
  const clockLength = materialState.clocks.bass.loopLength;
  const canonicalCell = Object.freeze(
    materialState.phrase.patterns.bass
      .slice(0, clockLength)
      .flatMap((active, step) =>
        active
          ? [
              Object.freeze({
                step,
                degree:
                  materialState.phrase.degrees.bass[step] ??
                  materialState.motif.events[
                    step % materialState.motif.events.length
                  ].degree,
              }),
            ]
          : [],
      ),
  );

  candidates.forEach(({ step, cellStep, degree }) => {
    let midi = degreeToMidi(
      movement.root,
      movement.mode.intervals,
      degree,
    );
    if (
      unitHash(materialState.motif.lineageId, cellStep, "bass-octave") <
      0.04 + profile.acid * 0.1
    ) {
      midi += 12;
    }
    midi = fitMidiToRange(midi, 34, 55);
    bass[step] = {
      midi,
      degree,
      accent:
        unitHash(materialState.motif.lineageId, cellStep, "bass-accent") <
        0.16 + profile.acid * 0.3 + energy * 0.08,
      velocity: clamp(
        0.48 +
          energy * 0.26 +
          unitHash(materialState.motif.lineageId, cellStep, "bass-velocity") *
            0.12,
        0.42,
        0.9,
      ),
      length:
        unitHash(materialState.motif.lineageId, cellStep, "bass-length") <
        0.22 + form.space * 0.22
          ? 2
          : 1,
      slideTo: null,
      slideSteps: 0,
      lineageId: materialState.motif.lineageId,
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
        materialState.motif.lineageId,
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
    materialCount: onsetSlice.filter(Boolean).length,
    vacatedCount: vacatedOnsetSlice.filter(Boolean).length,
    restoredCount: restoredCandidates.length,
    blockedVacatedCount: vacatedOnsetSlice.filter(
      (active, step) => active && Boolean(kick[step]),
    ).length,
    cell: canonicalCell,
    cellSignature: `${materialState.clocks.bass.id}:${canonicalCell
      .map((event) => `${event.step}:${event.degree}`)
      .join("|")}`,
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
  materialState = null,
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
  const percussionTimbre = percussionTimbreFor(trackDNA, profile);
  const section = sectionAtBar(movementWindow, bar);
  const { form, energy: formLevel, progress: phraseProgress } =
    formDynamicsAtBar(movementWindow, bar);
  const movement = decorateMovementWithIdentity(
    movementWindow,
    musicalIdentityForForm(seed, form, tonality),
  );
  const phraseIndex = Math.floor(bar / PHRASE_BARS);
  const barInPhrase = bar % PHRASE_BARS;
  materialState =
    materialState ||
    cachedMaterialStateForPhrase({
      seed,
      phraseIndex,
      vibeId,
      tonality,
      trackDNA,
    });
  if (materialState.phraseIndex !== phraseIndex) {
    throw new RangeError("materialState must describe the requested bar's phrase");
  }
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
    effectiveSpace > 0.68 ||
    ((profile.performanceBreakdownDepth ?? 0) > 0.5 && form.release);
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
  const echoAscent = buildEchoAscentPlan({
    seed,
    phraseIndex,
    barInPhrase,
    form,
  });
  const lowEndDropout =
    form.lowEndDropout === true &&
    Number.isInteger(form.lowEndDropoutStartBar) &&
    Number.isInteger(form.lowEndDropoutBars) &&
    barInPhrase >= form.lowEndDropoutStartBar &&
    barInPhrase < form.lowEndDropoutStartBar + form.lowEndDropoutBars;

  const phrasePatterns = materialState.phrase.patterns;
  const kick = emptyPattern();
  const kickArticulation = emptyPattern(null);
  const sourceKickArticulations = materialBarSlice(
    materialState.phrase.kickArticulations,
    barInPhrase,
  );
  const kickOnsets = materialBarSlice(
    phrasePatterns.kick,
    barInPhrase,
  ).flatMap((active, step) =>
    active
      ? [{ step, articulation: sourceKickArticulations[step] || "anchor" }]
      : [],
  );
  const kickLimit =
    lowEndDropout || form.kickPolicy === "withdraw"
      ? 0
      : form.kickPolicy === "thin"
        ? clamp(
            Math.round(
              1 +
              form.floorTrust * 1.5 -
              profile.breakDepth * 0.65 -
              Math.max(0, profile.performanceBreakdownDepth ?? 0) * 1.35,
            ),
            1,
            3,
          )
        : kickOnsets.length;
  kickOnsets
    .map(({ step, articulation }) => ({
      step,
      articulation,
      priority:
        unitHash(
          seed,
          materialState.motif.lineageId,
          phraseIndex,
          step,
          "material-kick-priority",
        ) +
        (step === 0 ? 2 : 0) +
        (articulation === "anchor" ? 0.35 : 0),
    }))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, kickLimit)
    .sort((left, right) => left.step - right.step)
    .forEach(({ step, articulation }) => {
      kickArticulation[step] = articulation;
      const articulationVelocity =
        articulation === "pickup"
          ? 0.48 + energy * 0.08
          : articulation === "roll"
            ? 0.59 + energy * 0.1
            : 0.75 + energy * 0.15 + (step === 0 ? 0.045 : 0);
      kick[step] = clamp(
        articulationVelocity +
          (unitHash(seed, phraseIndex, barInPhrase, step, "kick-velocity") -
            0.5) *
            0.018,
        0.45,
        0.94,
      );
    });

  const clap = emptyPattern();
  if (energy > 0.34 && !form.intentionalRest) {
    materialBarSlice(phrasePatterns.clap, barInPhrase).forEach(
      (active, step) => {
        if (!active) return;
        clap[step] =
          0.42 +
          energy * 0.3 +
          unitHash(
            seed,
            phraseIndex,
            barInPhrase,
            step,
            "material-clap-velocity",
          ) *
            0.08;
      },
    );
  }

  const hat = emptyPattern();
  const openHat = emptyPattern();
  materialBarSlice(phrasePatterns.hats, barInPhrase).forEach(
    (active, step) => {
      if (!active) return;
      const velocity =
        0.22 +
        energy * 0.34 +
        unitHash(
          seed,
          phraseIndex,
          barInPhrase,
          step,
          "material-hat-velocity",
        ) *
          0.16;
      hat[step] = velocity;
    },
  );
  materialBarSlice(phrasePatterns.openHats, barInPhrase).forEach(
    (active, step) => {
      if (!active || sparse) return;
      openHat[step] =
        0.24 +
        energy * 0.32 +
        unitHash(
          seed,
          phraseIndex,
          barInPhrase,
          step,
          "material-open-hat-velocity",
        ) *
          0.16;
    },
  );

  const shaker = emptyPattern();
  const rim = emptyPattern();
  const ride = emptyPattern();
  const metallic = emptyPattern();
  const tom = emptyPattern();
  const percussionVoiceSlice = materialBarSlice(
    phrasePatterns.percussionVoices,
    barInPhrase,
  );
  materialBarSlice(phrasePatterns.percussion, barInPhrase).forEach(
    (active, step) => {
      if (!active) return;
      const voice = percussionVoiceSlice[step];
      const lane = { shaker, rim, ride, metallic, tom }[voice];
      if (!lane) return;
      lane[step] =
        0.14 +
        energy * 0.2 +
        unitHash(
          seed,
          phraseIndex,
          barInPhrase,
          step,
          voice,
          "material-percussion-velocity",
        ) *
          0.16;
    },
  );

  const bassLine = buildBassLine({
    seed,
    bar,
    movement,
    form,
    profile,
    energy,
    kick,
    materialState,
    lowEndDropout,
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
    const generatedChordVocabulary = [
      phrasePatterns.clap,
      phrasePatterns.percussion,
      phrasePatterns.hats,
    ];
    const chordSteps = [
      ...new Set(
        generatedChordVocabulary.flatMap((lane) =>
          materialBarSlice(lane, barInPhrase).flatMap((active, step) =>
            active && !kick[step] ? [step] : [],
          ),
        ),
      ),
    ];
    if (chordSteps.length === 0) {
      chordSteps.push(
        hash32(
          seed,
          phraseIndex,
          materialState.motif.lineageId,
          "generated-chord-step",
        ) % STEPS_PER_BAR,
      );
    }
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

  const padEntryBar =
    hash32(
      seed,
      phraseIndex,
      trackDNA.harmonyBehavior,
      "pad-entry-bar",
    ) % PHRASE_BARS;
  const padRequested =
    phraseIndex > 0 &&
    barInPhrase === padEntryBar &&
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
        ));
  let pad = null;
  if (padRequested) {
    const baseNotes = makeChord(
      movement,
      audibleHarmonyDegree,
      2,
      harmonyDesign.suspended || profile.space > 0.7,
    );
    const inversion =
      hash32(seed, phraseIndex, "pad-inversion") % baseNotes.length;
    const notes = [
      ...baseNotes.slice(inversion),
      ...baseNotes.slice(0, inversion).map((note) => note + 12),
    ];
    const oscillatorPalettes = [
      ["sine", "triangle", "sine", "triangle"],
      ["triangle", "sine", "triangle", "sine"],
      ["sine", "triangle", "sawtooth", "triangle"],
    ];
    const availableBars = PHRASE_BARS - padEntryBar;
    const desiredDuration = Math.round(
      1.5 +
        profile.space * 3.5 +
        unitHash(seed, phraseIndex, "pad-duration") * 1.5,
    );
    const attackRatio =
      0.08 + unitHash(seed, phraseIndex, "pad-attack") * 0.28;
    const releaseStartRatio =
      0.58 + unitHash(seed, phraseIndex, "pad-release") * 0.28;
    pad = {
      notes,
      durationBars: clamp(desiredDuration, 1, availableBars),
      velocity: 0.12 + profile.chords * 0.14,
      attackRatio,
      releaseStartRatio: Math.max(attackRatio + 0.18, releaseStartRatio),
      filterPeakRatio:
        0.24 + unitHash(seed, phraseIndex, "pad-filter-peak") * 0.32,
      oscillatorTypes:
        oscillatorPalettes[
          hash32(seed, phraseIndex, "pad-oscillator-palette") %
            oscillatorPalettes.length
        ],
      modulation: {
        waveform:
          hash32(seed, phraseIndex, "pad-modulation-waveform") % 2
            ? "triangle"
            : "sine",
        rateHz:
          8 + unitHash(seed, phraseIndex, "pad-modulation-rate") * 14,
        depth:
          0.06 + unitHash(seed, phraseIndex, "pad-modulation-depth") * 0.1,
      },
    };
  }

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
    materialState,
  });
  const synth = fitEnsembleToArrangement({
    phrase: ensemblePhrase,
    barInPhrase,
    roles: effectiveEnsembleRoles,
    seed,
    phraseIndex,
    kick,
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
    materialMotifLineageId: materialState.motif.lineageId,
    materialGesture: materialState.gesture,
    bassClockId: materialState.clocks.bass.id,
    bassClockLength: materialState.clocks.bass.loopLength,
    decision: form.motifOperation,
    motifOperation: form.motifOperation,
    motifMutationCount: form.motifMutationCount,
    kickPolicy: form.kickPolicy,
    kickReason: form.kickReason,
    dropoutActive: lowEndDropout,
    dropoutStartBar: form.lowEndDropoutStartBar,
    dropoutBars: form.lowEndDropoutBars,
    dropoutReadiness: form.lowEndDropoutReadiness,
    kickPhraseId: materialState.kickPhrase.id,
    kickPhraseAge: materialState.kickPhrase.agePhrases,
    kickPhraseHold: materialState.kickPhrase.holdPhrases,
    kickRumbleMode: trackDNA.kickRumbleMode,
    kickFamilyId: form.kickFamilyId,
    priorKickFamilyId: form.priorKickFamilyId,
    kickFamilyMorph: form.kickFamilyMorph,
    kickFamilyMorphProgress: form.kickFamilyMorph
      ? clamp(phraseProgress, 0, 1)
      : 1,
    bassDensity: bassCount,
    materialBassDensity: bassLine.materialCount,
    vacatedBassDensity: bassLine.vacatedCount,
    restoredBassDensity: bassLine.restoredCount,
    blockedVacatedBassDensity: bassLine.blockedVacatedCount,
    bassBehavior: trackDNA.bassBehavior,
    bassCharacter: profile.performanceBassCharacter ?? "auto",
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
    rumbleBassDuckDepth:
      trackDNA.kickRumbleMode === "off"
        ? 0
        : trackDNA.kickRumbleMode === "deep"
          ? hasDenseBassIdentity(profile, trackDNA)
            ? 0.62
            : 0.44
          : hasDenseBassIdentity(profile, trackDNA)
            ? 0.34
            : 0.22,
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
    echoAscent,
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
    materialState,
    material: summarizeMaterialState(materialState),
    kick,
    kickArticulation,
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
    echoAscent,
    filterOpen: clamp(
      0.14 +
        form.brightness * 0.55 +
        energy * 0.2 -
        form.space * 0.08 +
        profile.drive * 0.08 +
        profile.metallic * 0.05 +
        profile.acid * 0.1 -
        profile.space * 0.06 +
        (profile.performanceBrightness ?? 0) * 0.2 +
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
