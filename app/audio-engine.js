import {
  GENERATOR_VERSION,
  VIBES,
  blendProfileObjects,
  blendProfiles,
  buildBarPlan,
  clamp,
  hash32,
  makeRng,
  midiToHz,
  nextPhraseBoundary,
  profileForVibe,
  transitionDurationFor,
  transitionProgress,
} from "./techno-model.js";
import { SYNTH_VOICE_LIMIT } from "./synth-dsp.js";
import { stageSynthPalette } from "./synth-genomes.js";

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const AudioWorkletNodeClass =
  window.AudioWorkletNode || globalThis.AudioWorkletNode;
const NATIVE_VOICE_LIMIT = 72;
const NATIVE_SOURCE_LIMIT = 144;

function freshSeed() {
  if (window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return hash32(Date.now(), performance.now() * 1000);
}

export function formatSeed(seed) {
  const hex = (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

function safeDisconnect(node) {
  try {
    node.disconnect();
  } catch (_) {
    // Nodes may already have been disconnected during context shutdown.
  }
}

function driveCurve(amount, length = 1024) {
  const curve = new Float32Array(length);
  const drive = Math.max(0.1, amount);
  for (let index = 0; index < curve.length; index += 1) {
    const value = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = Math.tanh(value * drive) / Math.tanh(drive);
  }
  return curve;
}

function holdParamAtTime(param, time, fallback = 0.0001) {
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(time);
    return;
  }
  const value = Number.isFinite(param.value) ? Math.max(fallback, param.value) : fallback;
  param.cancelScheduledValues(time);
  param.setValueAtTime(value, time);
}

export class InfiniteTechnoEngine {
  constructor(onEvent, options = {}) {
    this.onEvent = typeof onEvent === "function" ? onEvent : () => {};
    this.seed = Number.isFinite(options.seed) ? options.seed >>> 0 : freshSeed();
    this.activeVibe = profileForVibe(options.vibe).id;
    this.activeTonality = ["major", "neutral"].includes(options.tonality)
      ? options.tonality
      : "minor";
    this.vibeTransition = null;
    this.tonalityTransition = null;
    this.pendingSeed = null;
    this.ctx = null;
    this.running = false;
    this.starting = false;
    this.runToken = 0;
    this.timer = null;
    this.visualTimers = new Set();
    this.activeVoices = new Set();
    this.activeSourceCount = 0;
    this.bar = 0;
    this.step = 0;
    this.nextStepTime = 0;
    this.planBar = -1;
    this.plan = null;
    this.planState = null;
    this.currentTempo = this.profileTempo(profileForVibe(this.activeVibe), 0);
    this.lastOpenHatGain = null;
    this.lastOpenHatEnd = 0;
    this.analyser = null;
    this.cachedCurves = new Map();
    this.synthBank = null;
    this.synthWorkletReady = false;
    this.runtimeSynthPalette = null;
    this.runtimeSynthPhraseIndex = -1;
    this.instrumentProfile = null;
    this.instrumentProfilePhraseIndex = -1;
    this.phraseInstrumentation = Object.freeze([]);
    this.phraseInstrumentationKey = "";
    this.sentSynthGenomeIds = new Set();
    this.synthStats = {
      voices: 0,
      queued: 0,
      lateEvents: 0,
      droppedEvents: 0,
      startedEvents: 0,
    };
  }

  profileTempo(profile, bar) {
    const center = (profile.bpm[0] + profile.bpm[1]) / 2;
    const span = (profile.bpm[1] - profile.bpm[0]) / 2;
    const longWave = Math.sin((bar + (this.seed % 97)) / 93);
    const slowWave = Math.sin((bar + (this.seed % 211)) / 317);
    return clamp(
      center + (longWave * 0.65 + slowWave * 0.35) * span * profile.tempoDrift,
      profile.bpm[0],
      profile.bpm[1],
    );
  }

  requestVibe(vibeId) {
    if (!VIBES.some((vibe) => vibe.id === vibeId)) return;
    const currentState = this.resolveMusicalState(this.bar);
    const from = currentState.dominantVibe;
    if (vibeId === from && !this.vibeTransition) return;
    if (!this.running) {
      this.activeVibe = vibeId;
      this.vibeTransition = null;
      this.runtimeSynthPalette = null;
      this.runtimeSynthPhraseIndex = -1;
      this.instrumentProfile = null;
      this.instrumentProfilePhraseIndex = -1;
      this.phraseInstrumentationKey = "";
      this.currentTempo = this.profileTempo(profileForVibe(vibeId), this.bar);
      this.planBar = -1;
      this.onEvent({ type: "intent", kind: "vibe", active: vibeId, immediate: true });
      return;
    }
    const startBar = nextPhraseBoundary(this.bar, 8);
    const duration = transitionDurationFor(from, vibeId);
    this.vibeTransition = {
      from,
      fromProfile: { ...currentState.profile, bpm: [...currentState.profile.bpm] },
      to: vibeId,
      startBar,
      duration,
    };
    this.onEvent({
      type: "intent",
      kind: "vibe",
      from,
      to: vibeId,
      startBar,
      duration,
      immediate: false,
    });
  }

  requestTonality(tonality) {
    if (!["minor", "major", "neutral"].includes(tonality)) return;
    const from = this.resolveMusicalState(this.bar).dominantTonality;
    if (tonality === from && !this.tonalityTransition) return;
    if (!this.running) {
      this.activeTonality = tonality;
      this.tonalityTransition = null;
      this.phraseInstrumentationKey = "";
      this.planBar = -1;
      this.onEvent({ type: "intent", kind: "tonality", active: tonality, immediate: true });
      return;
    }
    const startBar = nextPhraseBoundary(this.bar, 8);
    const duration = from === "neutral" || tonality === "neutral" ? 64 : 96;
    this.tonalityTransition = { from, to: tonality, startBar, duration };
    this.onEvent({
      type: "intent",
      kind: "tonality",
      from,
      to: tonality,
      startBar,
      duration,
      immediate: false,
    });
  }

  requestNewTrajectory() {
    const seed = freshSeed();
    if (!this.running) {
      this.applySeed(seed);
      return;
    }
    const startBar = nextPhraseBoundary(this.bar, 16);
    this.pendingSeed = { seed, startBar };
    this.onEvent({
      type: "intent",
      kind: "seed",
      seed,
      startBar,
      immediate: false,
    });
  }

  applySeed(seed) {
    if (!this.running) {
      this.runtimeSynthPalette = null;
      this.runtimeSynthPhraseIndex = -1;
    }
    this.seed = seed >>> 0;
    this.pendingSeed = null;
    this.planBar = -1;
    this.plan = null;
    this.phraseInstrumentationKey = "";
    if (this.ctx) {
      this.noiseBuffer = this.makeNoise(2, hash32(this.seed, 0x29));
      if (this.convolver) this.convolver.buffer = this.makeImpulse(2.6, hash32(this.seed, 0x71));
    }
    this.onEvent({ type: "seed", seed: this.seed, bar: this.bar });
  }

  resolveMusicalState(bar) {
    let vibeProgress = 0;
    let dominantVibe = this.activeVibe;
    let profile = profileForVibe(this.activeVibe);
    if (this.vibeTransition) {
      vibeProgress = transitionProgress(
        bar,
        this.vibeTransition.startBar,
        this.vibeTransition.duration,
      );
      profile = this.vibeTransition.fromProfile
        ? blendProfileObjects(
            this.vibeTransition.fromProfile,
            profileForVibe(this.vibeTransition.to),
            vibeProgress,
          )
        : blendProfiles(
            this.vibeTransition.from,
            this.vibeTransition.to,
            vibeProgress,
          );
      dominantVibe =
        vibeProgress < 0.5 ? this.vibeTransition.from : this.vibeTransition.to;
    }

    let tonalityProgress = 0;
    let dominantTonality = this.activeTonality;
    if (this.tonalityTransition) {
      tonalityProgress = transitionProgress(
        bar,
        this.tonalityTransition.startBar,
        this.tonalityTransition.duration,
      );
      if (tonalityProgress < 0.34) {
        dominantTonality = this.tonalityTransition.from;
      } else if (
        tonalityProgress < 0.68 &&
        this.tonalityTransition.from !== "neutral" &&
        this.tonalityTransition.to !== "neutral"
      ) {
        dominantTonality = "neutral";
      } else {
        dominantTonality = this.tonalityTransition.to;
      }
    }

    return {
      profile,
      dominantVibe,
      dominantTonality,
      vibeProgress,
      tonalityProgress,
    };
  }

  settleTransitions(bar) {
    if (
      this.vibeTransition &&
      bar >= this.vibeTransition.startBar + this.vibeTransition.duration
    ) {
      this.activeVibe = this.vibeTransition.to;
      this.vibeTransition = null;
    }
    if (
      this.tonalityTransition &&
      bar >= this.tonalityTransition.startBar + this.tonalityTransition.duration
    ) {
      this.activeTonality = this.tonalityTransition.to;
      this.tonalityTransition = null;
    }
  }

  getSnapshot() {
    const state = this.resolveMusicalState(this.bar);
    return Object.freeze({
      version: GENERATOR_VERSION,
      seed: this.seed,
      running: this.running,
      bar: this.bar,
      step: this.step,
      bpm: this.currentTempo,
      vibe: state.dominantVibe,
      tonality: state.dominantTonality,
      section: this.plan?.section?.kind || "DORMANT",
      movement: this.plan?.movement?.index || 0,
      transition: this.vibeTransition
        ? {
            kind: "vibe",
            to: this.vibeTransition.to,
            startBar: this.vibeTransition.startBar,
            duration: this.vibeTransition.duration,
            progress: state.vibeProgress,
          }
        : this.tonalityTransition
          ? {
              kind: "tonality",
              to: this.tonalityTransition.to,
              startBar: this.tonalityTransition.startBar,
              duration: this.tonalityTransition.duration,
              progress: state.tonalityProgress,
            }
          : null,
      instrumentation: Object.freeze(
        (this.phraseInstrumentation || []).filter(
          (item) => item.role !== "synth" || this.synthWorkletReady,
        ),
      ),
      synth: Object.freeze({
        available: this.synthWorkletReady,
        voiceLimit: SYNTH_VOICE_LIMIT,
        ...this.synthStats,
      }),
    });
  }

  async start() {
    if (this.running || this.starting) return;
    if (!AudioContextClass) throw new Error("This browser does not support the Web Audio API.");

    this.starting = true;
    const token = ++this.runToken;
    const voices = new Set();
    let context = null;
    try {
      context = new AudioContextClass({ latencyHint: "interactive" });
      if (token !== this.runToken) {
        this.disposeContext(context, voices);
        return;
      }
      this.ctx = context;
      this.activeVoices = voices;
      this.activeSourceCount = 0;
      this.buildGraph();
      await context.resume();
      if (token !== this.runToken || this.ctx !== context) {
        this.disposeContext(context, voices);
        return;
      }
      if (context.state !== "running") {
        throw new Error("Audio was blocked. Click Start again to allow sound.");
      }
      context.onstatechange = () => {
        if (
          token === this.runToken &&
          this.ctx === context &&
          (this.running || this.starting) &&
          context.state !== "running"
        ) {
          this.stop("interrupted");
        }
      };
      await this.loadSynthBank(context);
      if (token !== this.runToken || this.ctx !== context) {
        this.disposeContext(context, voices);
        return;
      }
      if (context.state !== "running") {
        throw new Error("Audio was interrupted. Click Start to resume the set.");
      }
      this.running = true;
      this.nextStepTime = context.currentTime + 0.065;
      this.planBar = -1;
      this.masterGain.gain.cancelScheduledValues(context.currentTime);
      this.masterGain.gain.setValueAtTime(0.0001, context.currentTime);
      this.masterGain.gain.exponentialRampToValueAtTime(0.46, context.currentTime + 0.12);
      this.timer = window.setInterval(() => this.safeScheduler(), 25);
      this.safeScheduler();
      if (this.running && token === this.runToken) {
        this.onEvent({ type: "state", running: true, snapshot: this.getSnapshot() });
      }
    } catch (error) {
      if (context) this.disposeContext(context, voices);
      if (token !== this.runToken) return;
      this.running = false;
      if (this.ctx === context) this.ctx = null;
      if (this.activeVoices === voices) {
        this.activeVoices = new Set();
        this.activeSourceCount = 0;
      }
      throw error;
    } finally {
      if (token === this.runToken) this.starting = false;
    }
  }

  stop(reason = "manual") {
    const wasActive = this.running || this.starting || Boolean(this.ctx);
    this.runToken += 1;
    this.running = false;
    this.starting = false;
    window.clearInterval(this.timer);
    this.timer = null;
    for (const id of this.visualTimers) window.clearTimeout(id);
    this.visualTimers.clear();

    const context = this.ctx;
    const master = this.masterGain;
    const voices = this.activeVoices;
    try {
      this.synthBank?.port?.postMessage({ type: "all-notes-off" });
    } catch (_) {
      // The worklet may already be gone during page teardown.
    }
    this.activeVoices = new Set();
    this.activeSourceCount = 0;
    this.ctx = null;
    this.analyser = null;
    this.synthBank = null;
    this.synthWorkletReady = false;
    this.phraseInstrumentation = Object.freeze([]);
    this.phraseInstrumentationKey = "";
    this.sentSynthGenomeIds.clear();
    this.synthStats = {
      voices: 0,
      queued: 0,
      lateEvents: 0,
      droppedEvents: 0,
      startedEvents: 0,
    };
    this.lastOpenHatGain = null;
    this.lastOpenHatEnd = 0;

    if (context && context.state !== "closed" && master) {
      const now = context.currentTime;
      holdParamAtTime(master.gain, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    }
    if (context) window.setTimeout(() => this.disposeContext(context, voices), 95);
    if (wasActive) this.onEvent({ type: "state", running: false, reason });
  }

  disposeContext(context, voices = new Set()) {
    voices.clear();
    try {
      if (context.state !== "closed") context.close();
    } catch (_) {
      // Closing twice is harmless.
    }
  }

  buildGraph() {
    const context = this.ctx;
    this.kickBus = context.createGain();
    this.musicBus = context.createGain();
    this.toneFilter = context.createBiquadFilter();
    this.preMaster = context.createGain();
    this.highpass = context.createBiquadFilter();
    this.softClip = context.createWaveShaper();
    this.compressor = context.createDynamicsCompressor();
    this.analyser = context.createAnalyser();
    this.masterGain = context.createGain();

    this.kickBus.gain.value = 0.84;
    this.musicBus.gain.value = 1;
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 6500;
    this.toneFilter.Q.value = 0.7;
    this.preMaster.gain.value = 0.67;
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 26;
    this.highpass.Q.value = 0.65;
    this.softClip.curve = driveCurve(2.05, 2048);
    this.softClip.oversample = "2x";
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.2;
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.masterGain.gain.value = 0.0001;

    this.kickBus.connect(this.preMaster);
    this.musicBus.connect(this.toneFilter);
    this.toneFilter.connect(this.preMaster);
    this.preMaster.connect(this.highpass);
    this.highpass.connect(this.softClip);
    this.softClip.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(context.destination);

    this.delayIn = context.createGain();
    this.delay = context.createDelay(2);
    this.delayFilter = context.createBiquadFilter();
    this.delayFeedback = context.createGain();
    this.delayWet = context.createGain();
    this.delayFilter.type = "lowpass";
    this.delayFilter.frequency.value = 3900;
    this.delayFilter.Q.value = 0.7;
    this.delayIn.connect(this.delay);
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.musicBus);

    this.reverbIn = context.createGain();
    this.reverbHighpass = context.createBiquadFilter();
    this.reverbLowpass = context.createBiquadFilter();
    this.convolver = context.createConvolver();
    this.reverbWet = context.createGain();
    this.reverbHighpass.type = "highpass";
    this.reverbHighpass.frequency.value = 280;
    this.reverbLowpass.type = "lowpass";
    this.reverbLowpass.frequency.value = 7200;
    this.convolver.buffer = this.makeImpulse(2.6, hash32(this.seed, 0x71));
    this.reverbIn.connect(this.reverbHighpass);
    this.reverbHighpass.connect(this.reverbLowpass);
    this.reverbLowpass.connect(this.convolver);
    this.convolver.connect(this.reverbWet);
    this.reverbWet.connect(this.musicBus);

    this.rumbleDelay = context.createDelay(1);
    this.rumbleFeedback = context.createGain();
    this.rumbleFilter = context.createBiquadFilter();
    this.rumbleDrive = context.createWaveShaper();
    this.rumbleWet = context.createGain();
    this.rumbleFilter.type = "lowpass";
    this.rumbleFilter.frequency.value = 145;
    this.rumbleFilter.Q.value = 1.1;
    this.rumbleDrive.curve = driveCurve(3.2, 1024);
    this.rumbleDrive.oversample = "2x";
    this.kickBus.connect(this.rumbleDelay);
    this.rumbleDelay.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleDrive);
    this.rumbleDrive.connect(this.rumbleWet);
    this.rumbleWet.connect(this.musicBus);
    this.rumbleFilter.connect(this.rumbleFeedback);
    this.rumbleFeedback.connect(this.rumbleDelay);

    this.noiseBuffer = this.makeNoise(2, hash32(this.seed, 0x29));
    this.syncEffects(profileForVibe(this.activeVibe), null, true);
  }

  async loadSynthBank(context) {
    this.synthBank = null;
    this.synthWorkletReady = false;
    if (!context.audioWorklet || typeof AudioWorkletNodeClass !== "function") {
      this.onEvent({
        type: "synth-state",
        available: false,
        message: "Advanced synthesis is unavailable in this browser.",
      });
      return;
    }
    try {
      const workletUrl = new URL("./synth-worklet.js", import.meta.url);
      workletUrl.searchParams.set("v", GENERATOR_VERSION);
      await context.audioWorklet.addModule(workletUrl.href);
      if (this.ctx !== context || context.state === "closed") return;
      const node = new AudioWorkletNodeClass(context, "quantum-synth-bank", {
        numberOfInputs: 0,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
        processorOptions: { maxVoices: SYNTH_VOICE_LIMIT },
      });
      this.synthDry = context.createGain();
      this.synthDelaySend = context.createGain();
      this.synthReverbSend = context.createGain();
      this.synthDry.gain.value = 0.92;
      this.synthDelaySend.gain.value = 0.86;
      this.synthReverbSend.gain.value = 0.84;
      node.connect(this.synthDry, 0, 0);
      node.connect(this.synthDelaySend, 1, 0);
      node.connect(this.synthReverbSend, 2, 0);
      this.synthDry.connect(this.musicBus);
      this.synthDelaySend.connect(this.delayIn);
      this.synthReverbSend.connect(this.reverbIn);
      node.port.onmessage = (event) => {
        if (event.data?.type !== "stats") return;
        this.synthStats = {
          voices: clamp(Number(event.data.voices) || 0, 0, SYNTH_VOICE_LIMIT),
          queued: clamp(Number(event.data.queued) || 0, 0, 256),
          lateEvents: Math.max(0, Number(event.data.lateEvents) || 0),
          droppedEvents: Math.max(0, Number(event.data.droppedEvents) || 0),
          startedEvents: Math.max(0, Number(event.data.startedEvents) || 0),
        };
        this.onEvent({ type: "synth-stats", ...this.synthStats });
      };
      node.onprocessorerror = () => {
        if (this.ctx !== context || this.synthBank !== node) return;
        this.synthBank = null;
        this.synthWorkletReady = false;
        this.synthStats = {
          voices: 0,
          queued: 0,
          lateEvents: this.synthStats.lateEvents,
          droppedEvents: this.synthStats.droppedEvents,
          startedEvents: this.synthStats.startedEvents,
        };
        safeDisconnect(node);
        this.onEvent({
          type: "synth-state",
          available: false,
          message: "Advanced synthesis stopped; the core engine is continuing.",
        });
      };
      this.synthBank = node;
      this.synthWorkletReady = true;
      this.onEvent({
        type: "synth-state",
        available: true,
        voiceLimit: SYNTH_VOICE_LIMIT,
      });
    } catch (error) {
      if (this.ctx !== context || context.state === "closed") return;
      this.synthBank = null;
      this.synthWorkletReady = false;
      this.onEvent({
        type: "synth-state",
        available: false,
        message:
          error?.message || "The advanced synthesis bank could not be loaded.",
      });
    }
  }

  makeNoise(seconds, seed) {
    const context = this.ctx;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    const rng = makeRng(seed);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = rng() * 2 - 1;
      previous = previous * 0.12 + white * 0.88;
      data[index] = previous;
    }
    return buffer;
  }

  makeImpulse(seconds, seed) {
    const context = this.ctx;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const rng = makeRng(seed);
    for (let index = 0; index < length; index += 1) {
      const phase = index / length;
      const envelope = (1 - phase) ** 2.9;
      left[index] = (rng() * 2 - 1) * envelope;
      right[index] = (rng() * 2 - 1) * envelope;
    }
    return buffer;
  }

  syncEffects(profile, plan, immediate = false) {
    if (!this.ctx || !this.delay) return;
    const now = this.ctx.currentTime;
    const constant = immediate ? 0.001 : 0.42;
    const beat = 60 / Math.max(60, this.currentTempo);
    const filterOpen = plan?.filterOpen ?? 0.75;
    this.delay.delayTime.setTargetAtTime(beat * 0.75, now, constant);
    this.delayFeedback.gain.setTargetAtTime(clamp(0.2 + profile.space * 0.42, 0, 0.72), now, constant);
    this.delayWet.gain.setTargetAtTime(0.08 + profile.space * 0.2, now, constant);
    this.reverbWet.gain.setTargetAtTime(0.055 + profile.space * 0.22, now, constant);
    this.rumbleDelay.delayTime.setTargetAtTime(beat * 0.5, now, constant);
    this.rumbleFeedback.gain.setTargetAtTime(clamp(0.16 + profile.rumble * 0.34, 0, 0.58), now, constant);
    this.rumbleWet.gain.setTargetAtTime(0.018 + profile.rumble * 0.09, now, constant);
    this.toneFilter.frequency.setTargetAtTime(
      680 + filterOpen * 10600 + profile.warmth * 900,
      now,
      constant,
    );
  }

  safeScheduler() {
    try {
      this.scheduler();
    } catch (error) {
      const message = error?.message || "The audio scheduler stopped unexpectedly.";
      this.stop("error");
      this.onEvent({ type: "error", message });
    }
  }

  scheduler() {
    if (!this.running || !this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const approximateStep = 60 / Math.max(60, this.currentTempo) / 4;
    if (this.nextStepTime < now - approximateStep) {
      const missed = Math.floor((now - this.nextStepTime) / approximateStep) + 1;
      this.advance(missed);
      this.nextStepTime += missed * approximateStep;
    }

    let guard = 0;
    while (this.nextStepTime < now + 0.12 && guard < 16) {
      const state = this.resolveMusicalState(this.bar);
      if (this.step === 0) {
        const targetTempo = this.profileTempo(state.profile, this.bar);
        this.currentTempo = clamp(
          targetTempo,
          this.currentTempo - 0.12,
          this.currentTempo + 0.12,
        );
      }
      const stepDuration = 60 / this.currentTempo / 4;
      this.scheduleStep(this.bar, this.step, this.nextStepTime, stepDuration, state);
      this.nextStepTime += stepDuration;
      this.advance(1);
      guard += 1;
    }
  }

  advance(count) {
    const total = this.step + count;
    this.bar += Math.floor(total / 16);
    this.step = total % 16;
  }

  preparePlan(bar, state) {
    if (this.pendingSeed && bar >= this.pendingSeed.startBar) {
      this.applySeed(this.pendingSeed.seed);
    }
    this.settleTransitions(bar);
    const settledState = this.resolveMusicalState(bar);
    const phraseIndex = Math.floor(Math.max(0, bar) / 8);
    if (
      !this.instrumentProfile ||
      this.instrumentProfilePhraseIndex !== phraseIndex
    ) {
      this.instrumentProfile = Object.freeze({
        ...settledState.profile,
        bpm: Object.freeze([...settledState.profile.bpm]),
      });
      this.instrumentProfilePhraseIndex = phraseIndex;
    }
    const candidatePlan = buildBarPlan({
      seed: this.seed,
      bar,
      vibeId: settledState.dominantVibe,
      tonality: settledState.dominantTonality,
      profile: settledState.profile,
      instrumentProfile: this.instrumentProfile,
    });
    this.plan = this.adoptRuntimeSynthPalette(candidatePlan);
    this.refreshPhraseInstrumentation(bar);
    this.syncSynthGenomes(this.plan);
    this.planState = settledState;
    this.planBar = bar;
    this.syncEffects(settledState.profile, this.plan);
    return this.plan;
  }

  adoptRuntimeSynthPalette(plan) {
    if (
      !this.runtimeSynthPalette ||
      this.runtimeSynthPhraseIndex !== plan.phraseIndex
    ) {
      this.runtimeSynthPalette = stageSynthPalette(
        this.runtimeSynthPalette,
        plan.synthPalette,
        plan.phraseIndex,
      );
      this.runtimeSynthPhraseIndex = plan.phraseIndex;
    }
    return this.decoratePlanWithRuntimeSynthPalette(plan);
  }

  decoratePlanWithRuntimeSynthPalette(plan) {
    const palette = this.runtimeSynthPalette || plan.synthPalette;
    const instrumentation = Object.freeze(
      plan.instrumentation.map((item) => {
        if (item.role !== "synth" || !item.engine || !palette?.[item.engine]) {
          return item;
        }
        const genome = palette[item.engine];
        return Object.freeze({
          ...item,
          id: genome.id,
          label: genome.label,
          detail: genome.detail,
        });
      }),
    );
    return {
      ...plan,
      synthPalette: palette,
      instrumentation,
    };
  }

  refreshPhraseInstrumentation(bar) {
    const phraseStart = Math.floor(Math.max(0, bar) / 8) * 8;
    const paletteKey = ["fm", "modal", "string"]
      .map((engine) => this.runtimeSynthPalette?.[engine]?.id || "")
      .join(":");
    const key = `${this.seed}:${phraseStart}:${paletteKey}`;
    if (key === this.phraseInstrumentationKey) return;

    const items = [];
    const seen = new Set();
    for (let targetBar = phraseStart; targetBar < phraseStart + 8; targetBar += 1) {
      const targetState = this.resolveMusicalState(targetBar);
      const plan =
        targetBar === bar
          ? this.plan
          : this.decoratePlanWithRuntimeSynthPalette(
              buildBarPlan({
                seed: this.seed,
                bar: targetBar,
                vibeId: targetState.dominantVibe,
                tonality: targetState.dominantTonality,
                profile: targetState.profile,
                instrumentProfile: this.instrumentProfile,
              }),
            );
      for (const item of plan.instrumentation) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }
    this.phraseInstrumentation = Object.freeze(items);
    this.phraseInstrumentationKey = key;
  }

  syncSynthGenomes(plan) {
    if (!this.synthBank || !this.synthWorkletReady) return;
    if (this.sentSynthGenomeIds.size > 96) this.sentSynthGenomeIds.clear();
    for (const engine of plan.activeSynthEngines || []) {
      const genome = plan.synthPalette?.[engine];
      if (!genome || this.sentSynthGenomeIds.has(genome.id)) continue;
      this.synthBank.port.postMessage({ type: "define-genome", genome });
      this.sentSynthGenomeIds.add(genome.id);
    }
  }

  scheduleSynthNote(engine, time, note, stepDuration, genome, profile) {
    if (!this.synthBank || !this.synthWorkletReady || !this.ctx || !genome) return;
    const durationScale = engine === "fm" ? genome.durationScale : 1;
    const durationFrames = Math.round(
      stepDuration *
        clamp(note.length, 1, 6) *
        durationScale *
        this.ctx.sampleRate,
    );
    this.synthBank.port.postMessage({
      type: "note",
      engine,
      genomeId: genome.id,
      midi: note.midi,
      velocity: note.velocity,
      startFrame: Math.round(time * this.ctx.sampleRate),
      durationFrames,
      noteSeed: hash32(this.seed, this.bar, this.step, genome.id),
      priority: engine === "modal" ? 0 : 1,
      delaySend: clamp(
        0.035 + profile.space * 0.22 + (engine === "fm" ? 0.035 : 0),
        0,
        0.42,
      ),
      reverbSend: clamp(
        0.06 +
          profile.space * 0.3 +
          (engine === "modal" ? 0.08 : engine === "string" ? 0.04 : 0),
        0,
        0.55,
      ),
    });
  }

  scheduleStep(bar, step, time, stepDuration, state) {
    if (this.planBar !== bar) this.preparePlan(bar, state);
    const plan = this.plan;
    const swing =
      step % 2
        ? plan.profile.swing * (0.005 + plan.movement.timbre.swingBias * 0.012)
        : 0;
    const eventTime = time + swing;
    let kickPulse = 0;
    let bassPulse = 0;
    let hatPulse = 0;
    let chordPulse = 0;
    let synthPulse = 0;

    if (plan.kick[step]) {
      this.kick(eventTime, plan.kick[step], plan.energy, plan.movement.timbre);
      this.duck(eventTime, plan.kick[step]);
      kickPulse = plan.kick[step];
    }
    if (plan.clap[step]) this.clap(eventTime, plan.clap[step], plan.movement.timbre.clapTone);
    if (plan.hat[step]) {
      this.hat(eventTime, plan.hat[step], false, plan.movement.timbre.hatColor);
      hatPulse = plan.hat[step];
    }
    if (plan.openHat[step]) {
      this.hat(eventTime, plan.openHat[step], true, plan.movement.timbre.hatColor);
      hatPulse = plan.openHat[step];
    }
    if (plan.shaker[step]) this.shaker(eventTime, plan.shaker[step], plan.profile.warmth);
    if (plan.ride[step]) {
      this.ride(eventTime, plan.ride[step], plan.movement.timbre.hatColor);
      hatPulse = Math.max(hatPulse, plan.ride[step]);
    }
    if (plan.rim[step]) this.rim(eventTime, plan.rim[step], plan.movement.timbre.rimTone);
    if (plan.metallic[step]) {
      this.metallic(eventTime, plan.metallic[step], plan.profile.metallic, stepDuration);
    }
    if (plan.tom[step]) this.tom(eventTime, plan.tom[step], step, plan.profile.drive);
    if (plan.bass[step]) {
      this.bass(
        eventTime,
        plan.bass[step],
        stepDuration,
        plan.movement.timbre.filterBias,
        plan.bassVoice,
        plan.profile,
      );
      bassPulse = plan.bass[step].accent ? 1 : 0.62;
    }
    for (const engine of plan.activeSynthEngines || []) {
      const note = plan.synth?.[engine]?.[step];
      if (!note) continue;
      this.scheduleSynthNote(
        engine,
        eventTime,
        note,
        stepDuration,
        plan.synthPalette?.[engine],
        plan.profile,
      );
      synthPulse = Math.max(synthPulse, note.velocity);
    }
    if (plan.chord[step]) {
      this.chord(eventTime, plan.chord[step], plan.profile);
      chordPulse = plan.chord[step].velocity;
    }
    if (step === 0) {
      if (plan.pad) this.pad(eventTime, plan.pad, stepDuration, plan.profile);
      if (plan.texture) this.texture(eventTime, plan.texturePan, plan.energy, plan.profile);
      if (plan.riser) {
        this.riser(eventTime, stepDuration * 16 * plan.riserBars, plan.profile);
      }
      if (plan.downlifter) {
        this.downlifter(
          eventTime,
          stepDuration * 16 * plan.downlifterBars,
          plan.profile,
        );
      }
    }

    this.queueVisual(eventTime, {
      type: "step",
      bar,
      step,
      kick: kickPulse,
      bass: bassPulse,
      hat: hatPulse,
      chord: chordPulse,
      synth: synthPulse,
      section: plan.section.kind,
      sectionProgress: plan.sectionProgress,
      movement: plan.movement.index,
      mode: plan.movement.mode.label,
      root: plan.movement.rootName,
      energy: plan.energy,
      vibe: this.planState.dominantVibe,
      tonality: this.planState.dominantTonality,
      bpm: this.currentTempo,
      transition:
        this.vibeTransition || this.tonalityTransition
          ? {
              kind: this.vibeTransition ? "vibe" : "tonality",
              to: this.vibeTransition?.to || this.tonalityTransition?.to,
              progress: Math.max(
                this.planState.vibeProgress,
                this.planState.tonalityProgress,
              ),
            }
          : null,
      sectionStart: step === 0 && plan.sectionStart,
      instrumentation:
        step === 0
          ? this.phraseInstrumentation.filter(
              (item) => item.role !== "synth" || this.synthWorkletReady,
            )
          : null,
      synthEngines: step === 0 ? [...plan.activeSynthEngines] : null,
    });
  }

  queueVisual(time, event) {
    if (!this.ctx) return;
    const wait = Math.max(0, (time - this.ctx.currentTime) * 1000);
    const id = window.setTimeout(() => {
      this.visualTimers.delete(id);
      if (this.running) this.onEvent(event);
    }, wait);
    this.visualTimers.add(id);
  }

  registerVoice(sources, nodes) {
    const registry = this.activeVoices;
    const sourceCost = sources.length;
    if (
      registry.size >= NATIVE_VOICE_LIMIT ||
      this.activeSourceCount + sourceCost > NATIVE_SOURCE_LIMIT
    ) {
      sources.forEach(safeDisconnect);
      nodes.forEach(safeDisconnect);
      return false;
    }
    const token = { sources, nodes };
    registry.add(token);
    this.activeSourceCount += sourceCost;
    let remaining = sources.length;
    const cleanup = () => {
      remaining -= 1;
      if (remaining > 0) return;
      nodes.forEach(safeDisconnect);
      sources.forEach(safeDisconnect);
      registry.delete(token);
      if (this.activeVoices === registry) {
        this.activeSourceCount = Math.max(
          0,
          this.activeSourceCount - sourceCost,
        );
      }
    };
    sources.forEach((source) => {
      source.onended = cleanup;
    });
    return true;
  }

  createPanStage(initialPan = 0) {
    const context = this.ctx;
    if (typeof context.createStereoPanner === "function") {
      const node = context.createStereoPanner();
      node.pan.value = initialPan;
      return { node, pan: node.pan };
    }
    const node = context.createGain();
    const pan = {
      value: initialPan,
      setValueAtTime(value) {
        this.value = value;
      },
      linearRampToValueAtTime(value) {
        this.value = value;
      },
    };
    return { node, pan };
  }

  route(output, dry = 1, delay = 0, reverb = 0, kick = false) {
    const context = this.ctx;
    const nodes = [];
    const dryGain = context.createGain();
    dryGain.gain.value = dry;
    output.connect(dryGain);
    dryGain.connect(kick ? this.kickBus : this.musicBus);
    nodes.push(dryGain);
    if (delay > 0) {
      const send = context.createGain();
      send.gain.value = delay;
      output.connect(send);
      send.connect(this.delayIn);
      nodes.push(send);
    }
    if (reverb > 0) {
      const send = context.createGain();
      send.gain.value = reverb;
      output.connect(send);
      send.connect(this.reverbIn);
      nodes.push(send);
    }
    return nodes;
  }

  duck(time, amount) {
    const gain = this.musicBus.gain;
    holdParamAtTime(gain, time, 1);
    gain.exponentialRampToValueAtTime(0.46 + (1 - amount) * 0.18, time + 0.008);
    gain.exponentialRampToValueAtTime(1, time + 0.19);
  }

  kick(time, velocity, energy, timbre) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const click = context.createBufferSource();
    const clickFilter = context.createBiquadFilter();
    const clickGain = context.createGain();
    const decay = 0.38 + timbre.kickDecay * 0.22;
    const startFrequency = 138 + energy * 24 + timbre.kickTone * 26;
    oscillator.type = timbre.kickTone > 0.78 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(startFrequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(50 + timbre.kickTone * 6, time + 0.045);
    oscillator.frequency.exponentialRampToValueAtTime(43 + timbre.kickTone * 4, time + decay * 0.9);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.8 * velocity, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.27 * velocity, time + 0.075);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    oscillator.connect(gain);
    gain.connect(this.kickBus);
    click.buffer = this.noiseBuffer;
    clickFilter.type = "highpass";
    clickFilter.frequency.value = 3400 + timbre.kickTone * 2100;
    clickGain.gain.setValueAtTime(0.1 * velocity, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.014);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.kickBus);
    if (!this.registerVoice([oscillator, click], [gain, clickFilter, clickGain])) return;
    oscillator.start(time);
    oscillator.stop(time + decay + 0.04);
    click.start(time, (hash32(this.seed, this.bar, this.step) % 1000) / 1000, 0.02);
  }

  hat(time, velocity, open, color) {
    const context = this.ctx;
    if (!context) return;
    if (!open && this.lastOpenHatGain && this.lastOpenHatEnd > time) {
      holdParamAtTime(this.lastOpenHatGain.gain, time);
      this.lastOpenHatGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.014);
    }
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage();
    const duration = open ? 0.16 + color * 0.14 : 0.035 + color * 0.04;
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 1.05 + color * 0.62;
    highpass.type = "highpass";
    highpass.frequency.value = 5900 + color * 1900;
    bandpass.type = "bandpass";
    bandpass.frequency.value = 8700 + color * 2700;
    bandpass.Q.value = 0.65 + color * 1.7;
    panStage.pan.value =
      ((hash32(this.seed, this.bar, this.step, open ? 3 : 2) % 200) / 100 - 1) * 0.42;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.15 * velocity, time + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(
      panStage.node,
      0.84,
      open ? 0.08 : 0.025,
      open ? 0.12 : 0.045,
    );
    if (!this.registerVoice([source], [highpass, bandpass, gain, panStage.node, ...routes])) return;
    if (open) {
      this.lastOpenHatGain = gain;
      this.lastOpenHatEnd = time + duration;
    }
    const offset = (hash32(this.seed, this.bar, this.step, 0xaa) % 1500) / 1000;
    source.start(time, offset, duration + 0.02);
  }

  clap(time, velocity, tone) {
    const context = this.ctx;
    if (!context) return;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage(0.05);
    source.buffer = this.noiseBuffer;
    highpass.type = "highpass";
    highpass.frequency.value = 620 + tone * 320;
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1450 + tone * 940 + velocity * 320;
    bandpass.Q.value = 0.72;
    gain.gain.setValueAtTime(0.0001, time);
    [0, 0.012, 0.025].forEach((offset, index) => {
      gain.gain.setValueAtTime(0.0001, time + offset);
      gain.gain.linearRampToValueAtTime(
        (0.18 - index * 0.034) * velocity,
        time + offset + 0.002,
      );
      gain.gain.exponentialRampToValueAtTime(0.003, time + offset + 0.009);
    });
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.8, 0.055, 0.16);
    if (!this.registerVoice([source], [highpass, bandpass, gain, panStage.node, ...routes])) return;
    source.start(time, 0.2, 0.22);
  }

  rim(time, velocity, tone) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const bandpass = context.createBiquadFilter();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(470 + tone * 370 + velocity * 260, time);
    oscillator.frequency.exponentialRampToValueAtTime(340 + tone * 120, time + 0.045);
    bandpass.type = "bandpass";
    bandpass.frequency.value = 1050 + tone * 620;
    bandpass.Q.value = 1.3;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.1 * velocity, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.065);
    oscillator.connect(bandpass);
    bandpass.connect(gain);
    const routes = this.route(gain, 0.72, 0.09, 0.07);
    if (!this.registerVoice([oscillator], [bandpass, gain, ...routes])) return;
    oscillator.start(time);
    oscillator.stop(time + 0.08);
  }

  shaker(time, velocity, warmth) {
    const context = this.ctx;
    if (!context) return;
    const source = context.createBufferSource();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage();
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 1.35 + warmth * 0.35;
    bandpass.type = "bandpass";
    bandpass.frequency.value = 4300 + warmth * 1700;
    bandpass.Q.value = 1.8;
    panStage.pan.value =
      ((hash32(this.seed, this.bar, this.step, 0x5348) % 180) / 90 - 1) * 0.52;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.1 * velocity, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.052);
    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.7, 0.035, 0.04);
    if (!this.registerVoice([source], [bandpass, gain, panStage.node, ...routes])) return;
    source.start(time, (hash32(this.seed, this.bar, this.step) % 1200) / 1000, 0.07);
  }

  ride(time, velocity, color) {
    const context = this.ctx;
    if (!context) return;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage(0.14);
    const duration = 0.42 + color * 0.34;
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = 1.28 + color * 0.44;
    highpass.type = "highpass";
    highpass.frequency.value = 5200;
    bandpass.type = "bandpass";
    bandpass.frequency.value = 7600 + color * 2600;
    bandpass.Q.value = 2.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.09 * velocity, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.62, 0.05, 0.14);
    if (!this.registerVoice([source], [highpass, bandpass, gain, panStage.node, ...routes])) return;
    source.start(time, (hash32(this.seed, this.bar, this.step, 0x5244) % 900) / 1000, duration + 0.04);
  }

  metallic(time, velocity, color, stepDuration) {
    const context = this.ctx;
    if (!context) return;
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    const bandpass = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage();
    const base = 180 + (hash32(this.seed, this.bar, this.step, 0x4d54) % 420);
    const duration = clamp(stepDuration * (0.45 + color), 0.045, 0.24);
    carrier.type = "triangle";
    modulator.type = "sine";
    carrier.frequency.value = base;
    modulator.frequency.value = base * (1.47 + color * 1.9);
    modGain.gain.setValueAtTime(base * (0.4 + color * 1.8), time);
    modGain.gain.exponentialRampToValueAtTime(0.1, time + duration);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    bandpass.type = "bandpass";
    bandpass.frequency.value = 900 + color * 2800;
    bandpass.Q.value = 2 + color * 4;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.08 * velocity, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    panStage.pan.value =
      ((hash32(this.seed, this.bar, this.step, 0x504e) % 200) / 100 - 1) * 0.64;
    carrier.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.7, 0.09, 0.11);
    if (!this.registerVoice([carrier, modulator], [modGain, bandpass, gain, panStage.node, ...routes])) return;
    carrier.start(time);
    modulator.start(time);
    carrier.stop(time + duration + 0.02);
    modulator.stop(time + duration + 0.02);
  }

  tom(time, velocity, step, drive) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panStage = this.createPanStage();
    const frequency = 92 + (step % 4) * 26 + drive * 18;
    oscillator.type = drive > 0.72 ? "square" : "sine";
    oscillator.frequency.setValueAtTime(frequency * 1.7, time);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, time + 0.055);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16 * velocity, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
    panStage.pan.value = (step % 2 ? 1 : -1) * 0.22;
    oscillator.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.76, 0.06, 0.05);
    if (!this.registerVoice([oscillator], [gain, panStage.node, ...routes])) return;
    oscillator.start(time);
    oscillator.stop(time + 0.22);
  }

  curveForBass(drive) {
    const key = Math.round(clamp(drive, 0, 1) * 8);
    if (!this.cachedCurves.has(key)) {
      this.cachedCurves.set(key, driveCurve(1.15 + key * 0.38, 512));
    }
    return this.cachedCurves.get(key);
  }

  bass(time, note, stepDuration, filterBias, voice, profile) {
    if (voice === "sub") {
      this.subBass(time, note, stepDuration, profile);
    } else if (voice === "pulse") {
      this.pulseBass(time, note, stepDuration, profile);
    } else {
      this.acidBass(time, note, stepDuration, filterBias, profile);
    }
  }

  acidBass(time, note, stepDuration, filterBias, profile) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const filterA = context.createBiquadFilter();
    const filterB = context.createBiquadFilter();
    const gain = context.createGain();
    const localDrive = context.createWaveShaper();
    const slideGap = stepDuration * note.slideSteps;
    const duration = clamp(
      note.slideTo !== null ? slideGap * 1.025 : stepDuration * note.length * 0.9,
      0.09,
      0.8,
    );
    const accent = note.accent ? 1 : 0;
    const baseCutoff = 160 + filterBias * 360 + profile.drive * 170;
    const peakCutoff = clamp(
      baseCutoff * (3.4 + profile.acid * 6.4 + accent * 2.8),
      700,
      5800,
    );
    oscillator.type = filterBias > 0.5 ? "sawtooth" : "square";
    oscillator.frequency.setValueAtTime(midiToHz(note.midi), time);
    if (note.slideTo !== null) {
      const slideWindow = Math.min(0.075, stepDuration * 0.66);
      const slideStart = time + Math.max(0.02, slideGap - slideWindow);
      oscillator.frequency.setValueAtTime(midiToHz(note.midi), slideStart);
      oscillator.frequency.exponentialRampToValueAtTime(midiToHz(note.slideTo), time + slideGap);
    }
    filterA.type = "lowpass";
    filterA.Q.value = 7 + profile.acid * 9 + accent * 2;
    filterA.frequency.setValueAtTime(baseCutoff, time);
    filterA.frequency.exponentialRampToValueAtTime(peakCutoff, time + 0.025);
    filterA.frequency.exponentialRampToValueAtTime(baseCutoff * 1.12, time + duration);
    filterB.type = "lowpass";
    filterB.frequency.value = 5600;
    filterB.Q.value = 0.9;
    localDrive.curve = this.curveForBass(profile.drive);
    localDrive.oversample = "2x";
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.11 + accent * 0.05, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filterA);
    filterA.connect(filterB);
    filterB.connect(localDrive);
    localDrive.connect(gain);
    const routes = this.route(
      gain,
      0.88,
      0.025 + profile.space * 0.09,
      0.015 + profile.space * 0.035,
    );
    if (!this.registerVoice([oscillator], [filterA, filterB, localDrive, gain, ...routes])) return;
    oscillator.start(time);
    oscillator.stop(time + duration + 0.025);
  }

  subBass(time, note, stepDuration, profile) {
    const context = this.ctx;
    if (!context) return;
    const sine = context.createOscillator();
    const triangle = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const duration = clamp(stepDuration * note.length * 0.92, 0.1, 0.9);
    sine.type = "sine";
    triangle.type = "triangle";
    sine.frequency.value = midiToHz(note.midi);
    triangle.frequency.value = midiToHz(note.midi + 12);
    triangle.detune.value = 3;
    filter.type = "lowpass";
    filter.frequency.value = 210 + profile.warmth * 380;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.11 + (note.accent ? 0.025 : 0), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    sine.connect(filter);
    triangle.connect(filter);
    filter.connect(gain);
    const routes = this.route(gain, 0.92, 0.015, 0.012 + profile.space * 0.025);
    if (!this.registerVoice([sine, triangle], [filter, gain, ...routes])) return;
    sine.start(time);
    triangle.start(time);
    sine.stop(time + duration + 0.025);
    triangle.stop(time + duration + 0.025);
  }

  pulseBass(time, note, stepDuration, profile) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const shaper = context.createWaveShaper();
    const gain = context.createGain();
    const duration = clamp(stepDuration * note.length * 0.72, 0.075, 0.55);
    oscillator.type = "square";
    oscillator.frequency.value = midiToHz(note.midi);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320 + profile.drive * 280, time);
    filter.frequency.exponentialRampToValueAtTime(1100 + profile.drive * 1900, time + 0.016);
    filter.frequency.exponentialRampToValueAtTime(260, time + duration);
    filter.Q.value = 2.2 + profile.drive * 3;
    shaper.curve = this.curveForBass(profile.drive);
    shaper.oversample = "2x";
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.08 + (note.accent ? 0.035 : 0), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter);
    filter.connect(shaper);
    shaper.connect(gain);
    const routes = this.route(gain, 0.84, 0.035, 0.018);
    if (!this.registerVoice([oscillator], [filter, shaper, gain, ...routes])) return;
    oscillator.start(time);
    oscillator.stop(time + duration + 0.025);
  }

  chord(time, event, profile) {
    const context = this.ctx;
    if (!context) return;
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage();
    const oscillators = event.notes.slice(0, profile.chords > 0.6 ? 4 : 3).map((midi, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index % 2 ? "triangle" : "sawtooth";
      oscillator.frequency.value = midiToHz(midi);
      oscillator.detune.value = (index - 1.5) * 3;
      oscillator.connect(filter);
      return oscillator;
    });
    filter.type = "lowpass";
    filter.Q.value = 2.6 + profile.space * 2.2;
    filter.frequency.setValueAtTime(420 + profile.warmth * 420, time);
    filter.frequency.exponentialRampToValueAtTime(1700 + profile.space * 1900, time + 0.018);
    filter.frequency.exponentialRampToValueAtTime(360, time + event.length);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.048 * event.velocity, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + event.length);
    panStage.pan.value =
      ((hash32(this.seed, this.bar, this.step, 0x4348) % 160) / 100 - 0.8) * 0.7;
    filter.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(
      panStage.node,
      0.58,
      0.16 + profile.space * 0.28,
      0.1 + profile.space * 0.27,
    );
    if (!this.registerVoice(oscillators, [filter, gain, panStage.node, ...routes])) return;
    oscillators.forEach((oscillator) => {
      oscillator.start(time);
      oscillator.stop(time + event.length + 0.04);
    });
  }

  pad(time, event, stepDuration, profile) {
    const context = this.ctx;
    if (!context || this.activeVoices.size > 70) return;
    const duration = clamp(stepDuration * 16 * event.durationBars, 1.5, 14);
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage(-0.08);
    const oscillators = event.notes.slice(0, 4).map((midi, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index % 2 ? "triangle" : "sine";
      oscillator.frequency.value = midiToHz(midi);
      oscillator.detune.value = (index - 1.5) * 5;
      oscillator.connect(filter);
      return oscillator;
    });
    filter.type = "lowpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(340, time);
    filter.frequency.exponentialRampToValueAtTime(1200 + profile.space * 1800, time + duration * 0.42);
    filter.frequency.exponentialRampToValueAtTime(420, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(event.velocity * 0.032, time + duration * 0.18);
    gain.gain.setValueAtTime(event.velocity * 0.032, time + duration * 0.68);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    panStage.pan.setValueAtTime(-0.18, time);
    panStage.pan.linearRampToValueAtTime(0.18, time + duration);
    filter.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.38, 0.13, 0.42);
    if (!this.registerVoice(oscillators, [filter, gain, panStage.node, ...routes])) return;
    oscillators.forEach((oscillator) => {
      oscillator.start(time);
      oscillator.stop(time + duration + 0.05);
    });
  }

  texture(time, pan, energy, profile) {
    const context = this.ctx;
    if (!context || this.activeVoices.size > 72) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage();
    const duration = 2.2 + profile.space * 3.6;
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 0.4 + profile.texture * 0.25;
    filter.type = "bandpass";
    filter.Q.value = 4 + profile.texture * 6;
    filter.frequency.setValueAtTime(320 + energy * 230, time);
    filter.frequency.exponentialRampToValueAtTime(2100 + energy * 2100, time + duration * 0.62);
    filter.frequency.exponentialRampToValueAtTime(520, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.018 + profile.texture * 0.04, time + duration * 0.34);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    panStage.pan.setValueAtTime(pan, time);
    panStage.pan.linearRampToValueAtTime(-pan * 0.7, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.42, 0.12, 0.38);
    if (!this.registerVoice([source], [filter, gain, panStage.node, ...routes])) return;
    source.start(time, (hash32(this.seed, this.bar, 0x19) % 1500) / 1000);
    source.stop(time + duration + 0.03);
  }

  riser(time, duration, profile) {
    const context = this.ctx;
    if (!context || this.activeVoices.size > 78) return;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const gain = context.createGain();
    const panStage = this.createPanStage(-0.3);
    source.buffer = this.noiseBuffer;
    source.loop = true;
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(420, time);
    highpass.frequency.exponentialRampToValueAtTime(7800, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.018 + profile.space * 0.028, time + duration * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    panStage.pan.linearRampToValueAtTime(0.34, time + duration);
    source.connect(highpass);
    highpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(panStage.node, 0.42, 0.08, 0.28);
    if (!this.registerVoice([source], [highpass, gain, panStage.node, ...routes])) return;
    source.start(time, 0.1);
    source.stop(time + duration + 0.03);
  }

  downlifter(time, duration, profile) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(980 + profile.space * 620, time);
    oscillator.frequency.exponentialRampToValueAtTime(72, time + duration);
    filter.type = "lowpass";
    filter.frequency.value = 2200;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.025, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    const routes = this.route(gain, 0.32, 0.12, 0.3);
    if (!this.registerVoice([oscillator], [filter, gain, ...routes])) return;
    oscillator.start(time);
    oscillator.stop(time + duration + 0.03);
  }

  fillSpectrum(array) {
    if (!this.running || !this.analyser) {
      array.fill(0);
      return false;
    }
    this.analyser.getByteFrequencyData(array);
    return true;
  }
}
