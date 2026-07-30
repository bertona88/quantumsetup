import {
  clamp,
  hash32,
  lerp,
  makeRng,
  midiToHz,
} from "./generative-utils.js";
import {
  createSynthPalette,
  synthMutationEngineForPhrase,
} from "./synth-genomes.js";

export { clamp, hash32, lerp, makeRng, midiToHz };

export const GENERATOR_VERSION = "1.2.0";
export const STEPS_PER_BAR = 16;
export const PHRASE_BARS = 8;
export const MOVEMENT_BARS = 192;

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
  const candidates = [64, 96, 128];
  return candidates[Math.min(candidates.length - 1, Math.floor(distance * candidates.length))];
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

const MOVEMENT_TEMPLATES = [
  [
    ["IGNITION", 16],
    ["ASCENT", 16],
    ["LOCK", 32],
    ["DRIFT", 16],
    ["LOCK", 32],
    ["VOID", 8],
    ["PEAK", 32],
    ["RETURN", 32],
    ["RELEASE", 8],
  ],
  [
    ["IGNITION", 32],
    ["ASCENT", 32],
    ["LOCK", 32],
    ["BRIDGE", 16],
    ["PEAK", 32],
    ["RETURN", 32],
    ["RELEASE", 16],
  ],
  [
    ["IGNITION", 16],
    ["DRIVE", 32],
    ["BRIDGE", 8],
    ["DRIVE", 16],
    ["ASCENT", 16],
    ["PEAK", 32],
    ["VOID", 16],
    ["RETURN", 32],
    ["TRANSITION", 24],
  ],
  [
    ["IGNITION", 16],
    ["ASCENT", 24],
    ["LOCK", 32],
    ["VOID", 16],
    ["RETURN", 24],
    ["PEAK", 32],
    ["DRIFT", 16],
    ["TRANSITION", 32],
  ],
];

const SECTION_ENERGY = {
  IGNITION: [0.34, 0.58],
  ASCENT: [0.56, 0.84],
  DRIVE: [0.74, 0.9],
  LOCK: [0.84, 0.9],
  DRIFT: [0.68, 0.54],
  BRIDGE: [0.48, 0.62],
  VOID: [0.34, 0.46],
  PEAK: [0.92, 1],
  RETURN: [0.72, 0.9],
  RELEASE: [0.68, 0.38],
  TRANSITION: [0.5, 0.74],
};

const SYNTH_ENGINE_IDS = Object.freeze(["fm", "modal", "string"]);

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

const ENSEMBLE_SCENE_BY_ID = Object.freeze(
  Object.fromEntries(
    ENSEMBLE_SCENE_DEFINITIONS.map((scene) => [scene.id, scene]),
  ),
);

export const ENSEMBLE_SCENES = ENSEMBLE_SCENE_DEFINITIONS;

const ENSEMBLE_SCENE_POOLS = Object.freeze({
  IGNITION: Object.freeze(["negative-space", "motor-weave", "dub-afterimage"]),
  ASCENT: Object.freeze(["motor-weave", "acid-relay", "resonant-orbit"]),
  DRIVE: Object.freeze(["acid-relay", "motor-weave", "peak-interlock"]),
  LOCK: Object.freeze(["motor-weave", "acid-relay", "resonant-orbit"]),
  DRIFT: Object.freeze(["dub-afterimage", "resonant-orbit", "negative-space"]),
  BRIDGE: Object.freeze(["dub-afterimage", "resonant-orbit", "negative-space"]),
  VOID: Object.freeze(["dub-afterimage", "negative-space"]),
  PEAK: Object.freeze(["peak-interlock", "acid-relay", "motor-weave"]),
  RELEASE: Object.freeze(["negative-space", "dub-afterimage"]),
  TRANSITION: Object.freeze(["resonant-orbit", "dub-afterimage", "motor-weave"]),
});

function ensembleRecallSourceIndex(movement, sectionIndex) {
  for (let index = sectionIndex - 1; index >= 0; index -= 1) {
    if (["LOCK", "DRIVE", "ASCENT"].includes(movement.sections[index].kind)) {
      return index;
    }
  }
  return Math.max(0, sectionIndex - 1);
}

export function selectEnsembleScene(seed, movement, section) {
  const history = [];
  for (let index = 0; index <= section.index; index += 1) {
    const current = movement.sections[index];
    if (current.kind === "RETURN" && history.length > 0) {
      const sourceSectionIndex = ensembleRecallSourceIndex(movement, index);
      history.push({
        scene: history[sourceSectionIndex].scene,
        recalled: true,
        sourceSectionIndex,
      });
      continue;
    }
    const pool =
      ENSEMBLE_SCENE_POOLS[current.kind] ||
      ENSEMBLE_SCENE_POOLS.ASCENT;
    let sceneIndex =
      hash32(seed, movement.index, current.seed, 0x454e5343) % pool.length;
    if (
      pool.length > 1 &&
      history.at(-1)?.scene.id === pool[sceneIndex]
    ) {
      sceneIndex = (sceneIndex + 1) % pool.length;
    }
    history.push({
      scene: ENSEMBLE_SCENE_BY_ID[pool[sceneIndex]],
      recalled: false,
      sourceSectionIndex: index,
    });
  }
  const selected = history[section.index];
  return Object.freeze({
    ...selected.scene,
    recalled: selected.recalled,
    sourceSectionIndex: selected.sourceSectionIndex,
  });
}

export function stageEnsembleRoles(previous, candidate, phraseIndex) {
  if (!candidate) return previous;
  if (!previous) return candidate;
  const mutationEngine = synthMutationEngineForPhrase(phraseIndex);
  return Object.freeze(
    Object.fromEntries(
      SYNTH_ENGINE_IDS.map((engine) => [
        engine,
        engine === mutationEngine ? candidate[engine] : previous[engine],
      ]),
    ),
  );
}

export function createMovement(seed, movementIndex, tonality = "minor") {
  const safeTonality = ["major", "neutral"].includes(tonality) ? tonality : "minor";
  const rng = makeRng(hash32(seed, movementIndex, 0x4d4f5645));
  const template = MOVEMENT_TEMPLATES[Math.floor(rng() * MOVEMENT_TEMPLATES.length)];
  const modePool = MODE_POOLS[safeTonality];
  const mode = modePool[Math.floor(rng() * modePool.length)];
  const root = ROOTS[Math.floor(rng() * ROOTS.length)];
  const degreePool = [0, 0, 0, 1, 2, 2, 3, 4, 4, 5, 6];
  const motif = Array.from({ length: 5 }, (_, index) =>
    index === 0 ? 0 : degreePool[Math.floor(rng() * degreePool.length)],
  );
  const progression =
    safeTonality === "neutral"
      ? [
          [0, 3, 4, 0],
          [0, 4, 1, 3],
        ][Math.floor(rng() * 2)]
      : safeTonality === "major"
      ? [
          [0, 4, 5, 3],
          [0, 3, 4, 0],
          [0, 5, 3, 4],
        ][Math.floor(rng() * 3)]
      : [
          [0, 5, 2, 6],
          [0, 0, 3, 6],
          [0, 4, 5, 3],
        ][Math.floor(rng() * 3)];
  let cursor = 0;
  const sections = template.map(([kind, duration], index) => {
    const section = {
      index,
      kind,
      duration,
      startBar: cursor,
      endBar: cursor + duration,
      seed: hash32(seed, movementIndex, index, 0x53454354),
    };
    cursor += duration;
    return section;
  });
  if (cursor !== MOVEMENT_BARS) throw new Error(`Movement template totals ${cursor} bars`);
  return {
    index: movementIndex,
    startBar: movementIndex * MOVEMENT_BARS,
    endBar: (movementIndex + 1) * MOVEMENT_BARS,
    mode,
    root,
    rootName: ROOT_NAMES[((root % 12) + 12) % 12],
    motif,
    progression,
    sections,
    timbre: {
      kickTone: rng(),
      kickDecay: rng(),
      hatColor: rng(),
      clapTone: rng(),
      rimTone: rng(),
      filterBias: rng(),
      swingBias: rng(),
      stereoBias: rng() * 2 - 1,
    },
  };
}

export function sectionAtBar(movement, bar) {
  const localBar = ((bar % MOVEMENT_BARS) + MOVEMENT_BARS) % MOVEMENT_BARS;
  return (
    movement.sections.find(
      (section) => localBar >= section.startBar && localBar < section.endBar,
    ) || movement.sections[movement.sections.length - 1]
  );
}

function sectionEnergy(section, localBar) {
  const [from, to] = SECTION_ENERGY[section.kind] || [0.7, 0.7];
  const progress = clamp((localBar - section.startBar) / Math.max(1, section.duration - 1), 0, 1);
  return { energy: lerp(from, to, smoothstep(progress)), progress };
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

function advancedStartsPerBar(sectionKind) {
  if (["VOID", "RELEASE"].includes(sectionKind)) return 2;
  if (sectionKind === "PEAK") return 8;
  return 6;
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
    1,
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
  for (let barOffset = 0; barOffset < PHRASE_BARS; barOffset += 1) {
    const targetBar = phraseStartBar + barOffset;
    const localBar =
      ((targetBar % MOVEMENT_BARS) + MOVEMENT_BARS) % MOVEMENT_BARS;
    const { energy: sectionLevel } = sectionEnergy(section, localBar);
    const energy = clamp(
      sectionLevel * (0.58 + profile.drive * 0.5),
      0.12,
      1,
    );
    for (const engine of SYNTH_ENGINE_IDS) {
      const role = roles[engine];
      if (!role) continue;
      const rng = makeRng(
        hash32(
          seed,
          phraseIndex,
          barOffset,
          section.seed,
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
        lanes[engine][barOffset][step] = {
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
      advancedStartsPerBar(section.kind),
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
  for (const event of deferred) {
    const vocabulary = [
      ...new Set(event.role.pattern.flat()),
    ]
      .filter(
        (step) =>
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
  }
  return result;
}

function hasLaneEvents(lane) {
  return lane.some(Boolean);
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

export function buildBarPlan({
  seed,
  bar,
  vibeId = "hypnotic",
  tonality = "minor",
  profile = profileForVibe(vibeId),
  instrumentProfile = profile,
  ensembleRoles = null,
}) {
  const movementIndex = Math.floor(Math.max(0, bar) / MOVEMENT_BARS);
  const movement = createMovement(seed, movementIndex, tonality);
  const section = sectionAtBar(movement, bar);
  const localBar = bar % MOVEMENT_BARS;
  const { energy: sectionLevel, progress: sectionProgress } = sectionEnergy(section, localBar);
  const phraseIndex = Math.floor(bar / PHRASE_BARS);
  const barInPhrase = bar % PHRASE_BARS;
  const barInSection = localBar - section.startBar;
  const phraseRng = makeRng(hash32(seed, phraseIndex, section.seed, 0x50485241));
  const barRng = makeRng(hash32(seed, bar, section.seed, 0x42415221));
  const energy = clamp(sectionLevel * (0.58 + profile.drive * 0.5), 0.12, 1);
  const sparse = ["VOID", "BRIDGE", "RELEASE", "IGNITION"].includes(section.kind);
  const peak = ["PEAK", "RETURN"].includes(section.kind);
  const phraseEnd = barInPhrase === PHRASE_BARS - 1;
  const sectionStart = barInSection === 0;
  const sectionEnd = barInSection === section.duration - 1;

  const kick = emptyPattern();
  const kickAnchors = sparse && energy < 0.55 ? [0, 8] : [0, 4, 8, 12];
  kickAnchors.forEach((step, index) => {
    const keep =
      section.kind !== "VOID" ||
      step === 0 ||
      barInPhrase >= 6 ||
      phraseRng() < 0.22 + profile.rumble * 0.2;
    if (keep) kick[step] = 0.76 + energy * 0.17 + (index === 0 ? 0.05 : 0);
  });
  if (phraseEnd && energy > 0.62) {
    kick[14] = 0.52 + profile.drive * 0.2;
    if (profile.syncopation > 0.58) kick[15] = 0.44 + profile.drive * 0.22;
  }

  const clap = emptyPattern();
  if (energy > 0.46 && section.kind !== "VOID") {
    clap[4] = 0.48 + energy * 0.28;
    clap[12] = 0.54 + energy * 0.28;
    if (phraseEnd && profile.density > 0.7) clap[11] = 0.2;
  }

  const hat = emptyPattern();
  const openHat = emptyPattern();
  [2, 6, 10, 14].forEach((step, index) => {
    if (barRng() < 0.48 + energy * 0.45) {
      hat[step] = 0.34 + energy * 0.32 + (index % 2) * 0.05;
    }
  });
  for (let step = 1; step < STEPS_PER_BAR; step += 2) {
    if (barRng() < energy * (0.2 + profile.density * 0.34)) {
      hat[step] = Math.max(hat[step], 0.16 + barRng() * 0.24);
    }
  }
  if (!sparse && barRng() < 0.24 + profile.density * 0.5) {
    const step = barRng() < 0.5 ? 6 : 14;
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
  if (peak && profile.density > 0.58 && barInPhrase >= 4) {
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
  if (phraseEnd && energy > 0.54) {
    const fillLength = profile.metallic > 0.6 ? 4 : 3;
    for (let offset = 0; offset < fillLength; offset += 1) {
      tom[STEPS_PER_BAR - fillLength + offset] = 0.28 + offset * 0.1;
    }
  }

  const bass = Array(STEPS_PER_BAR).fill(null);
  const bassCandidates = shuffled([1, 2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 15], phraseRng);
  const bassCount = clamp(
    Math.round((2 + profile.density * 6) * (sparse ? 0.5 : 1) * (0.65 + energy * 0.35)),
    1,
    9,
  );
  const selected = bassCandidates.slice(0, bassCount).sort((a, b) => a - b);
  const motifRotation = (phraseIndex + Math.floor(phraseRng() * 3)) % movement.motif.length;
  selected.forEach((step, index) => {
    let degree = movement.motif[(index + motifRotation + (bar % 2)) % movement.motif.length];
    if (barRng() < profile.syncopation * 0.2) degree += barRng() < 0.5 ? -1 : 1;
    let midi = degreeToMidi(movement.root, movement.mode.intervals, degree);
    if (barRng() < 0.08 + profile.acid * 0.12) midi += 12;
    while (midi > 55) midi -= 12;
    while (midi < 34) midi += 12;
    bass[step] = {
      midi,
      degree,
      accent: barRng() < 0.18 + profile.acid * 0.32,
      length: barRng() < 0.26 + profile.space * 0.14 ? 2 : 1,
      slideTo: null,
      slideSteps: 0,
    };
  });
  selected.forEach((step, index) => {
    const note = bass[step];
    const nextStep = selected[index + 1];
    const gap = nextStep === undefined ? STEPS_PER_BAR - step : nextStep - step;
    note.length = Math.min(note.length, Math.max(1, gap));
    if (
      nextStep !== undefined &&
      gap <= 3 &&
      barRng() < 0.08 + profile.acid * 0.38
    ) {
      note.slideTo = bass[nextStep]?.midi ?? null;
      note.slideSteps = gap;
      note.length = gap;
    }
  });

  const chord = Array(STEPS_PER_BAR).fill(null);
  const progressionDegree = movement.progression[Math.floor(bar / 8) % movement.progression.length];
  const chordChance = profile.chords * (sparse ? 0.95 : 0.5) + (section.kind === "PEAK" ? 0.12 : 0);
  if (barRng() < chordChance) {
    const step = [3, 7, 11, 15][Math.floor(barRng() * 4)];
    chord[step] = {
      notes: makeChord(movement, progressionDegree, 1, barRng() < profile.space * 0.24),
      length: 0.16 + profile.space * 0.48,
      velocity: 0.42 + energy * 0.28,
    };
  }

  const pad =
    sectionStart || (barInPhrase === 0 && ["VOID", "BRIDGE", "DRIFT"].includes(section.kind))
      ? {
          notes: makeChord(movement, progressionDegree, 2, profile.space > 0.7),
          durationBars: clamp(Math.round(2 + profile.space * 4), 2, 6),
          velocity: 0.12 + profile.chords * 0.14,
        }
      : null;

  const bassVoice =
    instrumentProfile.acid > 0.72
      ? "acid"
      : instrumentProfile.rumble > 0.68 && instrumentProfile.warmth > 0.5
        ? "sub"
        : instrumentProfile.drive > 0.78
          ? "pulse"
          : hash32(seed, phraseIndex, section.seed, 0x42415353) % 2 === 0
            ? "sub"
            : "acid";

  const synthProfile = instrumentProfile;
  const synthPalette = createSynthPalette({
    seed,
    bar,
    vibeId,
    profile: synthProfile,
  });
  const targetEnsembleScene = selectEnsembleScene(seed, movement, section);
  const effectiveEnsembleRoles =
    ensembleRoles || targetEnsembleScene.roles;
  const activeSynthEngines = SYNTH_ENGINE_IDS.filter(
    (engine) => effectiveEnsembleRoles[engine],
  );
  const ensembleScene = Object.freeze({
    id: targetEnsembleScene.id,
    label: targetEnsembleScene.label,
    detail: targetEnsembleScene.detail,
    recalled: targetEnsembleScene.recalled,
    sourceSectionIndex: targetEnsembleScene.sourceSectionIndex,
    mutationEngine: synthMutationEngineForPhrase(phraseIndex),
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
  const ensemblePhrase = buildEnsemblePhrase({
    seed,
    phraseIndex,
    movement,
    section,
    profile: synthProfile,
    roles: effectiveEnsembleRoles,
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
  const texture =
    (barInPhrase === 0 || sectionStart) &&
    barRng() < 0.16 + profile.texture * 0.62;
  const texturePan =
    movement.timbre.stereoBias * 0.55 + barRng() * 0.35 - 0.175;
  const riser =
    section.endBar - localBar === 8 &&
    !["RELEASE", "VOID"].includes(section.kind);
  const downlifter =
    sectionStart && ["VOID", "BRIDGE", "RELEASE"].includes(section.kind);
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
    activeSynthEngines,
    ensembleScene,
  });

  return {
    bar,
    movement,
    section,
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
    synth,
    synthPalette,
    activeSynthEngines,
    ensembleScene,
    ensembleTargetRoles: targetEnsembleScene.roles,
    instrumentation,
    texture,
    texturePan,
    riser,
    riserBars: 8,
    downlifter,
    downlifterBars: 4,
    filterOpen: clamp(0.28 + energy * 0.58 + sectionProgress * 0.14, 0.18, 1),
    fingerprint: `${movement.index}:${section.index}:${phraseIndex}:${bassCount}:${bassVoice}:${ensembleScene.id}:${activeSynthEngines
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
