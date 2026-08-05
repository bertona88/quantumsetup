import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceMaterialState,
  buildBarPlan,
  createMaterialState,
  derivePhraseState,
  profileForVibe,
} from "./techno-model.js";
import { LANE_DOMAINS } from "./material-planner.js";
import { createTrackDNA } from "./track-dna.js";

const TRAJECTORY_WINDOW_BARS = 192;
const FIRST_48_BAR_WINDOW = 48;
const FIRST_48_PHRASE_GRAMMAR_FLOOR = 0.1;
// Kick, clap, and open-hat anchors are deliberately shared. The early-window
// drum floor therefore measures variation around a stable club foundation.
const FIRST_48_RHYTHM_FLOOR = 0.03;
const TEST_VIBE = "hypnotic";
const TEST_TONALITY = "minor";

// This manifest deliberately includes adjacent IDs as well as visually unrelated
// IDs. A 128-bit identity is not evidence of a different musical result; only the
// downstream note, rhythm, voice, timbre, and form contracts below count.
const TRAJECTORY_SEEDS = Object.freeze([
  "00000000000000000000000000000001",
  "00000000000000000000000000000002",
  "00000000000000000000000000000003",
  "00000000000000000000000000000004",
  "000000000000000000000000000000ff",
  "0123456789abcdeffedcba9876543210",
  "0123456789abcdeffedcba9876543211",
  "11111111111111111111111111111111",
  "55555555555555555555555555555555",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "deadbeefdeadbeefdeadbeefdeadbeef",
  "fedcba98765432100123456789abcdef",
  "ffffffffffffffffffffffffffffffff",
]);

const VIBE_IDS = Object.freeze([
  "hypnotic",
  "dub",
  "detroit",
  "acid",
  "peak",
]);
const DETERMINISM_TEST_SEED = "0123456789abcdeffedcba9876543210";
const METADATA_RELABEL_SEED = "0123456789abcdeffedcba9876543211";
const VIBE_TEST_SEED = "deadbeefdeadbeefdeadbeefdeadbeef";

const EXPECTED_LANE_DOMAINS = Object.freeze({
  kick: Object.freeze([16]),
  clap: Object.freeze([16]),
  hats: Object.freeze([
    5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29,
  ]),
  percussion: Object.freeze([
    5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    24, 25, 26, 27, 28, 29,
  ]),
  bass: Object.freeze([12, 15, 16, 18, 20, 24, 28, 32]),
  synthFm: Object.freeze([7, 9, 11, 13, 15, 17, 19, 23, 29, 31]),
  synthModal: Object.freeze([7, 9, 11, 13, 15, 17, 19, 23, 29, 31]),
  synthString: Object.freeze([7, 9, 11, 13, 15, 17, 19, 23, 29, 31]),
});

const AUDIBLE_POLYMETER_LANES = Object.freeze([
  "clap",
  "hats",
  "percussion",
  "bass",
  "synthFm",
  "synthModal",
  "synthString",
]);

const RHYTHM_LANES = Object.freeze([
  ["kick", 6],
  ["clap", 3],
  ["hat", 16],
  ["openHat", 4],
  ["shaker", 8],
  ["rim", 4],
  ["ride", 4],
  ["metallic", 4],
  ["tom", 4],
]);

const KICK_RANGES = Object.freeze({
  bodyHz: [38, 55],
  pitchStartHz: [120, 212],
  pitchDropSeconds: [0.022, 0.076],
  decaySeconds: [0.27, 0.72],
  clickHz: [2400, 7600],
  clickLevel: [0.025, 0.18],
  drive: [1.2, 3.5],
  rumbleSend: [0, 0.14],
  rumbleCutoffHz: [84, 176],
  rumbleFeedback: [0, 0.58],
});

const PERCUSSION_RANGES = Object.freeze({
  hatDecayScale: [0.5, 1.4],
  hatBandScale: [0.6, 1.4],
  hatNoiseRate: [0.7, 1.5],
  hatDelay: [0, 0.24],
  hatReverb: [0, 0.4],
  clapBursts: [2, 5],
  clapSpacing: [0.006, 0.022],
  clapDecay: [0.1, 0.4],
  clapDelay: [0, 0.2],
  clapReverb: [0, 0.48],
});

// These values are not Vibe labels: the audio engine consumes them directly for
// filters, distortion, delay/reverb, rumble, percussion, and texture synthesis.
const PROFILE_AUDIO_KEYS = Object.freeze([
  "drive",
  "space",
  "acid",
  "texture",
  "metallic",
  "rumble",
  "warmth",
]);

const DOMAIN_FLOORS = Object.freeze({
  rhythm: 0.06,
  bass: 0.09,
  harmony: 0.07,
  advanced: 0.08,
  timbre: 0.1,
  form: 0.065,
});
// The legacy Vibe check retains only its literal multi-domain claim. Cross-seed
// acceptance now belongs to the stricter first-48-bar contract below.
const MINIMUM_VIBE_SEPARATED_DOMAINS = 2;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalize(value, [minimum, maximum]) {
  return clamp01((value - minimum) / Math.max(Number.EPSILON, maximum - minimum));
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
}

function deviation(values) {
  const center = mean(values);
  return Math.sqrt(
    mean(values.map((value) => (value - center) ** 2)),
  );
}

function normalizedHistogram(counts) {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return counts.map(() => 0);
  return counts.map((value) => value / total);
}

function normalizedEntries(counts) {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Object.freeze([]);
  return Object.freeze(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => Object.freeze([key, value / total])),
  );
}

function totalVariation(left, right) {
  assert.equal(left.length, right.length);
  return Math.min(
    1,
    left.reduce(
      (sum, value, index) => sum + Math.abs(value - right[index]),
      0,
    ) / 2,
  );
}

function categoricalDistance(left, right) {
  const first = new Map(left);
  const second = new Map(right);
  const keys = new Set([...first.keys(), ...second.keys()]);
  let difference = 0;
  for (const key of keys) {
    difference += Math.abs((first.get(key) || 0) - (second.get(key) || 0));
  }
  return Math.min(1, difference / 2);
}

function vectorDistance(left, right) {
  assert.equal(left.length, right.length);
  return mean(
    left.map((value, index) => Math.abs(value - right[index])),
  );
}

function optionalVectorDistance(left, right) {
  if (left.length === 0 || right.length === 0) {
    return left.length === right.length ? 0 : 1;
  }
  return vectorDistance(left, right);
}

function averageVectors(vectors, width) {
  if (vectors.length === 0) return emptyCounter(width);
  return Array.from({ length: width }, (_, index) =>
    mean(vectors.map((vector) => vector[index])),
  );
}

function synthTopology(genome) {
  if (genome.engine === "fm") {
    return [
      genome.algorithm,
      genome.ratioFamily,
      genome.envelopeFamily,
      genome.waves.join(","),
    ].join("|");
  }
  if (genome.engine === "modal") {
    return [
      genome.material,
      genome.structure,
      genome.exciter,
      genome.modeCount,
    ].join("|");
  }
  return [
    genome.exciter,
    genome.body,
    genome.termination,
    Number(Boolean(genome.fixedPosition)),
  ].join("|");
}

function synthRendererControls(genome) {
  if (genome.engine === "fm") {
    return [
      ...genome.ratios.map((value) => normalize(value, [0.25, 16])),
      ...genome.levels.map(clamp01),
      ...genome.attacks.map((value) => normalize(value, [0.001, 1.2])),
      ...genome.decays.map((value) => normalize(value, [0.001, 1.2])),
      ...genome.sustains.map(clamp01),
      ...genome.releases.map((value) => normalize(value, [0.001, 1.2])),
      normalize(genome.modulationIndex, [0.22, 7.8]),
      normalize(genome.feedback, [0, 0.5]),
      normalize(genome.toneHz, [900, 11200]),
      normalize(genome.filterQ, [0.55, 8]),
      normalize(genome.filterEnvelope, [0.08, 1]),
      normalize(genome.detuneCents, [-9, 9]),
      normalize(genome.lfoRateHz, [0.06, 5]),
      normalize(genome.lfoDepthCents, [0, 19]),
      normalize(genome.drive, [1.05, 4.5]),
      normalize(genome.spread, [0.02, 0.86]),
      normalize(genome.durationScale, [0.52, 2]),
    ];
  }
  if (genome.engine === "modal") {
    return [
      normalize(genome.modeCount, [4, 8]),
      normalize(mean(genome.ratios), [1, 30]),
      normalize(deviation(genome.ratios), [0, 10]),
      clamp01(genome.hardness),
      normalize(genome.noiseMix, [0.03, 0.93]),
      normalize(genome.strikePosition, [0.06, 0.94]),
      normalize(genome.brightness, [0.18, 0.98]),
      normalize(genome.inharmonicity, [0.002, 0.225]),
      normalize(genome.stiffness, [0.06, 0.98]),
      normalize(genome.damping, [0.18, 0.95]),
      normalize(genome.decaySeconds, [0.16, 2.48]),
      normalize(genome.coupling, [0.04, 0.12]),
      normalize(genome.body, [0.12, 0.98]),
      normalize(genome.spread, [0.03, 0.92]),
      normalize(genome.detuneCents, [-7, 7]),
      normalize(genome.drive, [1, 3.55]),
    ];
  }
  return [
    normalize(genome.feedback, [0.79, 0.985]),
    normalize(genome.decaySeconds, [0.48, 3.55]),
    normalize(genome.brightness, [0.12, 0.98]),
    normalize(genome.stiffness, [0.03, 0.89]),
    normalize(genome.pickPosition, [0.08, 0.92]),
    normalize(genome.exciterMass, [0.08, 0.95]),
    normalize(genome.exciterDamping, [0.06, 0.92]),
    normalize(genome.damperMass, [0.04, 0.86]),
    normalize(genome.damperStiffness, [0.04, 0.93]),
    normalize(genome.bodySize, [0.12, 0.96]),
    normalize(genome.buzz, [0, 0.64]),
    normalize(genome.spread, [0.02, 0.76]),
    normalize(genome.detuneCents, [-6, 6]),
    normalize(genome.drive, [1, 3.15]),
    normalize(genome.releaseSeconds, [0.04, 0.94]),
  ];
}

function emptyCounter(length) {
  return Array.from({ length }, () => 0);
}

function makeAccumulator(barCount) {
  const phraseCount = barCount / 8;
  return {
    rhythm: Object.fromEntries(
      RHYTHM_LANES.map(([lane]) => [
        lane,
        { attacks: 0, steps: emptyCounter(16) },
      ]),
    ),
    bass: {
      attacks: 0,
      steps: emptyCounter(16),
      pitchClasses: emptyCounter(12),
      voices: { acid: 0, pulse: 0, sub: 0 },
      midi: [],
      lengths: [],
      velocities: [],
      slides: 0,
    },
    harmony: {
      chordAttacks: 0,
      chordPitchClasses: emptyCounter(12),
      padBars: 0,
      padPitchClasses: emptyCounter(12),
    },
    advanced: Object.fromEntries(
      ["fm", "modal", "string"].map((engine) => [
        engine,
        {
          attacks: 0,
          steps: emptyCounter(16),
          pitchClasses: emptyCounter(12),
          registers: emptyCounter(3),
          velocities: [],
          lengths: [],
          delaySends: [],
          reverbSends: [],
          topologies: new Map(),
          rendererControls: [],
        },
      ]),
    ),
    timbre: {
      kick: Object.fromEntries(
        Object.keys(KICK_RANGES).map((key) => [key, []]),
      ),
      percussion: Object.fromEntries(
        Object.keys(PERCUSSION_RANGES).map((key) => [key, []]),
      ),
      movement: {
        kickTone: [],
        kickDecay: [],
        hatColor: [],
        clapTone: [],
        rimTone: [],
        filterBias: [],
        swingBias: [],
        stereoBias: [],
      },
      profile: Object.fromEntries(
        PROFILE_AUDIO_KEYS.map((key) => [key, []]),
      ),
    },
    form: {
      energyByPhrase: Array.from({ length: phraseCount }, () => []),
      filterByPhrase: Array.from({ length: phraseCount }, () => []),
      attacksPerBar: [],
      textureBars: 0,
      risers: 0,
      downlifters: 0,
      intentionalRests: 0,
    },
    phraseGrammar: {
      gestures: [],
      answerDirections: [],
      transitions: new Map(),
      mutationShapes: new Map(),
    },
  };
}

function incrementCount(counts, key) {
  counts.set(key, (counts.get(key) || 0) + 1);
}

function countLane(accumulator, lane, values) {
  values.forEach((value, step) => {
    if (!value) return;
    accumulator.rhythm[lane].attacks += 1;
    accumulator.rhythm[lane].steps[step] += 1;
  });
}

function countPitches(counter, notes) {
  for (const midi of notes) {
    counter[((midi % 12) + 12) % 12] += 1;
  }
}

function assertMaterialClockContract(materialState, context) {
  assert.deepEqual(
    Object.keys(materialState.clocks),
    Object.keys(EXPECTED_LANE_DOMAINS),
    `${context} changed the material clock lanes`,
  );
  for (const [lane, domain] of Object.entries(EXPECTED_LANE_DOMAINS)) {
    assert.ok(
      domain.includes(materialState.clocks[lane].loopLength),
      `${context} put ${lane} outside its required clock domain`,
    );
  }

  const kick = materialState.clocks.kick;
  assert.equal(kick.hits, 4, `${context} violated the kick hit rule`);
  assert.equal(kick.rotation, 0, `${context} rotated the kick clock`);
  assert.equal(
    materialState.clocks.clap.hits,
    2,
    `${context} violated the backbeat clap rule`,
  );
}

function createAudiblePolymeterTracker() {
  return {
    currentPhrase: null,
    laneRuns: Object.fromEntries(
      AUDIBLE_POLYMETER_LANES.map((lane) => [lane, null]),
    ),
    witness: null,
  };
}

function beginAudiblePolymeterPhrase(tracker, materialState) {
  assert.equal(tracker.currentPhrase, null);
  tracker.currentPhrase = {
    phraseIndex: materialState.phraseIndex,
    clocks: Object.fromEntries(
      AUDIBLE_POLYMETER_LANES.map((lane) => [
        lane,
        materialState.clocks[lane],
      ]),
    ),
    onsets: Object.fromEntries(
      AUDIBLE_POLYMETER_LANES.map((lane) => [lane, 0]),
    ),
  };
}

function countAudiblePolymeterOnsets(tracker, plan) {
  const count = (events) => events.filter(Boolean).length;
  tracker.currentPhrase.onsets.clap += count(plan.clap);
  tracker.currentPhrase.onsets.hats +=
    count(plan.hat) + count(plan.openHat);
  tracker.currentPhrase.onsets.percussion +=
    count(plan.shaker) +
    count(plan.rim) +
    count(plan.ride) +
    count(plan.metallic) +
    count(plan.tom);
  tracker.currentPhrase.onsets.bass += count(plan.bass);
  tracker.currentPhrase.onsets.synthFm += count(plan.synth.fm);
  tracker.currentPhrase.onsets.synthModal += count(plan.synth.modal);
  tracker.currentPhrase.onsets.synthString += count(plan.synth.string);
}

function finishAudiblePolymeterPhrase(tracker) {
  const phrase = tracker.currentPhrase;
  assert.ok(phrase);
  for (const lane of AUDIBLE_POLYMETER_LANES) {
    const clock = phrase.clocks[lane];
    const prior = tracker.laneRuns[lane];
    const continues =
      prior?.clockId === clock.id &&
      prior.loopLength === clock.loopLength &&
      prior.lastPhraseIndex + 1 === phrase.phraseIndex;
    const audibleTail = phrase.onsets[lane] > 0
      ? [
        ...(continues ? prior.audibleTail : []),
        Object.freeze({
          phraseIndex: phrase.phraseIndex,
          clockId: clock.id,
          loopLength: clock.loopLength,
          onsets: phrase.onsets[lane],
        }),
      ].slice(-2)
      : [];
    const run = {
      clockId: clock.id,
      loopLength: clock.loopLength,
      lastPhraseIndex: phrase.phraseIndex,
      phraseCount: continues ? prior.phraseCount + 1 : 1,
      audibleTail,
    };
    tracker.laneRuns[lane] = run;

    if (
      tracker.witness === null &&
      run.loopLength !== 16 &&
      run.phraseCount >= 2 &&
      run.audibleTail.length >= 2
    ) {
      tracker.witness = Object.freeze({
        lane,
        clockId: run.clockId,
        loopLength: run.loopLength,
        phrases: Object.freeze([...run.audibleTail]),
      });
    }
  }
  tracker.currentPhrase = null;
}

function summarizeTrajectory(
  seed,
  vibeId = TEST_VIBE,
  tonality = TEST_TONALITY,
  barCount = TRAJECTORY_WINDOW_BARS,
) {
  assert.ok(
    Number.isSafeInteger(barCount) && barCount > 0 && barCount % 8 === 0,
    "trajectory summaries require a positive whole number of eight-bar phrases",
  );
  const accumulator = makeAccumulator(barCount);
  const profile = profileForVibe(vibeId);
  const trackDNA = createTrackDNA(seed);
  let materialState = null;
  const audiblePolymeter = createAudiblePolymeterTracker();

  for (let bar = 0; bar < barCount; bar += 1) {
    const phraseIndex = Math.floor(bar / 8);
    if (bar % 8 === 0) {
      if (audiblePolymeter.currentPhrase) {
        finishAudiblePolymeterPhrase(audiblePolymeter);
      }
      const materialInput = {
        seed,
        trackDNA,
        phraseIndex,
        form: derivePhraseState(seed, phraseIndex),
        profile,
        tonality,
      };
      materialState = materialState
        ? advanceMaterialState(materialState, materialInput)
        : createMaterialState(materialInput);
      assertMaterialClockContract(
        materialState,
        `${seed} phrase ${phraseIndex}`,
      );
      beginAudiblePolymeterPhrase(audiblePolymeter, materialState);
      const previousGesture = accumulator.phraseGrammar.gestures.at(-1);
      accumulator.phraseGrammar.gestures.push(materialState.gesture);
      accumulator.phraseGrammar.answerDirections.push(
        materialState.answerDirection || "none",
      );
      if (previousGesture) {
        incrementCount(
          accumulator.phraseGrammar.transitions,
          `${previousGesture}>${materialState.gesture}`,
        );
      }
      incrementCount(
        accumulator.phraseGrammar.mutationShapes,
        materialState.mutatedLanes.length > 0
          ? [...materialState.mutatedLanes].sort().join("+")
          : "none",
      );
    }
    const plan = buildBarPlan({
      seed,
      bar,
      vibeId,
      tonality,
      profile,
      instrumentProfile: profile,
      materialState,
    });
    countAudiblePolymeterOnsets(audiblePolymeter, plan);
    let barAttacks = 0;

    for (const [lane] of RHYTHM_LANES) {
      countLane(accumulator, lane, plan[lane]);
      barAttacks += plan[lane].filter(Boolean).length;
    }

    plan.bass.forEach((note, step) => {
      if (!note) return;
      accumulator.bass.attacks += 1;
      accumulator.bass.steps[step] += 1;
      accumulator.bass.pitchClasses[((note.midi % 12) + 12) % 12] += 1;
      accumulator.bass.midi.push(normalize(note.midi, [34, 55]));
      accumulator.bass.lengths.push(clamp01(note.length / 3));
      accumulator.bass.velocities.push(clamp01(note.velocity));
      accumulator.bass.slides += Number(
        Number.isFinite(note.slideTo) && note.slideSteps > 0,
      );
      if (Object.hasOwn(accumulator.bass.voices, plan.bassVoice)) {
        accumulator.bass.voices[plan.bassVoice] += 1;
      }
      barAttacks += 1;
    });

    plan.chord.forEach((event) => {
      if (!event) return;
      accumulator.harmony.chordAttacks += 1;
      countPitches(accumulator.harmony.chordPitchClasses, event.notes);
      barAttacks += 1;
    });
    if (plan.pad) {
      accumulator.harmony.padBars += 1;
      countPitches(accumulator.harmony.padPitchClasses, plan.pad.notes);
    }

    for (const engine of ["fm", "modal", "string"]) {
      plan.synth[engine].forEach((note, step) => {
        if (!note) return;
        const advanced = accumulator.advanced[engine];
        advanced.attacks += 1;
        advanced.steps[step] += 1;
        advanced.pitchClasses[((note.midi % 12) + 12) % 12] += 1;
        advanced.registers[note.midi < 60 ? 0 : note.midi < 72 ? 1 : 2] += 1;
        advanced.velocities.push(clamp01(note.velocity));
        advanced.lengths.push(clamp01(note.length / 4));
        advanced.delaySends.push(clamp01(note.delaySend / 0.42));
        advanced.reverbSends.push(clamp01(note.reverbSend / 0.55));
        const genome = plan.synthPalette?.[engine];
        if (genome) {
          const topology = synthTopology(genome);
          advanced.topologies.set(
            topology,
            (advanced.topologies.get(topology) || 0) + 1,
          );
          advanced.rendererControls.push(synthRendererControls(genome));
        }
        barAttacks += 1;
      });
    }

    for (const [key, range] of Object.entries(KICK_RANGES)) {
      accumulator.timbre.kick[key].push(normalize(plan.kickTimbre[key], range));
    }
    for (const [key, range] of Object.entries(PERCUSSION_RANGES)) {
      accumulator.timbre.percussion[key].push(
        normalize(plan.percussionTimbre[key], range),
      );
    }
    for (const key of Object.keys(accumulator.timbre.movement)) {
      const value = plan.movement.timbre[key];
      accumulator.timbre.movement[key].push(
        key === "stereoBias" ? clamp01((value + 1) / 2) : clamp01(value),
      );
    }
    for (const key of PROFILE_AUDIO_KEYS) {
      accumulator.timbre.profile[key].push(clamp01(plan.profile[key]));
    }

    accumulator.form.energyByPhrase[phraseIndex].push(clamp01(plan.energy));
    accumulator.form.filterByPhrase[phraseIndex].push(clamp01(plan.filterOpen));
    accumulator.form.attacksPerBar.push(clamp01(barAttacks / 32));
    accumulator.form.textureBars += Number(Boolean(plan.texture));
    accumulator.form.risers += Number(Boolean(plan.riser));
    accumulator.form.downlifters += Number(Boolean(plan.downlifter));
    accumulator.form.intentionalRests += Number(Boolean(plan.form.intentionalRest));
  }
  finishAudiblePolymeterPhrase(audiblePolymeter);

  return Object.freeze({
    seed,
    vibeId,
    tonality,
    barCount,
    rhythm: Object.freeze(
      Object.fromEntries(
        RHYTHM_LANES.map(([lane, maximum]) => {
          const data = accumulator.rhythm[lane];
          return [
            lane,
            Object.freeze({
              rate: clamp01(data.attacks / barCount / maximum),
              steps: Object.freeze(normalizedHistogram(data.steps)),
            }),
          ];
        }),
      ),
    ),
    bass: Object.freeze({
      rate: clamp01(accumulator.bass.attacks / barCount / 8),
      steps: Object.freeze(normalizedHistogram(accumulator.bass.steps)),
      pitchClasses: Object.freeze(
        normalizedHistogram(accumulator.bass.pitchClasses),
      ),
      voices: Object.freeze(
        normalizedHistogram(
          ["acid", "pulse", "sub"].map(
            (voice) => accumulator.bass.voices[voice],
          ),
        ),
      ),
      midi: mean(accumulator.bass.midi),
      midiSpread: deviation(accumulator.bass.midi),
      length: mean(accumulator.bass.lengths),
      velocity: mean(accumulator.bass.velocities),
      slideRate:
        accumulator.bass.slides / Math.max(1, accumulator.bass.attacks),
    }),
    harmony: Object.freeze({
      chordRate: clamp01(
        accumulator.harmony.chordAttacks / barCount,
      ),
      chordPitchClasses: Object.freeze(
        normalizedHistogram(accumulator.harmony.chordPitchClasses),
      ),
      padRate: accumulator.harmony.padBars / barCount,
      padPitchClasses: Object.freeze(
        normalizedHistogram(accumulator.harmony.padPitchClasses),
      ),
    }),
    advanced: Object.freeze(
      Object.fromEntries(
        ["fm", "modal", "string"].map((engine) => {
          const data = accumulator.advanced[engine];
          return [
            engine,
            Object.freeze({
              rate: clamp01(data.attacks / barCount / 4),
              steps: Object.freeze(normalizedHistogram(data.steps)),
              pitchClasses: Object.freeze(
                normalizedHistogram(data.pitchClasses),
              ),
              registers: Object.freeze(normalizedHistogram(data.registers)),
              velocity: mean(data.velocities),
              length: mean(data.lengths),
              delaySend: mean(data.delaySends),
              reverbSend: mean(data.reverbSends),
              topologies: normalizedEntries(data.topologies),
              rendererControls: Object.freeze(
                averageVectors(
                  data.rendererControls,
                  data.rendererControls[0]?.length || 0,
                ),
              ),
            }),
          ];
        }),
      ),
    ),
    timbre: Object.freeze({
      kickAndMovement: Object.freeze([
        ...Object.keys(KICK_RANGES).flatMap((key) => [
          mean(accumulator.timbre.kick[key]),
          deviation(accumulator.timbre.kick[key]),
        ]),
        ...Object.keys(accumulator.timbre.movement).flatMap((key) => [
          mean(accumulator.timbre.movement[key]),
          deviation(accumulator.timbre.movement[key]),
        ]),
      ]),
      percussion: Object.freeze(
        Object.keys(PERCUSSION_RANGES).map((key) =>
          mean(accumulator.timbre.percussion[key]),
        ),
      ),
      profile: Object.freeze(
        PROFILE_AUDIO_KEYS.map((key) =>
          mean(accumulator.timbre.profile[key]),
        ),
      ),
    }),
    form: Object.freeze([
      ...accumulator.form.energyByPhrase.map(mean),
      ...accumulator.form.filterByPhrase.map(mean),
      mean(accumulator.form.attacksPerBar),
      deviation(accumulator.form.attacksPerBar),
      accumulator.form.textureBars / barCount,
      accumulator.form.risers / barCount,
      accumulator.form.downlifters / barCount,
      accumulator.form.intentionalRests / barCount,
    ]),
    phraseGrammar: Object.freeze({
      gestures: Object.freeze([...accumulator.phraseGrammar.gestures]),
      answerDirections: Object.freeze([
        ...accumulator.phraseGrammar.answerDirections,
      ]),
      transitions: normalizedEntries(accumulator.phraseGrammar.transitions),
      mutationShapes: normalizedEntries(
        accumulator.phraseGrammar.mutationShapes,
      ),
    }),
    audiblePolymeterWitness: audiblePolymeter.witness,
  });
}

function rhythmDistance(left, right) {
  return mean(
    RHYTHM_LANES.map(([lane]) => {
      const first = left.rhythm[lane];
      const second = right.rhythm[lane];
      return (
        Math.abs(first.rate - second.rate) * 0.45 +
        totalVariation(first.steps, second.steps) * 0.55
      );
    }),
  );
}

function bassDistance(left, right) {
  return mean([
    Math.abs(left.bass.rate - right.bass.rate),
    totalVariation(left.bass.steps, right.bass.steps),
    totalVariation(left.bass.pitchClasses, right.bass.pitchClasses),
    totalVariation(left.bass.voices, right.bass.voices),
    Math.abs(left.bass.midi - right.bass.midi),
    Math.abs(left.bass.midiSpread - right.bass.midiSpread),
    Math.abs(left.bass.length - right.bass.length),
    Math.abs(left.bass.velocity - right.bass.velocity),
    Math.abs(left.bass.slideRate - right.bass.slideRate),
  ]);
}

function harmonyDistance(left, right) {
  return mean([
    Math.abs(left.harmony.chordRate - right.harmony.chordRate),
    totalVariation(
      left.harmony.chordPitchClasses,
      right.harmony.chordPitchClasses,
    ),
    Math.abs(left.harmony.padRate - right.harmony.padRate),
    totalVariation(
      left.harmony.padPitchClasses,
      right.harmony.padPitchClasses,
    ),
  ]);
}

function advancedDistance(left, right) {
  return mean(
    ["fm", "modal", "string"].map((engine) => {
      const first = left.advanced[engine];
      const second = right.advanced[engine];
      return mean([
        Math.abs(first.rate - second.rate),
        totalVariation(first.steps, second.steps),
        totalVariation(first.pitchClasses, second.pitchClasses),
        totalVariation(first.registers, second.registers),
        Math.abs(first.velocity - second.velocity),
        Math.abs(first.length - second.length),
        Math.abs(first.delaySend - second.delaySend),
        Math.abs(first.reverbSend - second.reverbSend),
        categoricalDistance(first.topologies, second.topologies),
        optionalVectorDistance(
          first.rendererControls,
          second.rendererControls,
        ),
      ]);
    }),
  );
}

function orchestrationDistance(left, right) {
  return mean(
    ["fm", "modal", "string"].map((engine) => {
      const first = left.advanced[engine];
      const second = right.advanced[engine];
      return mean([
        Math.abs(first.rate - second.rate),
        totalVariation(first.steps, second.steps),
        totalVariation(first.pitchClasses, second.pitchClasses),
        totalVariation(first.registers, second.registers),
        Math.abs(first.velocity - second.velocity),
        Math.abs(first.length - second.length),
        Math.abs(first.delaySend - second.delaySend),
        Math.abs(first.reverbSend - second.reverbSend),
      ]);
    }),
  );
}

function sequenceDistance(left, right) {
  assert.equal(left.length, right.length);
  return mean(left.map((value, index) => Number(value !== right[index])));
}

function phraseGrammarComponentDistances(left, right) {
  return Object.freeze({
    gestures: sequenceDistance(
      left.phraseGrammar.gestures,
      right.phraseGrammar.gestures,
    ),
    answers: sequenceDistance(
      left.phraseGrammar.answerDirections,
      right.phraseGrammar.answerDirections,
    ),
    transitions: categoricalDistance(
      left.phraseGrammar.transitions,
      right.phraseGrammar.transitions,
    ),
    mutations: categoricalDistance(
      left.phraseGrammar.mutationShapes,
      right.phraseGrammar.mutationShapes,
    ),
  });
}

function timbreComponentDistances(left, right) {
  return Object.freeze({
    kickAndMovement: vectorDistance(
      left.timbre.kickAndMovement,
      right.timbre.kickAndMovement,
    ),
    percussion: vectorDistance(
      left.timbre.percussion,
      right.timbre.percussion,
    ),
    profile: vectorDistance(left.timbre.profile, right.timbre.profile),
  });
}

function timbreDistance(left, right) {
  return mean(Object.values(timbreComponentDistances(left, right)));
}

function trajectoryDistance(left, right) {
  const domains = Object.freeze({
    rhythm: rhythmDistance(left, right),
    bass: bassDistance(left, right),
    harmony: harmonyDistance(left, right),
    advanced: advancedDistance(left, right),
    timbre: timbreDistance(left, right),
    form: vectorDistance(left.form, right.form),
  });
  return Object.freeze({
    domains,
    composite: mean(Object.values(domains)),
    separatedDomains: Object.entries(domains)
      .filter(([domain, distance]) => distance >= DOMAIN_FLOORS[domain])
      .map(([domain]) => domain),
  });
}

function first48SymbolicDistance(left, right) {
  const grammarComponents = phraseGrammarComponentDistances(left, right);
  const domains = Object.freeze({
    rhythm: rhythmDistance(left, right),
    phraseGrammar: mean(Object.values(grammarComponents)),
    orchestration: orchestrationDistance(left, right),
    timbre: timbreDistance(left, right),
    harmony: harmonyDistance(left, right),
  });
  const additionalSeparatedDomains = [
    ["orchestration", DOMAIN_FLOORS.advanced],
    ["timbre", DOMAIN_FLOORS.timbre],
    ["harmony", DOMAIN_FLOORS.harmony],
  ]
    .filter(([domain, floor]) => domains[domain] >= floor)
    .map(([domain]) => domain);
  return Object.freeze({
    domains,
    grammarComponents,
    composite: mean(Object.values(domains)),
    additionalSeparatedDomains,
  });
}

function diagnostic(left, right, distance) {
  const label = (summary) =>
    `${summary.seed.slice(0, 8)}…${summary.seed.slice(-8)}:${summary.vibeId}`;
  return JSON.stringify({
    pair: `${label(left)} <> ${label(right)}`,
    composite: Number(distance.composite.toFixed(4)),
    separatedDomains: distance.separatedDomains,
    domains: Object.fromEntries(
      Object.entries(distance.domains).map(([domain, value]) => [
        domain,
        Number(value.toFixed(4)),
      ]),
    ),
    timbreComponents: Object.fromEntries(
      Object.entries(timbreComponentDistances(left, right)).map(
        ([component, value]) => [component, Number(value.toFixed(4))],
      ),
    ),
  });
}

function populationComparisons(summaries) {
  const comparisons = [];
  for (let left = 0; left < summaries.length; left += 1) {
    for (let right = left + 1; right < summaries.length; right += 1) {
      const distance = trajectoryDistance(summaries[left], summaries[right]);
      comparisons.push({
        left: summaries[left],
        right: summaries[right],
        distance,
      });
    }
  }
  return comparisons;
}

function assertVibeEndpointsSeparated(summaries) {
  const comparisons = populationComparisons(summaries);
  const narrowest = comparisons.reduce((worst, candidate) => {
    const candidateCount = candidate.distance.separatedDomains.length;
    const worstCount = worst.distance.separatedDomains.length;
    if (candidateCount !== worstCount) {
      return candidateCount < worstCount ? candidate : worst;
    }
    return candidate.distance.composite < worst.distance.composite
      ? candidate
      : worst;
  });

  assert.ok(
    narrowest.distance.separatedDomains.length >=
      MINIMUM_VIBE_SEPARATED_DOMAINS,
    `narrowest trajectory-window pair differed in too few downstream musical domains: ${diagnostic(
      narrowest.left,
      narrowest.right,
      narrowest.distance,
    )}`,
  );
}

function assertFirst48Separated(summaries) {
  const comparisons = [];
  for (let left = 0; left < summaries.length; left += 1) {
    for (let right = left + 1; right < summaries.length; right += 1) {
      const first = summaries[left];
      const second = summaries[right];
      const distance = first48SymbolicDistance(first, second);
      const pair = `${first.seed} <> ${second.seed}`;
      assert.ok(
        distance.domains.rhythm >= FIRST_48_RHYTHM_FLOOR,
        `${pair} did not separate rhythm: ${JSON.stringify(distance)}`,
      );
      assert.ok(
        distance.domains.phraseGrammar >= FIRST_48_PHRASE_GRAMMAR_FLOOR,
        `${pair} phrase-grammar distance was below ${FIRST_48_PHRASE_GRAMMAR_FLOOR}: ${JSON.stringify(distance)}`,
      );
      assert.ok(
        distance.additionalSeparatedDomains.length >= 1,
        `${pair} did not separate orchestration, timbre, or harmony: ${JSON.stringify(distance)}`,
      );
      assert.ok(
        distance.composite >= 0.2,
        `${pair} composite symbolic distance was below 0.20: ${JSON.stringify(distance)}`,
      );
      comparisons.push({ left: first, right: second, distance });
    }
  }
  return comparisons;
}

test("material clock domains and kick/clap hit rules stay exact", () => {
  assert.deepEqual(LANE_DOMAINS, EXPECTED_LANE_DOMAINS);

  for (const seed of TRAJECTORY_SEEDS) {
    const profile = profileForVibe(TEST_VIBE);
    const trackDNA = createTrackDNA(seed);
    let materialState = null;
    for (
      let phraseIndex = 0;
      phraseIndex < TRAJECTORY_WINDOW_BARS / 8;
      phraseIndex += 1
    ) {
      const input = {
        seed,
        trackDNA,
        phraseIndex,
        form: derivePhraseState(seed, phraseIndex),
        profile,
        tonality: TEST_TONALITY,
      };
      materialState = materialState
        ? advanceMaterialState(materialState, input)
        : createMaterialState(input);
      assertMaterialClockContract(
        materialState,
        `${seed} phrase ${phraseIndex}`,
      );
    }
  }
});

test("a trajectory is a deterministic 192-bar downstream musical window", () => {
  const seed = DETERMINISM_TEST_SEED;
  const first = summarizeTrajectory(seed);
  const replay = summarizeTrajectory(seed);
  assert.deepEqual(replay, first);
  assert.equal(TRAJECTORY_WINDOW_BARS, 192);
});

test("metadata-only identity changes have zero trajectory distance", () => {
  const summary = summarizeTrajectory(
    DETERMINISM_TEST_SEED,
    TEST_VIBE,
    TEST_TONALITY,
    FIRST_48_BAR_WINDOW,
  );
  const relabelled = Object.freeze({
    ...summary,
    seed: METADATA_RELABEL_SEED,
    vibeId: "peak",
    tonality: "major",
  });
  assert.deepEqual(trajectoryDistance(summary, relabelled), {
    domains: {
      rhythm: 0,
      bass: 0,
      harmony: 0,
      advanced: 0,
      timbre: 0,
      form: 0,
    },
    composite: 0,
    separatedDomains: [],
  });
});

test("fixed trajectories separate within the first 48 bars", () => {
  const startedAt = performance.now();
  const summaries = TRAJECTORY_SEEDS.map((seed) =>
    summarizeTrajectory(seed, TEST_VIBE, TEST_TONALITY, FIRST_48_BAR_WINDOW)
  );
  for (const summary of summaries) {
    const witness = summary.audiblePolymeterWitness;
    assert.ok(
      witness,
      `${summary.seed} did not emit a persistent non-16 lane across two first-48 phrases`,
    );
    assert.notEqual(witness.loopLength, 16);
    assert.ok(witness.phrases.length >= 2);
    assert.ok(
      witness.phrases.every((phrase) =>
        phrase.clockId === witness.clockId &&
        phrase.loopLength === witness.loopLength &&
        phrase.onsets > 0
      ),
    );
    for (let index = 1; index < witness.phrases.length; index += 1) {
      assert.equal(
        witness.phrases[index].phraseIndex,
        witness.phrases[index - 1].phraseIndex + 1,
      );
    }
  }
  const comparisons = assertFirst48Separated(summaries);
  if (process.env.REPORT_TRAJECTORY_DIVERSITY === "1") {
    const rounded = (value) => Number(value.toFixed(6));
    const compactComparison = ({ left, right, distance }) => ({
      pair: `${left.seed} <> ${right.seed}`,
      composite: rounded(distance.composite),
      domains: Object.fromEntries(
        Object.entries(distance.domains).map(([domain, value]) => [
          domain,
          rounded(value),
        ]),
      ),
      gestureSequence: rounded(distance.grammarComponents.gestures),
      additionalSeparatedDomains: distance.additionalSeparatedDomains,
    });
    const report = Object.freeze({
      runtimeMs: Number((performance.now() - startedAt).toFixed(3)),
      pairCount: comparisons.length,
      comparisons: comparisons.map(compactComparison),
    });
    console.log(JSON.stringify(report));
  }
});

test("Vibe endpoints change the same trajectory in multiple musical domains", () => {
  const seed = VIBE_TEST_SEED;
  const summaries = VIBE_IDS.map((vibeId) =>
    summarizeTrajectory(seed, vibeId),
  );
  assertVibeEndpointsSeparated(summaries);
});
