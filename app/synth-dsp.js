import { clamp, hash32 } from "./generative-utils.js";
import { fmAlgorithmFor, validateSynthGenome } from "./synth-genomes.js";

export const SYNTH_VOICE_LIMIT = 24;
export const SYNTH_QUEUE_LIMIT = 256;
export const SYNTH_HARD_LIFETIME_SECONDS = 8;

const TAU = Math.PI * 2;
const SILENCE = 1e-7;
const ROUNDED_PULSE_DRIVE = 2.45;
const ROUNDED_PULSE_NORMALIZATION = Math.tanh(ROUNDED_PULSE_DRIVE);
const ENGINE_OUTPUT_TRIM = Object.freeze({
  fm: 0.085,
  modal: 0.115,
  // The lossy delay loop has substantially less raw output than the oscillator banks.
  string: 0.5,
});

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function nextNoise(voice) {
  let value = voice.noiseState >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  voice.noiseState = value >>> 0;
  return (voice.noiseState / 4294967295) * 2 - 1;
}

function wrapPhase(value) {
  if (value >= TAU || value <= -TAU) return value % TAU;
  return value;
}

function waveform(type, phase) {
  const normalized = ((phase / TAU) % 1 + 1) % 1;
  if (type === "triangle") return 1 - 4 * Math.abs(normalized - 0.5);
  if (type === "sawtooth") return normalized * 2 - 1;
  // A mathematically hard square is brittle before FM and creates excessive
  // upper-band energy. Saturating a sine retains the odd-harmonic pulse colour
  // while rounding the discontinuity; the genome's filter and drive can then
  // shape it without exposing a perfect textbook square.
  if (type === "square") {
    return (
      Math.tanh(Math.sin(phase) * ROUNDED_PULSE_DRIVE) /
      ROUNDED_PULSE_NORMALIZATION
    );
  }
  return Math.sin(phase);
}

function envelopeBeforeRelease(attack, decay, sustain, time) {
  if (time < 0) return 0;
  if (time < attack) return time / Math.max(attack, 0.0001);
  if (time < attack + decay) {
    const progress = (time - attack) / Math.max(decay, 0.0001);
    return 1 + (sustain - 1) * progress;
  }
  return sustain;
}

function envelopeValue(attack, decay, sustain, release, time, gateTime) {
  if (time < gateTime) {
    return envelopeBeforeRelease(attack, decay, sustain, time);
  }
  const releaseStart = envelopeBeforeRelease(
    attack,
    decay,
    sustain,
    gateTime,
  );
  const releaseProgress = (time - gateTime) / Math.max(release, 0.0001);
  return releaseProgress >= 1 ? 0 : releaseStart * (1 - releaseProgress);
}

function onePoleCoefficient(frequency, sampleRate) {
  const safeFrequency = clamp(frequency, 18, sampleRate * 0.42);
  return 1 - Math.exp((-TAU * safeFrequency) / sampleRate);
}

function dcBlock(voice, sample) {
  const output = sample - voice.dcInput + 0.995 * voice.dcOutput;
  voice.dcInput = sample;
  voice.dcOutput = output;
  return output;
}

function createFmState(genome, baseFrequency, sampleRate) {
  return {
    algorithm: fmAlgorithmFor(genome.algorithm),
    baseFrequency,
    phases: new Float64Array(4),
    operatorOutput: new Float64Array(4),
    previousOperatorOutput: new Float64Array(4),
    modulation: new Float64Array(4),
    filterZ1: 0,
    filterZ2: 0,
    sampleRate,
  };
}

function createModalState(genome, baseFrequency, sampleRate) {
  const frequencies = new Float64Array(genome.modeCount);
  const phases = new Float64Array(genome.modeCount);
  const amplitudes = new Float64Array(genome.modeCount);
  const decayTimes = new Float64Array(genome.modeCount);
  const nyquistLimit = sampleRate * 0.42;
  for (let index = 0; index < genome.modeCount; index += 1) {
    frequencies[index] = clamp(
      baseFrequency * genome.ratios[index] * 2 ** (genome.detuneCents / 1200),
      35,
      nyquistLimit,
    );
    const positionWeight =
      0.12 +
      0.88 *
        Math.abs(
          Math.sin(Math.PI * genome.ratios[index] * genome.strikePosition),
        );
    amplitudes[index] =
      positionWeight /
      (1 + index * (0.56 + (1 - genome.hardness) * 0.72));
    decayTimes[index] = clamp(
      genome.decaySeconds *
        (1 - genome.damping * (index / Math.max(1, genome.modeCount - 1)) * 0.72),
      0.08,
      4,
    );
  }
  return {
    frequencies,
    phases,
    amplitudes,
    decayTimes,
    bodyState: 0,
    coupledState: 0,
    sampleRate,
  };
}

function createStringState(genome, baseFrequency, sampleRate, voice) {
  const tunedFrequency = clamp(
    baseFrequency * 2 ** (genome.detuneCents / 1200),
    35,
    sampleRate * 0.36,
  );
  const delaySamples = clamp(sampleRate / tunedFrequency - 0.5, 2.25, 4093);
  const buffer = new Float64Array(Math.ceil(delaySamples) + 3);
  const hardness =
    genome.exciter === "hard-pick"
      ? 0.96
      : genome.exciter === "hammer"
        ? 0.68
        : genome.exciter === "scrape"
          ? 0.52
          : 0.34;
  for (let index = 0; index < buffer.length; index += 1) {
    const phase = index / Math.max(1, buffer.length - 1);
    const contact =
      0.18 +
      0.82 *
        Math.abs(
          Math.sin(
            Math.PI *
              phase /
              Math.max(0.08, genome.fixedPosition ? genome.pickPosition : 0.22),
          ),
        );
    buffer[index] =
      nextNoise(voice) *
      contact *
      (0.22 + genome.exciterMass * 0.56) *
      hardness;
  }
  const loopsPerSecond = sampleRate / delaySamples;
  const t60Gain = 10 ** (-3 / Math.max(0.12, genome.decaySeconds * loopsPerSecond));
  const terminationLoss =
    genome.termination === "damped"
      ? 0.96 - genome.damperMass * 0.07 - genome.damperStiffness * 0.045
      : genome.termination === "buzz"
        ? 0.985
        : 1;
  return {
    buffer,
    delaySamples,
    writeIndex: 0,
    feedback: clamp(
      Math.min(genome.feedback, t60Gain) * terminationLoss,
      0.72,
      0.9994,
    ),
    dampingState: 0,
    previousDamping: 0,
    bodyState: 0,
    tunedFrequency,
    sampleRate,
  };
}

function renderFm(voice, time) {
  const { genome, fm, sampleRate } = voice;
  fm.modulation.fill(0);
  const lfoCents =
    Math.sin(TAU * genome.lfoRateHz * time) * genome.lfoDepthCents;
  for (let index = 3; index >= 0; index -= 1) {
    const envelope = envelopeValue(
      genome.attacks[index],
      genome.decays[index],
      genome.sustains[index],
      genome.releases[index],
      time,
      voice.gateSeconds,
    );
    const frequency =
      fm.baseFrequency *
      genome.ratios[index] *
      2 ** ((genome.detuneCents + lfoCents) / 1200);
    const feedback =
      index === 3
        ? fm.previousOperatorOutput[3] *
          genome.feedback *
          fm.baseFrequency *
          0.32
        : 0;
    const instantaneousFrequency = clamp(
      frequency + fm.modulation[index] + feedback,
      0.1,
      sampleRate * 0.42,
    );
    fm.phases[index] = wrapPhase(
      fm.phases[index] + (TAU * instantaneousFrequency) / sampleRate,
    );
    const output =
      waveform(genome.waves[index], fm.phases[index]) *
      envelope *
      genome.levels[index];
    fm.operatorOutput[index] = output;
    for (const [source, target] of fm.algorithm.edges) {
      if (source !== index) continue;
      fm.modulation[target] +=
        output * fm.baseFrequency * genome.modulationIndex;
    }
  }
  let carrier = 0;
  for (const index of fm.algorithm.carriers) {
    carrier += fm.operatorOutput[index];
  }
  carrier /= Math.sqrt(Math.max(1, fm.algorithm.carriers.length));
  const mainEnvelope = envelopeValue(
    genome.attacks[0],
    genome.decays[0],
    genome.sustains[0],
    genome.releases[0],
    time,
    voice.gateSeconds,
  );
  const cutoff =
    genome.toneHz * (1 + genome.filterEnvelope * mainEnvelope * 1.35);
  const omega = (TAU * clamp(cutoff, 18, sampleRate * 0.42)) / sampleRate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * genome.filterQ);
  const a0 = 1 + alpha;
  const b0 = ((1 - cosine) * 0.5) / a0;
  const b1 = (1 - cosine) / a0;
  const b2 = b0;
  const a1 = (-2 * cosine) / a0;
  const a2 = (1 - alpha) / a0;
  const filtered = b0 * carrier + fm.filterZ1;
  fm.filterZ1 = b1 * carrier - a1 * filtered + fm.filterZ2;
  fm.filterZ2 = b2 * carrier - a2 * filtered;
  fm.previousOperatorOutput.set(fm.operatorOutput);
  return Math.tanh(filtered * genome.drive);
}

function renderModal(voice, time) {
  const { genome, modal, sampleRate } = voice;
  let sum = 0;
  let previousMode = 0;
  for (let index = 0; index < genome.modeCount; index += 1) {
    const decay = Math.exp((-6.907755 * time) / modal.decayTimes[index]);
    const coupling =
      genome.structure === "coupled"
        ? previousMode * genome.coupling * modal.frequencies[index]
        : 0;
    modal.phases[index] = wrapPhase(
      modal.phases[index] +
        (TAU * clamp(modal.frequencies[index] + coupling, 20, sampleRate * 0.42)) /
          sampleRate,
    );
    const mode =
      Math.sin(modal.phases[index]) * modal.amplitudes[index] * decay;
    sum += mode;
    previousMode = mode;
  }
  const exciterDuration =
    genome.exciter === "soft-mallet"
      ? 0.018
      : genome.exciter === "hard-mallet"
        ? 0.004
        : genome.exciter === "scrape"
          ? 0.12
          : 0.045;
  if (time < exciterDuration) {
    const envelope = 1 - time / exciterDuration;
    const noise = nextNoise(voice);
    const exciterGain =
      genome.exciter === "noise" || genome.exciter === "scrape"
        ? genome.noiseMix
        : 0.05 + genome.hardness * 0.18;
    sum += noise * envelope * exciterGain;
  }
  if (genome.structure === "coupled") {
    modal.coupledState +=
      onePoleCoefficient(
        190 + genome.body * 2800,
        sampleRate,
      ) *
      (sum - modal.coupledState);
    sum = sum * (1 - genome.coupling) + modal.coupledState * genome.coupling;
  }
  modal.bodyState +=
    onePoleCoefficient(
      620 + genome.brightness * 9800,
      sampleRate,
    ) *
    (sum - modal.bodyState);
  return Math.tanh(modal.bodyState * genome.drive);
}

function renderString(voice, time) {
  const { genome, string, sampleRate } = voice;
  let readPosition = string.writeIndex - string.delaySamples;
  while (readPosition < 0) readPosition += string.buffer.length;
  const first = Math.floor(readPosition) % string.buffer.length;
  const second = (first + 1) % string.buffer.length;
  const fraction = readPosition - Math.floor(readPosition);
  const delayed =
    string.buffer[first] * (1 - fraction) + string.buffer[second] * fraction;
  const dampingCoefficient =
    0.045 +
    genome.brightness * 0.74 +
    (1 - genome.exciterDamping) * 0.14 +
    (genome.termination === "damped" ? genome.damperStiffness * 0.08 : 0);
  string.dampingState +=
    clamp(dampingCoefficient, 0.04, 0.95) *
    (delayed - string.dampingState);
  const dispersion = clamp(genome.stiffness * 0.55, 0, 0.55);
  let feedbackSample =
    string.dampingState * (1 - dispersion) +
    string.previousDamping * dispersion;
  string.previousDamping = string.dampingState;
  if (genome.termination === "buzz") {
    feedbackSample +=
      Math.tanh(delayed * (1 + genome.buzz * 9)) * genome.buzz * 0.035;
  }
  let continuousExcitation = 0;
  if (genome.exciter === "scrape" && time < 0.18 + genome.exciterMass * 0.18) {
    continuousExcitation =
      nextNoise(voice) *
      (0.018 + genome.exciterMass * 0.04) *
      (1 - time / (0.36 + genome.exciterMass * 0.18));
  }
  string.buffer[string.writeIndex] =
    feedbackSample * string.feedback + continuousExcitation;
  string.writeIndex = (string.writeIndex + 1) % string.buffer.length;
  const bodyFrequency =
    genome.body === "metal"
      ? 2600 + genome.bodySize * 5200
      : genome.body === "glass"
        ? 1800 + genome.bodySize * 4600
        : genome.body === "hollow"
          ? 260 + genome.bodySize * 1200
          : 520 + genome.bodySize * 2600;
  string.bodyState +=
    onePoleCoefficient(bodyFrequency, sampleRate) *
    (delayed - string.bodyState);
  const releaseStart = Math.max(
    0,
    (voice.hardEndFrame - voice.startFrame) / sampleRate -
      genome.releaseSeconds,
  );
  const release =
    time < releaseStart
      ? 1
      : clamp(
          1 - (time - releaseStart) / Math.max(0.02, genome.releaseSeconds),
          0,
          1,
        );
  return Math.tanh(string.bodyState * genome.drive) * release;
}

export function createSynthVoice({
  engine,
  genome,
  midi,
  velocity,
  startFrame,
  durationFrames,
  sampleRate,
  noteSeed = 1,
  priority = 0,
  delaySend = 0,
  reverbSend = 0,
}) {
  if (
    !validateSynthGenome(genome) ||
    genome.engine !== engine ||
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    !Number.isFinite(startFrame) ||
    !Number.isFinite(durationFrames)
  ) {
    return null;
  }
  const safeMidi = clamp(Number.isFinite(midi) ? midi : 60, 24, 108);
  const safeVelocity = clamp(Number.isFinite(velocity) ? velocity : 0.5, 0, 1);
  const safeStartFrame = Math.max(0, Math.round(startFrame));
  const safeDurationFrames = clamp(
    Math.round(durationFrames),
    Math.round(sampleRate * 0.025),
    Math.round(sampleRate * 6),
  );
  const gateSeconds = safeDurationFrames / sampleRate;
  let lifetimeSeconds;
  if (engine === "fm") {
    lifetimeSeconds =
      gateSeconds + Math.max(...genome.releases) + 0.06;
  } else if (engine === "modal") {
    lifetimeSeconds = Math.max(gateSeconds, genome.decaySeconds * 1.14) + 0.05;
  } else {
    lifetimeSeconds =
      Math.max(gateSeconds, genome.decaySeconds) + genome.releaseSeconds + 0.08;
  }
  lifetimeSeconds = clamp(
    lifetimeSeconds,
    0.05,
    SYNTH_HARD_LIFETIME_SECONDS,
  );
  const noiseState =
    hash32(genome.id, safeMidi, noteSeed, safeStartFrame) || 0x6d2b79f5;
  const panUnit = (hash32(noiseState, "pan") >>> 0) / 4294967295;
  const voice = {
    engine,
    genome,
    midi: safeMidi,
    velocity: safeVelocity,
    startFrame: safeStartFrame,
    hardEndFrame: safeStartFrame + Math.ceil(lifetimeSeconds * sampleRate),
    gateSeconds,
    sampleRate,
    priority: clamp(Math.round(priority), 0, 3),
    delaySend: clamp(delaySend, 0, 0.65),
    reverbSend: clamp(reverbSend, 0, 0.75),
    pan: (panUnit * 2 - 1) * genome.spread,
    noiseState,
    dcInput: 0,
    dcOutput: 0,
    lastLevel: 1,
  };
  const baseFrequency = midiToFrequency(safeMidi);
  if (engine === "fm") {
    voice.fm = createFmState(genome, baseFrequency, sampleRate);
  } else if (engine === "modal") {
    voice.modal = createModalState(genome, baseFrequency, sampleRate);
  } else {
    voice.string = createStringState(
      genome,
      baseFrequency,
      sampleRate,
      voice,
    );
  }
  return voice;
}

export function renderSynthVoice(voice, absoluteFrame, target) {
  target[0] = 0;
  target[1] = 0;
  if (
    !voice ||
    absoluteFrame < voice.startFrame ||
    absoluteFrame >= voice.hardEndFrame
  ) {
    return Boolean(voice && absoluteFrame < voice.startFrame);
  }
  const time = (absoluteFrame - voice.startFrame) / voice.sampleRate;
  let sample;
  if (voice.engine === "fm") sample = renderFm(voice, time);
  else if (voice.engine === "modal") sample = renderModal(voice, time);
  else sample = renderString(voice, time);
  const trim = ENGINE_OUTPUT_TRIM[voice.engine];
  sample = dcBlock(voice, sample) * voice.velocity * trim;
  if (!Number.isFinite(sample)) {
    voice.hardEndFrame = absoluteFrame;
    return false;
  }
  const pan = clamp(voice.pan, -1, 1);
  const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);
  target[0] = sample * leftGain;
  target[1] = sample * rightGain;
  voice.lastLevel = Math.abs(sample);
  return absoluteFrame + 1 < voice.hardEndFrame;
}

export function renderSynthNote(event, frameCount, sampleRate = 48000) {
  const voice = createSynthVoice({ ...event, sampleRate });
  if (!voice) return null;
  const frames = Math.max(1, Math.floor(frameCount));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const scratch = new Float64Array(2);
  for (let index = 0; index < frames; index += 1) {
    renderSynthVoice(voice, index, scratch);
    left[index] = Math.abs(scratch[0]) < SILENCE ? 0 : scratch[0];
    right[index] = Math.abs(scratch[1]) < SILENCE ? 0 : scratch[1];
  }
  return { left, right, hardEndFrame: voice.hardEndFrame };
}
