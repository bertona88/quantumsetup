import assert from "node:assert/strict";
import test from "node:test";

import {
  PULSE_BASS_PROCESSORS,
  PULSE_BASS_TIMBRES,
  PULSE_BASS_TIMBRE_BY_ID,
  PULSE_BASS_TIMBRE_IDS,
  selectPulseBassTimbre,
} from "./pulse-bass-timbres.js";

function finiteNumbers(value, path = "root") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} was not finite`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    finiteNumbers(child, `${path}.${key}`);
  }
}

test("five pulse timbres expose complete frozen bounded parameter sets", () => {
  assert.deepEqual(PULSE_BASS_TIMBRE_IDS, [
    "raw-square",
    "filtered",
    "wobble-growl",
    "neuro-reese",
    "all-layer-hybrid",
  ]);
  assert.equal(Object.isFrozen(PULSE_BASS_TIMBRES), true);
  assert.equal(Object.isFrozen(PULSE_BASS_PROCESSORS), true);
  assert.equal(
    PULSE_BASS_TIMBRES.reduce((sum, timbre) => sum + timbre.probability, 0),
    1,
  );

  for (const timbre of PULSE_BASS_TIMBRES) {
    assert.equal(PULSE_BASS_TIMBRE_BY_ID[timbre.id], timbre);
    assert.equal(timbre.probability, 0.2);
    assert.ok(timbre.oscillators.length >= 1 && timbre.oscillators.length <= 2);
    assert.ok(timbre.processors.length >= 1 && timbre.processors.length <= 4);
    assert.ok(timbre.envelope.attackSeconds >= 0.003);
    assert.ok(timbre.envelope.attackSeconds <= 0.012);
    assert.ok(timbre.envelope.level > 0 && timbre.envelope.level <= 1);
    assert.ok(timbre.routing.dry > 0 && timbre.routing.dry <= 1);
    assert.ok(timbre.routing.delay >= 0 && timbre.routing.delay <= 0.08);
    assert.ok(timbre.routing.reverb >= 0 && timbre.routing.reverb <= 0.04);
    assert.equal(Object.isFrozen(timbre), true);
    finiteNumbers(timbre, timbre.id);
  }

  for (const processor of Object.values(PULSE_BASS_PROCESSORS)) {
    assert.ok(processor.sweep.peakHz + processor.sweep.peakDriveHz <= 3_000);
    assert.ok(processor.sweep.q + processor.sweep.qDrive <= 5.5);
    assert.ok(processor.shaper.amount + processor.shaper.amountDrive <= 9);
    assert.ok(["2x", "4x"].includes(processor.shaper.oversample));
    assert.ok(processor.formants.length <= 2);
    if (processor.modulation) {
      assert.ok(
        processor.sweep.closeHz >
          Math.abs(processor.modulation.sweepDepthHz),
      );
    }
    if (processor.comb) {
      assert.ok(processor.comb.maximumDelaySeconds <= 0.02);
      assert.ok(
        processor.comb.delaySeconds - processor.comb.modulationSeconds > 0,
      );
      assert.ok(
        processor.comb.delaySeconds + processor.comb.modulationSeconds <=
          processor.comb.maximumDelaySeconds,
      );
      assert.ok(Math.abs(processor.comb.delayedGain) < 0.7);
    }
    finiteNumbers(processor, processor.id);
  }
});

test("resident pulse timbres are deterministic and uniformly distributed", () => {
  const counts = Object.fromEntries(PULSE_BASS_TIMBRE_IDS.map((id) => [id, 0]));
  const sampleCount = 20_000;
  for (let index = 0; index < sampleCount; index += 1) {
    const seed = (index * 0x9e3779b1) >>> 0;
    const materialId = (index * 37 + 11) >>> 0;
    const first = selectPulseBassTimbre(seed, materialId);
    const second = selectPulseBassTimbre(seed, materialId);
    assert.equal(first, second);
    counts[first.id] += 1;
  }

  const expected = sampleCount / PULSE_BASS_TIMBRE_IDS.length;
  for (const [id, count] of Object.entries(counts)) {
    assert.ok(
      Math.abs(count - expected) / expected < 0.045,
      `${id} count ${count} was outside the uniform tolerance`,
    );
  }
});
