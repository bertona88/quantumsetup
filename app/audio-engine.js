import {
  GENERATOR_VERSION,
  VIBES,
  advanceMaterialState,
  blendProfileObjects,
  blendProfiles,
  buildBarPlan,
  clamp,
  createMaterialState,
  derivePhraseState,
  hash32,
  makeRng,
  midiToHz,
  nextPhraseBoundary,
  profileForVibe,
  stageEnsembleRoles,
  summarizeMaterialState,
  transitionDurationFor,
  transitionProgress,
} from "./techno-model.js";
import { SYNTH_VOICE_LIMIT } from "./synth-dsp.js";
import { stageSynthPalette } from "./synth-genomes.js";
import {
  normalizeTasteProfile,
  tasteFingerprint,
} from "./taste-model.js";
import {
  DEFAULT_DIRECTION_CONTROLS,
  DEFAULT_MIX_CONTROLS,
  DIRECTION_KEYS,
  MIX_CUT_KEYS,
  MIX_EQ_KEYS,
  applyDirectionToForm,
  applyDirectionToProfile,
  dbToGain,
  directionControlsEqual,
  interpolateDirectionControls,
  normalizeDirectionControls,
  normalizeMixControls,
} from "./performance-controls.js";
import {
  createTrackDNA,
  selectDistinctTrajectorySeed,
} from "./track-dna.js";
import {
  formatTrajectoryId,
  freshTrajectoryId,
  normalizeTrajectoryId,
} from "./trajectory-identity.js";
import { createVisualForecast } from "./visual-grammar.js";

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const AudioWorkletNodeClass =
  window.AudioWorkletNode || globalThis.AudioWorkletNode;
const NATIVE_VOICE_LIMIT = 72;
const NATIVE_SOURCE_LIMIT = 144;
const KICK_BUS_LEVEL = 0.84;
const BASS_BUS_LEVEL = 0.96;
const RUMBLE_BUS_LEVEL = 0.92;
const MUSIC_BUS_LEVEL = 1;
const SYNTH_MESSAGE_LEAD_SECONDS = 0.05;
const TRAJECTORY_CANDIDATE_COUNT = 16;
const DIRECTION_MORPH_BARS = 8;
const SILENT_GAIN = 0.0001;

function freshSeed() {
  return freshTrajectoryId(window.crypto);
}

export function formatSeed(seed) {
  return formatTrajectoryId(seed);
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

function deepFreezeData(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreezeData(child, seen);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function bassNoteTiming(note, stepDuration, durationScale = 0.9) {
  const safeStepDuration = clamp(Number(stepDuration) || 0.1, 0.02, 0.5);
  const lengthSteps = clamp(Math.round(Number(note?.length) || 1), 1, 4);
  const hasSlide =
    Number.isFinite(note?.slideTo) &&
    Number.isFinite(note?.slideSteps) &&
    note.slideSteps > 0;
  const maxSlideSteps = Math.max(
    1,
    Math.min(4, Math.floor(0.86 / safeStepDuration)),
  );
  const slideSteps = hasSlide
    ? clamp(Math.round(note.slideSteps), 1, maxSlideSteps)
    : 0;
  const slideGap = safeStepDuration * slideSteps;
  return Object.freeze({
    hasSlide,
    stepDuration: safeStepDuration,
    slideGap,
    duration: clamp(
      Math.max(
        safeStepDuration * lengthSteps * durationScale,
        hasSlide ? slideGap * 1.025 : 0,
      ),
      0.075,
      0.9,
    ),
  });
}

function scheduleBassPitch(
  frequency,
  note,
  time,
  stepDuration,
  transpose = 0,
) {
  const startMidi = clamp(
    (Number(note?.midi) || 36) + transpose,
    0,
    127,
  );
  const timing = bassNoteTiming(note, stepDuration);
  const startHz = midiToHz(startMidi);
  frequency.setValueAtTime(startHz, time);
  if (!timing.hasSlide) return timing;

  const targetMidi = clamp(Number(note.slideTo) + transpose, 0, 127);
  const slideWindow = Math.min(0.075, timing.stepDuration * 0.66);
  const slideStart = time + Math.max(0.02, timing.slideGap - slideWindow);
  frequency.setValueAtTime(startHz, slideStart);
  frequency.exponentialRampToValueAtTime(
    midiToHz(targetMidi),
    time + timing.slideGap,
  );
  return timing;
}

function summarizeEnsembleScene(scene) {
  if (!scene) return null;
  return Object.freeze({
    id: scene.id,
    label: scene.label,
    detail: scene.detail,
    recalled: scene.recalled,
    hybrid: scene.hybrid,
    mutationEngine: scene.mutationEngine,
    members: scene.members,
  });
}

function summarizeCouncilVerdict(verdict) {
  if (!verdict) return null;
  return Object.freeze({
    chair: verdict.chair,
    directive: verdict.directive,
    phase: verdict.phase,
    purpose: verdict.purpose,
    activeSynthEngines: verdict.activeSynthEngines,
    optionalLayerBudget: verdict.optionalLayerBudget,
    maxAdvancedStarts: verdict.maxAdvancedStarts,
  });
}

export class InfiniteTechnoEngine {
  constructor(onEvent, options = {}) {
    this.onEvent = typeof onEvent === "function" ? onEvent : () => {};
    this.seed = normalizeTrajectoryId(options.seed) ?? freshSeed();
    this.activeVibe = profileForVibe(options.vibe).id;
    this.activeTonality = ["major", "neutral"].includes(options.tonality)
      ? options.tonality
      : "minor";
    this.tasteProfile = normalizeTasteProfile(options.tasteProfile);
    this.mixControls = normalizeMixControls(
      options.mixControls || DEFAULT_MIX_CONTROLS,
    );
    this.directionControls = normalizeDirectionControls(
      options.directionControls || DEFAULT_DIRECTION_CONTROLS,
    );
    this.directionTransition = null;
    this.pendingMixCuts = null;
    this.vibeTransition = null;
    this.tonalityTransition = null;
    this.pendingSeed = null;
    this.ctx = null;
    this.running = false;
    this.starting = false;
    this.contextReleasing = false;
    this.contextRelease = Promise.resolve();
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
    this.materialState = null;
    this.materialPhraseIndex = -1;
    this.phrasePlans = null;
    this.phrasePlansPhraseIndex = -1;
    this.currentTempo = this.profileTempo(profileForVibe(this.activeVibe), 0);
    this.lastOpenHatGain = null;
    this.lastOpenHatEnd = 0;
    this.analyser = null;
    this.cachedCurves = new Map();
    this.synthBank = null;
    this.synthWorkletReady = false;
    this.runtimeSynthPalette = null;
    this.runtimeSynthPhraseIndex = -1;
    this.runtimeEnsembleRoles = null;
    this.runtimeEnsemblePhraseIndex = -1;
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

  resolveDirectionControls(bar = this.bar) {
    if (!this.directionTransition) return this.directionControls;
    if (bar < this.directionTransition.startBar) {
      return this.directionTransition.from;
    }
    return interpolateDirectionControls(
      this.directionTransition.from,
      this.directionTransition.to,
      transitionProgress(
        bar,
        this.directionTransition.startBar,
        this.directionTransition.duration,
      ),
    );
  }

  requestMixControl(name, value) {
    if (MIX_EQ_KEYS.includes(name)) {
      this.mixControls = normalizeMixControls({
        ...this.mixControls,
        [name]: value,
      });
      this.syncPerformanceMix(this.ctx?.currentTime, false);
      this.onEvent({
        type: "performance-mix",
        control: name,
        value: this.mixControls[name],
        pending: false,
        mix: this.mixControls,
      });
      return true;
    }
    if (!MIX_CUT_KEYS.includes(name)) return false;

    const property = `${name}Cut`;
    const target = value === true;
    if (!this.running) {
      this.mixControls = normalizeMixControls({
        ...this.mixControls,
        [property]: target,
      });
      this.pendingMixCuts = null;
      this.syncPerformanceMix(this.ctx?.currentTime, false);
      this.onEvent({
        type: "performance-mix",
        control: name,
        value: target,
        pending: false,
        mix: this.mixControls,
      });
      return true;
    }

    this.pendingMixCuts = {
      ...(this.pendingMixCuts || {}),
      [property]: target,
    };
    const absoluteStep = this.bar * 16 + this.step;
    const applyAtStep = absoluteStep + (4 - (absoluteStep % 4));
    this.onEvent({
      type: "performance-mix",
      control: name,
      value: target,
      pending: true,
      applyAtBar: Math.floor(applyAtStep / 16),
      applyAtStep: applyAtStep % 16,
      mix: this.mixControls,
    });
    return true;
  }

  queueDirectionControls(target, control) {
    const normalized = normalizeDirectionControls(target);
    if (!this.running) {
      this.directionControls = normalized;
      this.directionTransition = null;
      this.planBar = -1;
      this.onEvent({
        type: "performance-direction",
        control,
        immediate: true,
        direction: normalized,
      });
      return true;
    }

    const current = this.resolveDirectionControls(this.bar);
    if (directionControlsEqual(current, normalized)) return false;
    const startBar = nextPhraseBoundary(this.bar, 8);
    this.directionTransition = {
      from: current,
      to: normalized,
      startBar,
      duration: DIRECTION_MORPH_BARS,
    };
    this.onEvent({
      type: "performance-direction",
      control,
      immediate: false,
      startBar,
      duration: DIRECTION_MORPH_BARS,
      direction: normalized,
    });
    return true;
  }

  requestDirectionControl(name, value) {
    if (!DIRECTION_KEYS.includes(name)) return false;
    const target = this.directionTransition?.to || this.directionControls;
    return this.queueDirectionControls(
      { ...target, [name]: value },
      name,
    );
  }

  requestBassCharacter(character) {
    const target = this.directionTransition?.to || this.directionControls;
    return this.queueDirectionControls(
      { ...target, bassCharacter: character },
      "bassCharacter",
    );
  }

  profileTempo(profile, bar) {
    const center = (profile.bpm[0] + profile.bpm[1]) / 2;
    const span = (profile.bpm[1] - profile.bpm[0]) / 2;
    const longWave = Math.sin(
      (bar + (hash32(this.seed, "tempo-long-phase") % 97)) / 93,
    );
    const slowWave = Math.sin(
      (bar + (hash32(this.seed, "tempo-slow-phase") % 211)) / 317,
    );
    return clamp(
      center + (longWave * 0.65 + slowWave * 0.35) * span * profile.tempoDrift,
      profile.bpm[0],
      profile.bpm[1],
    );
  }

  requestVibe(vibeId) {
    if (!VIBES.some((vibe) => vibe.id === vibeId)) return;
    const currentState = this.resolveBaseMusicalState(this.bar);
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
    const candidates = Array.from(
      { length: TRAJECTORY_CANDIDATE_COUNT },
      () => freshSeed(),
    );
    const selection = selectDistinctTrajectorySeed(this.seed, candidates);
    if (!selection) {
      this.onEvent({
        type: "trajectory-rejected",
        reason: "insufficient-dna-distance",
        candidateCount: candidates.length,
      });
      return false;
    }
    const seed = selection.seed;
    if (!this.running) {
      this.applySeed(seed, selection);
      return true;
    }
    const startBar = nextPhraseBoundary(this.bar, 16);
    this.pendingSeed = { seed, startBar, selection };
    this.onEvent({
      type: "intent",
      kind: "seed",
      seed,
      startBar,
      immediate: false,
      dnaDistance: selection?.distance ?? null,
      changedDomains: selection?.changedDomains ?? null,
    });
    return true;
  }

  setTasteProfile(profile) {
    const normalized = normalizeTasteProfile(profile);
    if (tasteFingerprint(normalized) === tasteFingerprint(this.tasteProfile)) {
      return;
    }
    this.tasteProfile = normalized;
    this.phraseInstrumentationKey = "";
    if (!this.running) {
      this.planBar = -1;
    }
    this.onEvent({
      type: "taste",
      decisions: normalized.decisions,
      likes: normalized.likes,
      passes: normalized.passes,
      fingerprint: tasteFingerprint(normalized),
    });
  }

  applySeed(seed, selection = null) {
    try {
      if (this.synthBank && this.synthWorkletReady) {
        this.synthBank.port.postMessage({ type: "all-notes-off" });
      }
    } catch (_) {
      // A failed worklet must not prevent the trajectory boundary from landing.
    }
    this.runtimeSynthPalette = null;
    this.runtimeSynthPhraseIndex = -1;
    this.runtimeEnsembleRoles = null;
    this.runtimeEnsemblePhraseIndex = -1;
    this.instrumentProfile = null;
    this.instrumentProfilePhraseIndex = -1;
    this.phraseInstrumentation = Object.freeze([]);
    this.sentSynthGenomeIds.clear();
    this.seed = normalizeTrajectoryId(seed) ?? freshSeed();
    this.pendingSeed = null;
    this.planBar = -1;
    this.plan = null;
    this.materialState = null;
    this.materialPhraseIndex = -1;
    this.phrasePlans = null;
    this.phrasePlansPhraseIndex = -1;
    this.phraseInstrumentationKey = "";
    if (this.ctx) {
      this.noiseBuffer = this.makeNoise(2, hash32(this.seed, 0x29));
      if (this.convolver) this.convolver.buffer = this.makeImpulse(2.6, hash32(this.seed, 0x71));
    }
    this.onEvent({
      type: "seed",
      seed: this.seed,
      bar: this.bar,
      identityReset: true,
      dnaDistance: selection?.distance ?? null,
      changedDomains: selection?.changedDomains ?? null,
    });
  }

  resolveBaseMusicalState(bar) {
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

  resolveMusicalState(bar) {
    const state = this.resolveBaseMusicalState(bar);
    const direction = this.resolveDirectionControls(bar);
    return {
      ...state,
      profile: applyDirectionToProfile(state.profile, direction),
      direction,
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
    if (
      this.directionTransition &&
      bar >=
        this.directionTransition.startBar + this.directionTransition.duration
    ) {
      this.directionControls = this.directionTransition.to;
      this.directionTransition = null;
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
      ensembleScene: summarizeEnsembleScene(this.plan?.ensembleScene),
      council: summarizeCouncilVerdict(this.plan?.councilVerdict),
      material: summarizeMaterialState(this.materialState),
      taste: Object.freeze({
        decisions: this.tasteProfile.decisions,
        likes: this.tasteProfile.likes,
        passes: this.tasteProfile.passes,
        fingerprint: tasteFingerprint(this.tasteProfile),
      }),
      performance: Object.freeze({
        mix: this.mixControls,
        pendingCuts: this.pendingMixCuts
          ? Object.freeze({ ...this.pendingMixCuts })
          : null,
        direction: state.direction,
        directionTarget: this.directionTransition?.to || state.direction,
        directionTransition: this.directionTransition
          ? Object.freeze({
              startBar: this.directionTransition.startBar,
              duration: this.directionTransition.duration,
              progress:
                this.bar < this.directionTransition.startBar
                  ? 0
                  : transitionProgress(
                      this.bar,
                      this.directionTransition.startBar,
                      this.directionTransition.duration,
                    ),
            })
          : null,
      }),
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
      if (this.contextReleasing) await this.waitForContextRelease();
      if (token !== this.runToken || !this.starting || this.running) return;

      context = new AudioContextClass({ latencyHint: "interactive" });
      if (token !== this.runToken) {
        await this.disposeContext(context, voices);
        return;
      }
      this.ctx = context;
      this.activeVoices = voices;
      this.activeSourceCount = 0;
      this.buildGraph();
      await context.resume();
      if (token !== this.runToken || this.ctx !== context) {
        await this.disposeContext(context, voices);
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
        await this.disposeContext(context, voices);
        return;
      }
      if (context.state !== "running") {
        throw new Error("Audio was interrupted. Click Start to resume the set.");
      }
      this.running = true;
      this.nextStepTime = context.currentTime + 0.14;
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
      if (context) await this.disposeContext(context, voices);
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
    if (this.pendingMixCuts) {
      this.applyPendingMixCuts(this.ctx?.currentTime ?? 0);
    }
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
    if (context) {
      const previousRelease = this.contextRelease;
      this.contextReleasing = true;
      const release = previousRelease
        .then(
          () => new Promise((resolve) => window.setTimeout(resolve, 95)),
        )
        .then(() => this.disposeContext(context, voices));
      const trackedRelease = release.finally(() => {
        if (this.contextRelease === trackedRelease) {
          this.contextReleasing = false;
        }
      });
      this.contextRelease = trackedRelease;
    }
    return this.waitForContextRelease().then(() => {
      if (wasActive) this.onEvent({ type: "state", running: false, reason });
    });
  }

  waitForContextRelease() {
    return this.contextRelease;
  }

  async disposeContext(context, voices = new Set()) {
    voices.clear();
    try {
      if (context.state !== "closed") await context.close();
    } catch (_) {
      // Closing twice is harmless.
    }
  }

  buildGraph() {
    const context = this.ctx;
    this.kickBus = context.createGain();
    this.bassBus = context.createGain();
    this.rumbleBus = context.createGain();
    this.musicBus = context.createGain();
    this.kickPerformanceGain = context.createGain();
    this.bassPerformanceGain = context.createGain();
    this.toneFilter = context.createBiquadFilter();
    this.preMaster = context.createGain();
    this.highpass = context.createBiquadFilter();
    this.lowEq = context.createBiquadFilter();
    this.midEq = context.createBiquadFilter();
    this.highEq = context.createBiquadFilter();
    this.softClip = context.createWaveShaper();
    this.compressor = context.createDynamicsCompressor();
    this.analyser = context.createAnalyser();
    this.masterGain = context.createGain();

    this.kickBus.gain.value = KICK_BUS_LEVEL;
    this.bassBus.gain.value = BASS_BUS_LEVEL;
    this.rumbleBus.gain.value = RUMBLE_BUS_LEVEL;
    this.musicBus.gain.value = MUSIC_BUS_LEVEL;
    this.kickPerformanceGain.gain.value = 1;
    this.bassPerformanceGain.gain.value = 1;
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = 6500;
    this.toneFilter.Q.value = 0.7;
    this.preMaster.gain.value = 0.67;
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 26;
    this.highpass.Q.value = 0.65;
    this.lowEq.type = "lowshelf";
    this.lowEq.frequency.value = 180;
    this.lowEq.gain.value = this.mixControls.low;
    this.midEq.type = "peaking";
    this.midEq.frequency.value = 1200;
    this.midEq.Q.value = 0.72;
    this.midEq.gain.value = this.mixControls.mid;
    this.highEq.type = "highshelf";
    this.highEq.frequency.value = 5200;
    this.highEq.gain.value = this.mixControls.high;
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

    this.kickBus.connect(this.kickPerformanceGain);
    this.kickPerformanceGain.connect(this.preMaster);
    this.bassBus.connect(this.bassPerformanceGain);
    this.bassPerformanceGain.connect(this.preMaster);
    this.rumbleBus.connect(this.preMaster);
    this.musicBus.connect(this.toneFilter);
    this.toneFilter.connect(this.preMaster);
    this.preMaster.connect(this.highpass);
    this.highpass.connect(this.lowEq);
    this.lowEq.connect(this.midEq);
    this.midEq.connect(this.highEq);
    this.highEq.connect(this.softClip);
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
    this.rumbleSendGain = context.createGain();
    this.rumbleWet = context.createGain();
    this.rumbleFilter.type = "lowpass";
    this.rumbleFilter.frequency.value = 145;
    this.rumbleFilter.Q.value = 1.1;
    this.rumbleDrive.curve = driveCurve(3.2, 1024);
    this.rumbleDrive.oversample = "2x";
    this.rumbleFeedback.gain.value = 0.32;
    this.rumbleSendGain.gain.value = 0.06;
    this.rumbleWet.gain.value = 0.86;
    this.kickPerformanceGain.connect(this.rumbleSendGain);
    this.rumbleSendGain.connect(this.rumbleDelay);
    this.rumbleDelay.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleDrive);
    this.rumbleDrive.connect(this.rumbleWet);
    this.rumbleWet.connect(this.rumbleBus);
    this.rumbleFilter.connect(this.rumbleFeedback);
    this.rumbleFeedback.connect(this.rumbleDelay);

    this.noiseBuffer = this.makeNoise(2, hash32(this.seed, 0x29));
    this.syncPerformanceMix(context.currentTime, true);
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

  syncPerformanceMix(time = this.ctx?.currentTime, immediate = false, profile = null) {
    if (
      !this.ctx ||
      !this.kickPerformanceGain ||
      !this.bassPerformanceGain ||
      !this.lowEq ||
      !this.midEq ||
      !this.highEq
    ) {
      return;
    }
    const at = Number.isFinite(time) ? time : this.ctx.currentTime;
    const bassPresence = clamp(
      Number.isFinite(profile?.performanceBassPresence)
        ? profile.performanceBassPresence
        : this.resolveDirectionControls(this.bar).bassPresence,
      -1,
      1,
    );
    const bassTrimDb = bassPresence < 0
      ? bassPresence * 6
      : bassPresence * 4.5;
    const values = [
      [this.lowEq.gain, this.mixControls.low],
      [this.midEq.gain, this.mixControls.mid],
      [this.highEq.gain, this.mixControls.high],
      [
        this.kickPerformanceGain.gain,
        this.mixControls.kickCut ? SILENT_GAIN : 1,
      ],
      [
        this.bassPerformanceGain.gain,
        this.mixControls.bassCut ? SILENT_GAIN : dbToGain(bassTrimDb),
      ],
    ];
    for (const [param, value] of values) {
      param.cancelScheduledValues(at);
      if (immediate) {
        param.setValueAtTime(value, at);
      } else {
        param.setTargetAtTime(value, at, 0.035);
      }
    }
  }

  applyPendingMixCuts(time) {
    if (!this.pendingMixCuts) return false;
    const updates = this.pendingMixCuts;
    this.pendingMixCuts = null;
    this.mixControls = normalizeMixControls({
      ...this.mixControls,
      ...updates,
    });
    this.syncPerformanceMix(time, false);
    for (const name of MIX_CUT_KEYS) {
      const property = `${name}Cut`;
      if (!(property in updates)) continue;
      this.onEvent({
        type: "performance-mix",
        control: name,
        value: this.mixControls[property],
        pending: false,
        mix: this.mixControls,
      });
    }
    return true;
  }

  syncEffects(profile, plan, immediate = false) {
    if (!this.ctx || !this.delay) return;
    const now = this.ctx.currentTime;
    const constant = immediate ? 0.001 : 0.42;
    const beat = 60 / Math.max(60, this.currentTempo);
    const filterOpen = plan?.filterOpen ?? 0.75;
    const kickTimbre = plan?.kickTimbre;
    const rumbleSend = clamp(
      kickTimbre?.rumbleSend ??
        plan?.lowEnd?.rumbleSend ??
        0.018 + profile.rumble * 0.105,
      0,
      0.14,
    );
    const rumbleCutoff = clamp(
      kickTimbre?.rumbleCutoffHz ??
        92 + profile.rumble * 66 + profile.space * 18,
      84,
      176,
    );
    const rumbleFeedback = clamp(
      kickTimbre?.rumbleFeedback ??
        0.14 + profile.rumble * 0.34 + profile.space * 0.06,
      0,
      0.58,
    );
    this.delay.delayTime.setTargetAtTime(beat * 0.75, now, constant);
    this.delayFeedback.gain.setTargetAtTime(clamp(0.2 + profile.space * 0.42, 0, 0.72), now, constant);
    this.delayWet.gain.setTargetAtTime(0.08 + profile.space * 0.2, now, constant);
    this.reverbWet.gain.setTargetAtTime(0.055 + profile.space * 0.22, now, constant);
    this.rumbleDelay.delayTime.setTargetAtTime(beat * 0.5, now, constant);
    this.rumbleSendGain.gain.setTargetAtTime(rumbleSend, now, constant);
    this.rumbleFilter.frequency.setTargetAtTime(rumbleCutoff, now, constant);
    this.rumbleFeedback.gain.setTargetAtTime(rumbleFeedback, now, constant);
    this.toneFilter.frequency.setTargetAtTime(
      680 + filterOpen * 10600 + profile.warmth * 900,
      now,
      constant,
    );
    this.syncPerformanceMix(now, immediate, profile);
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
    let materialReplayStartPhrase = null;
    if (this.pendingSeed && bar >= this.pendingSeed.startBar) {
      const pendingSeed = this.pendingSeed;
      materialReplayStartPhrase = Math.floor(
        Math.max(0, pendingSeed.startBar) / 8,
      );
      this.applySeed(pendingSeed.seed, pendingSeed.selection);
    }
    // Keep a completed transition available until catch-up has replayed the
    // phrase-boundary profiles that led to the requested bar.
    const planningState = this.resolveMusicalState(bar);
    const phraseIndex = Math.floor(Math.max(0, bar) / 8);
    if (
      !this.phrasePlans ||
      this.phrasePlansPhraseIndex !== phraseIndex
    ) {
      this.buildFrozenPhrasePlans(
        phraseIndex,
        planningState,
        materialReplayStartPhrase,
      );
    }
    this.plan = this.phrasePlans[bar % 8];
    this.syncSynthGenomes(this.plan);
    this.settleTransitions(bar);
    const settledState = this.resolveMusicalState(bar);
    this.planState = settledState;
    this.planBar = bar;
    this.syncEffects(settledState.profile, this.plan);
    return this.plan;
  }

  advanceMaterialToPhrase(phraseIndex, settledState) {
    const trackDNA = createTrackDNA(this.seed);
    const inputFor = (targetPhraseIndex) => {
      const phraseState =
        targetPhraseIndex === phraseIndex
          ? settledState
          : this.resolveMusicalState(targetPhraseIndex * 8);
      return {
        seed: this.seed,
        phraseIndex: targetPhraseIndex,
        trackDNA,
        form: applyDirectionToForm(
          derivePhraseState(this.seed, targetPhraseIndex),
          phraseState.direction,
        ),
        profile: Object.freeze({
          ...phraseState.profile,
          bpm: Object.freeze([...phraseState.profile.bpm]),
        }),
        tonality: phraseState.dominantTonality,
      };
    };
    if (!this.materialState) {
      this.materialState = createMaterialState(inputFor(phraseIndex));
      this.materialPhraseIndex = phraseIndex;
      return this.materialState;
    }
    if (phraseIndex < this.materialState.phraseIndex) {
      throw new RangeError("runtime material cannot move backwards");
    }
    while (this.materialState.phraseIndex < phraseIndex) {
      const nextPhraseIndex = this.materialState.phraseIndex + 1;
      this.materialState = advanceMaterialState(
        this.materialState,
        inputFor(nextPhraseIndex),
      );
    }
    this.materialPhraseIndex = this.materialState.phraseIndex;
    return this.materialState;
  }

  stageSkippedRuntimePhrase(phraseIndex, phraseState, materialState) {
    // Runtime roles and synth genomes are staged mutations, so advancing only
    // MaterialPlanner state would make a scheduler jump path-dependent.
    const instrumentProfile = Object.freeze({
      ...phraseState.profile,
      bpm: Object.freeze([...phraseState.profile.bpm]),
    });
    this.instrumentProfile = instrumentProfile;
    this.instrumentProfilePhraseIndex = phraseIndex;
    const planInput = {
      seed: this.seed,
      bar: phraseIndex * 8,
      vibeId: phraseState.dominantVibe,
      tonality: phraseState.dominantTonality,
      profile: instrumentProfile,
      instrumentProfile,
      tasteProfile: this.tasteProfile,
      materialState,
    };
    const candidatePlan = buildBarPlan(planInput);
    this.runtimeEnsembleRoles = stageEnsembleRoles(
      this.runtimeEnsembleRoles,
      candidatePlan.ensembleTargetRoles,
      candidatePlan.synthHandoff,
    );
    this.runtimeEnsemblePhraseIndex = phraseIndex;
    const stagedPlan = buildBarPlan({
      ...planInput,
      ensembleRoles: this.runtimeEnsembleRoles,
    });
    this.runtimeSynthPalette = stageSynthPalette(
      this.runtimeSynthPalette,
      stagedPlan.synthPalette,
      stagedPlan.synthHandoff,
    );
    this.runtimeSynthPhraseIndex = phraseIndex;
  }

  buildFrozenPhrasePlans(
    phraseIndex,
    settledState,
    materialReplayStartPhrase = null,
  ) {
    const firstReplayPhrase = this.materialState
      ? this.materialState.phraseIndex + 1
      : Math.min(
          phraseIndex,
          Number.isSafeInteger(materialReplayStartPhrase)
            ? Math.max(0, materialReplayStartPhrase)
            : phraseIndex,
        );
    for (
      let replayPhraseIndex = firstReplayPhrase;
      replayPhraseIndex < phraseIndex;
      replayPhraseIndex += 1
    ) {
      const replayState = this.resolveMusicalState(replayPhraseIndex * 8);
      const replayMaterial = this.advanceMaterialToPhrase(
        replayPhraseIndex,
        replayState,
      );
      this.stageSkippedRuntimePhrase(
        replayPhraseIndex,
        replayState,
        replayMaterial,
      );
    }
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
    const materialState = this.advanceMaterialToPhrase(
      phraseIndex,
      settledState,
    );
    const phraseStartBar = phraseIndex * 8;
    const planInput = {
      seed: this.seed,
      bar: phraseStartBar,
      vibeId: settledState.dominantVibe,
      tonality: settledState.dominantTonality,
      profile: this.instrumentProfile,
      instrumentProfile: this.instrumentProfile,
      tasteProfile: this.tasteProfile,
      materialState,
    };
    const candidatePlan = buildBarPlan(planInput);
    this.runtimeEnsembleRoles = stageEnsembleRoles(
      this.runtimeEnsembleRoles,
      candidatePlan.ensembleTargetRoles,
      candidatePlan.synthHandoff,
    );
    this.runtimeEnsemblePhraseIndex = phraseIndex;
    const plans = Array.from({ length: 8 }, (_, barOffset) =>
      buildBarPlan({
        ...planInput,
        bar: phraseStartBar + barOffset,
        ensembleRoles: this.runtimeEnsembleRoles,
      }),
    );
    this.runtimeSynthPalette = stageSynthPalette(
      this.runtimeSynthPalette,
      plans[0].synthPalette,
      plans[0].synthHandoff,
    );
    this.runtimeSynthPhraseIndex = phraseIndex;
    this.phrasePlans = Object.freeze(
      plans.map((plan) =>
        deepFreezeData(this.decoratePlanWithRuntimeSynthPalette(plan)),
      ),
    );
    this.phrasePlansPhraseIndex = phraseIndex;
    this.plan = this.phrasePlans[0];
    this.refreshPhraseInstrumentation(phraseStartBar);
    return this.phrasePlans;
  }

  adoptRuntimeEnsemble(candidatePlan, planInput) {
    if (
      !this.runtimeEnsembleRoles ||
      this.runtimeEnsemblePhraseIndex !== candidatePlan.phraseIndex
    ) {
      this.runtimeEnsembleRoles = stageEnsembleRoles(
        this.runtimeEnsembleRoles,
        candidatePlan.ensembleTargetRoles,
        candidatePlan.synthHandoff,
      );
      this.runtimeEnsemblePhraseIndex = candidatePlan.phraseIndex;
    }
    const needsRebuild = ["fm", "modal", "string"].some(
      (engine) =>
        this.runtimeEnsembleRoles?.[engine] !==
        candidatePlan.ensembleTargetRoles?.[engine],
    );
    return needsRebuild
      ? buildBarPlan({
          ...planInput,
          ensembleRoles: this.runtimeEnsembleRoles,
        })
      : candidatePlan;
  }

  adoptRuntimeSynthPalette(plan) {
    if (
      !this.runtimeSynthPalette ||
      this.runtimeSynthPhraseIndex !== plan.phraseIndex
    ) {
      this.runtimeSynthPalette = stageSynthPalette(
        this.runtimeSynthPalette,
        plan.synthPalette,
        plan.synthHandoff,
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
    const roleKey = ["fm", "modal", "string"]
      .map((engine) => {
        const role = this.runtimeEnsembleRoles?.[engine];
        return role
          ? `${engine}:${role.sourceSceneId}:${role.id}`
          : `${engine}:`;
      })
      .join(":");
    const key = `${this.seed}:${phraseStart}:${paletteKey}:${roleKey}`;
    if (key === this.phraseInstrumentationKey) return;

    const items = [];
    const seen = new Set();
    for (const plan of this.phrasePlans || [this.plan]) {
      if (!plan) continue;
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
    const safeStartTime = Math.max(
      Number.isFinite(time) ? time : this.ctx.currentTime,
      this.ctx.currentTime + SYNTH_MESSAGE_LEAD_SECONDS,
    );
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
      startFrame: Math.round(safeStartTime * this.ctx.sampleRate),
      durationFrames,
      noteSeed: hash32(this.seed, this.bar, this.step, genome.id),
      priority: Number.isFinite(note.priority)
        ? clamp(note.priority, 0, 3)
        : engine === "modal"
          ? 0
          : 1,
      delaySend: Number.isFinite(note.delaySend)
        ? clamp(note.delaySend, 0, 0.42)
        : clamp(
            0.035 + profile.space * 0.22 + (engine === "fm" ? 0.035 : 0),
            0,
            0.42,
          ),
      reverbSend: Number.isFinite(note.reverbSend)
        ? clamp(note.reverbSend, 0, 0.55)
        : clamp(
            0.06 +
              profile.space * 0.3 +
              (engine === "modal"
                ? 0.08
                : engine === "string"
                  ? 0.04
                  : 0),
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
    if (step % 4 === 0) this.applyPendingMixCuts(eventTime);
    let kickPulse = 0;
    let bassPulse = 0;
    let hatPulse = 0;
    let chordPulse = 0;
    let synthPulse = 0;

    if (step === 0) {
      this.onEvent({
        type: "visual-forecast",
        bar,
        audioTime: eventTime,
        forecast: createVisualForecast({
          seed: this.seed,
          phrasePlans: this.phrasePlans,
          bar,
          stepDuration,
          kickCut: this.mixControls.kickCut,
          bassCut: this.mixControls.bassCut,
        }),
      });
    }

    if (plan.kick[step] && !this.mixControls.kickCut) {
      const articulation = plan.kickArticulation?.[step] || "anchor";
      const decayScale =
        articulation === "pickup"
          ? 0.52
          : articulation === "roll"
            ? 0.68
            : 1;
      const kickTimbre =
        decayScale === 1
          ? plan.kickTimbre
          : {
              ...plan.kickTimbre,
              decaySeconds: plan.kickTimbre.decaySeconds * decayScale,
              pitchDropSeconds:
                plan.kickTimbre.pitchDropSeconds *
                (articulation === "pickup" ? 0.72 : 0.84),
            };
      this.kick(eventTime, plan.kick[step], kickTimbre);
      this.duck(
        eventTime,
        plan.kick[step],
        plan.lowEnd,
        articulation,
      );
      kickPulse = plan.kick[step];
    }
    if (plan.clap[step]) {
      this.clap(
        eventTime,
        plan.clap[step],
        plan.movement.timbre.clapTone,
        plan.percussionTimbre,
      );
    }
    if (plan.hat[step]) {
      this.hat(
        eventTime,
        plan.hat[step],
        false,
        plan.movement.timbre.hatColor,
        plan.percussionTimbre,
      );
      hatPulse = plan.hat[step];
    }
    if (plan.openHat[step]) {
      this.hat(
        eventTime,
        plan.openHat[step],
        true,
        plan.movement.timbre.hatColor,
        plan.percussionTimbre,
      );
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
    if (plan.bass[step] && !this.mixControls.bassCut) {
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
      performance:
        step === 0
          ? {
              mix: this.mixControls,
              direction: this.planState.direction,
              directionTarget:
                this.directionTransition?.to || this.planState.direction,
              directionTransition: this.directionTransition
                ? {
                    startBar: this.directionTransition.startBar,
                    duration: this.directionTransition.duration,
                    progress:
                      bar < this.directionTransition.startBar
                        ? 0
                        : transitionProgress(
                            bar,
                            this.directionTransition.startBar,
                            this.directionTransition.duration,
                          ),
                  }
                : null,
            }
          : null,
      sectionStart: step === 0 && plan.sectionStart,
      instrumentation:
        step === 0
          ? this.phraseInstrumentation.filter(
              (item) => item.role !== "synth" || this.synthWorkletReady,
            )
          : null,
      ensembleScene:
        step === 0 ? summarizeEnsembleScene(plan.ensembleScene) : null,
      council:
        step === 0 ? summarizeCouncilVerdict(plan.councilVerdict) : null,
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

  route(output, dry = 1, delay = 0, reverb = 0, destination = "music") {
    const context = this.ctx;
    const nodes = [];
    const dryGain = context.createGain();
    const destinationBus =
      destination === "bass"
        ? this.bassBus
        : destination === "kick"
          ? this.kickBus
          : destination === "rumble"
            ? this.rumbleBus
            : this.musicBus;
    dryGain.gain.value = clamp(Number(dry) || 0, 0, 1);
    output.connect(dryGain);
    dryGain.connect(destinationBus);
    nodes.push(dryGain);
    const delayAmount = clamp(Number(delay) || 0, 0, 0.42);
    if (delayAmount > 0) {
      const send = context.createGain();
      send.gain.value = delayAmount;
      output.connect(send);
      send.connect(this.delayIn);
      nodes.push(send);
    }
    const reverbAmount = clamp(Number(reverb) || 0, 0, 0.55);
    if (reverbAmount > 0) {
      const send = context.createGain();
      send.gain.value = reverbAmount;
      output.connect(send);
      send.connect(this.reverbIn);
      nodes.push(send);
    }
    return nodes;
  }

  duck(time, amount, lowEnd = null, articulation = "anchor") {
    const impact = clamp(Number(amount) || 0, 0, 1);
    const articulationScale =
      articulation === "pickup"
        ? 0.32
        : articulation === "roll"
          ? 0.5
          : 1;
    const musicDepth = clamp(
      (Number(lowEnd?.musicDuckDepth) || 0.5) * articulationScale,
      0.08,
      0.72,
    );
    const bassDepth = clamp(
      (Number(lowEnd?.bassDuckDepth) || 0.7) * articulationScale,
      0.1,
      0.86,
    );
    const musicRecovery =
      articulation === "pickup"
        ? 0.065
        : articulation === "roll"
          ? 0.085
          : 0.14;
    const bassRecovery =
      articulation === "pickup"
        ? 0.055
        : articulation === "roll"
          ? 0.075
          : 0.105;
    const musicFloor = clamp(
      MUSIC_BUS_LEVEL * (1 - musicDepth * impact),
      0.18,
      MUSIC_BUS_LEVEL,
    );
    const bassFloor = clamp(
      BASS_BUS_LEVEL * (1 - bassDepth * impact),
      0.12,
      BASS_BUS_LEVEL,
    );

    holdParamAtTime(this.musicBus.gain, time, MUSIC_BUS_LEVEL);
    this.musicBus.gain.exponentialRampToValueAtTime(
      musicFloor,
      time + 0.008,
    );
    this.musicBus.gain.exponentialRampToValueAtTime(
      MUSIC_BUS_LEVEL,
      time + musicRecovery,
    );

    holdParamAtTime(this.bassBus.gain, time, BASS_BUS_LEVEL);
    this.bassBus.gain.exponentialRampToValueAtTime(
      bassFloor,
      time + 0.006,
    );
    this.bassBus.gain.exponentialRampToValueAtTime(
      BASS_BUS_LEVEL,
      time + bassRecovery,
    );
  }

  curveForKick(drive) {
    const key = `kick:${Math.round(clamp(drive, 1.2, 3.5) * 8)}`;
    if (!this.cachedCurves.has(key)) {
      this.cachedCurves.set(
        key,
        driveCurve(clamp(drive, 1.2, 3.5), 512),
      );
    }
    return this.cachedCurves.get(key);
  }

  kick(time, velocity, timbre = {}) {
    const context = this.ctx;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const bodyDrive = context.createWaveShaper();
    const bodyTrim = context.createGain();
    const click = context.createBufferSource();
    const clickFilter = context.createBiquadFilter();
    const clickGain = context.createGain();
    const level = clamp(Number(velocity) || 0, 0, 1);
    const bodyFrequency = clamp(Number(timbre.bodyHz) || 47, 36, 60);
    const startFrequency = clamp(
      Number(timbre.pitchStartHz) || 158,
      bodyFrequency + 12,
      220,
    );
    const pitchDrop = clamp(
      Number(timbre.pitchDropSeconds) || 0.045,
      0.02,
      0.08,
    );
    const decay = clamp(Number(timbre.decaySeconds) || 0.48, 0.24, 0.72);
    const clickFrequency = clamp(Number(timbre.clickHz) || 4200, 2200, 7600);
    const clickLevel = clamp(Number(timbre.clickLevel) || 0.1, 0.02, 0.18);
    const drive = clamp(Number(timbre.drive) || 2, 1.2, 3.5);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(startFrequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      bodyFrequency,
      time + pitchDrop,
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(30, bodyFrequency * 0.86),
      time + decay * 0.9,
    );
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.8 * level, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(
      0.27 * level,
      time + Math.max(0.065, pitchDrop * 1.45),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    oscillator.connect(gain);
    bodyDrive.curve = this.curveForKick(drive);
    bodyDrive.oversample = "2x";
    bodyTrim.gain.value = 0.76;
    gain.connect(bodyDrive);
    bodyDrive.connect(bodyTrim);
    bodyTrim.connect(this.kickBus);
    click.buffer = this.noiseBuffer;
    clickFilter.type = "highpass";
    clickFilter.frequency.value = clickFrequency;
    clickGain.gain.setValueAtTime(clickLevel * level, time);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.014);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.kickBus);
    if (
      !this.registerVoice(
        [oscillator, click],
        [gain, bodyDrive, bodyTrim, clickFilter, clickGain],
      )
    ) {
      return;
    }
    oscillator.start(time);
    oscillator.stop(time + decay + 0.04);
    click.start(time, (hash32(this.seed, this.bar, this.step) % 1000) / 1000, 0.02);
  }

  hat(time, velocity, open, color, timbre = {}) {
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
    const decayScale = clamp(
      Number(timbre.hatDecayScale) || 1,
      0.5,
      1.4,
    );
    const bandScale = clamp(
      Number(timbre.hatBandScale) || 1,
      0.6,
      1.4,
    );
    const noiseRate = clamp(
      Number(timbre.hatNoiseRate) || 1,
      0.7,
      1.5,
    );
    const duration =
      (open ? 0.16 + color * 0.14 : 0.035 + color * 0.04) *
      decayScale;
    source.buffer = this.noiseBuffer;
    source.playbackRate.value = (1.05 + color * 0.62) * noiseRate;
    highpass.type = "highpass";
    highpass.frequency.value = clamp(
      (5900 + color * 1900) * bandScale,
      4200,
      9800,
    );
    bandpass.type = "bandpass";
    bandpass.frequency.value = clamp(
      (8700 + color * 2700) * bandScale,
      6200,
      13800,
    );
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
      clamp(
        (Number.isFinite(Number(timbre.hatDelay))
          ? Number(timbre.hatDelay)
          : 0.025) * (open ? 1.6 : 1),
        0,
        0.24,
      ),
      clamp(
        (Number.isFinite(Number(timbre.hatReverb))
          ? Number(timbre.hatReverb)
          : 0.045) * (open ? 1.5 : 1),
        0,
        0.4,
      ),
    );
    if (!this.registerVoice([source], [highpass, bandpass, gain, panStage.node, ...routes])) return;
    if (open) {
      this.lastOpenHatGain = gain;
      this.lastOpenHatEnd = time + duration;
    }
    const offset = (hash32(this.seed, this.bar, this.step, 0xaa) % 1500) / 1000;
    source.start(time, offset, duration + 0.02);
  }

  clap(time, velocity, tone, timbre = {}) {
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
    const burstCount = clamp(
      Math.round(Number(timbre.clapBursts) || 3),
      2,
      5,
    );
    const spacing = clamp(
      Number(timbre.clapSpacing) || 0.012,
      0.006,
      0.022,
    );
    const decay = clamp(
      Number(timbre.clapDecay) || 0.2,
      0.1,
      0.4,
    );
    Array.from({ length: burstCount }, (_, index) => index * spacing).forEach(
      (offset, index) => {
      gain.gain.setValueAtTime(0.0001, time + offset);
      gain.gain.linearRampToValueAtTime(
        Math.max(0.055, 0.18 - index * 0.028) * velocity,
        time + offset + 0.002,
      );
      gain.gain.exponentialRampToValueAtTime(0.003, time + offset + 0.009);
      },
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    source.connect(highpass);
    highpass.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(panStage.node);
    const routes = this.route(
      panStage.node,
      0.8,
      clamp(
        Number.isFinite(Number(timbre.clapDelay))
          ? Number(timbre.clapDelay)
          : 0.055,
        0,
        0.2,
      ),
      clamp(
        Number.isFinite(Number(timbre.clapReverb))
          ? Number(timbre.clapReverb)
          : 0.16,
        0,
        0.48,
      ),
    );
    if (!this.registerVoice([source], [highpass, bandpass, gain, panStage.node, ...routes])) return;
    source.start(time, 0.2, decay + 0.04);
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
    const timing = scheduleBassPitch(
      oscillator.frequency,
      note,
      time,
      stepDuration,
    );
    const duration = timing.duration;
    const accent = note.accent ? 1 : 0;
    const velocity = clamp(Number(note.velocity) || 0.68, 0, 1);
    const baseCutoff = 160 + filterBias * 360 + profile.drive * 170;
    const peakCutoff = clamp(
      baseCutoff * (3.4 + profile.acid * 6.4 + accent * 2.8),
      700,
      5800,
    );
    oscillator.type = filterBias > 0.5 ? "sawtooth" : "square";
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
    gain.gain.exponentialRampToValueAtTime(
      0.105 + velocity * 0.075 + accent * 0.04,
      time + 0.006,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filterA);
    filterA.connect(filterB);
    filterB.connect(localDrive);
    localDrive.connect(gain);
    const routes = this.route(
      gain,
      0.9,
      0.025 + profile.space * 0.09,
      0.015 + profile.space * 0.035,
      "bass",
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
    const timing = scheduleBassPitch(
      sine.frequency,
      note,
      time,
      stepDuration,
    );
    scheduleBassPitch(
      triangle.frequency,
      note,
      time,
      stepDuration,
      12,
    );
    const duration = timing.duration;
    const velocity = clamp(Number(note.velocity) || 0.68, 0, 1);
    sine.type = "sine";
    triangle.type = "triangle";
    triangle.detune.value = 3;
    filter.type = "lowpass";
    filter.frequency.value = 210 + profile.warmth * 380;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(
      0.11 + velocity * 0.07 + (note.accent ? 0.03 : 0),
      time + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    sine.connect(filter);
    triangle.connect(filter);
    filter.connect(gain);
    const routes = this.route(
      gain,
      0.94,
      0.015,
      0.012 + profile.space * 0.025,
      "bass",
    );
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
    const timing = scheduleBassPitch(
      oscillator.frequency,
      note,
      time,
      stepDuration,
    );
    const duration = timing.duration;
    const velocity = clamp(Number(note.velocity) || 0.68, 0, 1);
    oscillator.type = "square";
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320 + profile.drive * 280, time);
    filter.frequency.exponentialRampToValueAtTime(1100 + profile.drive * 1900, time + 0.016);
    filter.frequency.exponentialRampToValueAtTime(260, time + duration);
    filter.Q.value = 2.2 + profile.drive * 3;
    shaper.curve = this.curveForBass(profile.drive);
    shaper.oversample = "2x";
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(
      0.1 + velocity * 0.075 + (note.accent ? 0.03 : 0),
      time + 0.004,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter);
    filter.connect(shaper);
    shaper.connect(gain);
    const routes = this.route(gain, 0.88, 0.035, 0.018, "bass");
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
