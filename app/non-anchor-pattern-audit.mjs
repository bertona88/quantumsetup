import { buildBarPlan, PHRASE_BARS } from "./techno-model.js";

const DEFAULT_TRAJECTORIES = 96;
const DEFAULT_BARS = 192;
const STEP_COUNT = 16;
const SYNTH_ENGINES = Object.freeze(["fm", "modal", "string"]);
const SECONDARY_PERCUSSION = Object.freeze([
  "shaker",
  "ride",
  "rim",
  "metallic",
  "tom",
]);

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function auditSeeds(count) {
  // SplitMix-style fixed coordinates give the audit a stable, well-spread set of
  // 128-bit trajectory IDs without depending on runtime entropy.
  let state = 0x9e3779b97f4a7c15n;
  const mask = (1n << 64n) - 1n;
  const next = () => {
    state = (state + 0x9e3779b97f4a7c15n) & mask;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & mask;
    return (value ^ (value >> 31n)) & mask;
  };
  return Array.from({ length: count }, () =>
    `${next().toString(16).padStart(16, "0")}${next()
      .toString(16)
      .padStart(16, "0")}`,
  );
}

function mask(lane) {
  return lane.map((event) => (event ? "1" : "0")).join("");
}

function relativeDegrees(lane) {
  const degrees = lane.filter(Boolean).map((event) => event.degree);
  if (degrees.length === 0) return "-";
  const origin = degrees[0];
  return degrees.map((degree) => degree - origin).join(",");
}

function chordShape(lane) {
  return lane
    .filter(Boolean)
    .map(({ notes }) => {
      if (!Array.isArray(notes) || notes.length === 0) return "-";
      const root = notes[0];
      return notes.map((note) => note - root).join(".");
    })
    .join("/") || "-";
}

function synthSignature(plan) {
  const engines = SYNTH_ENGINES.flatMap((engine) => {
    const lane = plan.synth?.[engine] || [];
    if (!lane.some(Boolean)) return [];
    const roles = [...new Set(lane.filter(Boolean).map((note) => note.ensembleRole))];
    return [`${engine}:${mask(lane)}:${relativeDegrees(lane)}:${roles.join("+")}`];
  });
  return engines.join("|") || "silent";
}

function secondaryPercussionSignature(plan) {
  const steps = Array.from({ length: STEP_COUNT }, (_, step) => {
    const voices = SECONDARY_PERCUSSION.filter((voice) => plan[voice]?.[step]);
    return voices.join("+") || "-";
  });
  return steps.every((step) => step === "-") ? "silent" : steps.join("|");
}

function transitionSignature(plan) {
  const events = [];
  if (plan.riser) events.push("riser");
  if (plan.downlifter) events.push("downlifter");
  if (plan.echoAscent) {
    events.push(
      `echo-${plan.echoAscent.variant || "unknown"}-${plan.echoAscent.contourId || "legacy"}`,
    );
  }
  return events.join("+") || "silent";
}

function laneObservations(plan) {
  const bass = plan.bass.some(Boolean)
    ? `${plan.bassVoice}:${mask(plan.bass)}:${relativeDegrees(plan.bass)}`
    : "silent";
  const chord = plan.chord.some(Boolean)
    ? `${mask(plan.chord)}:${chordShape(plan.chord)}`
    : "silent";
  const pad = plan.pad
    ? `${plan.pad.oscillatorTypes.join("+")}:${plan.pad.notes
        .map((note) => note - plan.pad.notes[0])
        .join(".")}:${plan.pad.durationBars}`
    : "silent";
  return Object.freeze({
    bass,
    chord,
    pad,
    synth: synthSignature(plan),
    secondaryPercussion: secondaryPercussionSignature(plan),
    texture: plan.texture ? "texture" : "silent",
    transitions: transitionSignature(plan),
  });
}

function eventSteps(plan, laneId) {
  if (laneId === "bass" || laneId === "chord") {
    return plan[laneId].flatMap((event, step) => (event ? [step] : []));
  }
  if (laneId === "synth") {
    return SYNTH_ENGINES.flatMap((engine) =>
      (plan.synth?.[engine] || []).flatMap((event, step) => (event ? [step] : [])),
    );
  }
  if (laneId === "secondaryPercussion") {
    return SECONDARY_PERCUSSION.flatMap((voice) =>
      plan[voice].flatMap((event, step) => (event ? [step] : [])),
    );
  }
  return [];
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, total, count = 6) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, count)
    .map(([value, occurrences]) => ({
      value,
      occurrences,
      share: Number((occurrences / Math.max(1, total)).toFixed(6)),
    }));
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.round((sorted.length - 1) * fraction)];
}

function runLengths(values) {
  if (values.length === 0) return [];
  const lengths = [];
  let prior = values[0];
  let length = 1;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] === prior) {
      length += 1;
    } else {
      if (prior !== "silent") lengths.push(length);
      prior = values[index];
      length = 1;
    }
  }
  if (prior !== "silent") lengths.push(length);
  return lengths;
}

function summarizeLane(laneId, observations, trajectoryRuns, stepCounts, examples) {
  const total = observations.length;
  const active = observations.filter((value) => value !== "silent");
  const activeCounts = new Map();
  for (const signature of active) increment(activeCounts, signature);
  const runValues = trajectoryRuns.flatMap((values) => runLengths(values));
  const allStepEvents = stepCounts.reduce((sum, value) => sum + value, 0);
  const dominant = topEntries(activeCounts, active.length, 6);
  return Object.freeze({
    bars: total,
    activeBars: active.length,
    presenceRate: Number((active.length / Math.max(1, total)).toFixed(6)),
    uniqueActiveSignatures: activeCounts.size,
    dominantActiveSignatures: dominant.map((entry) => ({
      ...entry,
      example: examples.get(entry.value) || null,
    })),
    consecutiveActiveRunBars: Object.freeze({
      median: percentile(runValues, 0.5),
      p90: percentile(runValues, 0.9),
      maximum: Math.max(0, ...runValues),
    }),
    onsetStepShare: Object.freeze(
      stepCounts.map((occurrences, step) => ({
        step,
        occurrences,
        share: Number((occurrences / Math.max(1, allStepEvents)).toFixed(6)),
      })),
    ),
    phrasePositionPresence: Object.freeze(
      Array.from({ length: PHRASE_BARS }, (_, position) => {
        const matching = observations.filter((_, index) => index % PHRASE_BARS === position);
        const matchingActive = matching.filter((value) => value !== "silent").length;
        return {
          position,
          share: Number((matchingActive / Math.max(1, matching.length)).toFixed(6)),
        };
      }),
    ),
  });
}

export function runNonAnchorPatternAudit({
  trajectoryCount = DEFAULT_TRAJECTORIES,
  bars = DEFAULT_BARS,
} = {}) {
  const seeds = auditSeeds(trajectoryCount);
  const laneIds = [
    "bass",
    "chord",
    "pad",
    "synth",
    "secondaryPercussion",
    "texture",
    "transitions",
  ];
  const observations = Object.fromEntries(laneIds.map((lane) => [lane, []]));
  const trajectoryRuns = Object.fromEntries(laneIds.map((lane) => [lane, []]));
  const stepCounts = Object.fromEntries(
    laneIds.map((lane) => [lane, Array(STEP_COUNT).fill(0)]),
  );
  const examples = Object.fromEntries(laneIds.map((lane) => [lane, new Map()]));
  const gestureCounts = new Map();
  const bassVoiceCounts = new Map();
  const synthEngineCounts = new Map();
  const activeChordEventCounts = new Map();

  for (const seed of seeds) {
    const perTrajectory = Object.fromEntries(laneIds.map((lane) => [lane, []]));
    for (let bar = 0; bar < bars; bar += 1) {
      const plan = buildBarPlan({ seed, bar });
      const observed = laneObservations(plan);
      increment(gestureCounts, plan.materialState.gesture);
      if (plan.bass.some(Boolean)) increment(bassVoiceCounts, plan.bassVoice);
      for (const engine of plan.activeSynthEngines) increment(synthEngineCounts, engine);
      if (plan.chord.some(Boolean)) {
        increment(activeChordEventCounts, String(plan.chord.filter(Boolean).length));
      }
      for (const laneId of laneIds) {
        const signature = observed[laneId];
        observations[laneId].push(signature);
        perTrajectory[laneId].push(signature);
        if (signature !== "silent" && !examples[laneId].has(signature)) {
          examples[laneId].set(signature, { seed, bar });
        }
        for (const step of eventSteps(plan, laneId)) stepCounts[laneId][step] += 1;
      }
    }
    for (const laneId of laneIds) trajectoryRuns[laneId].push(perTrajectory[laneId]);
  }

  const totalBars = trajectoryCount * bars;
  return Object.freeze({
    schema: "quantumsetup-non-anchor-pattern-audit-v1",
    generatorVersion: "2.4.0",
    scope: Object.freeze({
      trajectoryCount,
      barsPerTrajectory: bars,
      totalBars,
      excludedAnchors: Object.freeze(["kick", "clap/snare", "closed hat", "open hat"]),
    }),
    distributions: Object.freeze({
      gestures: topEntries(gestureCounts, totalBars, gestureCounts.size),
      bassVoices: topEntries(
        bassVoiceCounts,
        [...bassVoiceCounts.values()].reduce((sum, value) => sum + value, 0),
        bassVoiceCounts.size,
      ),
      activeSynthEngines: topEntries(
        synthEngineCounts,
        [...synthEngineCounts.values()].reduce((sum, value) => sum + value, 0),
        synthEngineCounts.size,
      ),
      chordEventsPerActiveBar: topEntries(
        activeChordEventCounts,
        [...activeChordEventCounts.values()].reduce((sum, value) => sum + value, 0),
        activeChordEventCounts.size,
      ),
    }),
    lanes: Object.freeze(
      Object.fromEntries(
        laneIds.map((laneId) => [
          laneId,
          summarizeLane(
            laneId,
            observations[laneId],
            trajectoryRuns[laneId],
            stepCounts[laneId],
            examples[laneId],
          ),
        ]),
      ),
    ),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const trajectoryCount = parsePositiveInteger(
    process.env.QS_AUDIT_TRAJECTORIES,
    DEFAULT_TRAJECTORIES,
    512,
  );
  const bars = parsePositiveInteger(process.env.QS_AUDIT_BARS, DEFAULT_BARS, 768);
  console.log(JSON.stringify(runNonAnchorPatternAudit({ trajectoryCount, bars }), null, 2));
}
