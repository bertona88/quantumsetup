import assert from "node:assert/strict";
import test from "node:test";

import {
  AdaptiveVisualQuality,
  VISUAL_QUALITY_LEVELS,
  initialVisualQualityForDevice,
  maximumVisualQualityForBattery,
} from "./quantum-visual.js";

function feed(controller, {
  durationMs,
  frameIntervalMs = 16.67,
  renderMs = 3,
  active = true,
  startAt = 0,
} = {}) {
  let now = startAt;
  let change = null;
  while (now < startAt + durationMs) {
    now += frameIntervalMs;
    change = controller.observe({
      now,
      frameIntervalMs,
      renderMs,
      rendered: true,
      active,
    }) || change;
  }
  return { change, now };
}

test("quality levels trade pixel and shadow cost monotonically", () => {
  const [economy, low, balanced, high] = VISUAL_QUALITY_LEVELS;
  assert.ok(economy.pixelRatioScale < low.pixelRatioScale);
  assert.ok(low.pixelRatioScale < balanced.pixelRatioScale);
  assert.ok(balanced.pixelRatioScale < high.pixelRatioScale);
  assert.ok(economy.shadowSteps < low.shadowSteps);
  assert.ok(low.shadowSteps < balanced.shadowSteps);
  assert.ok(balanced.shadowSteps < high.shadowSteps);
  assert.ok(economy.frameIntervalMs > low.frameIntervalMs);
});

test("sustained headroom upgrades slowly", () => {
  const controller = new AdaptiveVisualQuality();
  const { change } = feed(controller, { durationMs: 11000, renderMs: 3 });
  assert.equal(change?.id, "high");
  assert.equal(controller.quality.id, "high");
});

test("sustained missed frames downgrade quickly and can continue to economy", () => {
  const controller = new AdaptiveVisualQuality({ initialQuality: "high" });
  const warmup = feed(controller, {
    durationMs: 2000,
    frameIntervalMs: 16.67,
    renderMs: 3,
  });
  const first = feed(controller, {
    startAt: warmup.now,
    durationMs: 1200,
    frameIntervalMs: 30,
    renderMs: 15,
  });
  assert.equal(first.change?.id, "balanced");
  const second = feed(controller, {
    startAt: first.now,
    durationMs: 2800,
    frameIntervalMs: 30,
    renderMs: 15,
  });
  assert.equal(second.change?.id, "low");
  assert.equal(controller.quality.id, "low");
  const third = feed(controller, {
    startAt: second.now,
    durationMs: 3000,
    frameIntervalMs: 50,
    renderMs: 24,
  });
  assert.equal(third.change?.id, "economy");
  assert.equal(controller.quality.id, "economy");
});

test("a renderer that starts slow is not mistaken for a slow display", () => {
  const controller = new AdaptiveVisualQuality();
  const { change } = feed(controller, {
    durationMs: 2800,
    frameIntervalMs: 33.33,
    renderMs: 3,
  });
  assert.equal(change?.id, "low");
  assert.equal(controller.quality.id, "low");
});

test("background-sized pauses do not lower quality", () => {
  const controller = new AdaptiveVisualQuality({ initialQuality: "high" });
  for (let now = 1000; now <= 10000; now += 1000) {
    controller.observe({
      now,
      frameIntervalMs: 1000,
      renderMs: 0,
      rendered: false,
      active: false,
    });
  }
  assert.equal(controller.quality.id, "high");
});

test("device signals choose a conservative initial visual budget", () => {
  assert.equal(initialVisualQualityForDevice(), "balanced");
  assert.equal(initialVisualQualityForDevice({ hardwareConcurrency: 4 }), "low");
  assert.equal(initialVisualQualityForDevice({ deviceMemory: 2 }), "economy");
  assert.equal(initialVisualQualityForDevice({ saveData: true }), "economy");
  assert.equal(initialVisualQualityForDevice({ reducedMotion: true }), "economy");
});

test("battery state caps upgrades without affecting audio", () => {
  assert.equal(maximumVisualQualityForBattery({ charging: false, level: 0.1 }), "economy");
  assert.equal(maximumVisualQualityForBattery({ charging: false, level: 0.25 }), "low");
  assert.equal(maximumVisualQualityForBattery({ charging: false, level: 0.8 }), "high");

  const controller = new AdaptiveVisualQuality({ initialQuality: "high" });
  assert.equal(controller.setMaximumQuality("economy")?.id, "economy");
  const { change } = feed(controller, { durationMs: 12000, frameIntervalMs: 40, renderMs: 3 });
  assert.equal(change, null);
  assert.equal(controller.quality.id, "economy");
});
