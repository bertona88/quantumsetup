import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  AudioContext: class {},
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
const { buildBarPlan, hash32, profileForVibe } = await import("./techno-model.js");
const { selectDistinctTrajectorySeed } = await import("./track-dna.js");

const OLD_SEED = "00000000000000000000000000000001";
const NEW_SEED = "00000000000000000000000000000002";

function roleSignature(roles) {
  return Object.fromEntries(
    ["fm", "modal", "string"].map((engine) => [
      engine,
      `${roles[engine].sourceSceneId}:${roles[engine].id}`,
    ]),
  );
}

function paletteSignature(palette) {
  return Object.fromEntries(
    ["fm", "modal", "string"].map((engine) => [engine, palette[engine].id]),
  );
}

test("a running trajectory boundary replaces resident seed-bound synth identity", () => {
  const events = [];
  const workletMessages = [];
  const engine = new InfiniteTechnoEngine((event) => events.push(event), {
    seed: OLD_SEED,
    vibe: "hypnotic",
    tonality: "minor",
  });

  engine.preparePlan(8);
  const priorPalette = engine.runtimeSynthPalette;
  const priorRoles = engine.runtimeEnsembleRoles;
  const priorPaletteSignature = paletteSignature(priorPalette);
  const priorRoleSignature = roleSignature(priorRoles);
  for (const id of Object.values(priorPaletteSignature)) {
    engine.sentSynthGenomeIds.add(id);
  }

  engine.running = true;
  engine.synthWorkletReady = true;
  engine.synthBank = {
    port: {
      postMessage(message) {
        workletMessages.push(message);
      },
    },
  };

  const profile = profileForVibe("hypnotic");
  const expected = buildBarPlan({
    seed: NEW_SEED,
    bar: 16,
    vibeId: "hypnotic",
    tonality: "minor",
    profile,
    instrumentProfile: profile,
    tasteProfile: engine.tasteProfile,
  });
  const applySeed = engine.applySeed.bind(engine);
  let boundaryReset = null;
  engine.applySeed = (seed, selection) => {
    applySeed(seed, selection);
    boundaryReset = {
      palette: engine.runtimeSynthPalette,
      roles: engine.runtimeEnsembleRoles,
      synthPhraseIndex: engine.runtimeSynthPhraseIndex,
      ensemblePhraseIndex: engine.runtimeEnsemblePhraseIndex,
      instrumentProfile: engine.instrumentProfile,
      sentGenomeCount: engine.sentSynthGenomeIds.size,
    };
  };
  engine.pendingSeed = {
    seed: NEW_SEED,
    startBar: 16,
    selection: null,
  };
  engine.bar = 16;

  const entered = engine.preparePlan(16);

  assert.deepEqual(boundaryReset, {
    palette: null,
    roles: null,
    synthPhraseIndex: -1,
    ensemblePhraseIndex: -1,
    instrumentProfile: null,
    sentGenomeCount: 0,
  });
  assert.notEqual(engine.runtimeSynthPalette, priorPalette);
  assert.notEqual(engine.runtimeEnsembleRoles, priorRoles);
  assert.deepEqual(
    paletteSignature(engine.runtimeSynthPalette),
    paletteSignature(expected.synthPalette),
  );
  assert.deepEqual(
    roleSignature(engine.runtimeEnsembleRoles),
    roleSignature(expected.ensembleTargetRoles),
  );
  assert.notDeepEqual(
    paletteSignature(engine.runtimeSynthPalette),
    priorPaletteSignature,
  );
  assert.notDeepEqual(
    roleSignature(engine.runtimeEnsembleRoles),
    priorRoleSignature,
  );
  assert.equal(entered.ensembleScene.id, expected.ensembleScene.id);
  assert.equal(workletMessages[0].type, "all-notes-off");
  assert.deepEqual(events.at(-1), {
    type: "seed",
    seed: NEW_SEED,
    bar: 16,
    identityReset: true,
    dnaDistance: null,
    changedDomains: null,
  });
  assert.ok(
    workletMessages
      .slice(1)
      .every((message) => message.type === "define-genome"),
  );
});

test("new trajectory requests select a bounded macro-distinct seed candidate", () => {
  const candidates = Array.from({ length: 16 }, (_, index) =>
    Array.from({ length: 4 }, (_, word) =>
      hash32("audio-engine-trajectory", index + 1, word)
        .toString(16)
        .padStart(8, "0"),
    ).join(""),
  );
  const expected = selectDistinctTrajectorySeed(OLD_SEED, candidates);
  assert.ok(expected);

  const priorGetRandomValues = window.crypto.getRandomValues;
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
    engine.running = true;
    engine.bar = 3;
    engine.requestNewTrajectory();

    assert.equal(cursor, candidates.length);
    assert.equal(engine.pendingSeed.seed, expected.seed);
    assert.deepEqual(engine.pendingSeed.selection, expected);
    assert.equal(engine.pendingSeed.startBar, 16);
    assert.deepEqual(events.at(-1), {
      type: "intent",
      kind: "seed",
      seed: expected.seed,
      startBar: 16,
      immediate: false,
      dnaDistance: expected.distance,
      changedDomains: expected.changedDomains,
    });
  } finally {
    window.crypto.getRandomValues = priorGetRandomValues;
  }
});

test("a trajectory request never enters a candidate below the DNA gate", () => {
  const priorGetRandomValues = window.crypto.getRandomValues;
  window.crypto.getRandomValues = (values) => {
    values.set(
      Array.from({ length: 4 }, (_, word) =>
        Number.parseInt(OLD_SEED.slice(word * 8, word * 8 + 8), 16),
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
    engine.preparePlan(0);
    const residentMaterial = engine.materialState;
    const residentPlans = engine.phrasePlans;
    engine.running = true;
    engine.bar = 3;

    assert.equal(engine.requestNewTrajectory(), false);
    assert.equal(engine.seed, OLD_SEED);
    assert.equal(engine.pendingSeed, null);
    assert.equal(engine.materialState, residentMaterial);
    assert.equal(engine.phrasePlans, residentPlans);
    assert.deepEqual(events.at(-1), {
      type: "trajectory-rejected",
      reason: "insufficient-dna-distance",
      candidateCount: 16,
    });
  } finally {
    window.crypto.getRandomValues = priorGetRandomValues;
  }
});
