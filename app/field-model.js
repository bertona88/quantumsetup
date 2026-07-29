/**
 * QuantumSetup qualitative field model.
 *
 * This module is deliberately dimensionless and analytic. It borrows the shape
 * of rectangular-barrier transmission and coherent wave interference to create
 * a normalized probability-like field for visual and musical mapping. It is
 * not a numerical Schrödinger solver and should not be used for scientific
 * prediction.
 */

const TAU = Math.PI * 2;
const EPSILON = 1e-9;
const MAX_COEFFICIENT_INPUT = 1_000_000;
const utf8 = new TextEncoder();

export const MODEL_VERSION = "0.2.0-qualitative";
export const MAX_MODEL_TIME = 1_000_000_000_000;

export function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function hashSeed(input) {
  const bytes = utf8.encode(String(input));
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandom(seed) {
  let value = hashSeed(seed);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function finiteNumber(value, fallback, label) {
  const resolved = value ?? fallback;
  const numeric = Number(resolved);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`${label} must be finite`);
  }
  return numeric;
}

function boundedNumber(value, fallback, minimum, maximum, label) {
  return clamp(finiteNumber(value, fallback, label), minimum, maximum);
}

function wrappedAngle(value, fallback, label) {
  const angle = finiteNumber(value, fallback, label);
  return ((angle % TAU) + TAU) % TAU;
}

function periodicPhase(time, radiansPerUnit) {
  if (Math.abs(radiansPerUnit) < EPSILON) return 0;
  const period = TAU / Math.abs(radiansPerUnit);
  return (time % period) * radiansPerUnit;
}

function formatSeed(seed) {
  return hashSeed(seed).toString(16).padStart(8, "0").toUpperCase();
}

function deriveParameters(seed) {
  const random = createRandom(seed);
  return {
    packetCenter: 0.19 + random() * 0.12,
    packetWidth: 0.095 + random() * 0.085,
    barrierCenter: 0.56 + random() * 0.11,
    barrierWidth: 0.075 + random() * 0.09,
    carrier: 7.5 + random() * 7.5,
    transverse: 1.4 + random() * 3.8,
    drift: 0.018 + random() * 0.025,
    phaseA: random() * TAU,
    phaseB: random() * TAU,
    phaseC: random() * TAU,
    skew: random() * 2 - 1,
  };
}

export function createFieldState(seed = "quantumsetup", overrides = {}) {
  const stableSeed = String(seed);
  const derived = deriveParameters(stableSeed);

  return Object.freeze({
    seed: stableSeed,
    seedLabel: formatSeed(stableSeed),
    energy: boundedNumber(overrides.energy, 0.48, 0.02, 1.5, "energy"),
    barrierHeight: boundedNumber(
      overrides.barrierHeight,
      0.82,
      0,
      1.5,
      "barrier height",
    ),
    coherence: boundedNumber(overrides.coherence, 0.92, 0, 1, "coherence"),
    exposure: boundedNumber(overrides.exposure, 1.35, 0.25, 3, "exposure"),
    barrierCenter: boundedNumber(
      overrides.barrierCenter,
      derived.barrierCenter,
      0.35,
      0.8,
      "barrier center",
    ),
    barrierWidth: boundedNumber(
      overrides.barrierWidth,
      derived.barrierWidth,
      0.025,
      0.3,
      "barrier width",
    ),
    packetCenter: boundedNumber(
      overrides.packetCenter,
      derived.packetCenter,
      0.04,
      0.94,
      "packet center",
    ),
    packetWidth: boundedNumber(
      overrides.packetWidth,
      derived.packetWidth,
      0.02,
      0.35,
      "packet width",
    ),
    carrier: boundedNumber(overrides.carrier, derived.carrier, 0, 128, "carrier"),
    transverse: boundedNumber(
      overrides.transverse,
      derived.transverse,
      0,
      128,
      "transverse phase",
    ),
    drift: boundedNumber(overrides.drift, derived.drift, 0, 4, "drift"),
    phaseA: wrappedAngle(overrides.phaseA, derived.phaseA, "phase A"),
    phaseB: wrappedAngle(overrides.phaseB, derived.phaseB, "phase B"),
    phaseC: wrappedAngle(overrides.phaseC, derived.phaseC, "phase C"),
    skew: boundedNumber(overrides.skew, derived.skew, -8, 8, "skew"),
    collapseCenter:
      overrides.collapseCenter == null
        ? null
        : boundedNumber(overrides.collapseCenter, 0, 0, 1, "collapse center"),
    collapsedAt:
      overrides.collapsedAt == null
        ? null
        : boundedNumber(
            overrides.collapsedAt,
            0,
            0,
            MAX_MODEL_TIME,
            "collapse time",
          ),
    collapseNonce: Math.max(
      0,
      Math.floor(finiteNumber(overrides.collapseNonce, 0, "collapse nonce")),
    ),
  });
}

export function updateFieldState(state, controls = {}) {
  return createFieldState(state.seed, {
    ...state,
    ...controls,
  });
}

/**
 * Rectangular-barrier-inspired transmission coefficient.
 *
 * E, V and width are dimensionless. The scaling constants are chosen for an
 * expressive visual range, not to represent any physical unit system.
 */
export function calculateTransmission(energy, barrierHeight, barrierWidth) {
  const E = boundedNumber(
    energy,
    EPSILON,
    EPSILON,
    MAX_COEFFICIENT_INPUT,
    "energy",
  );
  const rawBarrier = boundedNumber(
    barrierHeight,
    0,
    0,
    MAX_COEFFICIENT_INPUT,
    "barrier height",
  );
  const width = boundedNumber(
    barrierWidth,
    0,
    0,
    MAX_COEFFICIENT_INPUT,
    "barrier width",
  );
  if (rawBarrier <= EPSILON || width <= EPSILON) return 1;
  const V = Math.max(EPSILON, rawBarrier);
  const scaledWidth = width * 7.5;

  if (Math.abs(E - V) < 1e-7) {
    return clamp(1 / (1 + (V * scaledWidth * scaledWidth) / 2), 0, 1);
  }

  if (E < V) {
    const decay = Math.sqrt(2 * (V - E));
    const sinh = Math.sinh(Math.min(12, decay * scaledWidth));
    const denominator = 1 + (V * V * sinh * sinh) / (4 * E * (V - E));
    return clamp(1 / denominator, 0, 1);
  }

  const wave = Math.sqrt(2 * (E - V));
  const sine = Math.sin(wave * scaledWidth);
  const denominator = 1 + (V * V * sine * sine) / (4 * E * (E - V));
  return clamp(1 / denominator, 0, 1);
}

function collapseEnvelope(state, x, time) {
  if (state.collapseCenter == null || state.collapsedAt == null) {
    return 1;
  }

  const age = Math.max(0, time - state.collapsedAt);
  const collapseMix = Math.exp(-age * 0.17);
  const width = (0.026 + (1 - state.coherence) * 0.065) * (1 + age * 0.24);
  const distance = x - state.collapseCenter;
  const localized = Math.exp(-(distance * distance) / (2 * width * width));
  return 1 - collapseMix * 0.92 + localized * collapseMix * 2.8;
}

function regionalAmplitude(state, x, transmission) {
  const halfWidth = state.barrierWidth / 2;
  const left = state.barrierCenter - halfWidth;
  const right = state.barrierCenter + halfWidth;

  if (x < left) {
    return 1;
  }

  if (x <= right) {
    const progress = (x - left) / Math.max(EPSILON, state.barrierWidth);
    const decay = 1.3 + 5.4 * Math.sqrt(Math.max(0, state.barrierHeight - state.energy));
    return Math.exp(-progress * decay) * (0.72 + transmission * 0.28);
  }

  return Math.sqrt(transmission);
}

function fieldValue(state, x, y, time, transmission) {
  const halfWidth = state.barrierWidth / 2;
  const barrierLeft = state.barrierCenter - halfWidth;
  const barrierRight = state.barrierCenter + halfWidth;
  const reflection = Math.sqrt(Math.max(0, 1 - transmission));
  const waveNumber = state.carrier * (0.72 + state.energy * 0.58);
  const angularVelocity = 0.62 + state.energy * 1.34;
  const movingCenter =
    state.packetCenter +
    Math.sin(periodicPhase(time, state.drift) + state.phaseC) *
      (0.032 + state.coherence * 0.025);
  const packetDistance = x - movingCenter;
  const packet =
    0.19 +
    0.81 *
      Math.exp(
        -(packetDistance * packetDistance) /
          (2 * state.packetWidth * state.packetWidth * (1 + time * 0.002)),
      );
  const transverseEnvelope = Math.exp(-Math.pow(Math.abs(y) * 0.76, 2.25));
  const transversePhase =
    Math.sin(y * state.transverse * Math.PI + state.phaseB) *
    (0.5 + 0.5 * state.coherence);
  const basePhase =
    waveNumber * x * TAU -
    periodicPhase(time, angularVelocity * TAU) +
    transversePhase +
    state.phaseA;
  const incoming = Math.sin(basePhase);

  let wave = incoming;
  if (x < barrierLeft) {
    const reflectedPhase =
      -waveNumber * (x - barrierLeft) * TAU -
      periodicPhase(time, angularVelocity * TAU * 0.83) +
      state.phaseB;
    wave += reflection * Math.sin(reflectedPhase) * state.coherence;
  } else if (x <= barrierRight) {
    const progress = (x - barrierLeft) / Math.max(EPSILON, state.barrierWidth);
    wave =
      Math.sin(basePhase * (1 - progress * 0.18) + progress * state.phaseC) *
      (0.72 + 0.28 * state.coherence);
  } else {
    wave =
      Math.sin(
        basePhase +
          state.phaseC +
          (x - barrierRight) * (state.skew * 2.4 + transmission * 3.1),
      );
  }

  const secondary =
    Math.sin(
      basePhase * 0.487 +
        y * (2.2 + state.transverse) +
        Math.sin(periodicPhase(time, 0.23) + state.phaseB) * 1.2,
    ) *
    (0.16 + 0.36 * state.coherence);
  const amplitude = regionalAmplitude(state, x, transmission);
  const collapse = collapseEnvelope(state, x, time);
  const decoherentFloor =
    (1 - state.coherence) *
    (0.12 +
      0.08 * Math.sin(x * 41 + y * 27 + state.phaseA) ** 2 +
      0.06 * Math.cos(x * 19 - y * 31 + state.phaseC) ** 2);
  const coherentDensity =
    amplitude *
    amplitude *
    packet *
    transverseEnvelope *
    (0.16 + Math.pow(wave + secondary, 2) * 0.7);

  return {
    density: Math.max(EPSILON, coherentDensity * collapse + decoherentFloor),
    phase: wrappedAngle(basePhase + secondary, 0, "display phase"),
  };
}

export function sampleProbabilityField(
  state,
  time = 0,
  { columns = 96, rows = 54 } = {},
) {
  const safeColumns = clamp(
    Math.floor(finiteNumber(columns, 96, "field columns")),
    2,
    512,
  );
  const safeRows = clamp(Math.floor(finiteNumber(rows, 54, "field rows")), 2, 288);
  const safeTime = boundedNumber(time, 0, 0, MAX_MODEL_TIME, "field time");
  const length = safeColumns * safeRows;
  const density = new Float64Array(length);
  const phase = new Float32Array(length);
  const marginalX = new Float64Array(safeColumns);
  const transmission = calculateTransmission(
    state.energy,
    state.barrierHeight,
    state.barrierWidth,
  );

  let rawSum = 0;
  let maximum = 0;

  for (let row = 0; row < safeRows; row += 1) {
    const y = ((row + 0.5) / safeRows) * 2 - 1;
    for (let column = 0; column < safeColumns; column += 1) {
      const x = (column + 0.5) / safeColumns;
      const index = row * safeColumns + column;
      const value = fieldValue(state, x, y, safeTime, transmission);
      density[index] = value.density;
      phase[index] = value.phase;
      marginalX[column] += value.density;
      rawSum += value.density;
      maximum = Math.max(maximum, value.density);
    }
  }

  const inverseSum = 1 / Math.max(EPSILON, rawSum);
  let normalizedSum = 0;
  let normalizedMaximum = 0;
  for (let index = 0; index < length; index += 1) {
    density[index] *= inverseSum;
    normalizedSum += density[index];
    normalizedMaximum = Math.max(normalizedMaximum, density[index]);
  }

  for (let column = 0; column < safeColumns; column += 1) {
    marginalX[column] *= inverseSum;
  }

  let entropy = 0;
  for (let index = 0; index < length; index += 1) {
    const probability = density[index];
    entropy -= probability * Math.log(Math.max(EPSILON, probability));
  }
  entropy /= Math.log(length);

  return {
    columns: safeColumns,
    rows: safeRows,
    density,
    phase,
    marginalX,
    transmission,
    norm: normalizedSum,
    maximum: normalizedMaximum,
    rawMaximum: maximum,
    entropy: clamp(entropy, 0, 1),
    qualitative: true,
  };
}

export function measurePosition(state, time = 0, nonce = state.collapseNonce + 1) {
  const safeTime = boundedNumber(
    time,
    0,
    0,
    MAX_MODEL_TIME,
    "measurement time",
  );
  const safeNonce = Math.max(
    0,
    Math.floor(finiteNumber(nonce, state.collapseNonce + 1, "measurement nonce")),
  );
  const field = sampleProbabilityField(state, safeTime, { columns: 192, rows: 24 });
  const random = createRandom(`${state.seed}|measure|${safeNonce}|${safeTime.toFixed(4)}`);
  const target = random();
  let cumulative = 0;
  let selected = field.columns - 1;

  for (let column = 0; column < field.columns; column += 1) {
    cumulative += field.marginalX[column];
    if (cumulative >= target) {
      selected = column;
      break;
    }
  }

  const jitter = (random() - 0.5) / field.columns;
  const position = clamp((selected + 0.5) / field.columns + jitter, 0, 1);

  return Object.freeze({
    position,
    probability: field.marginalX[selected],
    nonce: safeNonce,
    time: safeTime,
  });
}

export function collapseFieldState(state, measurement) {
  const position = boundedNumber(
    measurement?.position,
    undefined,
    0,
    1,
    "measurement position",
  );
  const time = boundedNumber(
    measurement?.time,
    undefined,
    0,
    MAX_MODEL_TIME,
    "measurement time",
  );
  const nonce = Math.max(
    0,
    Math.floor(finiteNumber(measurement?.nonce, state.collapseNonce + 1, "measurement nonce")),
  );

  return createFieldState(state.seed, {
    ...state,
    collapseCenter: position,
    collapsedAt: time,
    collapseNonce: Math.max(state.collapseNonce + 1, nonce),
  });
}

export function createParticleDescriptors(seed, count = 180) {
  const random = createRandom(`${seed}|particles`);
  const safeCount = clamp(
    Math.floor(finiteNumber(count, 180, "particle count")),
    0,
    1200,
  );
  return Array.from({ length: safeCount }, (_, index) =>
    Object.freeze({
      id: index,
      lane: random(),
      start: random(),
      speed: 0.45 + random() * 1.15,
      gate: random(),
      size: 0.35 + random() * 1.65,
      phase: random() * TAU,
      hueMix: random(),
    }),
  );
}
