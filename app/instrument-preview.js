import { renderSynthNote } from "./synth-dsp.js";
import { validateSynthGenome } from "./synth-genomes.js";

const PREVIEW_SECONDS = 2.75;
// Physical-model transients have a much higher crest factor than FM or modal
// tones. A deliberately low common RMS target keeps those attacks intact instead
// of clipping/compressing one family merely to make the cards equally loud.
const PREVIEW_TARGET_RMS = 0.0055;
const PREVIEW_PEAK_CEILING = 0.24;
const PREVIEW_NORMALIZATION_LIMIT = 192;
const PREVIEW_OUTPUT_GAIN = 0.22;
const PREVIEW_FADE_SECONDS = 0.025;
const MIN_SAMPLE_RATE = 8000;
const MAX_SAMPLE_RATE = 192000;

const PREVIEW_MOTIF = Object.freeze([
  Object.freeze({ time: 0.08, midi: 52, duration: 0.24, velocity: 0.66 }),
  Object.freeze({ time: 0.72, midi: 55, duration: 0.24, velocity: 0.66 }),
  Object.freeze({ time: 1.36, midi: 59, duration: 0.28, velocity: 0.66 }),
]);

function safeSampleRate(sampleRate) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < MIN_SAMPLE_RATE ||
    sampleRate > MAX_SAMPLE_RATE
  ) {
    throw new RangeError(
      `Preview sample rate must be between ${MIN_SAMPLE_RATE} and ${MAX_SAMPLE_RATE} Hz.`,
    );
  }
  return Math.round(sampleRate);
}

function signalStats(left, right) {
  let peak = 0;
  let sumSquares = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftSample = left[index];
    const rightSample = right[index];
    if (!Number.isFinite(leftSample) || !Number.isFinite(rightSample)) {
      throw new Error("Instrument preview produced a non-finite sample.");
    }
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample));
    sumSquares += leftSample * leftSample + rightSample * rightSample;
  }
  return {
    peak,
    rms: Math.sqrt(sumSquares / Math.max(1, left.length * 2)),
  };
}

function holdParamAtTime(param, time) {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
    return;
  }
  const value = Number.isFinite(param.value) ? Math.max(0, param.value) : 0;
  param.cancelScheduledValues(time);
  param.setValueAtTime(value, time);
}

function disconnect(node) {
  try {
    node?.disconnect();
  } catch (_) {
    // A source can end while a replacement or close operation is cleaning it up.
  }
}

/**
 * Render one fixed, effects-free three-note audition phrase.
 *
 * The returned PCM is deterministic for an identical genome and sample rate. Its
 * duration and peak are bounded independently of the source genome.
 */
export function renderInstrumentPreview(genome, sampleRate = 48000) {
  if (!validateSynthGenome(genome)) {
    throw new TypeError("A valid deterministic synth genome is required.");
  }
  const safeRate = safeSampleRate(sampleRate);
  const frameCount = Math.max(1, Math.floor(PREVIEW_SECONDS * safeRate));
  const mixedLeft = new Float64Array(frameCount);
  const mixedRight = new Float64Array(frameCount);

  for (let index = 0; index < PREVIEW_MOTIF.length; index += 1) {
    const note = PREVIEW_MOTIF[index];
    const rendered = renderSynthNote(
      {
        engine: genome.engine,
        genome,
        midi: note.midi,
        velocity: note.velocity,
        startFrame: Math.round(note.time * safeRate),
        durationFrames: Math.round(note.duration * safeRate),
        noteSeed: 0x50524556 + index,
        priority: 0,
        delaySend: 0,
        reverbSend: 0,
      },
      frameCount,
      safeRate,
    );
    if (!rendered) {
      throw new Error("The synth renderer rejected the preview genome.");
    }
    for (let frame = 0; frame < frameCount; frame += 1) {
      mixedLeft[frame] += rendered.left[frame];
      mixedRight[frame] += rendered.right[frame];
    }
  }

  const raw = signalStats(mixedLeft, mixedRight);
  if (raw.rms <= 1e-8 || raw.peak <= 1e-7) {
    throw new Error("Instrument preview was silent.");
  }
  const normalization = Math.min(
    PREVIEW_NORMALIZATION_LIMIT,
    PREVIEW_TARGET_RMS / raw.rms,
    PREVIEW_PEAK_CEILING / raw.peak,
  );
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  const fadeFrames = Math.max(1, Math.round(PREVIEW_FADE_SECONDS * safeRate));

  for (let frame = 0; frame < frameCount; frame += 1) {
    const fadeIn = Math.min(1, frame / fadeFrames);
    const fadeOut = Math.min(1, (frameCount - 1 - frame) / fadeFrames);
    const fade = Math.max(0, Math.min(fadeIn, fadeOut));
    left[frame] = Math.max(
      -PREVIEW_PEAK_CEILING,
      Math.min(PREVIEW_PEAK_CEILING, mixedLeft[frame] * normalization * fade),
    );
    right[frame] = Math.max(
      -PREVIEW_PEAK_CEILING,
      Math.min(PREVIEW_PEAK_CEILING, mixedRight[frame] * normalization * fade),
    );
  }

  const normalized = signalStats(left, right);
  return {
    sampleRate: safeRate,
    durationSeconds: frameCount / safeRate,
    left,
    right,
    peak: normalized.peak,
    rms: normalized.rms,
  };
}

/**
 * A stopped-transport browser auditioner.
 *
 * Construction is inert. The caller must invoke audition() from an explicit user
 * gesture and must keep the main transport stopped while active is true.
 */
export class InstrumentAuditioner {
  constructor(options = {}) {
    this.AudioContextClass =
      options.AudioContextClass ||
      globalThis.AudioContext ||
      globalThis.webkitAudioContext ||
      null;
    this.outputGain = Math.max(
      0.02,
      Math.min(
        0.3,
        Number.isFinite(options.outputGain)
          ? options.outputGain
          : PREVIEW_OUTPUT_GAIN,
      ),
    );
    this.context = null;
    this.current = null;
    this.generation = 0;
    this.contextRelease = Promise.resolve();
  }

  get active() {
    return Boolean(this.context && this.context.state !== "closed");
  }

  stopCurrent(time = this.context?.currentTime || 0) {
    const current = this.current;
    if (!current) return;
    this.current = null;
    holdParamAtTime(current.gain.gain, time);
    current.gain.gain.linearRampToValueAtTime(
      0,
      time + PREVIEW_FADE_SECONDS,
    );
    try {
      current.source.stop(time + PREVIEW_FADE_SECONDS);
    } catch (_) {
      // Stopping an already-ended AudioBufferSource is harmless.
    }
  }

  async audition(genome) {
    if (!validateSynthGenome(genome)) {
      throw new TypeError("A valid deterministic synth genome is required.");
    }
    if (typeof this.AudioContextClass !== "function") {
      throw new Error("This browser does not support preview audio.");
    }

    const generation = ++this.generation;
    await this.contextRelease;
    if (generation !== this.generation) return null;
    if (!this.context || this.context.state === "closed") {
      this.context = new this.AudioContextClass({ latencyHint: "interactive" });
    }
    const context = this.context;
    let preview;
    try {
      const resume =
        context.state === "running" ? Promise.resolve() : context.resume();
      preview = renderInstrumentPreview(genome, context.sampleRate);
      await resume;
    } catch (error) {
      if (context === this.context && generation === this.generation) {
        await this.close();
      }
      throw error;
    }
    if (
      generation !== this.generation ||
      context !== this.context
    ) {
      return null;
    }
    if (context.state !== "running") {
      await this.close();
      throw new Error("Preview audio could not start.");
    }

    const now = context.currentTime;
    const replacing = Boolean(this.current);
    this.stopCurrent(now);
    const startTime = now + (replacing ? PREVIEW_FADE_SECONDS : 0.005);
    const source = context.createBufferSource();
    const gain = context.createGain();
    const buffer = context.createBuffer(
      2,
      preview.left.length,
      preview.sampleRate,
    );
    if (typeof buffer.copyToChannel === "function") {
      buffer.copyToChannel(preview.left, 0);
      buffer.copyToChannel(preview.right, 1);
    } else {
      buffer.getChannelData(0).set(preview.left);
      buffer.getChannelData(1).set(preview.right);
    }
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(
      this.outputGain,
      startTime + PREVIEW_FADE_SECONDS,
    );
    const fadeOutTime = Math.max(
      startTime + PREVIEW_FADE_SECONDS,
      startTime + preview.durationSeconds - PREVIEW_FADE_SECONDS,
    );
    gain.gain.setValueAtTime(this.outputGain, fadeOutTime);
    gain.gain.linearRampToValueAtTime(
      0,
      startTime + preview.durationSeconds,
    );

    const current = { source, gain };
    this.current = current;
    source.onended = () => {
      disconnect(source);
      disconnect(gain);
      if (this.current === current) this.current = null;
    };
    source.start(startTime);
    source.stop(startTime + preview.durationSeconds + 0.005);

    return Object.freeze({
      sampleRate: preview.sampleRate,
      durationSeconds: preview.durationSeconds,
      peak: preview.peak,
      rms: preview.rms,
    });
  }

  async close() {
    this.generation += 1;
    const context = this.context;
    this.context = null;
    if (!context) {
      this.current = null;
      await this.contextRelease;
      return;
    }
    const current = this.current;
    this.current = null;
    if (current) {
      try {
        current.source.stop();
      } catch (_) {
        // The source may already have reached its finite stop time.
      }
      disconnect(current.source);
      disconnect(current.gain);
    }
    const release = this.contextRelease.then(async () => {
      try {
        if (context.state !== "closed") await context.close();
      } catch (_) {
        // Page teardown can close the context before this cleanup reaches it.
      }
    });
    this.contextRelease = release;
    await release;
  }
}
