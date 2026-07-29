export const GENERATOR_VERSION = "1.0.0";
export const STEPS_PER_BAR = 16;
export const PHRASE_BARS = 8;
export const MOVEMENT_BARS = 192;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function hash32(...values) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const text = typeof value === "string" ? value : String(Number(value) >>> 0);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
      hash ^= hash >>> 13;
      hash = Math.imul(hash, 0x85ebca6b);
    }
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

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

export function buildBarPlan({
  seed,
  bar,
  vibeId = "hypnotic",
  tonality = "minor",
  profile = profileForVibe(vibeId),
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
    profile.acid > 0.72
      ? "acid"
      : profile.rumble > 0.68 && profile.warmth > 0.5
        ? "sub"
        : profile.drive > 0.78
          ? "pulse"
          : barInPhrase < 4
            ? "sub"
            : "acid";

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
    texture:
      (barInPhrase === 0 || sectionStart) &&
      barRng() < 0.16 + profile.texture * 0.62,
    texturePan: movement.timbre.stereoBias * 0.55 + barRng() * 0.35 - 0.175,
    riser:
      section.endBar - localBar === 8 &&
      !["RELEASE", "VOID"].includes(section.kind),
    riserBars: 8,
    downlifter: sectionStart && ["VOID", "BRIDGE", "RELEASE"].includes(section.kind),
    downlifterBars: 4,
    filterOpen: clamp(0.28 + energy * 0.58 + sectionProgress * 0.14, 0.18, 1),
    fingerprint: `${movement.index}:${section.index}:${phraseIndex}:${bassCount}:${bassVoice}`,
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
    bassDegrees,
    plan.bassVoice,
    chordPitchClasses,
  ].join("/");
}
