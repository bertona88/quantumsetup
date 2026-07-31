import assert from "node:assert/strict";
import test from "node:test";

let contextConstructions = 0;

class FakeAudioParam {
  constructor(value = 1) {
    this.value = value;
  }

  cancelAndHoldAtTime() {}

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }

  exponentialRampToValueAtTime(value) {
    this.value = value;
  }
}

class FakeAudioContext {
  constructor() {
    contextConstructions += 1;
    this.state = "running";
    this.currentTime = 0;
  }

  async resume() {
    this.state = "running";
  }

  async close() {
    this.state = "closed";
  }
}

globalThis.window = {
  AudioContext: FakeAudioContext,
  AudioWorkletNode: null,
  clearInterval() {},
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  setTimeout(callback) {
    queueMicrotask(callback);
    return 1;
  },
  crypto: {
    getRandomValues(values) {
      values.fill(1);
      return values;
    },
  },
};

const { InfiniteTechnoEngine } = await import("./audio-engine.js");
const { summarizeMaterialState } = await import("./material-planner.js");
const { hash32 } = await import("./techno-model.js");
const { selectDistinctTrajectorySeed } = await import("./track-dna.js");

const OLD_SEED = "00000000000000000000000000000001";

function createEngine(options = {}) {
  return new InfiniteTechnoEngine(() => {}, {
    seed: OLD_SEED,
    vibe: "hypnotic",
    tonality: "minor",
    ...options,
  });
}

function assertDeepFrozen(value, seen = new Set(), path = "value") {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, `${path} was mutable`);
  for (const [key, child] of Object.entries(value)) {
    assertDeepFrozen(child, seen, `${path}.${key}`);
  }
}

function distinctTrajectoryCandidates() {
  return Array.from({ length: 16 }, (_, index) =>
    Array.from({ length: 4 }, (_, word) =>
      hash32("audio-engine-material", index + 1, word)
        .toString(16)
        .padStart(8, "0"),
    ).join(""),
  );
}

function attachSilentScheduler(engine) {
  for (const method of [
    "kick",
    "duck",
    "clap",
    "hat",
    "shaker",
    "ride",
    "rim",
    "metallic",
    "tom",
    "bass",
    "scheduleSynthNote",
    "chord",
    "pad",
    "texture",
    "riser",
    "downlifter",
    "queueVisual",
  ]) {
    engine[method] = () => {};
  }
  engine.ctx = { state: "running", currentTime: 0 };
  engine.running = true;
  engine.nextStepTime = 0;
}

function driveSchedulerThroughBar(engine, targetBar) {
  let guard = 0;
  while (engine.planBar < targetBar && guard < 4096) {
    engine.ctx.currentTime = engine.nextStepTime;
    engine.scheduler();
    guard += 1;
  }
  assert.ok(guard < 4096, `scheduler did not reach bar ${targetBar}`);
}

test("runtime material enters exactly once per eight-bar phrase", () => {
  const engine = createEngine();
  const entries = [];
  const advanceMaterialToPhrase =
    engine.advanceMaterialToPhrase.bind(engine);
  engine.advanceMaterialToPhrase = (phraseIndex, settledState) => {
    const prior = engine.materialState;
    const material = advanceMaterialToPhrase(phraseIndex, settledState);
    entries.push({ phraseIndex, prior, material });
    return material;
  };

  for (let bar = 0; bar < 8; bar += 1) {
    const plan = engine.preparePlan(bar);
    assert.equal(plan.phraseIndex, 0);
    assert.equal(engine.materialState.phraseIndex, 0);
  }
  const phraseZero = engine.materialState;
  const phraseZeroPlans = engine.phrasePlans;
  assert.deepEqual(entries.map((entry) => entry.phraseIndex), [0]);

  for (let bar = 8; bar < 16; bar += 1) {
    const plan = engine.preparePlan(bar);
    assert.equal(plan.phraseIndex, 1);
    assert.equal(engine.materialState.phraseIndex, 1);
  }
  const phraseOne = engine.materialState;
  assert.notEqual(phraseOne, phraseZero);
  assert.notEqual(engine.phrasePlans, phraseZeroPlans);
  assert.deepEqual(entries.map((entry) => entry.phraseIndex), [0, 1]);
  assert.equal(entries[1].prior, phraseZero);
  assert.equal(entries[1].material, phraseOne);

  engine.preparePlan(16);
  engine.preparePlan(17);
  engine.preparePlan(23);
  assert.deepEqual(entries.map((entry) => entry.phraseIndex), [0, 1, 2]);
  assert.equal(engine.materialState.phraseIndex, 2);
});

test("mid-phrase intents cannot replace or mutate cached current-phrase plans", () => {
  const engine = createEngine();
  const firstPlan = engine.preparePlan(0);
  const cachedPlans = engine.phrasePlans;
  const cachedMaterial = engine.materialState;
  const cachedFingerprints = cachedPlans.map((plan) => plan.fingerprint);

  assert.equal(firstPlan, cachedPlans[0]);
  assertDeepFrozen(cachedPlans, new Set(), "phrasePlans");
  assert.throws(() => {
    cachedPlans[0].kick[0] = 0;
  }, TypeError);

  engine.running = true;
  engine.bar = 3;
  engine.requestVibe("acid");
  engine.requestTonality("major");
  assert.equal(engine.vibeTransition.startBar, 8);
  assert.equal(engine.tonalityTransition.startBar, 8);

  for (const bar of [3, 5, 7]) {
    const plan = engine.preparePlan(bar);
    assert.equal(engine.phrasePlans, cachedPlans);
    assert.equal(engine.materialState, cachedMaterial);
    assert.equal(plan, cachedPlans[bar]);
    assert.deepEqual(
      engine.phrasePlans.map((candidate) => candidate.fingerprint),
      cachedFingerprints,
    );
  }

  engine.bar = 8;
  const nextPhrasePlan = engine.preparePlan(8);
  assert.notEqual(engine.phrasePlans, cachedPlans);
  assert.notEqual(engine.materialState, cachedMaterial);
  assert.equal(engine.materialState.phraseIndex, 1);
  assert.equal(nextPhrasePlan, engine.phrasePlans[0]);
});

test("scheduler-applied Vibe and Tonality intents diverge only after the queued phrase boundary", () => {
  const control = createEngine();
  const intent = createEngine();
  attachSilentScheduler(control);
  attachSilentScheduler(intent);
  driveSchedulerThroughBar(control, 3);
  driveSchedulerThroughBar(intent, 3);

  const controlCurrentPlans = control.phrasePlans;
  const intentCurrentPlans = intent.phrasePlans;
  assert.deepEqual(intentCurrentPlans, controlCurrentPlans);
  intent.requestVibe("acid");
  intent.requestTonality("major");
  assert.equal(intent.vibeTransition.startBar, 8);
  assert.equal(intent.tonalityTransition.startBar, 8);

  driveSchedulerThroughBar(control, 7);
  driveSchedulerThroughBar(intent, 7);
  assert.equal(control.phrasePlans, controlCurrentPlans);
  assert.equal(intent.phrasePlans, intentCurrentPlans);
  assert.deepEqual(intent.phrasePlans, control.phrasePlans);

  driveSchedulerThroughBar(control, 24);
  driveSchedulerThroughBar(intent, 24);
  assert.ok(control.materialState.phraseIndex >= 3);
  assert.equal(intent.materialState.phraseIndex, control.materialState.phraseIndex);
  assert.notDeepEqual(
    intent.materialState,
    control.materialState,
    "queued intents did not influence a future material phrase",
  );
  assert.notDeepEqual(
    intent.phrasePlans,
    control.phrasePlans,
    "queued intents did not influence future frozen bar plans",
  );
});

test("skipped runtime phrases replay every material transition before planning the target", () => {
  const sequential = createEngine();
  const jumped = createEngine();

  for (const bar of [0, 8, 16, 24, 32]) {
    sequential.preparePlan(bar);
  }
  jumped.preparePlan(0);
  const initialJumpedState = jumped.materialState;
  jumped.preparePlan(32);

  assert.equal(initialJumpedState.phraseIndex, 0);
  assert.equal(jumped.materialPhraseIndex, 4);
  assert.equal(jumped.materialState.phraseIndex, 4);
  assert.deepEqual(jumped.materialState, sequential.materialState);
  assert.deepEqual(
    jumped.phrasePlans.map((plan) => plan.material),
    sequential.phrasePlans.map((plan) => plan.material),
  );
  assert.equal(
    jumped.materialState.phraseMemory.recentFingerprints.length,
    5,
  );
});

test("skipped phrases replay ensemble roles and synth palettes before freezing the target", () => {
  const seed = "00000000000000000000000000000002";
  const sequential = createEngine({ seed });
  const jumped = createEngine({ seed });

  for (let phraseIndex = 0; phraseIndex <= 12; phraseIndex += 1) {
    const bar = phraseIndex * 8;
    sequential.bar = bar;
    sequential.preparePlan(bar);
  }
  jumped.preparePlan(0);
  jumped.bar = 96;
  jumped.preparePlan(96);

  assert.deepEqual(jumped.materialState, sequential.materialState);
  assert.deepEqual(
    jumped.runtimeEnsembleRoles,
    sequential.runtimeEnsembleRoles,
  );
  assert.deepEqual(
    jumped.runtimeSynthPalette,
    sequential.runtimeSynthPalette,
  );
  assert.deepEqual(jumped.phrasePlans, sequential.phrasePlans);
  assertDeepFrozen(jumped.phrasePlans, new Set(), "jumped.phrasePlans");
});

test("completed Vibe transitions retain historical phrase profiles during catch-up", () => {
  const seed = "00000000000000000000000000000005";
  const sequential = createEngine({ seed });
  const jumped = createEngine({ seed });

  for (const engine of [sequential, jumped]) {
    engine.preparePlan(0);
    engine.running = true;
    engine.bar = 1;
    engine.requestVibe("acid");
    assert.equal(engine.vibeTransition.startBar, 8);
    assert.equal(engine.vibeTransition.duration, 64);
  }

  for (let bar = 8; bar <= 72; bar += 8) {
    sequential.bar = bar;
    sequential.preparePlan(bar);
  }
  jumped.bar = 72;
  jumped.preparePlan(72);

  assert.equal(sequential.vibeTransition, null);
  assert.equal(jumped.vibeTransition, null);
  assert.equal(sequential.activeVibe, "acid");
  assert.equal(jumped.activeVibe, "acid");
  assert.deepEqual(jumped.materialState, sequential.materialState);
  assert.deepEqual(
    jumped.runtimeEnsembleRoles,
    sequential.runtimeEnsembleRoles,
  );
  assert.deepEqual(
    jumped.runtimeSynthPalette,
    sequential.runtimeSynthPalette,
  );
  assert.deepEqual(jumped.phrasePlans, sequential.phrasePlans);
});

test("a jumped New Trajectory replays from its accepted seed boundary", () => {
  const nextSeed = "11111111111111111111111111111111";
  const selection = selectDistinctTrajectorySeed(OLD_SEED, [nextSeed]);
  assert.ok(selection);

  const sequential = createEngine();
  const jumped = createEngine();
  for (const engine of [sequential, jumped]) {
    engine.preparePlan(16);
    engine.running = true;
    engine.bar = 17;
    engine.pendingSeed = {
      seed: selection.seed,
      startBar: 32,
      selection,
    };
    engine.bar = 24;
    engine.preparePlan(24);
  }

  for (let bar = 32; bar <= 64; bar += 8) {
    sequential.bar = bar;
    sequential.preparePlan(bar);
  }
  jumped.bar = 64;
  jumped.preparePlan(64);

  assert.equal(sequential.seed, selection.seed);
  assert.equal(jumped.seed, selection.seed);
  assert.equal(jumped.materialState.phraseIndex, 8);
  assert.equal(
    jumped.materialState.phraseMemory.recentFingerprints.length,
    5,
  );
  assert.ok(
    Object.values(jumped.materialState.clocks).some(
      (clock) => clock.agePhrases > 0 || clock.mutationCount > 0,
    ),
  );
  assert.deepEqual(jumped.materialState, sequential.materialState);
  assert.deepEqual(
    jumped.runtimeEnsembleRoles,
    sequential.runtimeEnsembleRoles,
  );
  assert.deepEqual(
    jumped.runtimeSynthPalette,
    sequential.runtimeSynthPalette,
  );
  assert.deepEqual(jumped.phrasePlans, sequential.phrasePlans);
});

test("snapshots expose the frozen material summary instead of mutable planner state", () => {
  const engine = createEngine();
  engine.bar = 19;
  engine.step = 6;
  engine.preparePlan(engine.bar);

  const snapshot = engine.getSnapshot();
  const expected = summarizeMaterialState(engine.materialState);

  assert.equal(snapshot.version, "2.0.0");
  assert.equal(snapshot.material === engine.materialState, false);
  assert.deepEqual(snapshot.material, expected);
  assertDeepFrozen(snapshot, new Set(), "snapshot");
  assert.equal(
    snapshot.material.phraseFingerprint,
    engine.materialState.phrase.fingerprint,
  );
  assert.equal(snapshot.material.gesture, engine.materialState.gesture);
  assert.equal(
    snapshot.material.answerDirection,
    engine.materialState.answerDirection,
  );
  assert.equal(
    snapshot.material.motifLineageId,
    engine.materialState.motif.lineageId,
  );
  assert.equal(
    snapshot.material.motifParentLineageId,
    engine.materialState.motif.parentLineageId,
  );
  assert.equal(snapshot.material.candidateCount, 12);
  assert.equal(
    snapshot.material.selectedCandidateScore,
    engine.materialState.selection.selectedCandidateScore,
  );
  assert.equal(
    snapshot.material.eligibleCandidateCount,
    engine.materialState.selection.eligibleCandidateCount,
  );
  assert.ok(snapshot.material.samplingTemperature >= 0.35);
  assert.ok(snapshot.material.samplingTemperature <= 0.85);
  assert.deepEqual(
    Object.keys(snapshot.material.laneClocks).sort(),
    [
      "bass",
      "clap",
      "hats",
      "kick",
      "percussion",
      "synthFm",
      "synthModal",
      "synthString",
    ],
  );
  for (const [lane, clock] of Object.entries(engine.materialState.clocks)) {
    assert.equal(
      snapshot.material.laneClocks[lane].loopLength,
      clock.loopLength,
    );
    assert.equal(snapshot.material.laneClocks[lane].hits, clock.hits);
    assert.equal(
      snapshot.material.laneClocks[lane].phaseOrigin,
      clock.phaseOrigin,
    );
  }
  for (const field of [
    "active",
    "remainingPhrases",
    "durationPhrases",
    "anchoredPhrasesSince",
    "requiredAnchoredPhrases",
    "forcedReanchor",
  ]) {
    assert.equal(
      snapshot.material.kickExcursion[field],
      engine.materialState.kickExcursion[field],
    );
  }
  assert.equal("phraseMemory" in snapshot.material, false);
  assert.equal("events" in snapshot.material, false);
});

test("stop releases Web Audio state without discarding material memory", async () => {
  contextConstructions = 0;
  const events = [];
  const engine = new InfiniteTechnoEngine((event) => events.push(event), {
    seed: OLD_SEED,
    vibe: "hypnotic",
    tonality: "minor",
  });
  engine.preparePlan(24);
  engine.bar = 26;
  engine.step = 7;

  const residentMaterial = engine.materialState;
  const residentPlans = engine.phrasePlans;
  const residentSummary = summarizeMaterialState(residentMaterial);
  const context = new FakeAudioContext();
  engine.ctx = context;
  engine.masterGain = { gain: new FakeAudioParam(0.46) };
  engine.running = true;

  await engine.stop("manual");

  assert.equal(contextConstructions, 1);
  assert.equal(context.state, "closed");
  assert.equal(engine.running, false);
  assert.equal(engine.ctx, null);
  assert.equal(engine.materialState, residentMaterial);
  assert.equal(engine.materialPhraseIndex, 3);
  assert.equal(engine.phrasePlans, residentPlans);
  assert.deepEqual(engine.getSnapshot().material, residentSummary);
  assert.deepEqual(events.at(-1), {
    type: "state",
    running: false,
    reason: "manual",
  });

  engine.preparePlan(27);
  assert.equal(engine.materialState, residentMaterial);
  assert.equal(engine.phrasePlans, residentPlans);
  engine.preparePlan(32);
  assert.equal(engine.materialState.phraseIndex, 4);
  assert.ok(
    engine.materialState.phraseMemory.recentFingerprints.includes(
      residentMaterial.phrase.fingerprint,
    ),
  );
});

test("an actual stop and restart preserves the resident material phrase", async () => {
  contextConstructions = 0;
  const engine = createEngine();
  engine.preparePlan(24);
  engine.bar = 24;
  const residentMaterial = engine.materialState;
  const residentPlans = engine.phrasePlans;

  engine.buildGraph = () => {
    engine.masterGain = { gain: new FakeAudioParam(0.0001) };
  };
  engine.loadSynthBank = async () => {};
  engine.safeScheduler = () => {
    if (engine.running) engine.preparePlan(engine.bar);
  };

  await engine.start();
  assert.equal(engine.running, true);
  assert.equal(engine.materialState, residentMaterial);
  assert.equal(engine.phrasePlans, residentPlans);
  await engine.stop("manual");
  assert.equal(engine.running, false);
  await engine.start();
  assert.equal(engine.running, true);
  assert.equal(engine.materialState, residentMaterial);
  assert.equal(engine.phrasePlans, residentPlans);
  assert.equal(contextConstructions, 2);
  await engine.stop("manual");
});

test("an accepted New Trajectory resets material only at its seed boundary", () => {
  const candidates = distinctTrajectoryCandidates();
  const expected = selectDistinctTrajectorySeed(OLD_SEED, candidates);
  assert.ok(expected);

  const previousGetRandomValues = window.crypto.getRandomValues;
  let cursor = 0;
  window.crypto.getRandomValues = (values) => {
    const candidate = candidates[cursor];
    cursor += 1;
    values.set(
      Array.from({ length: 4 }, (_, word) =>
        Number.parseInt(candidate.slice(word * 8, word * 8 + 8), 16),
      ),
    );
    return values;
  };

  try {
    const events = [];
    const engine = new InfiniteTechnoEngine((event) => events.push(event), {
      seed: OLD_SEED,
      vibe: "hypnotic",
      tonality: "minor",
    });
    engine.preparePlan(16);
    engine.running = true;
    engine.bar = 17;

    const applySeed = engine.applySeed.bind(engine);
    let resetObservation = null;
    engine.applySeed = (seed, selection) => {
      const priorMaterial = engine.materialState;
      applySeed(seed, selection);
      resetObservation = {
        priorMaterial,
        materialState: engine.materialState,
        materialPhraseIndex: engine.materialPhraseIndex,
        phrasePlans: engine.phrasePlans,
        phrasePlansPhraseIndex: engine.phrasePlansPhraseIndex,
      };
    };

    assert.equal(engine.requestNewTrajectory(), true);
    assert.equal(cursor, candidates.length);
    assert.equal(engine.pendingSeed.seed, expected.seed);
    assert.equal(engine.pendingSeed.startBar, 32);
    assert.equal(resetObservation, null);

    engine.preparePlan(24);
    const preBoundaryMaterial = engine.materialState;
    const preBoundaryPlans = engine.phrasePlans;
    assert.equal(preBoundaryMaterial.seed, OLD_SEED);
    assert.equal(preBoundaryMaterial.phraseIndex, 3);
    assert.equal(resetObservation, null);

    engine.preparePlan(31);
    assert.equal(engine.materialState, preBoundaryMaterial);
    assert.equal(engine.phrasePlans, preBoundaryPlans);

    engine.bar = 32;
    engine.preparePlan(32);
    assert.deepEqual(resetObservation, {
      priorMaterial: preBoundaryMaterial,
      materialState: null,
      materialPhraseIndex: -1,
      phrasePlans: null,
      phrasePlansPhraseIndex: -1,
    });
    assert.equal(engine.seed, expected.seed);
    assert.equal(engine.pendingSeed, null);
    assert.notEqual(engine.materialState, preBoundaryMaterial);
    assert.equal(engine.materialState.seed, expected.seed);
    assert.equal(engine.materialState.phraseIndex, 4);
    assert.equal(engine.materialState.phraseMemory.archivedMotifs.length, 0);
    assert.equal(
      engine.materialState.phraseMemory.recentFingerprints.length,
      1,
    );
    assert.ok(
      Object.values(engine.materialState.clocks).every(
        (clock) => clock.agePhrases === 0 && clock.mutationCount === 0,
      ),
    );
    assert.deepEqual(
      engine.plan.material,
      summarizeMaterialState(engine.materialState),
    );
    assert.equal(
      events.some(
        (event) =>
          event.type === "seed" &&
          event.seed === expected.seed &&
          event.identityReset === true,
      ),
      true,
    );
  } finally {
    window.crypto.getRandomValues = previousGetRandomValues;
  }
});
