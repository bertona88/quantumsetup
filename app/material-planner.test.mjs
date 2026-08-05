import assert from "node:assert/strict";
import test from "node:test";

import { derivePhraseState } from "./emergent-form.js";
import { hash32 } from "./generative-utils.js";
import {
  GESTURES,
  GESTURE_TRANSITIONS,
  KICK_ARTICULATIONS,
  KICK_PHRASE_IDS,
  LANE_DOMAINS,
  LANE_GRAMMARS,
  MATERIAL_CANDIDATE_COUNT,
  MATERIAL_SCORE_BAND,
  MATERIAL_SCORE_FLOOR,
  MATERIAL_STRUCTURE_MIN_DISTANCE,
  MATERIAL_VERSION,
  MaterialPlanner,
  OPEN_HAT_MODES,
  PHRASE_BARS,
  SCORE_WEIGHTS,
  STEPS_PER_BAR,
  STEPS_PER_PHRASE,
  advanceMaterialState,
  createMaterialState,
  euclidean,
  generateMaterialCandidates,
  gestureProbabilities,
  materialCoreSignature,
  materialPhraseFingerprint,
  materialStructuralDistance,
  renderMaterialClock,
  renderOpenHatPattern,
  summarizeMaterialState,
  traceMaterial,
  validateMaterialCandidate,
} from "./material-planner.js";
import { createTrackDNA } from "./track-dna.js";

const PROFILE = Object.freeze({
  id: "hypnotic",
  density: 0.68,
  syncopation: 0.64,
  space: 0.42,
  metallic: 0.42,
  drive: 0.62,
});

const EXPECTED_GESTURES = Object.freeze([
  "repeat",
  "subtract",
  "add",
  "displace",
  "call",
  "answer",
  "rest",
  "recall",
]);

const EXPECTED_TRANSITIONS = Object.freeze({
  repeat: [0.24, 0.14, 0.12, 0.14, 0.14, 0.06, 0.1, 0.06],
  subtract: [0.22, 0.08, 0.14, 0.16, 0.16, 0.08, 0.1, 0.06],
  add: [0.18, 0.18, 0.08, 0.16, 0.16, 0.1, 0.08, 0.06],
  displace: [0.2, 0.14, 0.12, 0.1, 0.18, 0.1, 0.1, 0.06],
  call: [0.05, 0.05, 0.05, 0.05, 0.05, 0.6, 0.1, 0.05],
  answer: [0.24, 0.14, 0.14, 0.14, 0.12, 0.06, 0.1, 0.06],
  rest: [0.32, 0.08, 0.12, 0.1, 0.18, 0.08, 0.06, 0.06],
  recall: [0.34, 0.14, 0.1, 0.12, 0.12, 0.06, 0.06, 0.06],
});

const EXPECTED_LANE_DOMAINS = Object.freeze({
  kick: [16],
  clap: [16],
  hats: Array.from({ length: 25 }, (_, index) => index + 5),
  percussion: Array.from({ length: 25 }, (_, index) => index + 5),
  bass: [12, 15, 16, 18, 20, 24, 28, 32],
  synthFm: [7, 9, 11, 13, 15, 17, 19, 23, 29, 31],
  synthModal: [7, 9, 11, 13, 15, 17, 19, 23, 29, 31],
  synthString: [7, 9, 11, 13, 15, 17, 19, 23, 29, 31],
});

const LANE_IDS = Object.freeze(Object.keys(LANE_DOMAINS));
const RAW_PATTERN_LANES = Object.freeze([
  "clap",
  "hats",
  "percussion",
]);
const PRIME_LENGTHS = new Set([5, 7, 11, 13, 17, 19, 23, 29, 31]);
const TRIPLET_LENGTHS = new Set([6, 9, 12, 18, 24]);

function approximatelyEqual(actual, expected, epsilon = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} was not within ${epsilon} of ${expected}`,
  );
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return sum(values) / Math.max(1, values.length);
}

function groupProbability(probabilities, gestures) {
  return sum(gestures.map((gesture) => probabilities[gesture]));
}

function assertDeepFrozen(value, seen = new Set(), path = "value") {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} was mutable`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, seen, `${path}.${key}`);
  }
}

function circularGaps(pattern) {
  const positions = pattern
    .map((value, index) => (value ? index : -1))
    .filter((index) => index >= 0);
  if (positions.length === 0) return [];
  return positions.map((position, index) => {
    const next = positions[(index + 1) % positions.length];
    return (next - position + pattern.length) % pattern.length || pattern.length;
  });
}

function plannerInput(seed, phraseIndex, overrides = {}) {
  return {
    seed,
    trackDNA: createTrackDNA(seed),
    phraseIndex,
    form: derivePhraseState(seed, phraseIndex),
    profile: PROFILE,
    tonality: "minor",
    ...overrides,
  };
}

function expectedClockPattern(state, lane) {
  return renderMaterialClock(state.clocks[lane], state.phraseIndex);
}

function motifKey(motif) {
  return `${motif.lineageId}:${motif.events
    .map((event) => `${event.onset}.${event.degree}`)
    .join(",")}`;
}

function independentMotifDelta(previousMotif, nextMotif) {
  const previous = new Map(
    previousMotif.events.map((event) => [event.onset, event.degree]),
  );
  const next = new Map(
    nextMotif.events.map((event) => [event.onset, event.degree]),
  );
  const removed = [...previous.keys()].filter((onset) => !next.has(onset));
  const added = [...next.keys()].filter((onset) => !previous.has(onset));
  const changedDegrees = [...previous.entries()].filter(
    ([onset, degree]) => next.has(onset) && next.get(onset) !== degree,
  ).length;
  return {
    changedOnsets: Math.max(removed.length, added.length),
    changedDegrees,
  };
}

function cloneCandidate(candidate) {
  return structuredClone(candidate);
}

function assertPhraseSafety(candidate) {
  for (const lane of LANE_IDS) {
    const clock = candidate.clocks[lane];
    assert.ok(LANE_DOMAINS[lane].includes(clock.loopLength));
    assert.ok(Number.isSafeInteger(clock.hits));
    assert.ok(clock.hits >= 0 && clock.hits <= clock.loopLength);
    assert.ok(Number.isSafeInteger(clock.rotation));
    assert.ok(Number.isSafeInteger(clock.phaseOrigin));
    assert.ok(clock.holdPhrases >= 2 && clock.holdPhrases <= 8);
    assert.ok(clock.history.length <= 8);
  }

  assert.ok(candidate.mutatedLanes.length <= 2);
  assert.ok(candidate.renewedLanes.length <= 1);
  assert.ok(candidate.renewedLanes.every((lane) => lane === "kick"));
  assert.ok(candidate.mutation.onsetFraction <= 0.25);
  assert.ok(candidate.mutation.degreeFraction <= 0.25);
  for (const event of candidate.motif.events) {
    assert.ok(Number.isSafeInteger(event.onset));
    assert.ok(event.onset >= 0 && event.onset < 16);
    assert.ok(Number.isSafeInteger(event.degree));
    assert.ok(event.degree >= 0 && event.degree <= 6);
  }

  const patterns = candidate.phrase.patterns;
  assert.ok(OPEN_HAT_MODES.includes(candidate.phrase.openHatMode));
  assert.equal(
    candidate.phrase.openHatMode,
    candidate.clocks.hats.openHatMode,
  );
  assert.deepEqual(
    patterns.openHats,
    renderOpenHatPattern(
      candidate.clocks.hats,
      candidate.phraseIndex,
      candidate.form.intentionalRest === true,
    ),
  );
  for (const lane of [
    patterns.kick,
    patterns.clap,
    patterns.hats,
    patterns.openHats,
    patterns.percussion,
    patterns.bass,
    patterns.bassVacatedByAnchor,
    ...Object.values(patterns.synth),
  ]) {
    assert.equal(lane.length, STEPS_PER_PHRASE);
  }
  for (let offset = 0; offset < STEPS_PER_PHRASE; offset += 1) {
    assert.equal(
      Boolean(patterns.kick[offset] && patterns.bass[offset]),
      false,
      `kick/bass collision at ${offset}`,
    );
    assert.equal(
      Boolean(patterns.hats[offset] && patterns.openHats[offset]),
      false,
      `closed/open hat collision at ${offset}`,
    );
    const synthStarts = Object.values(patterns.synth).filter(
      (lane) => lane[offset],
    ).length;
    assert.ok(synthStarts <= 1, `synth collision at ${offset}`);
    if (patterns.kick[offset]) assert.equal(synthStarts, 0);
  }
  for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
    let starts = 0;
    for (const lane of Object.values(patterns.synth)) {
      starts += lane
        .slice(bar * STEPS_PER_BAR, (bar + 1) * STEPS_PER_BAR)
        .filter(Boolean).length;
    }
    assert.ok(starts <= 4, `bar ${bar} admitted ${starts} synth starts`);
  }

  for (const degree of candidate.phrase.degrees.bass.filter(
    Number.isFinite,
  )) {
    assert.ok(Number.isSafeInteger(degree) && degree >= 0 && degree <= 6);
  }
  for (const degrees of Object.values(candidate.phrase.degrees.synth)) {
    for (const degree of degrees.filter(Number.isFinite)) {
      assert.ok(Number.isSafeInteger(degree) && degree >= 0 && degree <= 10);
    }
  }
}

test("canonical Euclidean patterns are immutable, even, rotated, and validated", () => {
  assert.deepEqual(euclidean(4, 16), [
    1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0,
  ]);
  assert.deepEqual(euclidean(3, 8), [1, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(euclidean(5, 13), [
    1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0,
  ]);

  const base = euclidean(3, 8);
  assert.deepEqual(euclidean(3, 8, 1), [base.at(-1), ...base.slice(0, -1)]);
  assert.deepEqual(euclidean(3, 8, -1), [...base.slice(1), base[0]]);

  for (let steps = 1; steps <= 64; steps += 1) {
    for (let hits = 0; hits <= steps; hits += 1) {
      const pattern = euclidean(hits, steps, steps * 3 + hits);
      assert.equal(Object.isFrozen(pattern), true);
      assert.equal(pattern.length, steps);
      assert.equal(sum(pattern), hits);
      assert.ok(pattern.every((value) => value === 0 || value === 1));
      const gaps = circularGaps(pattern);
      if (gaps.length > 1) {
        assert.ok(
          Math.max(...gaps) - Math.min(...gaps) <= 1,
          `E(${hits},${steps}) had uneven gaps ${gaps.join(",")}`,
        );
      }
    }
  }

  const immutable = euclidean(4, 16);
  assert.throws(() => {
    immutable[0] = 0;
  }, TypeError);
  for (const args of [
    [1, 0],
    [1, 513],
    [1, 2.5],
    [-1, 8],
    [9, 8],
  ]) {
    assert.throws(() => euclidean(...args), RangeError);
  }
  assert.throws(() => euclidean(3, 8, 0.5), TypeError);
});

test("gesture grammar and candidate score weights preserve the authored contract", () => {
  assert.equal(MATERIAL_VERSION, "2.3.1");
  assert.equal(MATERIAL_CANDIDATE_COUNT, 12);
  assert.equal(MATERIAL_SCORE_FLOOR, 0.55);
  assert.equal(MATERIAL_SCORE_BAND, 0.2);
  assert.equal(PHRASE_BARS, 8);
  assert.equal(STEPS_PER_BAR, 16);
  assert.equal(STEPS_PER_PHRASE, 128);
  assert.deepEqual(GESTURES, EXPECTED_GESTURES);
  assert.deepEqual(Object.keys(GESTURE_TRANSITIONS), EXPECTED_GESTURES);

  for (const gesture of EXPECTED_GESTURES) {
    const row = GESTURE_TRANSITIONS[gesture];
    assert.deepEqual(
      Object.keys(row),
      EXPECTED_GESTURES,
      `${gesture} transition order changed`,
    );
    assert.deepEqual(
      EXPECTED_GESTURES.map((target) => row[target]),
      EXPECTED_TRANSITIONS[gesture],
    );
    approximatelyEqual(sum(Object.values(row)), 1);
    assert.ok(Object.values(row).every((probability) => probability > 0));
    assert.equal(Object.isFrozen(row), true);
  }

  assert.deepEqual(SCORE_WEIGHTS, {
    grooveContinuity: 0.22,
    macroFit: 0.18,
    kickBassSeparation: 0.16,
    motifContinuity: 0.14,
    novelty: 0.12,
    orchestration: 0.1,
    phaseInterest: 0.08,
  });
  approximatelyEqual(sum(Object.values(SCORE_WEIGHTS)), 1);
  assert.deepEqual(LANE_DOMAINS, EXPECTED_LANE_DOMAINS);
  assert.deepEqual(Object.keys(LANE_GRAMMARS), Object.keys(LANE_DOMAINS));
  assert.ok(
    Object.values(LANE_GRAMMARS).every(
      (grammars) => grammars.length > 0 && new Set(grammars).size === grammars.length,
    ),
  );
  assertDeepFrozen(LANE_DOMAINS);
  assert.deepEqual(OPEN_HAT_MODES, [
    "offbeat-full",
    "offbeat-pair",
    "offbeat-alternating",
    "offbeat-tail",
    "closed-only",
  ]);
  assertDeepFrozen(OPEN_HAT_MODES);
  assert.deepEqual(KICK_PHRASE_IDS, [
    "anchor",
    "turnaround-pickup",
    "breathing",
    "rolling-pressure",
  ]);
  assert.deepEqual(KICK_ARTICULATIONS, ["anchor", "pickup", "roll"]);

  const baseline = gestureProbabilities("repeat");
  const novelty = gestureProbabilities("repeat", { noveltyDebt: 1 });
  const fatigue = gestureProbabilities("repeat", { fatigue: 1 });
  const salience = gestureProbabilities("repeat", { motifSalience: 1 });
  const release = gestureProbabilities("repeat", { release: true });
  const climax = gestureProbabilities("repeat", { climax: true });
  for (const probabilities of [
    baseline,
    novelty,
    fatigue,
    salience,
    release,
    climax,
  ]) {
    approximatelyEqual(sum(Object.values(probabilities)), 1);
    assert.equal(Object.isFrozen(probabilities), true);
  }
  for (const gesture of ["add", "displace", "call"]) {
    assert.ok(novelty[gesture] > baseline[gesture]);
  }
  for (const gesture of ["subtract", "rest"]) {
    assert.ok(fatigue[gesture] > baseline[gesture]);
  }
  for (const gesture of ["repeat", "answer", "recall"]) {
    assert.ok(salience[gesture] > baseline[gesture]);
  }
  for (const gesture of ["rest", "recall"]) {
    assert.ok(release[gesture] > baseline[gesture]);
  }
  for (const gesture of ["add", "displace", "answer"]) {
    assert.ok(climax[gesture] > baseline[gesture]);
  }
});

test("kick phrases stay bar-aligned and realize the approved curated vocabulary", () => {
  const seed = 7;
  const trace = traceMaterial({
    seed,
    trackDNA: createTrackDNA(seed),
    phraseCount: 64,
    formForPhrase: (phraseIndex) => derivePhraseState(seed, phraseIndex),
    profile: PROFILE,
    tonality: "minor",
  });
  const examples = new Map();
  for (const state of trace) {
    if (!examples.has(state.kickPhrase.id)) {
      examples.set(state.kickPhrase.id, state);
    }
  }
  assert.deepEqual([...examples.keys()].sort(), [...KICK_PHRASE_IDS].sort());
  const expected = {
    anchor: { hits: 32, pickup: 0, roll: 0 },
    "turnaround-pickup": { hits: 34, pickup: 2, roll: 0 },
    breathing: { hits: 30, pickup: 2, roll: 0 },
    "rolling-pressure": { hits: 36, pickup: 0, roll: 8 },
  };
  for (const [id, state] of examples) {
    const onsets = state.phrase.patterns.kick.flatMap(
      (active, offset) => (active ? [offset] : []),
    );
    assert.equal(onsets.length, expected[id].hits);
    assert.equal(
      state.phrase.kickArticulations.filter((value) => value === "pickup")
        .length,
      expected[id].pickup,
    );
    assert.equal(
      state.phrase.kickArticulations.filter((value) => value === "roll").length,
      expected[id].roll,
    );
    for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
      assert.equal(state.phrase.patterns.kick[bar * STEPS_PER_BAR], true);
    }
    for (let index = 1; index < onsets.length; index += 1) {
      assert.ok(onsets[index] - onsets[index - 1] >= 2);
    }
    const rawBass = expectedClockPattern(state, "bass");
    const vacatedAnchors =
      state.phrase.patterns.bassVacatedByAnchor.filter(Boolean).length;
    assert.equal(
      rawBass.filter(Boolean).length -
        state.phrase.patterns.bass.filter(Boolean).length,
      vacatedAnchors,
      `${id} lost bass outside its declared kick relation`,
    );
    let sourceCursor = 0;
    rawBass.forEach((active, offset) => {
      if (!active) return;
      const expectedDegree =
        state.motif.events[sourceCursor % state.motif.events.length].degree;
      if (state.phrase.patterns.bassVacatedByAnchor[offset]) {
        assert.equal(
          state.phrase.degrees.bassVacatedByAnchor[offset],
          expectedDegree,
          `${id} changed the source motif degree for anchor vacancy ${offset}`,
        );
      }
      sourceCursor += 1;
    });
  }
});

test("bass character biases density without exposing or fixing note masks", () => {
  const densities = {
    sub: [],
    rolling: [],
    acid: [],
    syncopated: [],
  };
  for (let seed = 0; seed < 128; seed += 1) {
    const trackDNA = createTrackDNA(seed);
    for (const character of Object.keys(densities)) {
      const state = createMaterialState({
        seed,
        trackDNA,
        phraseIndex: 0,
        form: derivePhraseState(seed, 0),
        profile: {
          ...PROFILE,
          performanceBassCharacter: character,
        },
        tonality: "minor",
      });
      densities[character].push(
        state.clocks.bass.hits / state.clocks.bass.loopLength,
      );
    }
  }
  assert.ok(mean(densities.sub) < mean(densities.syncopated));
  assert.ok(mean(densities.syncopated) < mean(densities.rolling));
  assert.ok(mean(densities.rolling) < mean(densities.acid));
  assert.ok(Math.max(...densities.rolling) >= 0.35);
  assert.ok(Math.max(...densities.acid) >= 0.4);
});

test("syncopated bass remains resident after authoritative kick collision relocation", () => {
  let nonRestPhrases = 0;
  let zeroBassPhrases = 0;
  let maximumZeroRun = 0;
  for (let seed = 0; seed < 64; seed += 1) {
    const trackDNA = createTrackDNA(seed);
    const trace = traceMaterial({
      seed,
      trackDNA,
      phraseCount: 48,
      formForPhrase: (phraseIndex) => derivePhraseState(seed, phraseIndex),
      profile: {
        ...PROFILE,
        performanceBassCharacter: "syncopated",
      },
      tonality: "minor",
    });
    let zeroRun = 0;
    for (const state of trace) {
      const rawBass = expectedClockPattern(state, "bass");
      const emittedBass = state.phrase.patterns.bass;
      assert.equal(
        rawBass.filter(Boolean).length - emittedBass.filter(Boolean).length,
        state.phrase.patterns.bassVacatedByAnchor.filter(Boolean).length,
        `seed ${seed} phrase ${state.phraseIndex} lost bass without anchor provenance`,
      );
      if (state.gesture === "rest" || state.form?.intentionalRest) {
        zeroRun = 0;
        continue;
      }
      nonRestPhrases += 1;
      if (emittedBass.some(Boolean)) {
        zeroRun = 0;
      } else {
        zeroBassPhrases += 1;
        zeroRun += 1;
        maximumZeroRun = Math.max(maximumZeroRun, zeroRun);
      }
    }
  }
  assert.ok(nonRestPhrases > 0);
  assert.equal(zeroBassPhrases, 0);
  assert.equal(maximumZeroRun, 0);
});

test("syncopated Track DNA also avoids kick-isomorphic bass clocks", () => {
  let matchingSeeds = 0;
  for (let seed = 0; seed < 256; seed += 1) {
    const trackDNA = createTrackDNA(seed);
    if (trackDNA.bassBehavior !== "syncopated-stabs") continue;
    matchingSeeds += 1;
    const trace = traceMaterial({
      seed,
      trackDNA,
      phraseCount: 16,
      formForPhrase: (phraseIndex) => derivePhraseState(seed, phraseIndex),
      profile: PROFILE,
      tonality: "minor",
    });
    for (const state of trace) {
      assert.notEqual(
        state.clocks.bass.hits * 4,
        state.clocks.bass.loopLength,
        `seed ${seed} phrase ${state.phraseIndex} entered a quarter-grid attractor`,
      );
    }
  }
  assert.ok(matchingSeeds >= 32);
});

test("candidate generation is deterministic, order-independent, bounded, and collision-safe", () => {
  const input = plannerInput(
    "0123456789abcdeffedcba9876543210",
    0,
  );
  const first = generateMaterialCandidates(null, input);
  const replay = generateMaterialCandidates(null, plannerInput(
    "0123456789abcdeffedcba9876543210",
    0,
  ));
  const reversed = generateMaterialCandidates(
    null,
    plannerInput("0123456789abcdeffedcba9876543210", 0),
    Array.from(
      { length: MATERIAL_CANDIDATE_COUNT },
      (_, index) => MATERIAL_CANDIDATE_COUNT - 1 - index,
    ),
  );
  assert.deepEqual(replay, first);
  assert.deepEqual(reversed, first);
  assert.equal(first.length, MATERIAL_CANDIDATE_COUNT);
  assert.deepEqual(
    first.map((candidate) => candidate.candidateIndex),
    Array.from({ length: MATERIAL_CANDIDATE_COUNT }, (_, index) => index),
  );
  assert.equal(
    new Set(first.map((candidate) => materialCoreSignature(candidate.phrase)))
      .size,
    MATERIAL_CANDIDATE_COUNT,
    "the candidate bank collapsed distinct indices onto the same core material",
  );
  assertDeepFrozen(first);

  for (const candidate of first) {
    assertPhraseSafety(candidate);
    assert.ok(Number.isFinite(candidate.score));
    assert.ok(candidate.score >= 0 && candidate.score <= 1);
    for (const measure of Object.values(candidate.measures)) {
      assert.ok(Number.isFinite(measure));
      assert.ok(measure >= 0 && measure <= 1);
    }
    approximatelyEqual(
      candidate.score,
      Object.entries(SCORE_WEIGHTS).reduce(
        (total, [name, weight]) =>
          total + candidate.measures[name] * weight,
        0,
      ),
    );
    assert.equal(
      candidate.valid,
      candidate.rejectionReasons.length === 0,
    );
  }
  assert.ok(first.some((candidate) => candidate.valid));

  for (const invalidOrder of [
    [],
    Array(MATERIAL_CANDIDATE_COUNT).fill(0),
    Array.from({ length: MATERIAL_CANDIDATE_COUNT }, (_, index) => index + 1),
  ]) {
    assert.throws(
      () => generateMaterialCandidates(null, input, invalidOrder),
      RangeError,
    );
  }

  const prior = createMaterialState(plannerInput(3, 0));
  const nextCandidates = generateMaterialCandidates(
    prior,
    plannerInput(3, 1),
  );
  const reversedNextCandidates = generateMaterialCandidates(
    prior,
    plannerInput(3, 1),
    Array.from(
      { length: MATERIAL_CANDIDATE_COUNT },
      (_, index) => MATERIAL_CANDIDATE_COUNT - 1 - index,
    ),
  );
  assert.deepEqual(
    reversedNextCandidates,
    nextCandidates,
    "candidate enumeration order changed a populated-memory candidate bank",
  );
  assert.ok(
    new Set(
      nextCandidates.map(
        (candidate) => candidate.measures.orchestration,
      ),
    ).size > 1,
    "orchestration scoring collapsed to a constant after safety capping",
  );
});

test("emitted-material fingerprints include every lane, voice, and degree but exclude lineage", () => {
  const candidate = generateMaterialCandidates(
    null,
    plannerInput("fingerprint-coverage", 0),
  ).find((entry) => entry.valid);
  assert.ok(candidate);
  const baseline = materialPhraseFingerprint(candidate.phrase);
  assert.equal(baseline, candidate.fingerprint);

  const toggledOpenHat = cloneCandidate(candidate.phrase);
  toggledOpenHat.patterns.openHats[1] =
    !toggledOpenHat.patterns.openHats[1];
  assert.notEqual(materialPhraseFingerprint(toggledOpenHat), baseline);

  const changedVoice = cloneCandidate(candidate.phrase);
  const percussionOffset = changedVoice.patterns.percussion.findIndex(Boolean);
  assert.ok(percussionOffset >= 0);
  changedVoice.patterns.percussionVoices[percussionOffset] =
    changedVoice.patterns.percussionVoices[percussionOffset] === "rim"
      ? "shaker"
      : "rim";
  assert.notEqual(materialPhraseFingerprint(changedVoice), baseline);

  const changedDegree = cloneCandidate(candidate.phrase);
  const degreeOffset = changedDegree.degrees.bass.findIndex(Number.isFinite);
  assert.ok(degreeOffset >= 0);
  changedDegree.degrees.bass[degreeOffset] += 1;
  assert.notEqual(materialPhraseFingerprint(changedDegree), baseline);
});

test("candidate validator rejects crafted unsafe material for every safety class", () => {
  const candidate = generateMaterialCandidates(
    null,
    plannerInput("negative-validator-fixtures", 0),
  ).find((entry) => entry.valid);
  assert.ok(candidate);
  const reasonsFor = (mutate) => {
    const unsafe = cloneCandidate(candidate);
    mutate(unsafe);
    return validateMaterialCandidate(unsafe);
  };

  assert.ok(
    reasonsFor((unsafe) => unsafe.phrase.patterns.hats.fill(true))
      .includes("density:hats"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.phrase.patterns.openHats[0] = true;
    }).includes("open-hat-vocabulary"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      const offset = unsafe.phrase.patterns.percussion.findIndex(Boolean);
      unsafe.phrase.patterns.percussionVoices[offset] = "unsafe-voice";
    }).includes("voice:percussion"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.motif.events[0].degree = 99;
    }).includes("pitch-bound"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.phrase.bassKickRelation = "counter";
      const offset = unsafe.phrase.patterns.kick.findIndex(Boolean);
      unsafe.phrase.patterns.bass[offset] = true;
    }).includes("kick-bass-relation"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      const offset = unsafe.phrase.patterns.kick.findIndex(Boolean);
      unsafe.phrase.patterns.synth.fm[offset] = true;
    }).includes("kick-synth-collision"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      const offset = unsafe.phrase.patterns.kick.findIndex((active) => !active);
      unsafe.phrase.patterns.synth.fm[offset] = true;
      unsafe.phrase.patterns.synth.modal[offset] = true;
    }).includes("voice:synth-collision"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.clocks.kick.loopLength = 17;
    }).includes("kick-anchor-clock"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.kickPhrase.id = "racing-excursion";
    }).includes("kick-phrase-family"),
  );
  assert.ok(
    reasonsFor((unsafe) => unsafe.phrase.patterns.kick.fill(false))
      .includes("silence"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.mutatedLanes = ["clap", "hats", "percussion"];
    }).includes("structural-mutation-budget"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.mutation.onsetFraction = 0.5;
    }).includes("motif-mutation-budget"),
  );
  assert.ok(
    reasonsFor((unsafe) => {
      unsafe.score = Number.NaN;
    }).includes("dsp-safety"),
  );
});

test("planner calls are pure, honor explicit zero profiles, and never freeze caller input", () => {
  const raw = {
    seed: "caller-owned-input",
    trackDNA: {
      grooveFamily: "straight-pressure",
      formPhenotype: "machine-funk",
    },
    phraseIndex: 0,
    form: {
      noveltyDebt: 0,
      fatigue: 0,
      motifSalience: 0,
    },
    profile: {
      density: 0,
      syncopation: 0,
      space: 0,
      metallic: 0,
    },
    tonality: "minor",
  };
  const before = JSON.parse(JSON.stringify(raw));
  createMaterialState(raw);
  assert.deepEqual(raw, before);
  assert.equal(Object.isFrozen(raw), false);
  assert.equal(Object.isFrozen(raw.trackDNA), false);
  assert.equal(Object.isFrozen(raw.form), false);
  assert.equal(Object.isFrozen(raw.profile), false);

  let zeroProfilesChangedMaterial = false;
  for (let seed = 0; seed < 24; seed += 1) {
    const common = {
      seed: `explicit-zero-${seed}`,
      trackDNA: {
        grooveFamily: "straight-pressure",
        formPhenotype: "machine-funk",
      },
      phraseIndex: 0,
      form: {},
      tonality: "minor",
    };
    const zero = createMaterialState({
      ...common,
      profile: {
        density: 0,
        syncopation: 0,
        space: 0,
        metallic: 0,
      },
    });
    const omitted = createMaterialState({ ...common, profile: {} });
    if (
      JSON.stringify(zero.phrase.patterns) !==
      JSON.stringify(omitted.phrase.patterns)
    ) {
      zeroProfilesChangedMaterial = true;
      break;
    }
  }
  assert.equal(
    zeroProfilesChangedMaterial,
    true,
    "explicit zero profile values were treated as missing defaults",
  );
});

test("state creation, incremental advance, batch replay, summaries, and class wrapper agree", () => {
  const seed = 42;
  const phraseCount = 24;
  const inputs = Array.from({ length: phraseCount }, (_, phraseIndex) => ({
    form: derivePhraseState(seed, phraseIndex),
    profile: PROFILE,
    tonality: phraseIndex >= 16 ? "neutral" : "minor",
  }));
  const options = {
    seed,
    trackDNA: createTrackDNA(seed),
    phraseCount,
    inputs,
  };
  const trace = traceMaterial(options);
  assert.deepEqual(traceMaterial(options), trace);
  assert.equal(Object.isFrozen(trace), true);

  let incremental = createMaterialState({
    seed,
    trackDNA: options.trackDNA,
    phraseIndex: 0,
    ...inputs[0],
  });
  const initialBeforeAdvance = JSON.stringify(incremental);
  for (let phraseIndex = 1; phraseIndex < phraseCount; phraseIndex += 1) {
    incremental = advanceMaterialState(incremental, {
      seed,
      trackDNA: options.trackDNA,
      phraseIndex,
      ...inputs[phraseIndex],
    });
  }
  assert.deepEqual(incremental, trace.at(-1));
  assert.equal(JSON.stringify(trace[0]), initialBeforeAdvance);

  for (const state of trace) {
    assertDeepFrozen(state);
    assert.equal(state.version, MATERIAL_VERSION);
    assert.equal(state.startStep, state.phraseIndex * STEPS_PER_PHRASE);
    assert.equal(state.selection.candidateCount, MATERIAL_CANDIDATE_COUNT);
    assert.ok(state.selection.eligibleCandidateCount >= 1);
    assert.ok(state.selection.eligibleCandidateCount <= MATERIAL_CANDIDATE_COUNT);
    assert.ok(state.selection.selectedCandidateScore >= MATERIAL_SCORE_FLOOR);
    assert.ok(
      state.selection.selectedCandidateScore >=
        state.selection.bestCandidateScore - MATERIAL_SCORE_BAND - 1e-12,
    );
    assert.ok(state.selection.samplingTemperature >= 0.35);
    assert.ok(state.selection.samplingTemperature <= 0.85);
    assert.equal(state.selection.fallback, false);
    const summary = summarizeMaterialState(state);
    assertDeepFrozen(summary);
    assert.equal(summary.gesture, state.gesture);
    assert.equal(summary.motifLineageId, state.motif.lineageId);
    assert.equal(summary.phraseFingerprint, state.phrase.fingerprint);
    assert.equal(summary.openHatMode, state.phrase.openHatMode);
    assert.equal(
      summary.laneClocks.hats.openHatMode,
      state.clocks.hats.openHatMode,
    );
    assert.equal(summary.candidateCount, MATERIAL_CANDIDATE_COUNT);
  }
  assertDeepFrozen(summarizeMaterialState(null));

  const planner = new MaterialPlanner({
    seed,
    trackDNA: options.trackDNA,
    phraseIndex: 0,
    ...inputs[0],
  });
  assert.deepEqual(planner.getState(), trace[0]);
  assert.deepEqual(planner.getSnapshot(), summarizeMaterialState(trace[0]));
  assert.deepEqual(
    planner.advance({
      seed,
      trackDNA: options.trackDNA,
      phraseIndex: 1,
      ...inputs[1],
    }),
    trace[1],
  );

  assert.throws(() => createMaterialState(null), TypeError);
  assert.throws(
    () => createMaterialState(plannerInput(seed, -1)),
    RangeError,
  );
  assert.throws(
    () =>
      advanceMaterialState(trace[0], {
        ...plannerInput(seed, 2),
        phraseIndex: 2,
      }),
    RangeError,
  );
  assert.throws(() => advanceMaterialState({}, plannerInput(seed, 1)), TypeError);
  assert.throws(() => traceMaterial({ seed, phraseCount: 0 }), RangeError);
  assert.throws(() => traceMaterial({ seed, phraseCount: 8193 }), RangeError);
});

test("absolute clock phase and material identity continue across the 192-bar observation boundary", () => {
  const seed = 7;
  const trace = traceMaterial({
    seed,
    trackDNA: createTrackDNA(seed),
    phraseCount: 30,
    formForPhrase: (phraseIndex) => derivePhraseState(seed, phraseIndex),
    profile: PROFILE,
    tonality: "minor",
  });

  for (const state of trace) {
    assert.equal(state.clocks.kick.loopLength, 16);
    assert.equal(state.clocks.kick.hits, 4);
    assert.equal(state.clocks.kick.rotation, 0);
    assert.ok(KICK_PHRASE_IDS.includes(state.kickPhrase.id));
    for (const lane of RAW_PATTERN_LANES) {
      const renderedPattern = state.phrase.patterns[lane];
      const expectedPattern = expectedClockPattern(state, lane).map(
        (active, offset) =>
          lane === "hats" && state.phrase.patterns.openHats[offset]
            ? false
            : active,
      );
      assert.deepEqual(
        renderedPattern,
        expectedPattern,
        `${lane} lost absolute phase at phrase ${state.phraseIndex}`,
      );
    }
  }

  const beforeBoundary = trace[23];
  const atBoundary = trace[24];
  assert.equal(beforeBoundary.startStep, 23 * STEPS_PER_PHRASE);
  assert.equal(atBoundary.startStep, 192 * STEPS_PER_BAR);
  const changed = LANE_IDS.filter(
    (lane) =>
      beforeBoundary.clocks[lane].id !== atBoundary.clocks[lane].id,
  ).sort();
  assert.deepEqual(
    changed,
    [...atBoundary.mutatedLanes, ...atBoundary.renewedLanes].sort(),
  );
  assert.ok(changed.length <= 2);
  assert.ok(changed.length < LANE_IDS.length);
  for (const lane of LANE_IDS.filter((candidate) => !changed.includes(candidate))) {
    assert.equal(
      atBoundary.clocks[lane].phaseOrigin,
      beforeBoundary.clocks[lane].phaseOrigin,
    );
    assert.equal(atBoundary.clocks[lane].id, beforeBoundary.clocks[lane].id);
  }

  const replayedWindow = traceMaterial({
    seed,
    trackDNA: createTrackDNA(seed),
    startPhrase: 24,
    phraseCount: 6,
    formForPhrase: (phraseIndex) => derivePhraseState(seed, phraseIndex),
    profile: PROFILE,
    tonality: "minor",
  });
  assert.deepEqual(
    replayedWindow,
    trace.slice(24, 30),
    "startPhrase reset material instead of replaying to the requested window",
  );
});

test("open-hat vocabulary is varied, deterministic, and resident with the hats clock", () => {
  const reachedModes = new Set();
  let residentComparisons = 0;
  let residentModeChanges = 0;
  let fullPhrases = 0;
  let audiblePhrases = 0;
  for (let seed = 0; seed < 32; seed += 1) {
    const trackDNA = createTrackDNA(seed);
    let state = null;
    for (let phraseIndex = 0; phraseIndex < 24; phraseIndex += 1) {
      const form = derivePhraseState(seed, phraseIndex);
      const previous = state;
      const input = {
        seed,
        trackDNA,
        phraseIndex,
        form,
        profile: PROFILE,
        tonality: "minor",
      };
      state = state
        ? advanceMaterialState(state, input)
        : createMaterialState(input);
      const mode = state.phrase.openHatMode;
      reachedModes.add(mode);
      assert.equal(mode, state.clocks.hats.openHatMode);
      assert.deepEqual(
        state.phrase.patterns.openHats,
        renderOpenHatPattern(
          state.clocks.hats,
          phraseIndex,
          form.intentionalRest === true,
        ),
      );
      if (!form.intentionalRest) {
        const count = state.phrase.patterns.openHats.filter(Boolean).length;
        audiblePhrases += 1;
        fullPhrases += Number(mode === "offbeat-full");
        if (mode === "offbeat-full") assert.equal(count, 32);
        if (mode === "offbeat-pair" || mode === "offbeat-alternating") {
          assert.equal(count, 16);
        }
        if (mode === "offbeat-tail") assert.ok([8, 16].includes(count));
        if (mode === "closed-only") assert.equal(count, 0);
      }
      if (previous?.clocks.hats.id === state.clocks.hats.id) {
        residentComparisons += 1;
        residentModeChanges += Number(
          previous.phrase.openHatMode !== state.phrase.openHatMode,
        );
      }
    }
  }
  assert.deepEqual([...reachedModes].sort(), [...OPEN_HAT_MODES].sort());
  assert.ok(residentComparisons > 500);
  assert.equal(residentModeChanges, 0);
  assert.ok(fullPhrases / audiblePhrases > 0.1);
  assert.ok(fullPhrases / audiblePhrases < 0.4);
});

test("Track DNA creates statistically distinct clock dialects and patient hold times", () => {
  const families = [
    "straight-pressure",
    "rolling-syncopation",
    "triplet-weave",
    "broken-machine",
    "swung-motor",
  ];
  const metrics = {};
  for (const grooveFamily of families) {
    const totals = {
      nearSixteen: 0,
      triplet: 0,
      prime: 0,
      odd: 0,
      clocks: 0,
    };
    for (let seed = 0; seed < 192; seed += 1) {
      const state = createMaterialState({
        seed: `${grooveFamily}-${seed}`,
        trackDNA: {
          grooveFamily,
          formPhenotype: "machine-funk",
        },
        phraseIndex: 0,
        form: {},
        profile: PROFILE,
      });
      for (const lane of ["clap", "hats", "percussion", "bass"]) {
        const length = state.clocks[lane].loopLength;
        totals.nearSixteen += Number(Math.abs(length - 16) <= 1);
        totals.triplet += Number(TRIPLET_LENGTHS.has(length));
        totals.prime += Number(PRIME_LENGTHS.has(length));
        totals.odd += Number(length % 2 === 1);
        totals.clocks += 1;
      }
    }
    metrics[grooveFamily] = {
      nearSixteen: totals.nearSixteen / totals.clocks,
      triplet: totals.triplet / totals.clocks,
      prime: totals.prime / totals.clocks,
      odd: totals.odd / totals.clocks,
    };
  }
  assert.ok(
    metrics["straight-pressure"].nearSixteen >
      Math.max(
        ...families
          .filter((family) => family !== "straight-pressure")
          .map((family) => metrics[family].nearSixteen),
      ),
  );
  assert.ok(
    metrics["triplet-weave"].triplet >
      Math.max(
        ...families
          .filter((family) => family !== "triplet-weave")
          .map((family) => metrics[family].triplet),
      ),
  );
  assert.ok(
    metrics["broken-machine"].prime >
      Math.max(
        ...families
          .filter((family) => family !== "broken-machine")
          .map((family) => metrics[family].prime),
      ),
  );
  assert.ok(
    metrics["swung-motor"].odd >
      Math.max(
        ...families
          .filter((family) => family !== "swung-motor")
          .map((family) => metrics[family].odd),
      ),
  );

  const meanHold = (formPhenotype) => {
    let total = 0;
    let count = 0;
    for (let seed = 0; seed < 192; seed += 1) {
      const state = createMaterialState({
        seed: `${formPhenotype}-${seed}`,
        trackDNA: {
          grooveFamily: "straight-pressure",
          formPhenotype,
        },
        phraseIndex: 0,
        form: {},
        profile: PROFILE,
      });
      for (const [lane, clock] of Object.entries(state.clocks)) {
        if (lane === "kick") continue;
        total += clock.holdPhrases;
        count += 1;
      }
    }
    return total / count;
  };
  assert.ok(
    meanHold("patient-hypnosis") > meanHold("pressure-ratchet") + 1.5,
  );

  const observedMeanResidence = (formPhenotype) => {
    const completedRuns = [];
    for (let seed = 0; seed < 16; seed += 1) {
      let state = null;
      const liveRuns = {};
      for (let phraseIndex = 0; phraseIndex < 64; phraseIndex += 1) {
        const input = {
          seed: `observed-${formPhenotype}-${seed}`,
          trackDNA: {
            grooveFamily: "straight-pressure",
            formPhenotype,
          },
          phraseIndex,
          form: derivePhraseState(seed, phraseIndex),
          profile: PROFILE,
        };
        state = state
          ? advanceMaterialState(state, input)
          : createMaterialState(input);
        for (const [lane, clock] of Object.entries(state.clocks)) {
          if (lane === "kick") continue;
          const run = liveRuns[lane];
          if (!run || run.id !== clock.id) {
            if (run) completedRuns.push(run.phrases);
            liveRuns[lane] = { id: clock.id, phrases: 1 };
          } else {
            run.phrases += 1;
          }
        }
      }
    }
    return mean(completedRuns);
  };
  assert.ok(
    observedMeanResidence("patient-hypnosis") >
      observedMeanResidence("pressure-ratchet") + 0.35,
    "patient metadata did not produce longer observed clock residency",
  );
});

test("candidate sampling explores eligible alternatives instead of always taking the maximum", () => {
  const selectedIndices = new Set();
  let nonMaximumSelections = 0;
  for (let seed = 0; seed < 128; seed += 1) {
    const input = {
      seed,
      trackDNA: createTrackDNA(seed),
      phraseIndex: 0,
      form: {
        noveltyDebt: (seed % 10) / 10,
        fatigue: 0.3,
        motifSalience: 0.6,
      },
      profile: PROFILE,
    };
    const candidates = generateMaterialCandidates(null, input);
    const state = createMaterialState(input);
    const valid = candidates.filter((candidate) => candidate.valid);
    const bestScore = Math.max(...valid.map((candidate) => candidate.score));
    const scoreEligible = valid
      .filter(
        (candidate) =>
          candidate.score >= MATERIAL_SCORE_FLOOR &&
          candidate.score >= bestScore - MATERIAL_SCORE_BAND,
      )
      .sort(
        (left, right) =>
          right.score - left.score || left.id - right.id,
      );
    const pruned = [];
    for (const candidate of scoreEligible) {
      if (
        pruned.every(
          (accepted) =>
            materialStructuralDistance(candidate.phrase, accepted.phrase) >=
            MATERIAL_STRUCTURE_MIN_DISTANCE,
        )
      ) {
        pruned.push(candidate);
      }
    }
    const eligible = (pruned.length > 0 ? pruned : scoreEligible.slice(0, 1))
      .sort((left, right) => left.id - right.id);
    assert.equal(state.selection.eligibleCandidateCount, eligible.length);
    assert.ok(
      eligible.some(
        (candidate) =>
          candidate.id === state.selection.selectedCandidateId,
      ),
    );
    const temperature = state.selection.samplingTemperature;
    const weights = eligible.map((candidate) =>
      Math.exp((candidate.score - bestScore) / temperature),
    );
    const totalWeight = sum(weights);
    const target =
      (hash32(seed, 0, "candidate-softmax-selection") >>> 0) / 4294967296;
    let cursor = 0;
    let expected = eligible.at(-1);
    for (let index = 0; index < eligible.length; index += 1) {
      cursor += weights[index] / totalWeight;
      if (target < cursor || index === eligible.length - 1) {
        expected = eligible[index];
        break;
      }
    }
    assert.equal(state.selection.selectedCandidateId, expected.id);
    selectedIndices.add(state.selection.selectedCandidateIndex);
    nonMaximumSelections += Number(
      state.selection.selectedCandidateScore <
        state.selection.bestCandidateScore - 1e-12,
    );
  }
  assert.ok(selectedIndices.size >= 8);
  assert.ok(nonMaximumSelections >= 32);

  const temperatureFor = (noveltyDebt, formPhenotype) =>
    createMaterialState({
      seed: `temperature-${noveltyDebt}-${formPhenotype}`,
      trackDNA: {
        grooveFamily: "straight-pressure",
        formPhenotype,
      },
      phraseIndex: 0,
      form: { noveltyDebt },
      profile: PROFILE,
    }).selection.samplingTemperature;
  assert.ok(
    temperatureFor(1, "machine-funk") >
      temperatureFor(0, "machine-funk"),
  );
  assert.ok(
    temperatureFor(0.5, "pressure-ratchet") >
      temperatureFor(0.5, "patient-hypnosis"),
  );
});

test("128 trajectories over 384 bars satisfy the material long-scan contract", () => {
  const phraseCount = 384 / PHRASE_BARS;
  const lookaheadPhrases = 4;
  const reachedGestures = new Set();
  const reachedAnswerDirections = new Set();
  const reachedKickPhrases = new Set();
  const selectedCandidateIndices = new Set();
  let totalPhrases = 0;
  let kickPhraseTransitions = 0;
  let answeredCalls = 0;
  let nonMaximumSelections = 0;
  let maximumRestStreak = 0;
  let maximumNonKickClockRun = 0;

  for (let seed = 0; seed < 128; seed += 1) {
    const forms = Array.from(
      { length: phraseCount + lookaheadPhrases },
      (_, phraseIndex) => derivePhraseState(seed, phraseIndex),
    );
    const trace = traceMaterial({
      seed,
      trackDNA: createTrackDNA(seed),
      phraseCount: phraseCount + lookaheadPhrases,
      inputs: forms.map((form) => ({
        form,
        profile: PROFILE,
        tonality: "minor",
      })),
    });
    assert.equal(trace.length, phraseCount + lookaheadPhrases);

    assert.ok(
      trace.slice(0, phraseCount).every(
        (state) =>
          state.clocks.kick.loopLength === 16 &&
          state.clocks.kick.hits === 4 &&
          state.clocks.kick.rotation === 0,
      ),
      `seed ${seed} allowed the foundation kick to leave the bar`,
    );

    const clockRuns = {};
    let persistentNonSixteen = false;
    const seenFingerprints = new Set();

    const laneHasAudibleOnset = (state, lane) => {
      if (lane === "hats") {
        return (
          state.phrase.patterns.hats.some(Boolean) ||
          state.phrase.patterns.openHats.some(Boolean)
        );
      }
      if (lane.startsWith("synth")) {
        const engine = {
          synthFm: "fm",
          synthModal: "modal",
          synthString: "string",
        }[lane];
        return state.phrase.patterns.synth[engine].some(Boolean);
      }
      return state.phrase.patterns[lane].some(Boolean);
    };

    for (let index = 0; index < phraseCount; index += 1) {
      const state = trace[index];
      const previous = trace[index - 1] || null;
      const form = forms[index];
      totalPhrases += 1;
      reachedGestures.add(state.gesture);
      reachedKickPhrases.add(state.kickPhrase.id);
      selectedCandidateIndices.add(state.selection.selectedCandidateIndex);
      maximumRestStreak = Math.max(
        maximumRestStreak,
        state.phraseMemory.restStreak,
      );
      nonMaximumSelections += Number(
        state.selection.selectedCandidateScore <
          state.selection.bestCandidateScore - 1e-12,
      );

      assert.equal(state.selection.candidateCount, MATERIAL_CANDIDATE_COUNT);
      assert.equal(state.selection.fallback, false);
      assert.ok(state.selection.selectedCandidateScore >= MATERIAL_SCORE_FLOOR);
      assert.ok(state.selection.samplingTemperature >= 0.35);
      assert.ok(state.selection.samplingTemperature <= 0.85);
      assert.ok([2, 3].includes(state.clocks.clap.hits));
      assert.equal(state.clocks.kick.loopLength, 16);
      assert.equal(state.clocks.kick.hits, 4);
      assert.equal(state.clocks.kick.rotation, 0);
      assert.ok(KICK_PHRASE_IDS.includes(state.kickPhrase.id));
      assert.ok(state.motif.events.length >= 4);
      assert.ok(state.motif.events.every(
        (event) =>
          Number.isSafeInteger(event.onset) &&
          event.onset >= 0 &&
          event.onset < 16 &&
          Number.isSafeInteger(event.degree) &&
          event.degree >= 0 &&
          event.degree <= 6,
      ));
      const bassKickOverlap = state.phrase.patterns.bass.filter(
        (active, offset) => active && state.phrase.patterns.kick[offset],
      ).length;
      if (state.phrase.bassKickRelation === "counter") {
        assert.equal(bassKickOverlap, 0);
      } else if (state.phrase.bassKickRelation === "hybrid") {
        assert.ok(bassKickOverlap <= PHRASE_BARS);
      } else {
        assert.equal(state.phrase.bassKickRelation, "layered");
      }
      assert.equal(
        state.phrase.patterns.openHats.some(
          (active, offset) =>
            active && state.phrase.patterns.hats[offset],
        ),
        false,
      );

      if (seenFingerprints.has(state.phrase.fingerprint)) {
        assert.ok(
          ["repeat", "recall"].includes(state.gesture),
          `seed ${seed} phrase ${index}: exact emitted material repeated under ${state.gesture}`,
        );
      }
      seenFingerprints.add(state.phrase.fingerprint);

      for (const [lane, clock] of Object.entries(state.clocks)) {
        const priorRun = clockRuns[lane];
        clockRuns[lane] =
          priorRun?.id === clock.id
            ? {
                ...priorRun,
                phrases: priorRun.phrases + 1,
                audiblePhrases:
                  priorRun.audiblePhrases +
                  Number(laneHasAudibleOnset(state, lane)),
              }
            : {
                id: clock.id,
                phrases: 1,
                holdPhrases: clock.holdPhrases,
                loopLength: clock.loopLength,
                audiblePhrases: Number(laneHasAudibleOnset(state, lane)),
              };
        if (priorRun && priorRun.id !== clock.id) {
          const minimumResidence =
            lane === "kick" && priorRun.loopLength !== 16 ? 1 : 2;
          assert.ok(
            priorRun.phrases >= minimumResidence &&
              priorRun.phrases <= 8,
            `seed ${seed} phrase ${index}: ${lane} persisted ${priorRun.phrases} phrases`,
          );
          if (
            priorRun.loopLength !== 16 &&
            priorRun.phrases >= 2 &&
            priorRun.audiblePhrases >= 2
          ) {
            persistentNonSixteen = true;
          }
        }
        if (lane !== "kick") {
          maximumNonKickClockRun = Math.max(
            maximumNonKickClockRun,
            clockRuns[lane].phrases,
          );
          if (
            clock.loopLength !== 16 &&
            clockRuns[lane].phrases >= 2 &&
            clockRuns[lane].audiblePhrases >= 2
          ) {
            persistentNonSixteen = true;
          }
        }
      }

      if (previous) {
        const changed = LANE_IDS.filter(
          (lane) => previous.clocks[lane].id !== state.clocks[lane].id,
        ).sort();
        const expectedIdentityChanges = [
          ...state.mutatedLanes,
          ...state.renewedLanes,
        ].sort();
        assert.deepEqual(changed, expectedIdentityChanges);
        for (const lane of changed) {
          assert.equal(
            state.clocks[lane].phaseOrigin,
            previous.clocks[lane].phaseOrigin,
            `seed ${seed} phrase ${index}: ${lane} reset its absolute phase origin`,
          );
        }
        const allowance =
          form.climax || form.release || state.gesture === "recall" ? 2 : 1;
        assert.ok(
          state.mutatedLanes.length <= allowance,
          `seed ${seed} phrase ${index} structurally mutated ${state.mutatedLanes.join(",")}`,
        );
        if (state.renewedLanes.length > 0) {
          assert.deepEqual(state.renewedLanes, ["kick"]);
          for (const key of ["loopLength", "hits", "rotation"]) {
            assert.equal(state.clocks.kick[key], previous.clocks.kick[key]);
          }
        }
        if (state.gesture === "recall") {
          assert.ok(
            previous.phraseMemory.archivedMotifs.some(
              (motif) => motifKey(motif) === motifKey(state.motif),
            ),
            `seed ${seed} phrase ${index}: recall did not restore an archived motif`,
          );
        } else {
          const delta = independentMotifDelta(previous.motif, state.motif);
          const mutationBudget = Math.max(
            1,
            Math.floor(previous.motif.events.length * 0.25),
          );
          assert.ok(delta.changedOnsets <= mutationBudget);
          assert.ok(delta.changedDegrees <= mutationBudget);
          if (delta.changedOnsets + delta.changedDegrees > 0) {
            assert.equal(
              state.motif.parentLineageId,
              previous.motif.lineageId,
            );
          } else {
            assert.equal(state.motif.lineageId, previous.motif.lineageId);
          }
        }
      }

      if (state.gesture === "call") {
        const answer = trace[index + 1];
        assert.equal(answer.gesture, "answer");
        assert.equal(answer.answerDirection, state.answerDirection);
        assert.equal(answer.phraseMemory.unresolvedCall, null);
        reachedAnswerDirections.add(state.answerDirection);
        answeredCalls += 1;
      }

      for (let bar = 0; bar < PHRASE_BARS; bar += 1) {
        assert.equal(
          state.phrase.patterns.kick[bar * STEPS_PER_BAR],
          true,
          `seed ${seed} phrase ${index} lost bar ${bar + 1}'s downbeat`,
        );
      }
      const kickOnsets = state.phrase.patterns.kick.flatMap(
        (active, offset) => (active ? [offset] : []),
      );
      for (let onset = 1; onset < kickOnsets.length; onset += 1) {
        assert.ok(
          kickOnsets[onset] - kickOnsets[onset - 1] >= 2,
          `seed ${seed} phrase ${index} emitted a racing kick gap`,
        );
      }
      state.phrase.kickArticulations.forEach((articulation, offset) => {
        assert.equal(
          articulation === null,
          !state.phrase.patterns.kick[offset],
        );
        if (articulation !== null) {
          assert.ok(KICK_ARTICULATIONS.includes(articulation));
        }
      });
      if (previous) {
        if (state.kickPhrase.id === previous.kickPhrase.id) {
          assert.equal(state.kickPhrase.changed, false);
          assert.equal(
            state.kickPhrase.agePhrases,
            previous.kickPhrase.agePhrases + 1,
          );
        } else {
          kickPhraseTransitions += 1;
          assert.equal(state.kickPhrase.changed, true);
          assert.equal(state.kickPhrase.priorId, previous.kickPhrase.id);
          assert.equal(state.kickPhrase.agePhrases, 0);
        }
      }
    }

    for (const [lane, run] of Object.entries(clockRuns)) {
      assert.ok(
        run.phrases <= 8,
        `seed ${seed}: ${lane} ended with a ${run.phrases}-phrase run`,
      );
      if (
        run.loopLength !== 16 &&
        run.phrases >= 2 &&
        run.audiblePhrases >= 2
      ) {
        persistentNonSixteen = true;
      }
    }
    assert.equal(
      persistentNonSixteen,
      true,
      `seed ${seed} never held non-16 polymetric material`,
    );
  }

  assert.deepEqual([...reachedGestures].sort(), [...EXPECTED_GESTURES].sort());
  assert.deepEqual(
    [...reachedAnswerDirections].sort(),
    ["downward", "registral", "rhythmic", "upward"],
  );
  assert.deepEqual([...reachedKickPhrases].sort(), [...KICK_PHRASE_IDS].sort());
  assert.ok(kickPhraseTransitions > totalPhrases * 0.2);
  assert.ok(answeredCalls > 0);
  assert.ok(selectedCandidateIndices.size >= 8);
  assert.ok(nonMaximumSelections > totalPhrases * 0.2);
  assert.ok(maximumNonKickClockRun <= 8);
  assert.ok(
    maximumRestStreak <= 2,
    `rest gesture persisted ${maximumRestStreak} phrases`,
  );
});
