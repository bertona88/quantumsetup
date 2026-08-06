import assert from "node:assert/strict";
import test from "node:test";

let contextConstructions = 0;
let delayedCloseResolve = null;

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
  constructor(options) {
    contextConstructions += 1;
    this.state = "suspended";
    this.currentTime = 0;
    this.delayClose = false;
  }

  async resume() {
    this.state = "running";
  }

  close() {
    if (this.state === "closed") return Promise.resolve();
    if (!this.delayClose) {
      this.state = "closed";
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      delayedCloseResolve = () => {
        this.state = "closed";
        resolve();
      };
    });
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
      values[0] = 0x12345678;
      return values;
    },
  },
};

const { InfiniteTechnoEngine, audioLatencyHintFor } = await import("./audio-engine.js");

test("mobile devices request a playback-sized audio buffer", () => {
  assert.equal(audioLatencyHintFor({ maxTouchPoints: 5, userAgent: "Safari" }), "playback");
  assert.equal(audioLatencyHintFor({ maxTouchPoints: 0, userAgent: "Android" }), "playback");
  assert.equal(audioLatencyHintFor({ maxTouchPoints: 0, userAgent: "Desktop" }), "interactive");
});

function installMinimalStartGraph(engine) {
  engine.buildGraph = () => {
    engine.masterGain = { gain: new FakeAudioParam(0.0001) };
    engine.analyser = {};
  };
  engine.loadSynthBank = async () => {};
  engine.safeScheduler = () => {};
}

test("interrupted context release blocks a replacement context until close resolves", async () => {
  contextConstructions = 0;
  delayedCloseResolve = null;
  const engine = new InfiniteTechnoEngine(() => {}, { seed: 1 });
  installMinimalStartGraph(engine);

  const oldContext = new FakeAudioContext();
  oldContext.state = "running";
  oldContext.delayClose = true;
  engine.ctx = oldContext;
  engine.masterGain = { gain: new FakeAudioParam(0.46) };
  engine.running = true;

  const stopping = engine.stop("interrupted");
  const restarting = engine.start();
  for (
    let turn = 0;
    turn < 8 && typeof delayedCloseResolve !== "function";
    turn += 1
  ) {
    await Promise.resolve();
  }

  assert.equal(engine.contextReleasing, true);
  assert.equal(contextConstructions, 1);
  assert.equal(typeof delayedCloseResolve, "function");

  delayedCloseResolve();
  await stopping;
  await restarting;

  assert.equal(contextConstructions, 2);
  assert.equal(engine.contextReleasing, false);
  assert.equal(engine.running, true);
  await engine.stop();
});

test("stop cancels a replacement start that is waiting for context release", async () => {
  contextConstructions = 0;
  delayedCloseResolve = null;
  const engine = new InfiniteTechnoEngine(() => {}, { seed: 2 });
  installMinimalStartGraph(engine);

  const oldContext = new FakeAudioContext();
  oldContext.state = "running";
  oldContext.delayClose = true;
  engine.ctx = oldContext;
  engine.masterGain = { gain: new FakeAudioParam(0.46) };
  engine.running = true;

  const interruptedStop = engine.stop("interrupted");
  const restarting = engine.start();
  for (
    let turn = 0;
    turn < 8 && typeof delayedCloseResolve !== "function";
    turn += 1
  ) {
    await Promise.resolve();
  }

  assert.equal(engine.starting, true);
  assert.equal(contextConstructions, 1);
  const pagehideStop = engine.stop("pagehide");
  delayedCloseResolve();
  await Promise.all([interruptedStop, restarting, pagehideStop]);

  assert.equal(contextConstructions, 1);
  assert.equal(engine.contextReleasing, false);
  assert.equal(engine.running, false);
  assert.equal(engine.starting, false);
  assert.equal(engine.ctx, null);
});

test("stopped taste updates wait for the next authorized palette handoff", () => {
  const engine = new InfiniteTechnoEngine(() => {}, {
    seed: 0,
    vibe: "acid",
  });
  engine.preparePlan(8);
  const residentIds = ["fm", "modal", "string"].map(
    (engineId) => engine.runtimeSynthPalette[engineId].id,
  );
  const resident = engine.runtimeSynthPalette;
  engine.setTasteProfile({
    schemaVersion: 1,
    weights: { brightness: 0.7, warmth: -0.2 },
    likes: 3,
    passes: 0,
  });
  engine.preparePlan(8);

  assert.equal(engine.runtimeSynthPalette, resident);
  assert.deepEqual(
    ["fm", "modal", "string"].map(
      (engineId) => engine.runtimeSynthPalette[engineId].id,
    ),
    residentIds,
  );

  let authorizedPlan = null;
  for (let bar = 16; bar <= 2048; bar += 8) {
    const plan = engine.preparePlan(bar);
    const changed = ["fm", "modal", "string"].filter(
      (engineId, index) =>
        engine.runtimeSynthPalette[engineId].id !== residentIds[index],
    );
    if (!plan.synthHandoff) {
      assert.deepEqual(changed, []);
      continue;
    }
    authorizedPlan = plan;
    assert.ok(changed.length <= 1);
    assert.ok(
      changed.every((engineId) => engineId === plan.synthHandoff.engine),
    );
    break;
  }
  assert.ok(authorizedPlan, "expected an emergent motif handoff");
});
