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
      values[0] = 0x12345678;
      return values;
    },
  },
};

const { InfiniteTechnoEngine } = await import("./audio-engine.js");

test("stopped direction changes are immediate without rewriting a frozen phrase", () => {
  const events = [];
  const engine = new InfiniteTechnoEngine((event) => events.push(event), {
    seed: 7,
    vibe: "hypnotic",
  });
  engine.preparePlan(0);
  const frozenPlans = engine.phrasePlans;
  const material = engine.materialState;

  assert.equal(engine.requestDirectionControl("energy", 0.75), true);
  assert.equal(engine.resolveDirectionControls(0).energy, 0.75);
  assert.equal(engine.phrasePlans, frozenPlans);
  assert.equal(engine.materialState, material);
  assert.equal(events.at(-1).immediate, true);
});

test("running direction enters on an eight-bar boundary and glides for one phrase", () => {
  const events = [];
  const engine = new InfiniteTechnoEngine((event) => events.push(event), {
    seed: 11,
    vibe: "hypnotic",
  });
  engine.running = true;
  engine.bar = 3;

  assert.equal(engine.requestDirectionControl("brightness", 1), true);
  assert.equal(engine.directionTransition.startBar, 8);
  assert.equal(engine.directionTransition.duration, 8);
  assert.equal(engine.resolveDirectionControls(7).brightness, 0);
  assert.equal(engine.resolveDirectionControls(8).brightness, 0);
  assert.ok(engine.resolveDirectionControls(12).brightness > 0);
  assert.equal(engine.resolveDirectionControls(16).brightness, 1);
  assert.equal(events.at(-1).startBar, 8);

  engine.settleTransitions(16);
  assert.equal(engine.directionTransition, null);
  assert.equal(engine.directionControls.brightness, 1);
});

test("bass character remains discrete until the direction glide completes", () => {
  const engine = new InfiniteTechnoEngine(() => {}, { seed: 12 });
  engine.running = true;
  engine.bar = 1;
  engine.requestBassCharacter("acid");

  assert.equal(engine.resolveDirectionControls(8).bassCharacter, "auto");
  assert.equal(engine.resolveDirectionControls(15).bassCharacter, "auto");
  assert.equal(engine.resolveDirectionControls(16).bassCharacter, "acid");
});

test("Vibe transitions capture the unshaped base profile", () => {
  const engine = new InfiniteTechnoEngine(() => {}, {
    seed: 13,
    vibe: "hypnotic",
  });
  engine.requestDirectionControl("energy", 1);
  const shapedDrive = engine.resolveMusicalState(0).profile.drive;
  const baseDrive = engine.resolveBaseMusicalState(0).profile.drive;
  assert.ok(shapedDrive > baseDrive);

  engine.running = true;
  engine.requestVibe("acid");
  assert.equal(engine.vibeTransition.fromProfile.drive, baseDrive);
});

test("performance snapshot is deeply frozen and separates active from target", () => {
  const engine = new InfiniteTechnoEngine(() => {}, { seed: 14 });
  engine.running = true;
  engine.bar = 2;
  engine.requestDirectionControl("space", 0.8);
  engine.requestMixControl("kick", true);
  const performance = engine.getSnapshot().performance;

  assert.ok(Object.isFrozen(performance));
  assert.ok(Object.isFrozen(performance.mix));
  assert.ok(Object.isFrozen(performance.pendingCuts));
  assert.ok(Object.isFrozen(performance.direction));
  assert.ok(Object.isFrozen(performance.directionTarget));
  assert.equal(performance.direction.space, 0);
  assert.equal(performance.directionTarget.space, 0.8);
  assert.equal(performance.pendingCuts.kickCut, true);
});
