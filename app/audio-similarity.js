import { clamp } from "./generative-utils.js";

export const AUDIO_SIMILARITY_VERSION = "1.2.0";
export const AUDIO_FFT_SIZE = 512;
export const AUDIO_HOP_SIZE = 256;
export const AUDIO_STRUCTURE_MIN_DISTANCE = 0.08;
export const AUDIO_RENDER_MIXES = Object.freeze([
  "full",
  "non-anchors",
  "bass",
  "harmony",
  "synth",
  "secondary-percussion",
  "transitions",
  "drums",
]);

const FREQUENCY_BANDS = Object.freeze([
  Object.freeze({ id: "sub", low: 28, high: 90 }),
  Object.freeze({ id: "bass", low: 90, high: 260 }),
  Object.freeze({ id: "body", low: 260, high: 1400 }),
  Object.freeze({ id: "presence", low: 1400, high: 5200 }),
  Object.freeze({ id: "air", low: 5200, high: 12000 }),
]);

function assertPowerOfTwo(value) {
  if (!Number.isSafeInteger(value) || value < 2 || (value & (value - 1)) !== 0) {
    throw new RangeError("FFT size must be a power of two");
  }
}

function bitReverse(value, bits) {
  let reversed = 0;
  for (let bit = 0; bit < bits; bit += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>>= 1;
  }
  return reversed;
}

export function fftMagnitudes(frame) {
  const size = frame.length;
  assertPowerOfTwo(size);
  const levels = Math.log2(size);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let index = 0; index < size; index += 1) {
    real[bitReverse(index, levels)] = Number(frame[index]) || 0;
  }
  for (let span = 2; span <= size; span *= 2) {
    const half = span / 2;
    const angle = -2 * Math.PI / span;
    for (let start = 0; start < size; start += span) {
      for (let offset = 0; offset < half; offset += 1) {
        const phase = angle * offset;
        const cosine = Math.cos(phase);
        const sine = Math.sin(phase);
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] * cosine - imaginary[odd] * sine;
        const oddImaginary = real[odd] * sine + imaginary[odd] * cosine;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
      }
    }
  }
  return Float64Array.from(
    { length: size / 2 + 1 },
    (_, bin) => Math.hypot(real[bin], imaginary[bin]) / size,
  );
}

function hannWindow(size) {
  return Float64Array.from(
    { length: size },
    (_, index) => 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (size - 1)),
  );
}

function normalizeVector(values) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!(total > 0)) return values.map(() => 0);
  return values.map((value) => Math.max(0, value) / total);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
}

function standardDeviation(values) {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

function autocorrelation(values, width) {
  const centered = values.map((value) => value - mean(values));
  const energy = centered.reduce((sum, value) => sum + value * value, 0);
  return Array.from({ length: width }, (_, index) => {
    const lag = index + 1;
    let sum = 0;
    for (let cursor = lag; cursor < centered.length; cursor += 1) {
      sum += centered[cursor] * centered[cursor - lag];
    }
    return energy > 0 ? clamp(sum / energy, -1, 1) : 0;
  });
}

function monoSamples(audio) {
  if (audio instanceof Float32Array || audio instanceof Float64Array) {
    return Float64Array.from(audio);
  }
  if (!audio || typeof audio.getChannelData !== "function") {
    throw new TypeError("audio must be samples or an AudioBuffer-like value");
  }
  const channels = Math.max(1, Number(audio.numberOfChannels) || 1);
  const length = Number(audio.length) || audio.getChannelData(0).length;
  const mixed = new Float64Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = audio.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mixed[index] += data[index] / channels;
    }
  }
  return mixed;
}

export function extractAudioStructure(
  audio,
  sampleRate,
  { stepDuration = 0.1171875, fftSize = AUDIO_FFT_SIZE, hopSize = AUDIO_HOP_SIZE } = {},
) {
  assertPowerOfTwo(fftSize);
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new RangeError("sampleRate must be between 8000 and 192000");
  }
  if (!Number.isFinite(stepDuration) || stepDuration <= 0) {
    throw new RangeError("stepDuration must be positive");
  }
  const samples = monoSamples(audio);
  const window = hannWindow(fftSize);
  const bandFlux = Object.fromEntries(
    FREQUENCY_BANDS.map(({ id }) => [id, []]),
  );
  const bandEnergy = Object.fromEntries(
    FREQUENCY_BANDS.map(({ id }) => [id, []]),
  );
  const rms = [];
  let priorMagnitudes = null;
  for (let start = 0; start + fftSize <= samples.length; start += hopSize) {
    const frame = Float64Array.from(
      { length: fftSize },
      (_, index) => samples[start + index] * window[index],
    );
    rms.push(Math.sqrt(mean(Array.from(frame, (value) => value * value))));
    const magnitudes = fftMagnitudes(frame);
    for (const band of FREQUENCY_BANDS) {
      const firstBin = clamp(
        Math.floor(band.low * fftSize / sampleRate),
        0,
        magnitudes.length - 1,
      );
      const lastBin = clamp(
        Math.ceil(Math.min(band.high, sampleRate / 2) * fftSize / sampleRate),
        firstBin + 1,
        magnitudes.length,
      );
      let energy = 0;
      let flux = 0;
      for (let bin = firstBin; bin < lastBin; bin += 1) {
        const magnitude = magnitudes[bin];
        energy += magnitude * magnitude;
        if (priorMagnitudes) {
          flux += Math.max(0, magnitude - priorMagnitudes[bin]);
        }
      }
      bandEnergy[band.id].push(Math.log1p(energy * 1000));
      bandFlux[band.id].push(flux);
    }
    priorMagnitudes = magnitudes;
  }

  const framesPerStep = stepDuration * sampleRate / hopSize;
  const stepProfiles = {};
  const recurrence = {};
  const spectralSurface = [];
  for (const { id } of FREQUENCY_BANDS) {
    const profile = Array(16).fill(0);
    bandFlux[id].forEach((value, frameIndex) => {
      const step = Math.floor(frameIndex / framesPerStep) % 16;
      profile[step] += value;
    });
    stepProfiles[id] = Object.freeze(normalizeVector(profile));
    recurrence[id] = Object.freeze(autocorrelation(bandFlux[id], 24));
    spectralSurface.push(mean(bandEnergy[id]), standardDeviation(bandEnergy[id]));
  }
  return Object.freeze({
    version: AUDIO_SIMILARITY_VERSION,
    stepProfiles: Object.freeze(stepProfiles),
    recurrence: Object.freeze(recurrence),
    spectralSurface: Object.freeze(spectralSurface),
    dynamics: Object.freeze([
      mean(rms),
      standardDeviation(rms),
      Math.max(0, ...rms),
      rms.filter((value) => value < mean(rms) * 0.18).length /
        Math.max(1, rms.length),
    ]),
  });
}

function vectorDistance(left, right) {
  return mean(left.map((value, index) => Math.abs(value - right[index])));
}

function cyclicDistance(left, right) {
  let minimum = Infinity;
  for (let shift = 0; shift < left.length; shift += 1) {
    minimum = Math.min(
      minimum,
      0.5 * left.reduce(
        (sum, value, index) =>
          sum + Math.abs(value - right[(index + shift) % right.length]),
        0,
      ),
    );
  }
  return clamp(minimum, 0, 1);
}

export function audioStructuralDistance(left, right) {
  const bandWeights = Object.freeze({
    sub: 0.25,
    bass: 0.27,
    body: 0.2,
    presence: 0.17,
    air: 0.11,
  });
  const rhythm = Object.entries(bandWeights).reduce(
    (sum, [id, weight]) =>
      sum + cyclicDistance(left.stepProfiles[id], right.stepProfiles[id]) * weight,
    0,
  );
  const recurrenceDistance = Object.entries(bandWeights).reduce(
    (sum, [id, weight]) =>
      sum + vectorDistance(left.recurrence[id], right.recurrence[id]) * weight,
    0,
  );
  const dynamics = vectorDistance(left.dynamics, right.dynamics);
  const surface = vectorDistance(left.spectralSurface, right.spectralSurface);
  return clamp(
    rhythm * 0.52 + recurrenceDistance * 0.28 + dynamics * 0.12 + surface * 0.08,
    0,
    1,
  );
}

function silenceForMix(engine, mix) {
  const methods = [
    "kick",
    "clap",
    "hat",
    "shaker",
    "ride",
    "rim",
    "metallic",
    "tom",
    "echoAscentHit",
    "bass",
    "scheduleSynthNote",
    "chord",
    "pad",
    "texture",
    "riser",
    "downlifter",
  ];
  const allowed = {
    full: methods,
    "non-anchors": [
      "shaker",
      "ride",
      "rim",
      "metallic",
      "tom",
      "echoAscentHit",
      "bass",
      "scheduleSynthNote",
      "chord",
      "pad",
      "texture",
      "riser",
      "downlifter",
    ],
    bass: ["bass"],
    harmony: ["chord", "pad"],
    synth: ["scheduleSynthNote"],
    "secondary-percussion": ["shaker", "ride", "rim", "metallic", "tom"],
    transitions: ["echoAscentHit", "riser", "downlifter"],
    drums: ["kick", "clap", "hat", "shaker", "ride", "rim", "metallic", "tom"],
  }[mix];
  const keep = new Set(allowed);
  for (const method of methods) {
    if (!keep.has(method)) engine[method] = () => {};
  }
}

export async function renderCoreTrajectoryAudio({
  seed,
  startBar = 0,
  bars = 4,
  vibe = "hypnotic",
  tonality = "minor",
  mix = "full",
  sampleRate = 16000,
  OfflineAudioContextClass = globalThis.OfflineAudioContext ||
    globalThis.webkitOfflineAudioContext,
} = {}) {
  if (typeof OfflineAudioContextClass !== "function") {
    throw new Error("OfflineAudioContext is required for rendered-audio validation");
  }
  if (!Number.isSafeInteger(bars) || bars < 1 || bars > 32) {
    throw new RangeError("bars must be an integer from 1 to 32");
  }
  if (!Number.isSafeInteger(startBar) || startBar < 0 || startBar > 767) {
    throw new RangeError("startBar must be an integer from 0 to 767");
  }
  if (!AUDIO_RENDER_MIXES.includes(mix)) {
    throw new RangeError(`mix must be one of: ${AUDIO_RENDER_MIXES.join(", ")}`);
  }
  const maximumSeconds = bars * 4 * 60 / 105 + 4;
  const context = new OfflineAudioContextClass(
    2,
    Math.ceil(maximumSeconds * sampleRate),
    sampleRate,
  );
  const { InfiniteTechnoEngine } = await import(
    "./audio-engine.js?v=2.4.0-reference-listener-3"
  );
  const engine = new InfiniteTechnoEngine(() => {}, { seed, vibe, tonality });
  engine.ctx = context;
  engine.activeVoices = new Set();
  engine.activeSourceCount = 0;
  engine.buildGraph();
  engine.queueVisual = () => {};
  engine.registerVoice = () => true;
  engine.synthWorkletReady = false;
  silenceForMix(engine, mix);
  engine.masterGain.gain.cancelScheduledValues(0);
  engine.masterGain.gain.setValueAtTime(0.46, 0);

  for (let bar = 0; bar < startBar; bar += 1) {
    engine.bar = bar;
    engine.step = 0;
    engine.preparePlan(bar, engine.resolveMusicalState(bar));
  }
  if (["full", "non-anchors", "synth"].includes(mix)) {
    await engine.loadSynthBank(context);
  }

  let time = 0.1;
  const stepDurations = [];
  for (let bar = startBar; bar < startBar + bars; bar += 1) {
    const state = engine.resolveMusicalState(bar);
    const bpm = engine.profileTempo(state.profile, bar);
    const stepDuration = 60 / bpm / 4;
    stepDurations.push(stepDuration);
    engine.currentTempo = bpm;
    for (let step = 0; step < 16; step += 1) {
      engine.bar = bar;
      engine.step = step;
      engine.scheduleStep(bar, step, time, stepDuration, state);
      time += stepDuration;
    }
  }
  const rendered = await context.startRendering();
  return Object.freeze({
    buffer: rendered,
    sampleRate,
    startBar,
    bars,
    mix,
    stepDuration: mean(stepDurations),
    musicalSeconds: time - 0.1,
  });
}
