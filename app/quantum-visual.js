import {
  CanvasSpectrumMountainFallback,
  SpectrumMountainRenderer,
} from "./spectrum-mountain.js?v=2.2.0-spectrum-mountain-4";
import { clamp } from "./techno-model.js";

export class QuantumPremonitionVisual {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.running = false;
    this.lastRenderTime = null;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    try {
      this.renderer = new SpectrumMountainRenderer(canvas, { reducedMotion });
      this.rendererName = "webgl2-spectrum-mountain";
    } catch (_) {
      this.renderer = new CanvasSpectrumMountainFallback(canvas, { reducedMotion });
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
  }) {
    if (!this.context || !this.width || !this.height) return;
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
    });
  }

  dispose() {
    this.renderer.dispose();
  }
}
