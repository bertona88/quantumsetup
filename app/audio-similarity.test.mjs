import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_FFT_SIZE,
  AUDIO_RENDER_MIXES,
  AUDIO_STRUCTURE_MIN_DISTANCE,
  audioStructuralDistance,
  extractAudioStructure,
  fftMagnitudes,
} from "./audio-similarity.js";
import { AUDIO_AUDIT_SEEDS } from "./audio-diversity-runner.js";

const SAMPLE_RATE = 16000;
const STEP_DURATION = 0.125;

function impulsePattern(steps, frequency = 80, amplitude = 0.8) {
  const stepSamples = Math.round(STEP_DURATION * SAMPLE_RATE);
  const samples = new Float64Array(stepSamples * 64);
  for (let absoluteStep = 0; absoluteStep < 64; absoluteStep += 1) {
    if (!steps.includes(absoluteStep % 16)) continue;
    const start = absoluteStep * stepSamples;
    for (let index = 0; index < Math.min(stepSamples, 480); index += 1) {
      const envelope = Math.exp(-index / 110);
      samples[start + index] +=
        Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE) *
        envelope * amplitude;
    }
  }
  return samples;
}

test("radix-two FFT places a deterministic sine at its expected bin", () => {
  const bin = 17;
  const frame = Float64Array.from(
    { length: AUDIO_FFT_SIZE },
    (_, index) => Math.sin(2 * Math.PI * bin * index / AUDIO_FFT_SIZE),
  );
  const magnitudes = fftMagnitudes(frame);
  const peak = magnitudes.reduce(
    (best, value, index) => value > best.value ? { index, value } : best,
    { index: -1, value: -Infinity },
  );
  assert.equal(peak.index, bin);
  assert.ok(peak.value > 0.49 && peak.value < 0.51);
});

test("audio structure is deterministic and treats phase-shifted bounce as related", () => {
  const afterKick = extractAudioStructure(
    impulsePattern([1, 5, 9, 13]),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  const identical = extractAudioStructure(
    impulsePattern([1, 5, 9, 13]),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  const offbeat = extractAudioStructure(
    impulsePattern([2, 6, 10, 14]),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  const broken = extractAudioStructure(
    impulsePattern([1, 2, 7, 11, 15]),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  assert.equal(audioStructuralDistance(afterKick, identical), 0);
  const phaseDistance = audioStructuralDistance(afterKick, offbeat);
  const brokenDistance = audioStructuralDistance(afterKick, broken);
  assert.ok(phaseDistance < brokenDistance);
  assert.ok(phaseDistance < AUDIO_STRUCTURE_MIN_DISTANCE);
  assert.ok(brokenDistance > AUDIO_STRUCTURE_MIN_DISTANCE);
});

test("structural audio comparison resists timbre-only novelty", () => {
  const low = extractAudioStructure(
    impulsePattern([2, 6, 10, 14], 70),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  const bright = extractAudioStructure(
    impulsePattern([2, 6, 10, 14], 1200),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  const changed = extractAudioStructure(
    impulsePattern([1, 4, 7, 11, 15], 70),
    SAMPLE_RATE,
    { stepDuration: STEP_DURATION },
  );
  assert.ok(
    audioStructuralDistance(low, bright) < AUDIO_STRUCTURE_MIN_DISTANCE,
  );
  assert.ok(
    audioStructuralDistance(low, changed) > AUDIO_STRUCTURE_MIN_DISTANCE,
  );
});

test("rendered audit manifest is bounded and uses a non-zero rejection gate", () => {
  assert.ok(AUDIO_AUDIT_SEEDS.length >= 8);
  assert.equal(new Set(AUDIO_AUDIT_SEEDS).size, AUDIO_AUDIT_SEEDS.length);
  assert.ok(AUDIO_STRUCTURE_MIN_DISTANCE > 0);
  assert.ok(AUDIO_STRUCTURE_MIN_DISTANCE < 0.5);
  assert.deepEqual(AUDIO_RENDER_MIXES, [
    "full",
    "non-anchors",
    "bass",
    "harmony",
    "synth",
    "secondary-percussion",
    "transitions",
    "drums",
  ]);
});
