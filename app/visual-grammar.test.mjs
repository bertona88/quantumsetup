import assert from "node:assert/strict";
import test from "node:test";

import { buildBarPlan, profileForVibe } from "./techno-model.js";
import {
  createVisualForecast,
  visualGenesForPhrase,
  visualUnit,
} from "./visual-grammar.js";

const seed = "0123456789abcdeffedcba9876543210";

test("visual grammar is deterministic and changes by coordinate", () => {
  assert.equal(visualUnit(seed, 4, 2, "kick"), visualUnit(seed, 4, 2, "kick"));
  assert.notEqual(visualUnit(seed, 4, 2, "kick"), visualUnit(seed, 4, 3, "kick"));
});

test("visual genes are bounded, deterministic, and evolve by phrase", () => {
  const first = visualGenesForPhrase(seed, 0);
  assert.deepEqual(first, visualGenesForPhrase(seed, 0));
  assert.notDeepEqual(first, visualGenesForPhrase(seed, 1));
  assert.ok(first.interference >= 0.58 && first.interference <= 1);
  assert.ok(first.orbit >= 0.2 && first.orbit <= 0.82);
  assert.ok(first.cellular >= 0.08 && first.cellular <= 0.66);
  assert.ok(first.symmetry >= 3 && first.symmetry <= 9);
  assert.ok(first.memory >= 0.86 && first.memory <= 0.965);
});

test("forecast exposes frozen musical events without mutating the plans", () => {
  const plans = Array.from({ length: 8 }, (_, bar) =>
    buildBarPlan({
      seed,
      bar,
      vibeId: "hypnotic",
      tonality: "minor",
      profile: profileForVibe("hypnotic"),
    }),
  );
  const before = JSON.stringify(plans);
  const forecast = createVisualForecast({
    seed,
    phrasePlans: plans,
    bar: 2,
    stepDuration: 0.115,
  });
  assert.equal(forecast.bar, 2);
  assert.equal(forecast.phraseIndex, 0);
  assert.equal(forecast.horizonSteps, 96);
  assert.ok(forecast.events.length > 0);
  assert.ok(forecast.events.every((event) => event.offsetSteps >= 0));
  assert.ok(forecast.events.every((event) => event.offsetSteps < 96));
  assert.equal(JSON.stringify(plans), before);
});

test("forecast includes every audible echo-ascent percussion hit", () => {
  const phraseStart = 5 * 8;
  const plans = Array.from({ length: 8 }, (_, barInPhrase) =>
    buildBarPlan({ seed: 0, bar: phraseStart + barInPhrase }),
  );
  const forecast = createVisualForecast({
    seed: 0,
    phrasePlans: plans,
    bar: phraseStart + 4,
    stepDuration: 0.115,
  });
  let assertedHits = 0;
  for (const plan of plans.slice(4)) {
    for (const [step, hit] of plan.echoAscent.hits.entries()) {
      if (!hit) continue;
      const event = forecast.events.find(
        (candidate) => candidate.bar === plan.bar && candidate.step === step,
      );
      assert.ok(event, `missing echo-ascent forecast at ${plan.bar}:${step}`);
      assert.ok(event.channels.percussion >= hit.velocity);
      assertedHits += 1;
    }
  }
  assert.ok(assertedHits > 0);
});
