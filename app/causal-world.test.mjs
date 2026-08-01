import assert from "node:assert/strict";
import test from "node:test";

import {
  CausalWorld,
  createSpacetimeEvents,
  temporalEnvelope,
} from "./causal-world.js";

const seed = "0123456789abcdeffedcba9876543210";

const forecast = Object.freeze({
  seed,
  stepDuration: 0.125,
  genes: Object.freeze({
    curl: 0.4,
    memory: 0.95,
    eccentricity: 1.1,
    interference: 0.8,
  }),
  events: Object.freeze([
    Object.freeze({
      bar: 4,
      step: 0,
      offsetSteps: 0,
      coordinate: 42,
      channels: Object.freeze({ kick: 1, bass: 0.7, hat: 0, chord: 0, synth: 0, percussion: 0 }),
    }),
    Object.freeze({
      bar: 4,
      step: 4,
      offsetSteps: 4,
      coordinate: 84,
      channels: Object.freeze({ kick: 0, bass: 0, hat: 0.55, chord: 0, synth: 0, percussion: 0 }),
    }),
  ]),
});

test("future pressure, exact impact, and persistent memory form one temporal envelope", () => {
  const distant = temporalEnvelope(10, 0, "bass");
  const premonition = temporalEnvelope(10, 6, "bass");
  const impact = temporalEnvelope(10, 10, "bass");
  const residue = temporalEnvelope(10, 16, "bass");
  const oldResidue = temporalEnvelope(10, 34, "bass");
  assert.equal(distant.anticipation, 0);
  assert.ok(premonition.anticipation > 0);
  assert.ok(impact.pressure > premonition.pressure);
  assert.ok(residue.memory > 0);
  assert.ok(oldResidue.memory < residue.memory);
});

test("one frozen musical step becomes stable co-located spacetime events", () => {
  const events = createSpacetimeEvents({ forecast, audioTime: 20 });
  assert.deepEqual(events, createSpacetimeEvents({ forecast, audioTime: 20 }));
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.kind), ["bass", "kick", "hat"]);
  assert.ok(events.every((event) => event.x >= 0.12 && event.x <= 0.88));
  assert.ok(events.every((event) => event.y >= 0.12 && event.y <= 0.82));
  assert.equal(events[0].time, 20);
  assert.equal(events[2].time, 20.5);
});

test("the deterministic world bends before sound and retains a scar afterward", () => {
  const first = new CausalWorld(seed);
  const second = new CausalWorld(seed);
  for (const world of [first, second]) {
    world.setRunning(true, 15);
    world.ingestForecast({ forecast, audioTime: 20 });
    world.advance({ delta: 0.1, audibleTime: 16, energy: 0.6 });
  }
  const initial = new CausalWorld(seed).filaments[0].nodes[0];
  const bent = first.filaments[0].nodes[0];
  assert.notEqual(bent.x, initial.x);
  assert.deepEqual(first.filaments, second.filaments);

  first.advance({ delta: 0.1, audibleTime: 20.05, energy: 0.6 });
  assert.ok(first.scars.some((scar) => scar.kind === "kick"));
  first.advance({ delta: 0.1, audibleTime: 27, energy: 0.4 });
  assert.ok(first.scars.some((scar) => scar.age > 0 && scar.kind === "kick"));
});

test("forecast ingestion is idempotent and never mutates the frozen score", () => {
  const before = JSON.stringify(forecast);
  const world = new CausalWorld(seed);
  world.ingestForecast({ forecast, audioTime: 20 });
  const count = world.events.length;
  world.ingestForecast({ forecast, audioTime: 20 });
  assert.equal(world.events.length, count);
  assert.equal(JSON.stringify(forecast), before);
});
