import { clamp, hash32 } from "./generative-utils.js";

export const MATERIAL_VERSION = "2.1.0";
export const MATERIAL_CANDIDATE_COUNT = 12;
export const MATERIAL_SCORE_FLOOR = 0.55;
export const MATERIAL_SCORE_BAND = 0.2;
export const PHRASE_BARS = 8;
export const STEPS_PER_BAR = 16;
export const STEPS_PER_PHRASE = PHRASE_BARS * STEPS_PER_BAR;

export const GESTURES = Object.freeze([
  "repeat",
  "subtract",
  "add",
  "displace",
  "call",
  "answer",
  "rest",
  "recall",
]);

const transitionRow = (values) =>
  Object.freeze(
    Object.fromEntries(
      GESTURES.map((gesture, index) => [gesture, values[index]]),
    ),
  );

export const GESTURE_TRANSITIONS = Object.freeze({
  repeat: transitionRow([0.24, 0.14, 0.12, 0.14, 0.14, 0.06, 0.1, 0.06]),
  subtract: transitionRow([0.22, 0.08, 0.14, 0.16, 0.16, 0.08, 0.1, 0.06]),
  add: transitionRow([0.18, 0.18, 0.08, 0.16, 0.16, 0.1, 0.08, 0.06]),
  displace: transitionRow([0.2, 0.14, 0.12, 0.1, 0.18, 0.1, 0.1, 0.06]),
  call: transitionRow([0.05, 0.05, 0.05, 0.05, 0.05, 0.6, 0.1, 0.05]),
  answer: transitionRow([0.24, 0.14, 0.14, 0.14, 0.12, 0.06, 0.1, 0.06]),
  rest: transitionRow([0.32, 0.08, 0.12, 0.1, 0.18, 0.08, 0.06, 0.06]),
  recall: transitionRow([0.34, 0.14, 0.1, 0.12, 0.12, 0.06, 0.06, 0.06]),
});

export const SCORE_WEIGHTS = Object.freeze({
  grooveContinuity: 0.22,
  macroFit: 0.18,
  kickBassSeparation: 0.16,
  motifContinuity: 0.14,
  novelty: 0.12,
  orchestration: 0.1,
  phaseInterest: 0.08,
});

export const LANE_DOMAINS = Object.freeze({
  kick: Object.freeze([16]),
  clap: Object.freeze([12, 15, 16, 18, 20, 24]),
  hats: Object.freeze(Array.from({ length: 25 }, (_, index) => index + 5)),
  percussion: Object.freeze(Array.from({ length: 25 }, (_, index) => index + 5)),
  bass: Object.freeze([12, 15, 16, 18, 20, 24, 28, 32]),
  synthFm: Object.freeze([7, 9, 11, 13, 15, 17, 19, 23, 29, 31]),
  synthModal: Object.freeze([7, 9, 11, 13, 15, 17, 19, 23, 29, 31]),
  synthString: Object.freeze([7, 9, 11, 13, 15, 17, 19, 23, 29, 31]),
});

export const KICK_PHRASE_IDS = Object.freeze([
  "anchor",
  "turnaround-pickup",
  "breathing",
  "rolling-pressure",
]);

export const KICK_ARTICULATIONS = Object.freeze([
  "anchor",
  "pickup",
  "roll",
]);

const LANE_IDS = Object.freeze(Object.keys(LANE_DOMAINS));
const STRUCTURAL_LANES = Object.freeze(
  LANE_IDS.filter((lane) => lane !== "kick"),
);
const SYNTH_LANES = Object.freeze({
  fm: "synthFm",
  modal: "synthModal",
  string: "synthString",
});
const ANSWER_DIRECTIONS = Object.freeze([
  "upward",
  "downward",
  "rhythmic",
  "registral",
]);
const PRIME_LENGTHS = new Set([5, 7, 11, 13, 17, 19, 23, 29, 31]);
const TRIPLET_LENGTHS = new Set([6, 9, 12, 18, 24]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function unitHash(...coordinates) {
  return (hash32(...coordinates) >>> 0) / 4294967296;
}

function normalizeWeights(weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) {
    return weights.map(() => 1 / Math.max(1, weights.length));
  }
  return weights.map((value) => value / total);
}

function coordinateChoice(values, weights, ...coordinates) {
  const normalized = normalizeWeights(weights);
  const target = unitHash(...coordinates);
  let cursor = 0;
  for (let index = 0; index < values.length; index += 1) {
    cursor += normalized[index];
    if (target < cursor || index === values.length - 1) return values[index];
  }
  return values.at(-1);
}

function integer(value, fallback = 0) {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function profileValue(profile, key, fallback = 0.5) {
  const value = Number(profile?.[key]);
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

function formValue(form, key, fallback = 0) {
  const value = Number(form?.[key]);
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

/**
 * Canonical Bjorklund distribution. Rotation moves the pattern to the right:
 * E(3, 8, 1) is E(3, 8, 0) rotated by one step.
 */
export function euclidean(hits, steps, rotation = 0) {
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > 512) {
    throw new RangeError("steps must be an integer from 1 to 512");
  }
  if (!Number.isSafeInteger(hits) || hits < 0 || hits > steps) {
    throw new RangeError("hits must be an integer from 0 to steps");
  }
  if (!Number.isSafeInteger(rotation)) {
    throw new TypeError("rotation must be a safe integer");
  }
  if (hits === 0) return Object.freeze(Array(steps).fill(0));
  if (hits === steps) return Object.freeze(Array(steps).fill(1));

  const counts = [];
  const remainders = [hits];
  let divisor = steps - hits;
  let level = 0;
  while (true) {
    counts[level] = Math.floor(divisor / remainders[level]);
    remainders[level + 1] = divisor % remainders[level];
    divisor = remainders[level];
    level += 1;
    if (remainders[level] <= 1) break;
  }
  counts[level] = divisor;

  const pattern = [];
  const build = (currentLevel) => {
    if (currentLevel === -1) {
      pattern.push(0);
      return;
    }
    if (currentLevel === -2) {
      pattern.push(1);
      return;
    }
    for (let index = 0; index < counts[currentLevel]; index += 1) {
      build(currentLevel - 1);
    }
    if (remainders[currentLevel] !== 0) build(currentLevel - 2);
  };
  build(level);
  while (pattern[0] !== 1) pattern.push(pattern.shift());

  const shift = positiveModulo(rotation, steps);
  return Object.freeze(
    Array.from(
      { length: steps },
      (_, index) => pattern[positiveModulo(index - shift, steps)],
    ),
  );
}

export function gestureProbabilities(previousGesture = "repeat", form = {}) {
  const row =
    GESTURE_TRANSITIONS[previousGesture] || GESTURE_TRANSITIONS.repeat;
  const logits = Object.fromEntries(
    GESTURES.map((gesture) => [gesture, Math.log(row[gesture])]),
  );
  const novelty = formValue(form, "noveltyDebt");
  const fatigue = formValue(form, "fatigue");
  const salience = formValue(form, "motifSalience");
  for (const gesture of ["add", "displace", "call"]) {
    logits[gesture] += novelty * 0.85;
  }
  for (const gesture of ["subtract", "rest"]) {
    logits[gesture] += fatigue * 0.8;
  }
  for (const gesture of ["repeat", "answer", "recall"]) {
    logits[gesture] += salience * 0.65;
  }
  if (form?.release) {
    logits.rest += 0.9;
    logits.recall += 0.75;
  }
  if (form?.climax) {
    logits.add += 0.72;
    logits.displace += 0.68;
    logits.answer += 0.62;
  }
  const maximum = Math.max(...Object.values(logits));
  const weights = GESTURES.map((gesture) => Math.exp(logits[gesture] - maximum));
  const normalized = normalizeWeights(weights);
  return Object.freeze(
    Object.fromEntries(
      GESTURES.map((gesture, index) => [gesture, normalized[index]]),
    ),
  );
}

function grooveLengthWeight(length, grooveFamily, lane) {
  let weight = 1;
  if (grooveFamily === "straight-pressure") {
    weight *= 1 / (1 + Math.abs(length - 16) * 0.24);
    if ([15, 16, 17].includes(length)) weight *= 2.2;
  } else if (grooveFamily === "rolling-syncopation") {
    if ([15, 17, 20, 24].includes(length)) weight *= 2.25;
  } else if (grooveFamily === "triplet-weave") {
    if (TRIPLET_LENGTHS.has(length)) weight *= 3.4;
  } else if (grooveFamily === "broken-machine") {
    if (PRIME_LENGTHS.has(length)) weight *= 3.6;
  } else if (grooveFamily === "swung-motor") {
    if (length % 2 === 1) weight *= 3.1;
  }
  if (lane.startsWith("synth") && length % 2 === 1) weight *= 1.5;
  return weight;
}

function clockHoldPhrases(trackDNA, seed, phraseIndex, lane, mutationCount) {
  const phenotype = trackDNA?.formPhenotype;
  const bounds =
    phenotype === "patient-hypnosis"
      ? [5, 8]
      : phenotype === "negative-space"
        ? [4, 8]
        : phenotype === "pressure-ratchet"
          ? [2, 5]
          : [3, 7];
  return (
    bounds[0] +
    (hash32(seed, phraseIndex, lane, mutationCount, "clock-hold") %
      (bounds[1] - bounds[0] + 1))
  );
}

function hitsForClock(
  lane,
  loopLength,
  profile,
  seed,
  phraseIndex,
  mutationCount,
  trackDNA = null,
) {
  if (lane === "kick") return loopLength === 16 ? 4 : clamp(Math.round(loopLength / 4), 3, 5);
  if (lane === "clap") {
    return 2 + (hash32(seed, phraseIndex, mutationCount, "clap-hits") % 2);
  }
  const density = profileValue(profile, "density");
  const syncopation = profileValue(profile, "syncopation");
  if (lane === "hats") {
    return clamp(Math.round(loopLength * (0.19 + density * 0.2)), 2, 14);
  }
  if (lane === "percussion") {
    return clamp(
      Math.round(loopLength * (0.08 + density * 0.1 + syncopation * 0.05)),
      1,
      8,
    );
  }
  if (lane === "bass") {
    const presence = clamp(
      Number(profile?.performanceBassPresence) || 0,
      -1,
      1,
    );
    const character = profile?.performanceBassCharacter || "auto";
    const behavior = trackDNA?.bassBehavior;
    const characterDensity = {
      sub: 0.095,
      rolling: 0.225,
      acid: 0.255,
      syncopated: 0.175,
    }[character];
    const behaviorDensity = {
      "offbeat-pulse": 0.14,
      "rolling-cell": 0.19,
      "acid-serpent": 0.215,
      "sub-sustain": 0.095,
      "syncopated-stabs": 0.17,
    }[behavior] ?? 0.125;
    const rhythmicLift =
      unitHash(seed, phraseIndex, mutationCount, "bass-density-lift") *
      (character === "rolling" || character === "acid" ? 0.035 : 0.018);
    return clamp(
      Math.round(
        loopLength *
          ((characterDensity ?? behaviorDensity) +
            density * 0.075 +
            syncopation * 0.052 +
            presence * 0.045 +
            rhythmicLift),
      ),
      2,
      10,
    );
  }
  return clamp(Math.round(loopLength * (0.07 + density * 0.07)), 1, 5);
}

function createClock({
  lane,
  seed,
  phraseIndex,
  trackDNA,
  profile,
  mutationCount = 0,
}) {
  const domain = LANE_DOMAINS[lane];
  const weights = domain.map((length) =>
    grooveLengthWeight(length, trackDNA?.grooveFamily, lane),
  );
  const loopLength = coordinateChoice(
    domain,
    weights,
    seed,
    phraseIndex,
    lane,
    mutationCount,
    "clock-length",
  );
  const hits = hitsForClock(
    lane,
    loopLength,
    profile,
    seed,
    phraseIndex,
    mutationCount,
    trackDNA,
  );
  const rotation =
    lane === "kick"
      ? 0
      : hash32(seed, phraseIndex, lane, mutationCount, "clock-rotation") %
        loopLength;
  const phraseStartStep = phraseIndex * STEPS_PER_PHRASE;
  const phaseOffset =
    lane === "kick"
      ? 0
      : hash32(seed, phraseIndex, lane, mutationCount, "clock-phase") %
        loopLength;
  const phaseOrigin = phraseStartStep - phaseOffset;
  return {
    id: hash32(
      MATERIAL_VERSION,
      seed,
      phraseIndex,
      lane,
      loopLength,
      hits,
      rotation,
      phaseOrigin,
      mutationCount,
    ),
    lane,
    loopLength,
    hits,
    rotation,
    phaseOrigin,
    agePhrases: 0,
    holdPhrases: clockHoldPhrases(
      trackDNA,
      seed,
      phraseIndex,
      lane,
      mutationCount,
    ),
    mutationCount,
    history: [],
  };
}

function ageClock(clock) {
  return {
    ...clock,
    agePhrases: clock.agePhrases + 1,
    history: [...clock.history],
  };
}

function mutateClock(clock, input, candidateIndex) {
  const nextMutation = clock.mutationCount + 1;
  let next = createClock({
    lane: clock.lane,
    seed: input.seed,
    phraseIndex: input.phraseIndex,
    trackDNA: input.trackDNA,
    profile: input.profile,
    mutationCount: nextMutation + candidateIndex * 17,
  });
  if (
    next.loopLength === clock.loopLength &&
    next.hits === clock.hits &&
    next.rotation === clock.rotation
  ) {
    next = {
      ...next,
      rotation: positiveModulo(next.rotation + 1, next.loopLength),
    };
  }
  next = {
    ...next,
    phaseOrigin: clock.phaseOrigin,
    id: hash32(
      MATERIAL_VERSION,
      input.seed,
      input.phraseIndex,
      clock.lane,
      next.loopLength,
      next.hits,
      next.rotation,
      clock.phaseOrigin,
      nextMutation,
      "continuous-phase-clock",
    ),
  };
  const history = [
    ...clock.history,
    {
      phraseIndex: input.phraseIndex,
      priorId: clock.id,
      loopLength: clock.loopLength,
      hits: clock.hits,
      rotation: clock.rotation,
    },
  ].slice(-8);
  return {
    ...next,
    mutationCount: nextMutation,
    id: hash32(next.id, nextMutation, "clock-mutation-id"),
    history,
  };
}

function renewClockIdentity(clock, input, candidateIndex) {
  const nextMutation = clock.mutationCount + 1;
  return {
    ...clock,
    id: hash32(
      clock.id,
      input.seed,
      input.phraseIndex,
      candidateIndex,
      nextMutation,
      "clock-identity-renewal",
    ),
    agePhrases: 0,
    holdPhrases: clockHoldPhrases(
      input.trackDNA,
      input.seed,
      input.phraseIndex,
      clock.lane,
      nextMutation,
    ),
    mutationCount: nextMutation,
    history: [
      ...clock.history,
      {
        phraseIndex: input.phraseIndex,
        priorId: clock.id,
        loopLength: clock.loopLength,
        hits: clock.hits,
        rotation: clock.rotation,
      },
    ].slice(-8),
  };
}

function renderClock(clock, phraseIndex) {
  const cycle = euclidean(clock.hits, clock.loopLength, clock.rotation);
  const phraseStart = phraseIndex * STEPS_PER_PHRASE;
  return Array.from({ length: STEPS_PER_PHRASE }, (_, offset) => {
    const absoluteStep = phraseStart + offset;
    return cycle[positiveModulo(absoluteStep - clock.phaseOrigin, clock.loopLength)] === 1;
  });
}

function initialMotif(seed, phraseIndex, trackDNA) {
  const hits = 5 + (hash32(seed, phraseIndex, "motif-hits") % 3);
  const onsetPattern = euclidean(
    hits,
    16,
    hash32(seed, phraseIndex, "motif-rotation") % 16,
  );
  let degree =
    hash32(seed, phraseIndex, trackDNA?.harmonyBehavior, "motif-root") % 7;
  const events = [];
  for (let onset = 0; onset < onsetPattern.length; onset += 1) {
    if (!onsetPattern[onset]) continue;
    const direction =
      (hash32(seed, phraseIndex, onset, "motif-direction") % 3) - 1;
    degree = clamp(degree + direction, 0, 6);
    events.push({ onset, degree });
  }
  const lineageId = hash32(seed, phraseIndex, "material-motif-lineage");
  return {
    lineageId,
    parentLineageId: null,
    generation: 0,
    events,
  };
}

function motifFingerprint(motif) {
  return `${motif.lineageId}:${motif.events
    .map((event) => `${event.onset}.${event.degree}`)
    .join(",")}`;
}

function mutationBudget(motif) {
  return Math.max(1, Math.floor(motif.events.length * 0.25));
}

function transformMotif({
  motif,
  gesture,
  direction,
  seed,
  phraseIndex,
  candidateIndex,
  archivedMotifs,
}) {
  if (gesture === "recall" && archivedMotifs.length > 0) {
    const recalled =
      archivedMotifs[
        hash32(seed, phraseIndex, candidateIndex, "motif-recall") %
          archivedMotifs.length
      ];
    return {
      motif: {
        ...recalled,
        events: recalled.events.map((event) => ({ ...event })),
      },
      changedOnsets: 0,
      changedDegrees: 0,
      recalled: true,
    };
  }
  const events = motif.events.map((event) => ({ ...event }));
  const budget = mutationBudget(motif);
  let changedOnsets = 0;
  let changedDegrees = 0;
  if (!["repeat", "rest", "recall"].includes(gesture)) {
    const target =
      hash32(seed, phraseIndex, candidateIndex, gesture, "motif-target") %
      events.length;
    if (gesture === "subtract" && events.length > 4) {
      events.splice(target, Math.min(budget, events.length - 4));
      changedOnsets = Math.min(budget, motif.events.length - 4);
    } else if (gesture === "add") {
      const occupied = new Set(events.map((event) => event.onset));
      for (let index = 0; index < budget; index += 1) {
        const start =
          hash32(seed, phraseIndex, candidateIndex, index, "motif-add") % 16;
        let onset = start;
        for (let probe = 0; probe < 16 && occupied.has(onset); probe += 1) {
          onset = (onset + 1) % 16;
        }
        if (occupied.has(onset)) continue;
        occupied.add(onset);
        events.push({
          onset,
          degree:
            events[
              hash32(seed, phraseIndex, candidateIndex, index, "motif-add-source") %
                events.length
            ].degree,
        });
        changedOnsets += 1;
      }
      events.sort((left, right) => left.onset - right.onset);
    } else if (
      gesture === "displace" ||
      (gesture === "call" && direction === "rhythmic") ||
      (gesture === "answer" && direction === "rhythmic")
    ) {
      const occupied = new Set(events.map((event) => event.onset));
      const event = events[target];
      occupied.delete(event.onset);
      const delta =
        hash32(seed, phraseIndex, candidateIndex, gesture, "motif-displace") % 2
          ? 1
          : -1;
      const onset = positiveModulo(event.onset + delta, 16);
      if (!occupied.has(onset)) {
        event.onset = onset;
        changedOnsets = 1;
        events.sort((left, right) => left.onset - right.onset);
      } else {
        const nextDegree = clamp(event.degree + delta, 0, 6);
        changedDegrees = Number(nextDegree !== event.degree);
        event.degree = nextDegree;
      }
    } else {
      const event = events[target];
      const delta =
        direction === "downward"
          ? -1
          : direction === "registral"
            ? 2
            : 1;
      const nextDegree = clamp(event.degree + delta, 0, 6);
      changedDegrees = Number(nextDegree !== event.degree);
      event.degree = nextDegree;
    }
  }
  const changed = changedOnsets + changedDegrees > 0;
  return {
    motif: {
      lineageId: changed
        ? hash32(
            motif.lineageId,
            seed,
            phraseIndex,
            candidateIndex,
            gesture,
            "material-motif-child",
          )
        : motif.lineageId,
      parentLineageId: changed ? motif.lineageId : motif.parentLineageId,
      generation: changed ? motif.generation + 1 : motif.generation,
      events,
    },
    changedOnsets,
    changedDegrees,
    recalled: false,
  };
}

function answerDirection(seed, phraseIndex, candidateIndex) {
  return ANSWER_DIRECTIONS[
    hash32(seed, phraseIndex, candidateIndex, "answer-direction") %
      ANSWER_DIRECTIONS.length
  ];
}

function chooseGesture(previousState, input, candidateIndex) {
  const obligation = previousState?.phraseMemory?.unresolvedCall;
  if (obligation && input.phraseIndex <= obligation.duePhraseIndex) {
    return {
      gesture: "answer",
      direction: obligation.direction,
      forcedAnswer: true,
    };
  }
  const previousGesture =
    previousState?.phraseMemory?.previousGesture || "repeat";
  const probabilities = gestureProbabilities(previousGesture, input.form);
  const gesture = coordinateChoice(
    GESTURES,
    GESTURES.map((name) => probabilities[name]),
    input.seed,
    input.phraseIndex,
    candidateIndex,
    "gesture",
  );
  const boundedGesture =
    (gesture === "rest" &&
      (previousState?.phraseMemory?.restStreak || 0) >= 2) ||
    (gesture === "recall" &&
      (previousState?.phraseMemory?.archivedMotifs?.length || 0) === 0)
      ? "repeat"
      : gesture;
  return {
    gesture: boundedGesture,
    direction:
      boundedGesture === "call" || boundedGesture === "answer"
        ? answerDirection(input.seed, input.phraseIndex, candidateIndex)
        : null,
    forcedAnswer: false,
  };
}

function mutationAllowance(form, gesture) {
  return form?.climax || form?.release || gesture === "recall" ? 2 : 1;
}

function kickPhraseWeights(input) {
  const energy = formValue(input.form, "energy", 0.55);
  const space = formValue(input.form, "space", 0.5);
  const novelty = formValue(input.form, "noveltyDebt", 0.45);
  const drive = profileValue(input.profile, "drive", 0.5);
  const groove = input.trackDNA?.grooveFamily;
  const weights = {
    anchor: 0.42 + (1 - novelty) * 0.16,
    "turnaround-pickup": 0.25 + novelty * 0.16,
    breathing:
      0.18 + space * 0.2 + (input.form?.release ? 0.26 : 0) +
      (input.gesture === "rest" || input.gesture === "subtract" ? 0.18 : 0),
    "rolling-pressure":
      0.16 + energy * 0.18 + drive * 0.2 + (input.form?.climax ? 0.24 : 0),
  };
  if (groove === "straight-pressure") weights.anchor += 0.18;
  if (groove === "rolling-syncopation") weights["rolling-pressure"] += 0.22;
  if (groove === "triplet-weave") weights["turnaround-pickup"] += 0.12;
  if (groove === "broken-machine") weights.breathing += 0.18;
  if (groove === "swung-motor") weights["rolling-pressure"] += 0.14;
  return weights;
}

function chooseKickPhrase(previousState, input, candidateIndex, gesture) {
  const previous = previousState?.kickPhrase || null;
  if (previous && previous.agePhrases + 1 < previous.holdPhrases) {
    return {
      ...previous,
      agePhrases: previous.agePhrases + 1,
      changed: false,
      priorId: previous.id,
    };
  }
  const weightedInput = { ...input, gesture };
  const weights = kickPhraseWeights(weightedInput);
  const choices = previous
    ? KICK_PHRASE_IDS.filter((id) => id !== previous.id)
    : [...KICK_PHRASE_IDS];
  if (!previous) weights.anchor += 0.2;
  const id = coordinateChoice(
    choices,
    choices.map((choice) => weights[choice]),
    input.seed,
    input.phraseIndex,
    candidateIndex,
    "kick-phrase-family",
  );
  const holdSpan = id === "anchor" ? 3 : 2;
  const holdPhrases =
    1 +
    (hash32(
      input.seed,
      input.phraseIndex,
      candidateIndex,
      id,
      "kick-phrase-hold",
    ) % holdSpan);
  return {
    id,
    priorId: previous?.id ?? id,
    agePhrases: 0,
    holdPhrases,
    changed: Boolean(previous && previous.id !== id),
  };
}

function materializeKickPhrase(kickPhrase) {
  const pattern = Array(STEPS_PER_PHRASE).fill(false);
  const articulations = Array(STEPS_PER_PHRASE).fill(null);
  const add = (bar, step, articulation = "anchor") => {
    const offset = bar * STEPS_PER_BAR + step;
    pattern[offset] = true;
    articulations[offset] = articulation;
  };
  for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
    let steps = [0, 4, 8, 12];
    if (kickPhrase.id === "breathing" && bar % 4 === 2) {
      steps = [0, 8];
    } else if (kickPhrase.id === "rolling-pressure" && bar % 2 === 1) {
      steps = [0, 4, 7, 10, 12];
    }
    for (const step of steps) {
      const articulation =
        kickPhrase.id === "rolling-pressure" && [7, 10].includes(step)
          ? "roll"
          : "anchor";
      add(bar, step, articulation);
    }
    const turnaround =
      (kickPhrase.id === "turnaround-pickup" && [3, 7].includes(bar)) ||
      (kickPhrase.id === "breathing" && bar % 4 === 3);
    if (turnaround) add(bar, 14, "pickup");
  }
  return { pattern, articulations };
}

function candidateClocks(previousState, input, candidateIndex, gesture) {
  const initial = !previousState;
  const clocks = {};
  for (const lane of LANE_IDS) {
    clocks[lane] = initial
      ? createClock({
          lane,
          seed: input.seed,
          phraseIndex: input.phraseIndex,
          trackDNA: input.trackDNA,
          profile: input.profile,
        })
      : ageClock(previousState.clocks[lane]);
  }
  const renewKick = clocks.kick.agePhrases >= clocks.kick.holdPhrases;
  if (renewKick) {
    clocks.kick = renewClockIdentity(clocks.kick, input, candidateIndex);
  }
  const kickPhrase = chooseKickPhrase(
    previousState,
    input,
    candidateIndex,
    gesture,
  );
  const mutatedLanes = [];
  const renewedLanes = renewKick ? ["kick"] : [];
  const totalAllowance = mutationAllowance(input.form, gesture);
  let remaining = totalAllowance - mutatedLanes.length;
  const eligible = STRUCTURAL_LANES.filter(
    (lane) => clocks[lane].agePhrases >= 2,
  ).sort(
    (left, right) =>
      clocks[right].agePhrases - clocks[left].agePhrases ||
      clocks[right].agePhrases / clocks[right].holdPhrases -
        clocks[left].agePhrases / clocks[left].holdPhrases ||
      hash32(input.seed, input.phraseIndex, candidateIndex, left, "lane-order") -
        hash32(input.seed, input.phraseIndex, candidateIndex, right, "lane-order"),
  );
  const additionalMutationChance =
    input.trackDNA?.formPhenotype === "patient-hypnosis"
      ? 0.05
      : input.trackDNA?.formPhenotype === "negative-space"
        ? 0.24
        : input.trackDNA?.formPhenotype === "pressure-ratchet"
          ? 1
          : 0.68;
  for (let index = 0; index < eligible.length; index += 1) {
    const lane = eligible[index];
    if (remaining <= 0) break;
    const mutate =
      index === 0 ||
      unitHash(
        input.seed,
        input.phraseIndex,
        candidateIndex,
        lane,
        "lane-mutate",
      ) <
      additionalMutationChance;
    if (!mutate) continue;
    clocks[lane] = mutateClock(clocks[lane], input, candidateIndex);
    mutatedLanes.push(lane);
    remaining -= 1;
  }
  return {
    clocks,
    mutatedLanes,
    renewedLanes,
    kickPhrase,
  };
}

function capSynthPatterns(patterns, kick, seed, phraseIndex) {
  for (let offset = 0; offset < STEPS_PER_PHRASE; offset += 1) {
    if (kick[offset]) {
      for (const engine of Object.keys(patterns)) patterns[engine][offset] = false;
      continue;
    }
    const attacks = Object.keys(patterns).filter(
      (engine) => patterns[engine][offset],
    );
    if (attacks.length <= 1) continue;
    attacks.sort(
      (left, right) =>
        hash32(seed, phraseIndex, offset, left, "synth-collision") -
        hash32(seed, phraseIndex, offset, right, "synth-collision"),
    );
    for (const engine of attacks.slice(1)) patterns[engine][offset] = false;
  }
  for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
    const starts = [];
    for (const engine of Object.keys(patterns)) {
      for (let step = 0; step < STEPS_PER_BAR; step += 1) {
        const offset = bar * STEPS_PER_BAR + step;
        if (patterns[engine][offset]) starts.push({ engine, offset });
      }
    }
    starts.sort(
      (left, right) =>
        hash32(seed, phraseIndex, left.engine, left.offset, "synth-budget") -
        hash32(seed, phraseIndex, right.engine, right.offset, "synth-budget"),
    );
    for (const event of starts.slice(4)) patterns[event.engine][event.offset] = false;
  }
}

function assignDegrees(pattern, motif, offset = 0, reverse = false) {
  const degrees = Array(STEPS_PER_PHRASE).fill(null);
  let cursor = 0;
  for (let step = 0; step < pattern.length; step += 1) {
    if (!pattern[step]) continue;
    const eventIndex = reverse
      ? positiveModulo(motif.events.length - 1 - cursor, motif.events.length)
      : cursor % motif.events.length;
    degrees[step] = motif.events[eventIndex].degree + offset;
    cursor += 1;
  }
  return degrees;
}

function materializePhrase(
  clocks,
  kickPhrase,
  motif,
  gesture,
  input,
  candidateIndex,
) {
  const materializedKick = materializeKickPhrase(kickPhrase);
  const kick = materializedKick.pattern;
  const clap = renderClock(clocks.clap, input.phraseIndex);
  const hats = renderClock(clocks.hats, input.phraseIndex);
  const percussion = renderClock(clocks.percussion, input.phraseIndex);
  const bass = renderClock(clocks.bass, input.phraseIndex);
  for (let offset = 0; offset < bass.length; offset += 1) {
    if (!bass[offset] || !kick[offset]) continue;
    const articulation = materializedKick.articulations[offset];
    bass[offset] = false;
    if (articulation === "anchor") continue;
    const barStart = Math.floor(offset / STEPS_PER_BAR) * STEPS_PER_BAR;
    const barEnd = barStart + STEPS_PER_BAR;
    const destination = [offset + 1, offset - 1, offset + 2].find(
      (candidate) =>
        candidate >= barStart &&
        candidate < barEnd &&
        !kick[candidate] &&
        !bass[candidate],
    );
    if (destination !== undefined) bass[destination] = true;
  }
  const synth = Object.fromEntries(
    Object.entries(SYNTH_LANES).map(([engine, lane]) => [
      engine,
      gesture === "rest"
        ? Array(STEPS_PER_PHRASE).fill(false)
        : renderClock(clocks[lane], input.phraseIndex),
    ]),
  );
  capSynthPatterns(synth, kick, input.seed, input.phraseIndex);
  const openHats = hats.map(
    (active, offset) =>
      active &&
      unitHash(
        input.seed,
        input.phraseIndex,
        candidateIndex,
        offset,
        "open-hat",
      ) <
        0.06 + profileValue(input.profile, "space") * 0.13,
  );
  const closedHats = hats.map(
    (active, offset) => active && !openHats[offset],
  );
  const percussionVoices = percussion.map((active, offset) => {
    if (!active) return null;
    const choice = unitHash(
      input.seed,
      input.phraseIndex,
      candidateIndex,
      offset,
      "percussion-voice",
    );
    if (input.form?.climax && choice > 0.8) return "ride";
    if (input.form?.allowFill && offset >= STEPS_PER_PHRASE - 16 && choice > 0.68) {
      return "tom";
    }
    if (profileValue(input.profile, "metallic") > 0.55 && choice > 0.58) {
      return "metallic";
    }
    return choice < 0.48 ? "shaker" : "rim";
  });
  return {
    kickPhraseId: kickPhrase.id,
    kickArticulations: materializedKick.articulations,
    patterns: {
      kick,
      clap,
      hats: closedHats,
      openHats,
      percussion,
      percussionVoices,
      bass,
      synth,
    },
    degrees: {
      bass: assignDegrees(bass, motif, 0, false),
      synth: {
        fm: assignDegrees(synth.fm, motif, 0, false),
        modal: assignDegrees(synth.modal, motif, 4, false),
        string: assignDegrees(synth.string, motif, 2, true),
      },
    },
  };
}

function booleanDistance(left, right) {
  if (!left || !right || left.length !== right.length) return 1;
  let changes = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (Boolean(left[index]) !== Boolean(right[index])) changes += 1;
  }
  return changes / left.length;
}

export function materialPhraseFingerprint(phrase) {
  const encodeBooleanLane = (lane) =>
    lane.map((value) => (value ? "1" : "0")).join("");
  const encodeValues = (values) =>
    values
      .map((value) =>
        value === null || value === undefined ? "_" : String(value),
      )
      .join(",");
  const laneSignature = [
    phrase.patterns.kick,
    phrase.patterns.clap,
    phrase.patterns.hats,
    phrase.patterns.openHats,
    phrase.patterns.percussion,
    phrase.patterns.bass,
    phrase.patterns.synth.fm,
    phrase.patterns.synth.modal,
    phrase.patterns.synth.string,
  ]
    .map(encodeBooleanLane)
    .join("/");
  const voiceSignature = encodeValues(phrase.patterns.percussionVoices);
  const degreeSignature = [
    phrase.degrees.bass,
    phrase.degrees.synth.fm,
    phrase.degrees.synth.modal,
    phrase.degrees.synth.string,
  ]
    .map(encodeValues)
    .join("/");
  return hash32(
    phrase.kickPhraseId,
    encodeValues(phrase.kickArticulations),
    laneSignature,
    voiceSignature,
    degreeSignature,
    "emitted-material-fingerprint",
  )
    .toString(16)
    .padStart(8, "0");
}

function scoreCandidate(candidate, previousState, input) {
  const priorPhrase = previousState?.phrase;
  const clockContinuity = previousState
    ? LANE_IDS.filter(
        (lane) => candidate.clocks[lane].id === previousState.clocks[lane].id,
      ).length / LANE_IDS.length
    : 0.72;
  const kickPhraseContinuity = previousState
    ? candidate.kickPhrase.id === previousState.kickPhrase.id
      ? 1
      : 0.68
    : 0.82;
  const grooveContinuity = clamp(
    clockContinuity * 0.72 + kickPhraseContinuity * 0.28,
    0,
    1,
  );
  const actualDensity =
    [
      candidate.phrase.patterns.hats,
      candidate.phrase.patterns.percussion,
      candidate.phrase.patterns.bass,
    ].reduce(
      (total, lane) => total + lane.filter(Boolean).length / lane.length,
      0,
    ) / 3;
  const desiredDensity = 0.08 + profileValue(input.profile, "density") * 0.2;
  const macroFit = clamp(1 - Math.abs(actualDensity - desiredDensity) * 3, 0, 1);
  const overlap = candidate.phrase.patterns.bass.filter(
    (active, index) => active && candidate.phrase.patterns.kick[index],
  ).length;
  const kickBassSeparation = overlap === 0 ? 1 : clamp(1 - overlap / 8, 0, 1);
  const mutationFraction =
    (candidate.mutation.changedOnsets + candidate.mutation.changedDegrees) /
    Math.max(1, previousState?.motif?.events?.length || candidate.motif.events.length);
  const motifContinuity = clamp(
    1 -
      mutationFraction +
      (candidate.gesture === "answer" || candidate.gesture === "recall" ? 0.08 : 0),
    0,
    1,
  );
  const recent =
    previousState?.phraseMemory?.recentFingerprints?.includes(
      candidate.fingerprint,
    ) || false;
  const patternNovelty = priorPhrase
    ? [
        "kick",
        "clap",
        "hats",
        "percussion",
        "bass",
      ].reduce(
        (sum, lane) =>
          sum +
          booleanDistance(
            candidate.phrase.patterns[lane],
            priorPhrase.patterns[lane],
          ),
        0,
      ) / 5
    : 0.55;
  const novelty = clamp(
    patternNovelty * 1.9 + (recent ? 0 : 0.32) +
      (["repeat", "recall"].includes(candidate.gesture) ? -0.08 : 0),
    0,
    1,
  );
  let maximumStarts = 0;
  let totalStarts = 0;
  for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
    let starts = 0;
    for (const lane of Object.values(candidate.phrase.patterns.synth)) {
      starts += lane
        .slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR)
        .filter(Boolean).length;
    }
    maximumStarts = Math.max(maximumStarts, starts);
    totalStarts += starts;
  }
  const averageStarts = totalStarts / PHRASE_BARS;
  const desiredStarts =
    candidate.gesture === "rest"
      ? 0
      : clamp(
          0.45 +
            profileValue(input.profile, "density") * 2.55 -
            profileValue(input.profile, "space") * 0.72 +
            (input.form?.climax ? 0.5 : 0) -
            (input.form?.release ? 0.35 : 0),
          0.25,
          3.5,
        );
  const budgetCeiling = input.form?.climax
    ? 4
    : input.form?.release || candidate.gesture === "rest"
      ? 2
      : 3;
  const orchestration = clamp(
    (1 - Math.abs(averageStarts - desiredStarts) / 3.5) * 0.78 +
      (maximumStarts <= budgetCeiling
        ? 1
        : 1 - (maximumStarts - budgetCeiling) / 4) *
        0.22,
    0,
    1,
  );
  const nonSixteen = LANE_IDS.filter(
    (lane) => candidate.clocks[lane].loopLength !== 16,
  ).length;
  const distinctLengths = new Set(
    LANE_IDS.map((lane) => candidate.clocks[lane].loopLength),
  ).size;
  const phaseInterest = clamp(nonSixteen / LANE_IDS.length * 0.72 + distinctLengths / LANE_IDS.length * 0.28, 0, 1);
  const measures = {
    grooveContinuity,
    macroFit,
    kickBassSeparation,
    motifContinuity,
    novelty,
    orchestration,
    phaseInterest,
  };
  const score = Object.entries(SCORE_WEIGHTS).reduce(
    (total, [key, weight]) => total + measures[key] * weight,
    0,
  );
  return { measures, score };
}

export function validateMaterialCandidate(candidate, previousState = null) {
  const reasons = [];
  const patterns = candidate.phrase.patterns;
  for (const lane of LANE_IDS) {
    const clock = candidate.clocks[lane];
    if (!LANE_DOMAINS[lane].includes(clock.loopLength)) {
      reasons.push(`clock-domain:${lane}`);
    }
    if (
      !Number.isSafeInteger(clock.hits) ||
      clock.hits < 0 ||
      clock.hits > clock.loopLength
    ) {
      reasons.push(`clock-hits:${lane}`);
    }
  }
  const allowedStructuralMutations = mutationAllowance(
    candidate.form,
    candidate.gesture,
  );
  if (candidate.mutatedLanes.length > allowedStructuralMutations) {
    reasons.push("structural-mutation-budget");
  }
  if (candidate.mutation.onsetFraction > 0.25 || candidate.mutation.degreeFraction > 0.25) {
    reasons.push("motif-mutation-budget");
  }
  if (
    patterns.bass.some(
      (active, index) => active && patterns.kick[index],
    )
  ) {
    reasons.push("kick-bass-collision");
  }
  if (
    patterns.kick.some(
      (active, index) =>
        active &&
        Object.values(patterns.synth).some((lane) => lane[index]),
    )
  ) {
    reasons.push("kick-synth-collision");
  }
  if (
    patterns.hats.some(
      (active, index) => active && patterns.openHats[index],
    )
  ) {
    reasons.push("hat-collision");
  }
  const densityCeilings = {
    kick: 64,
    clap: 40,
    hats: 96,
    openHats: 48,
    percussion: 64,
    bass: 64,
  };
  for (const [lane, ceiling] of Object.entries(densityCeilings)) {
    if (patterns[lane].filter(Boolean).length > ceiling) {
      reasons.push(`density:${lane}`);
    }
  }
  const validPercussionVoices = new Set([
    "shaker",
    "rim",
    "ride",
    "metallic",
    "tom",
  ]);
  if (
    patterns.percussionVoices.some(
      (voice, offset) =>
        (patterns.percussion[offset] &&
          !validPercussionVoices.has(voice)) ||
        (!patterns.percussion[offset] && voice !== null),
    )
  ) {
    reasons.push("voice:percussion");
  }
  for (let offset = 0; offset < STEPS_PER_PHRASE; offset += 1) {
    const starts = Object.values(patterns.synth).filter(
      (lane) => lane[offset],
    ).length;
    if (starts > 1) {
      reasons.push("voice:synth-collision");
      break;
    }
  }
  for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
    const start = bar * STEPS_PER_BAR;
    const starts = Object.values(patterns.synth).reduce(
      (total, lane) =>
        total +
        lane
          .slice(start, start + STEPS_PER_BAR)
          .filter(Boolean).length,
      0,
    );
    if (starts > 4) {
      reasons.push("voice:synth-budget");
      break;
    }
  }
  if (
    candidate.motif.events.some(
      (event) =>
        !Number.isSafeInteger(event.onset) ||
        event.onset < 0 ||
        event.onset > 15 ||
        !Number.isSafeInteger(event.degree) ||
        event.degree < 0 ||
        event.degree > 6,
    )
  ) {
    reasons.push("pitch-bound");
  }
  const emittedDegrees = [
    ...candidate.phrase.degrees.bass.filter(Number.isFinite),
    ...Object.values(candidate.phrase.degrees.synth).flatMap((degrees) =>
      degrees.filter(Number.isFinite),
    ),
  ];
  if (
    emittedDegrees.some(
      (degree) =>
        !Number.isSafeInteger(degree) ||
        degree < 0 ||
        degree > 10,
    )
  ) {
    reasons.push("emitted-pitch-bound");
  }
  if (
    candidate.clocks.kick.loopLength !== 16 ||
    candidate.clocks.kick.hits !== 4 ||
    candidate.clocks.kick.rotation !== 0
  ) {
    reasons.push("kick-anchor-clock");
  }
  if (
    !KICK_PHRASE_IDS.includes(candidate.kickPhrase?.id) ||
    candidate.phrase.kickPhraseId !== candidate.kickPhrase?.id
  ) {
    reasons.push("kick-phrase-family");
  }
  if (
    !Array.isArray(candidate.phrase.kickArticulations) ||
    candidate.phrase.kickArticulations.length !== STEPS_PER_PHRASE ||
    candidate.phrase.kickArticulations.some(
      (articulation, offset) =>
        (patterns.kick[offset] &&
          !KICK_ARTICULATIONS.includes(articulation)) ||
        (!patterns.kick[offset] && articulation !== null),
    )
  ) {
    reasons.push("kick-articulation");
  }
  const kickOnsets = patterns.kick.flatMap((active, offset) =>
    active ? [offset] : [],
  );
  if (
    Array.from({ length: PHRASE_BARS }, (_, bar) =>
      patterns.kick[bar * STEPS_PER_BAR],
    ).some((active) => !active) ||
    kickOnsets.some(
      (offset, index) =>
        index > 0 && offset - kickOnsets[index - 1] < 2,
    ) ||
    STEPS_PER_PHRASE - kickOnsets.at(-1) + kickOnsets[0] < 2
  ) {
    reasons.push("kick-phrase-safety");
  }
  if (!patterns.kick.some(Boolean)) reasons.push("silence");
  if (
    !Number.isFinite(candidate.score) ||
    candidate.score < 0 ||
    candidate.score > 1 ||
    Object.values(candidate.measures).some(
      (measure) =>
        !Number.isFinite(measure) ||
        measure < 0 ||
        measure > 1,
    )
  ) {
    reasons.push("dsp-safety");
  }
  if (
    previousState?.phraseMemory?.recentFingerprints?.includes(
      candidate.fingerprint,
    ) &&
    !["repeat", "recall"].includes(candidate.gesture)
  ) {
    reasons.push("planner-collapse");
  }
  return Object.freeze(reasons);
}

function normalizeInput(previousState, rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    throw new TypeError("material planner input must be an object");
  }
  const phraseIndex = Number.isSafeInteger(rawInput.phraseIndex)
    ? rawInput.phraseIndex
    : previousState
      ? previousState.phraseIndex + 1
      : Number.isSafeInteger(rawInput.form?.phraseIndex)
        ? rawInput.form.phraseIndex
        : 0;
  if (phraseIndex < 0) {
    throw new RangeError("phraseIndex must be a non-negative safe integer");
  }
  if (previousState && phraseIndex !== previousState.phraseIndex + 1) {
    throw new RangeError("advanceMaterialState must advance exactly one phrase");
  }
  const sourceTrackDNA = rawInput.trackDNA ?? previousState?.trackDNA ?? {};
  const sourceForm = rawInput.form ?? {};
  const sourceProfile = rawInput.profile ?? {};
  return {
    seed: rawInput.seed ?? previousState?.seed,
    trackDNA: { ...sourceTrackDNA },
    form: { ...sourceForm },
    profile: {
      ...sourceProfile,
      ...(Array.isArray(sourceProfile.bpm)
        ? { bpm: [...sourceProfile.bpm] }
        : {}),
    },
    tonality: rawInput.tonality ?? previousState?.tonality ?? "minor",
    phraseIndex,
  };
}

function makeCandidate(previousState, input, candidateIndex) {
  const gestureChoice = chooseGesture(previousState, input, candidateIndex);
  const residentMotif =
    previousState?.phraseMemory?.residentMotif ||
    initialMotif(input.seed, input.phraseIndex, input.trackDNA);
  const archive = previousState?.phraseMemory?.archivedMotifs || [];
  const transformed = transformMotif({
    motif: residentMotif,
    gesture: gestureChoice.gesture,
    direction: gestureChoice.direction,
    seed: input.seed,
    phraseIndex: input.phraseIndex,
    candidateIndex,
    archivedMotifs: archive,
  });
  const clockResult = candidateClocks(
    previousState,
    input,
    candidateIndex,
    gestureChoice.gesture,
  );
  const materialized = materializePhrase(
    clockResult.clocks,
    clockResult.kickPhrase,
    transformed.motif,
    gestureChoice.gesture,
    input,
    candidateIndex,
  );
  const fingerprint = materialPhraseFingerprint(materialized);
  const basis = Math.max(1, residentMotif.events.length);
  const candidate = {
    id: hash32(input.seed, input.phraseIndex, candidateIndex, "material-candidate"),
    candidateIndex,
    phraseIndex: input.phraseIndex,
    gesture: gestureChoice.gesture,
    answerDirection: gestureChoice.direction,
    forcedAnswer: gestureChoice.forcedAnswer,
    form: input.form,
    clocks: clockResult.clocks,
    mutatedLanes: clockResult.mutatedLanes,
    renewedLanes: clockResult.renewedLanes,
    kickPhrase: clockResult.kickPhrase,
    motif: transformed.motif,
    mutation: {
      changedOnsets: transformed.changedOnsets,
      changedDegrees: transformed.changedDegrees,
      onsetFraction: transformed.changedOnsets / basis,
      degreeFraction: transformed.changedDegrees / basis,
      recalled: transformed.recalled,
    },
    phrase: {
      ...materialized,
      fingerprint,
    },
    fingerprint,
  };
  const scoring = scoreCandidate(candidate, previousState, input);
  candidate.measures = scoring.measures;
  candidate.score = scoring.score;
  const rejectionReasons = validateMaterialCandidate(candidate, previousState);
  candidate.rejectionReasons = rejectionReasons;
  candidate.valid = rejectionReasons.length === 0;
  return deepFreeze(candidate);
}

export function generateMaterialCandidates(
  previousState,
  rawInput,
  candidateOrder = null,
) {
  const input = normalizeInput(previousState, rawInput);
  const order =
    candidateOrder ||
    Array.from({ length: MATERIAL_CANDIDATE_COUNT }, (_, index) => index);
  if (
    !Array.isArray(order) ||
    order.length !== MATERIAL_CANDIDATE_COUNT ||
    new Set(order).size !== MATERIAL_CANDIDATE_COUNT ||
    order.some(
      (value) =>
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value >= MATERIAL_CANDIDATE_COUNT,
    )
  ) {
    throw new RangeError("candidateOrder must be a permutation of candidate indices");
  }
  return Object.freeze(
    order
      .map((candidateIndex) =>
        makeCandidate(previousState, input, candidateIndex),
      )
      .sort((left, right) => left.candidateIndex - right.candidateIndex),
  );
}

function samplingTemperature(input) {
  const novelty = formValue(input.form, "noveltyDebt");
  const phenotype = input.trackDNA?.formPhenotype;
  const phenotypeOffset =
    phenotype === "patient-hypnosis"
      ? -0.08
      : phenotype === "pressure-ratchet"
        ? 0.1
        : phenotype === "machine-funk"
          ? 0.06
          : 0;
  return clamp(0.43 + novelty * 0.34 + phenotypeOffset, 0.35, 0.85);
}

function selectCandidate(candidates, input) {
  const valid = candidates.filter((candidate) => candidate.valid);
  if (valid.length === 0) {
    throw new Error("material planner produced no valid candidate");
  }
  const bestScore = Math.max(...valid.map((candidate) => candidate.score));
  let eligible = valid.filter(
    (candidate) =>
      candidate.score >= MATERIAL_SCORE_FLOOR &&
      candidate.score >= bestScore - MATERIAL_SCORE_BAND,
  );
  let fallback = false;
  if (eligible.length === 0) {
    fallback = true;
    eligible = [valid.slice().sort((left, right) => right.score - left.score)[0]];
  }
  eligible.sort((left, right) => left.id - right.id);
  const temperature = samplingTemperature(input);
  const weights = eligible.map((candidate) =>
    Math.exp((candidate.score - bestScore) / temperature),
  );
  const selected = coordinateChoice(
    eligible,
    weights,
    input.seed,
    input.phraseIndex,
    "candidate-softmax-selection",
  );
  return {
    selected,
    bestScore,
    eligibleCandidateCount: eligible.length,
    temperature,
    fallback,
  };
}

function archiveForSelection(previousState, selected) {
  const archive = [
    ...(previousState?.phraseMemory?.archivedMotifs || []),
  ];
  const prior = previousState?.phraseMemory?.residentMotif;
  if (
    prior &&
    !["repeat", "rest", "recall"].includes(selected.gesture) &&
    motifFingerprint(prior) !== motifFingerprint(selected.motif)
  ) {
    const frozenPrior = deepFreeze({
      ...prior,
      events: prior.events.map((event) => ({ ...event })),
    });
    if (
      !archive.some(
        (motif) => motifFingerprint(motif) === motifFingerprint(frozenPrior),
      )
    ) {
      archive.push(frozenPrior);
    }
  }
  return archive.slice(-8);
}

function stateFromSelection(previousState, input, candidates, selection) {
  const selected = selection.selected;
  const previousCall = previousState?.phraseMemory?.unresolvedCall || null;
  const unresolvedCall =
    selected.gesture === "call"
      ? {
          createdPhraseIndex: input.phraseIndex,
          duePhraseIndex: input.phraseIndex + 1,
          direction: selected.answerDirection,
          sourceLineageId: selected.motif.lineageId,
        }
      : selected.gesture === "answer"
        ? null
        : previousCall &&
            input.phraseIndex <= previousCall.duePhraseIndex
          ? previousCall
          : null;
  const recentFingerprints = [
    ...(previousState?.phraseMemory?.recentFingerprints || []),
    selected.fingerprint,
  ].slice(-16);
  const state = {
    version: MATERIAL_VERSION,
    seed: input.seed,
    phraseIndex: input.phraseIndex,
    startStep: input.phraseIndex * STEPS_PER_PHRASE,
    tonality: input.tonality,
    trackDNA: input.trackDNA,
    gesture: selected.gesture,
    answerDirection: selected.answerDirection,
    motif: selected.motif,
    clocks: selected.clocks,
    mutatedLanes: selected.mutatedLanes,
    renewedLanes: selected.renewedLanes,
    kickPhrase: selected.kickPhrase,
    phrase: selected.phrase,
    phraseMemory: {
      residentMotif: selected.motif,
      previousGesture: selected.gesture,
      unresolvedCall,
      recentFingerprints,
      archivedMotifs: archiveForSelection(previousState, selected),
      restStreak:
        selected.gesture === "rest"
          ? (previousState?.phraseMemory?.restStreak || 0) + 1
          : 0,
    },
    selection: {
      selectedCandidateId: selected.id,
      selectedCandidateIndex: selected.candidateIndex,
      selectedCandidateScore: selected.score,
      bestCandidateScore: selection.bestScore,
      candidateCount: candidates.length,
      eligibleCandidateCount: selection.eligibleCandidateCount,
      samplingTemperature: selection.temperature,
      fallback: selection.fallback,
      measures: selected.measures,
      rejectionCount: candidates.filter((candidate) => !candidate.valid).length,
    },
  };
  return deepFreeze(state);
}

export function createMaterialState(rawInput) {
  const input = normalizeInput(null, rawInput);
  const candidates = generateMaterialCandidates(null, input);
  return stateFromSelection(
    null,
    input,
    candidates,
    selectCandidate(candidates, input),
  );
}

export function advanceMaterialState(previousState, rawInput) {
  if (!previousState || previousState.version !== MATERIAL_VERSION) {
    throw new TypeError(
      `previous material state must be a version ${MATERIAL_VERSION} state`,
    );
  }
  const input = normalizeInput(previousState, rawInput);
  const candidates = generateMaterialCandidates(previousState, input);
  return stateFromSelection(
    previousState,
    input,
    candidates,
    selectCandidate(candidates, input),
  );
}

export function traceMaterial(options) {
  const phraseCount = integer(
    options?.phraseCount ?? options?.inputs?.length,
    0,
  );
  if (phraseCount < 1 || phraseCount > 8192) {
    throw new RangeError("phraseCount must be an integer from 1 to 8192");
  }
  const startPhrase = integer(options.startPhrase, 0);
  const inputs = options.inputs || [];
  const inputFor = (phraseIndex) => {
    const windowOffset = phraseIndex - startPhrase;
    const supplied =
      windowOffset >= 0 && windowOffset < inputs.length
        ? inputs[windowOffset] || {}
        : {};
    return {
      seed: options.seed,
      trackDNA: options.trackDNA,
      phraseIndex,
      form:
        supplied.form ||
        options.formForPhrase?.(phraseIndex) ||
        options.form ||
        {},
      profile:
        supplied.profile ||
        options.profileForPhrase?.(phraseIndex) ||
        options.profile ||
        {},
      tonality:
        supplied.tonality ||
        options.tonalityForPhrase?.(phraseIndex) ||
        options.tonality ||
        "minor",
    };
  };
  const states = [];
  let state = options.initialState || null;
  if (state) {
    if (state.phraseIndex !== startPhrase - 1) {
      throw new RangeError(
        "initialState must describe the phrase before startPhrase",
      );
    }
    for (
      let phraseIndex = startPhrase;
      phraseIndex < startPhrase + phraseCount;
      phraseIndex += 1
    ) {
      state = advanceMaterialState(state, inputFor(phraseIndex));
      states.push(state);
    }
    return Object.freeze(states);
  }

  const endPhrase = startPhrase + phraseCount;
  state = createMaterialState(inputFor(0));
  if (startPhrase === 0) states.push(state);
  for (let phraseIndex = 1; phraseIndex < endPhrase; phraseIndex += 1) {
    state = advanceMaterialState(state, inputFor(phraseIndex));
    if (phraseIndex >= startPhrase) states.push(state);
  }
  return Object.freeze(states);
}

export function summarizeMaterialState(state) {
  if (!state) {
    return deepFreeze({
      gesture: null,
      motifLineageId: null,
      laneClocks: {},
      selectedCandidateScore: null,
      candidateCount: 0,
      eligibleCandidateCount: 0,
      samplingTemperature: null,
      kickPhrase: {
        id: null,
        priorId: null,
        agePhrases: 0,
        holdPhrases: 0,
        changed: false,
      },
    });
  }
  return deepFreeze({
    gesture: state.gesture,
    answerDirection: state.answerDirection,
    motifLineageId: state.motif.lineageId,
    motifParentLineageId: state.motif.parentLineageId,
    phraseFingerprint: state.phrase.fingerprint,
    laneClocks: Object.fromEntries(
      LANE_IDS.map((lane) => {
        const clock = state.clocks[lane];
        return [
          lane,
          {
            loopLength: clock.loopLength,
            hits: clock.hits,
            rotation: clock.rotation,
            phaseOrigin: clock.phaseOrigin,
            agePhrases: clock.agePhrases,
            mutationCount: clock.mutationCount,
          },
        ];
      }),
    ),
    selectedCandidateScore: state.selection.selectedCandidateScore,
    candidateCount: state.selection.candidateCount,
    eligibleCandidateCount: state.selection.eligibleCandidateCount,
    samplingTemperature: state.selection.samplingTemperature,
    kickPhrase: {
      id: state.kickPhrase.id,
      priorId: state.kickPhrase.priorId,
      agePhrases: state.kickPhrase.agePhrases,
      holdPhrases: state.kickPhrase.holdPhrases,
      changed: state.kickPhrase.changed,
    },
  });
}

export class MaterialPlanner {
  constructor(input) {
    this.state = createMaterialState(input);
  }

  advance(input) {
    this.state = advanceMaterialState(this.state, input);
    return this.state;
  }

  getState() {
    return this.state;
  }

  getSnapshot() {
    return summarizeMaterialState(this.state);
  }
}
