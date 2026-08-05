import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTerrainGrid,
  extractSpectralBands,
  lookAtMatrix,
  multiplyMatrices,
  perceptualFrequencyAt,
  perspectiveMatrix,
  resampleMirroredSpectrum,
  SpectrumTerrainHistory,
  visualSpectrumGain,
} from "./spectrum-mountain.js";

function isolatedTone(frequency, sampleRate = 48000, bins = 512) {
  const spectrum = new Uint8Array(bins);
  const bin = Math.round(frequency / (sampleRate * 0.5 / bins));
  spectrum[bin] = 255;
  return spectrum;
}

test("musical spectral bands distinguish sub, body, and air energy", () => {
  const sub = extractSpectralBands(isolatedTone(70));
  const body = extractSpectralBands(isolatedTone(900));
  const air = extractSpectralBands(isolatedTone(10000));
  assert.equal(sub.indexOf(Math.max(...sub)), 0);
  assert.equal(body.indexOf(Math.max(...body)), 2);
  assert.equal(air.indexOf(Math.max(...air)), 4);
  assert.ok([...sub, ...body, ...air].every(Number.isFinite));
});

test("perceptual mirrored resampling retains narrow peaks for mountain relief", () => {
  const terrain = resampleMirroredSpectrum(isolatedTone(1000), 48000, 128);
  assert.equal(terrain.length, 128);
  assert.ok(Math.max(...terrain) > 0.35);
  assert.ok(terrain.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  for (let index = 0; index < terrain.length; index += 1) {
    assert.equal(terrain[index], terrain[terrain.length - 1 - index]);
  }
});

test("mel-like spacing keeps the low end compact and visually gain-balanced", () => {
  const low = 25;
  const high = 16000;
  const bassEdge = Array.from({ length: 1001 }, (_, index) => index / 1000)
    .find((amount) => perceptualFrequencyAt(amount, low, high) >= 360);
  assert.ok(bassEdge > 0.1 && bassEdge < 0.18);
  assert.ok(visualSpectrumGain(70, high) < visualSpectrumGain(1000, high));
  assert.ok(visualSpectrumGain(1000, high) <= visualSpectrumGain(10000, high));
});

test("continuous terrain grid is finite, indexed, and WebGL1-sized", () => {
  const grid = buildTerrainGrid(128, 64);
  assert.equal(grid.vertices.length, (128 + 1) * (64 + 1) * 2);
  assert.equal(grid.indices.length, 128 * 64 * 6);
  assert.ok([...grid.vertices].every(Number.isFinite));
  assert.ok(Math.max(...grid.indices) < 65536);
});

test("terrain history advances continuously and deterministically toward the camera", () => {
  const first = new SpectrumTerrainHistory({ columns: 64, rows: 24, seed: "abc" });
  const second = new SpectrumTerrainHistory({ columns: 64, rows: 24, seed: "abc" });
  const spectrum = isolatedTone(180, 48000, 512);
  let firstState;
  for (let frame = 0; frame < 45; frame += 1) {
    firstState = first.update(spectrum, 48000, 1 / 60, { active: true });
    second.update(spectrum, 48000, 1 / 60, { active: true });
  }
  assert.deepEqual(first.data, second.data);
  assert.deepEqual(firstState, second.update(spectrum, 48000, 0, { active: true }));
  assert.ok(firstState.historyOffset >= 0 && firstState.historyOffset < 1 / first.rows);
  assert.ok(Math.max(...first.data.slice(-first.columns)) > 80);
});

test("first audible spectrum warms the full depth without a horizon wall", () => {
  const history = new SpectrumTerrainHistory({ columns: 64, rows: 24, seed: "warm" });
  const before = history.data.slice();
  history.update(isolatedTone(180), 48000, 1 / 60, { active: true });
  const changedRows = Array.from({ length: history.rows }, (_, row) => {
    const start = row * history.columns;
    return history.data.slice(start, start + history.columns).some(
      (value, column) => value !== before[start + column],
    );
  });
  assert.ok(changedRows.every(Boolean));
  assert.equal(history.hasAudioTerrain, true);
});

test("perspective camera matrices remain finite for the flyover", () => {
  const projection = perspectiveMatrix(Math.PI / 4, 16 / 9, 0.08, 20);
  const view = lookAtMatrix([0.2, 1.6, -3.7], [0, 0.3, 0.6]);
  const combined = multiplyMatrices(projection, view);
  assert.equal(combined.length, 16);
  assert.ok([...combined].every(Number.isFinite));
  assert.notEqual(combined[0], 0);
  assert.notEqual(combined[5], 0);
});
