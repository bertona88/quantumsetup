import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateTransmission,
  collapseFieldState,
  createFieldState,
  createParticleDescriptors,
  createRandom,
  hashSeed,
  measurePosition,
  sampleProbabilityField,
  updateFieldState,
} from "./field-model.js";

test("qs-seed-v1 hashing and random stream have stable fixtures", () => {
  assert.equal(hashSeed("hello"), 0x4f9f2cab);
  const random = createRandom("fixture");
  assert.deepEqual(
    [random(), random(), random()],
    [0.4677815765608102, 0.9576418695505708, 0.39120850758627057],
  );
});

test("the same seed and controls create the same field", () => {
  const first = createFieldState("fixed-seed", { energy: 0.44, barrierHeight: 0.8 });
  const second = createFieldState("fixed-seed", { energy: 0.44, barrierHeight: 0.8 });
  const fieldA = sampleProbabilityField(first, 12.5, { columns: 24, rows: 14 });
  const fieldB = sampleProbabilityField(second, 12.5, { columns: 24, rows: 14 });

  assert.deepEqual([...fieldA.density], [...fieldB.density]);
  assert.deepEqual([...fieldA.phase], [...fieldB.phase]);
  assert.equal(first.seedLabel, second.seedLabel);
});

test("different seeds produce distinct interference fields", () => {
  const first = sampleProbabilityField(createFieldState("alpha"), 3, {
    columns: 20,
    rows: 12,
  });
  const second = sampleProbabilityField(createFieldState("beta"), 3, {
    columns: 20,
    rows: 12,
  });

  assert.notDeepEqual([...first.density], [...second.density]);
});

test("probability fields are finite, non-negative and normalized", () => {
  const state = createFieldState("normalization", {
    energy: 0.21,
    barrierHeight: 1.12,
    coherence: 0.37,
  });
  const field = sampleProbabilityField(state, 27.2, { columns: 73, rows: 39 });
  const total = [...field.density].reduce((sum, value) => sum + value, 0);
  const marginalTotal = [...field.marginalX].reduce((sum, value) => sum + value, 0);

  assert.ok([...field.density].every((value) => Number.isFinite(value) && value >= 0));
  assert.ok(Math.abs(total - 1) < 1e-9, `expected normalized field, received ${total}`);
  assert.ok(Math.abs(marginalTotal - 1) < 1e-9);
  for (let column = 0; column < field.columns; column += 1) {
    let columnTotal = 0;
    for (let row = 0; row < field.rows; row += 1) {
      columnTotal += field.density[row * field.columns + column];
    }
    assert.ok(Math.abs(columnTotal - field.marginalX[column]) < 1e-12);
  }
  assert.ok(Math.abs(field.norm - 1) < 1e-9);
  assert.ok(field.entropy >= 0 && field.entropy <= 1);
});

test("sub-threshold transmission decreases as the barrier widens", () => {
  const thin = calculateTransmission(0.34, 0.91, 0.05);
  const medium = calculateTransmission(0.34, 0.91, 0.13);
  const wide = calculateTransmission(0.34, 0.91, 0.24);

  assert.ok(thin > medium);
  assert.ok(medium > wide);
  assert.ok(wide >= 0 && thin <= 1);
});

test("transmission remains bounded across threshold regimes", () => {
  const values = [
    calculateTransmission(0.3, 0.9, 0.12),
    calculateTransmission(0.9, 0.9, 0.12),
    calculateTransmission(1.2, 0.5, 0.12),
  ];

  assert.ok(values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.equal(calculateTransmission(0.5, 0, 0.12), 1);
  assert.ok(Math.abs(calculateTransmission(0.9, 0.9, 0.12) - 0.7328691828508611) < 1e-12);
});

test("invalid numeric input fails instead of producing an attractive NaN field", () => {
  assert.throws(() => createFieldState("invalid", { energy: Number.NaN }), /finite/);
  const state = createFieldState("valid");
  assert.throws(() => sampleProbabilityField(state, Number.POSITIVE_INFINITY), /finite/);
  assert.throws(
    () => sampleProbabilityField(state, 0, { columns: Number.NaN, rows: 20 }),
    /finite/,
  );
  assert.throws(
    () => collapseFieldState(state, { position: Number.NaN, time: 0, nonce: 1 }),
    /finite/,
  );
  assert.throws(
    () => collapseFieldState(state, { position: 0.5, time: Number.POSITIVE_INFINITY, nonce: 1 }),
    /finite/,
  );
});

test("extreme finite inputs are clamped to a finite model domain", () => {
  const transmission = calculateTransmission(
    Number.MAX_VALUE,
    Number.MAX_VALUE,
    Number.MAX_VALUE,
  );
  const state = createFieldState("finite-extremes", {
    carrier: Number.MAX_VALUE,
    transverse: Number.MAX_VALUE,
    drift: Number.MAX_VALUE,
    phaseA: Number.MAX_VALUE,
    phaseB: -Number.MAX_VALUE,
    phaseC: Number.MAX_VALUE,
    skew: -Number.MAX_VALUE,
  });
  const field = sampleProbabilityField(state, Number.MAX_VALUE, {
    columns: Number.MAX_VALUE,
    rows: Number.MAX_VALUE,
  });

  assert.ok(Number.isFinite(transmission) && transmission >= 0 && transmission <= 1);
  assert.equal(field.columns, 512);
  assert.equal(field.rows, 288);
  assert.ok([...field.density].every(Number.isFinite));
  assert.ok([...field.phase].every(Number.isFinite));
  assert.ok(Math.abs(field.norm - 1) < 1e-9);
});

test("measurement and collapse are deterministic", () => {
  const state = createFieldState("observer");
  const first = measurePosition(state, 7.25, 1);
  const second = measurePosition(state, 7.25, 1);
  const collapsed = collapseFieldState(state, first);

  assert.deepEqual(first, second);
  assert.equal(collapsed.collapseCenter, first.position);
  assert.equal(collapsed.collapsedAt, first.time);
  assert.equal(collapsed.collapseNonce, 1);
});

test("control updates preserve the underlying seeded geometry", () => {
  const state = createFieldState("stable-geometry");
  const changed = updateFieldState(state, { energy: 1.1, coherence: 0.2 });

  assert.equal(changed.seed, state.seed);
  assert.equal(changed.barrierCenter, state.barrierCenter);
  assert.equal(changed.carrier, state.carrier);
  assert.equal(changed.energy, 1.1);
  assert.equal(changed.coherence, 0.2);
});

test("artistic exposure does not change the sampled cell masses", () => {
  const dim = createFieldState("exposure-boundary", { exposure: 0.55 });
  const bright = updateFieldState(dim, { exposure: 2 });
  const dimField = sampleProbabilityField(dim, 4.5, { columns: 31, rows: 17 });
  const brightField = sampleProbabilityField(bright, 4.5, { columns: 31, rows: 17 });

  assert.deepEqual([...dimField.density], [...brightField.density]);
  assert.deepEqual([...dimField.marginalX], [...brightField.marginalX]);
});

test("particle descriptors are deterministic and bounded", () => {
  const first = createParticleDescriptors("particles", 12);
  const second = createParticleDescriptors("particles", 12);

  assert.deepEqual(first, second);
  assert.equal(first.length, 12);
  assert.ok(first.every((particle) => particle.lane >= 0 && particle.lane < 1));
  assert.ok(first.every((particle) => particle.gate >= 0 && particle.gate < 1));
});
