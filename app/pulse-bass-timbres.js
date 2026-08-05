import { hash32 } from "./generative-utils.js";

export const PULSE_BASS_TIMBRE_VERSION = "1.0.0";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const PULSE_BASS_PROCESSORS = deepFreeze({
  raw: {
    id: "raw",
    sweep: {
      startHz: 320,
      startDriveHz: 280,
      peakHz: 1_100,
      peakDriveHz: 1_900,
      closeHz: 260,
      openSeconds: 0.016,
      q: 2.2,
      qDrive: 3,
    },
    shaper: {
      kind: "bass",
      amount: 1.15,
      amountDrive: 3.04,
      foldHarmonics: 0,
      foldMix: 0,
      asymmetry: 0,
      dcBlockHz: 0,
      oversample: "2x",
    },
    body: null,
    modulation: null,
    comb: null,
    bodyGain: 1,
    formants: [],
  },
  filtered: {
    id: "filtered",
    sweep: {
      startHz: 320,
      startDriveHz: 280,
      peakHz: 700,
      peakDriveHz: 900,
      closeHz: 260,
      openSeconds: 0.016,
      q: 1.6,
      qDrive: 1.8,
    },
    shaper: {
      kind: "bass",
      amount: 1.15,
      amountDrive: 3.04,
      foldHarmonics: 0,
      foldMix: 0,
      asymmetry: 0,
      dcBlockHz: 0,
      oversample: "2x",
    },
    body: {
      type: "lowpass",
      cutoffHz: 850,
      cutoffDriveHz: 150,
      cutoffWarmthHz: 150,
      minimumHz: 850,
      maximumHz: 1_150,
      q: 0.6,
    },
    modulation: null,
    comb: null,
    bodyGain: 1,
    formants: [],
  },
  wobble: {
    id: "wobble",
    sweep: {
      startHz: 260,
      startDriveHz: 200,
      peakHz: 680,
      peakDriveHz: 980,
      closeHz: 240,
      openSeconds: 0.02,
      q: 2.1,
      qDrive: 2.2,
    },
    shaper: {
      kind: "growl",
      amount: 3.1,
      amountDrive: 4,
      foldHarmonics: 2.4,
      foldMix: 0.18,
      asymmetry: 0.07,
      dcBlockHz: 28,
      oversample: "4x",
    },
    body: {
      type: "lowpass",
      cutoffHz: 900,
      cutoffDriveHz: 210,
      cutoffWarmthHz: 120,
      minimumHz: 900,
      maximumHz: 1_230,
      q: 0.72,
    },
    modulation: {
      waveform: "sine",
      tempoMultiplier: 2,
      sweepDepthHz: 220,
      bodyDepthHz: 120,
    },
    comb: null,
    bodyGain: 0.47,
    formants: [
      {
        frequencyHz: 460,
        modulationDepthHz: 210,
        q: 4.2,
        gain: 0.56,
        pan: -0.22,
      },
      {
        frequencyHz: 1_240,
        modulationDepthHz: -360,
        q: 3.4,
        gain: 0.32,
        pan: 0.22,
      },
    ],
  },
  neuro: {
    id: "neuro",
    sweep: {
      startHz: 420,
      startDriveHz: 160,
      peakHz: 900,
      peakDriveHz: 600,
      closeHz: 350,
      openSeconds: 0.024,
      q: 1.2,
      qDrive: 1.4,
    },
    shaper: {
      kind: "neuro",
      amount: 5.2,
      amountDrive: 3.6,
      foldHarmonics: 3.8,
      foldMix: 0.22,
      asymmetry: 0.1,
      dcBlockHz: 28,
      oversample: "4x",
    },
    body: {
      type: "lowpass",
      cutoffHz: 820,
      cutoffDriveHz: 180,
      cutoffWarmthHz: 100,
      minimumHz: 820,
      maximumHz: 1_100,
      q: 0.66,
    },
    modulation: {
      waveform: "sine",
      tempoMultiplier: 1,
      sweepDepthHz: 260,
      bodyDepthHz: 90,
    },
    comb: {
      delaySeconds: 0.005,
      modulationSeconds: 0.0018,
      modulationRateHz: 0.37,
      dryGain: 0.78,
      delayedGain: -0.58,
      maximumDelaySeconds: 0.02,
    },
    bodyGain: 0.4,
    formants: [
      {
        frequencyHz: 620,
        modulationDepthHz: 250,
        q: 4.8,
        gain: 0.58,
        pan: -0.28,
      },
      {
        frequencyHz: 1_540,
        modulationDepthHz: -380,
        q: 3.8,
        gain: -0.3,
        pan: 0.28,
      },
    ],
  },
});

export const PULSE_BASS_TIMBRES = deepFreeze([
  {
    id: "raw-square",
    label: "RAW SQUARE",
    probability: 0.2,
    oscillators: [
      { waveform: "square", octave: 0, detuneCents: 0, gain: 1 },
    ],
    sub: null,
    processors: [{ id: "raw", gain: 1 }],
    envelope: { attackSeconds: 0.004, level: 0.94, durationScale: 0.9 },
    routing: { dry: 0.84, delay: 0.025, reverb: 0.014 },
  },
  {
    id: "filtered",
    label: "FILTERED",
    probability: 0.2,
    oscillators: [
      { waveform: "square", octave: 0, detuneCents: 0, gain: 1 },
    ],
    sub: null,
    processors: [{ id: "filtered", gain: 1 }],
    envelope: { attackSeconds: 0.004, level: 1, durationScale: 0.9 },
    routing: { dry: 0.88, delay: 0.035, reverb: 0.018 },
  },
  {
    id: "wobble-growl",
    label: "WOBBLE GROWL",
    probability: 0.2,
    oscillators: [
      { waveform: "square", octave: 0, detuneCents: -3, gain: 0.72 },
      { waveform: "sawtooth", octave: 0, detuneCents: 7, gain: 0.28 },
    ],
    sub: { waveform: "sine", octave: 0, detuneCents: 0, gain: 0.34, cutoffHz: 118 },
    processors: [{ id: "wobble", gain: 0.76 }],
    envelope: { attackSeconds: 0.006, level: 0.72, durationScale: 0.94 },
    routing: { dry: 0.86, delay: 0.045, reverb: 0.016 },
  },
  {
    id: "neuro-reese",
    label: "NEURO REESE",
    probability: 0.2,
    oscillators: [
      { waveform: "square", octave: 0, detuneCents: 3, gain: 0.58 },
      { waveform: "sawtooth", octave: 0, detuneCents: -7, gain: 0.42 },
    ],
    sub: { waveform: "sine", octave: 0, detuneCents: 0, gain: 0.36, cutoffHz: 112 },
    processors: [{ id: "neuro", gain: 0.72 }],
    envelope: { attackSeconds: 0.006, level: 0.7, durationScale: 0.94 },
    routing: { dry: 0.84, delay: 0.055, reverb: 0.014 },
  },
  {
    id: "all-layer-hybrid",
    label: "ALL-LAYER HYBRID",
    probability: 0.2,
    oscillators: [
      { waveform: "square", octave: 0, detuneCents: -2, gain: 0.65 },
      { waveform: "sawtooth", octave: 0, detuneCents: 5, gain: 0.35 },
    ],
    sub: { waveform: "sine", octave: 0, detuneCents: 0, gain: 0.28, cutoffHz: 115 },
    processors: [
      { id: "raw", gain: 0.18 },
      { id: "filtered", gain: 0.34 },
      { id: "wobble", gain: 0.3 },
      { id: "neuro", gain: 0.28 },
    ],
    envelope: { attackSeconds: 0.007, level: 0.62, durationScale: 0.96 },
    routing: { dry: 0.82, delay: 0.06, reverb: 0.018 },
  },
]);

export const PULSE_BASS_TIMBRE_IDS = Object.freeze(
  PULSE_BASS_TIMBRES.map((timbre) => timbre.id),
);

export const PULSE_BASS_TIMBRE_BY_ID = deepFreeze(
  Object.fromEntries(PULSE_BASS_TIMBRES.map((timbre) => [timbre.id, timbre])),
);

export function selectPulseBassTimbre(seed, bassVoiceMaterialId) {
  const index =
    hash32(
      PULSE_BASS_TIMBRE_VERSION,
      seed,
      bassVoiceMaterialId,
      "pulse-bass-timbre",
    ) % PULSE_BASS_TIMBRES.length;
  return PULSE_BASS_TIMBRES[index];
}
