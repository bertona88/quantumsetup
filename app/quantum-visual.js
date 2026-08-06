import {
  CanvasSpectrumMountainFallback,
  SpectrumMountainRenderer,
} from "./spectrum-mountain.js?v=2.4.0-pattern-priors-1";
import { clamp } from "./techno-model.js";

export const VISUAL_QUALITY_LEVELS = Object.freeze([
  Object.freeze({
    id: "low",
    pixelRatioScale: 0.72,
    desktopPixelRatioCap: 1.05,
    mobilePixelRatioCap: 0.9,
    shadowSteps: 4,
  }),
  Object.freeze({
    id: "balanced",
    pixelRatioScale: 1,
    desktopPixelRatioCap: 1.6,
    mobilePixelRatioCap: 1.25,
    shadowSteps: 10,
  }),
  Object.freeze({
    id: "high",
    pixelRatioScale: 1.15,
    desktopPixelRatioCap: 2,
    mobilePixelRatioCap: 1.7,
    shadowSteps: 14,
  }),
]);

function qualityIndex(id) {
  const index = VISUAL_QUALITY_LEVELS.findIndex((quality) => quality.id === id);
  return index < 0 ? 1 : index;
}

export class AdaptiveVisualQuality {
  constructor({
    initialQuality = "balanced",
    warmupMs = 1600,
    downgradeMs = 850,
    upgradeMs = 8000,
    downgradeCooldownMs = 1200,
    upgradeCooldownMs = 8000,
  } = {}) {
    this.index = qualityIndex(initialQuality);
    this.warmupMs = warmupMs;
    this.downgradeMs = downgradeMs;
    this.upgradeMs = upgradeMs;
    this.downgradeCooldownMs = downgradeCooldownMs;
    this.upgradeCooldownMs = upgradeCooldownMs;
    this.baselineIntervalMs = null;
    this.activeSince = null;
    this.lastChangeAt = -Infinity;
    this.badTimeMs = 0;
    this.goodTimeMs = 0;
  }

  get quality() {
    return VISUAL_QUALITY_LEVELS[this.index];
  }

  resetObservation() {
    this.activeSince = null;
    this.badTimeMs = 0;
    this.goodTimeMs = 0;
  }

  observe({
    now,
    frameIntervalMs,
    renderMs = 0,
    rendered = true,
    active = true,
  }) {
    const timestamp = Number(now);
    const interval = Number(frameIntervalMs);
    const renderCost = Math.max(0, Number(renderMs) || 0);
    if (
      !active ||
      !Number.isFinite(timestamp) ||
      !Number.isFinite(interval) ||
      interval < 4 ||
      interval > 100
    ) {
      this.resetObservation();
      return null;
    }

    if (this.activeSince == null) {
      this.activeSince = timestamp;
      this.baselineIntervalMs = Math.min(interval, 20);
      return null;
    }

    if (interval < this.baselineIntervalMs * 1.05) {
      this.baselineIntervalMs += (interval - this.baselineIntervalMs) * 0.06;
    }
    if (timestamp - this.activeSince < this.warmupMs) return null;

    const baseline = clamp(this.baselineIntervalMs, 6.5, 40);
    const missedFrame = interval > baseline * 1.42;
    const expensiveRender = rendered && renderCost > baseline * 0.7;
    if (missedFrame || expensiveRender) {
      this.badTimeMs += interval;
    } else {
      this.badTimeMs = Math.max(0, this.badTimeMs - interval * 1.5);
    }

    if (rendered) {
      const hasHeadroom =
        interval < baseline * 1.16 && renderCost < baseline * 0.34;
      if (hasHeadroom) this.goodTimeMs += interval;
      else this.goodTimeMs = Math.max(0, this.goodTimeMs - interval);
    }

    if (
      this.badTimeMs >= this.downgradeMs &&
      this.index > 0 &&
      timestamp - this.lastChangeAt >= this.downgradeCooldownMs
    ) {
      this.index -= 1;
      this.lastChangeAt = timestamp;
      this.badTimeMs = 0;
      this.goodTimeMs = 0;
      return this.quality;
    }
    if (
      this.goodTimeMs >= this.upgradeMs &&
      this.index < VISUAL_QUALITY_LEVELS.length - 1 &&
      timestamp - this.lastChangeAt >= this.upgradeCooldownMs
    ) {
      this.index += 1;
      this.lastChangeAt = timestamp;
      this.badTimeMs = 0;
      this.goodTimeMs = 0;
      return this.quality;
    }
    return null;
  }
}

export class QuantumPremonitionVisual {
  constructor(canvas, { reducedMotion = false, quality = VISUAL_QUALITY_LEVELS[1] } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.running = false;
    this.lastRenderTime = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    try {
      this.renderer = new SpectrumMountainRenderer(canvas, { reducedMotion, quality });
      this.rendererName = "webgl2-spectrum-mountain";
    } catch (_) {
      this.renderer = new CanvasSpectrumMountainFallback(canvas, { reducedMotion, quality });
      this.rendererName = "canvas-spectrum-mountain";
    }
    this.context = this.renderer.context;
  }

  resize() {
    if (!this.canvas || !this.context) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(this.width, this.height, this.dpr);
  }

  setSeed(seed) {
    this.renderer.setSeed(seed);
  }

  setQuality(quality) {
    if (!quality || quality.id === this.quality.id) return false;
    this.quality = quality;
    this.renderer.setQuality(quality);
    this.resize();
    return true;
  }

  setRunning(running) {
    this.running = running === true;
  }

  ingestForecast(event) {
    if (event?.forecast) this.renderer.setForecast(event.forecast);
  }

  ingestImpact() {
    // Scheduled pulse envelopes are supplied directly on every render frame.
  }

  render({
    now,
    spectrum,
    sampleRate = 48000,
    pulses = {},
    energy = 0.42,
    bar = 0,
    step = 0,
  }) {
    if (!this.context || !this.width || !this.height) return false;
    const time = Number(now) / 1000;
    const delta = this.lastRenderTime == null
      ? 1 / 60
      : clamp(time - this.lastRenderTime, 0, 0.12);
    this.lastRenderTime = time;
    this.renderer.render({
      now,
      delta,
      spectrum,
      sampleRate,
      active: this.running,
      pulses,
      energy,
      bar,
      step,
    });
    return true;
  }

  dispose() {
    this.renderer.dispose();
  }
}
