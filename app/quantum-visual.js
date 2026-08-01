import { clamp } from "./techno-model.js";
import { CausalWorld } from "./causal-world.js";

const TAU = Math.PI * 2;
const BACKGROUND = "#020609";

function ease(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

function midpoint(a, b) {
  return (a + b) * 0.5;
}

export class QuantumPremonitionVisual {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.("2d", { alpha: false }) || null;
    this.reducedMotion = reducedMotion;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.lastRenderTime = null;
    this.running = false;
    this.world = new CausalWorld("0");
    this.feedbackCanvas = document.createElement("canvas");
    this.feedbackContext = this.feedbackCanvas.getContext("2d", { alpha: false });
    this.hasFeedback = false;
  }

  resize() {
    if (!this.canvas || !this.context) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * dpr));
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.feedbackCanvas.width = this.canvas.width;
    this.feedbackCanvas.height = this.canvas.height;
    this.feedbackContext?.setTransform(1, 0, 0, 1, 0, 0);
    this.context.fillStyle = BACKGROUND;
    this.context.fillRect(0, 0, this.width, this.height);
    this.feedbackContext?.drawImage(this.canvas, 0, 0);
    this.hasFeedback = false;
  }

  setSeed(seed) {
    this.world.setSeed(seed);
    this.hasFeedback = false;
  }

  setRunning(running, audibleTime = null) {
    this.running = running === true;
    this.world.setRunning(this.running, audibleTime);
  }

  ingestForecast(event) {
    if (!event?.forecast) return;
    this.world.ingestForecast(event);
  }

  ingestImpact(event) {
    this.world.ingestImpact(event);
  }

  drawRememberedFrame(context, laws, time) {
    if (!this.hasFeedback) {
      context.fillStyle = BACKGROUND;
      context.fillRect(0, 0, this.width, this.height);
      return;
    }
    const centerX = this.width * 0.5;
    const centerY = this.height * 0.44;
    const breath = this.reducedMotion ? 0 : Math.sin(time * 0.09) * 0.00028;
    const scale = 1.0006 + Math.abs(laws.curl) * 0.0007 + breath;
    context.save();
    context.translate(centerX, centerY);
    context.rotate(laws.curl * 0.00034);
    context.scale(scale, scale);
    context.globalAlpha = clamp(laws.memory, 0.86, 0.982);
    context.drawImage(this.feedbackCanvas, -centerX, -centerY, this.width, this.height);
    context.restore();
    context.fillStyle = `rgba(2,6,9,${0.038 + (1 - laws.memory) * 0.42})`;
    context.fillRect(0, 0, this.width, this.height);
  }

  drawAmbientField(context, snapshot, time) {
    const gradient = context.createRadialGradient(
      this.width * 0.52,
      this.height * 0.42,
      0,
      this.width * 0.52,
      this.height * 0.42,
      Math.max(this.width, this.height) * 0.72,
    );
    const breathing = this.reducedMotion ? 0 : Math.sin(time * 0.12) * 0.008;
    gradient.addColorStop(0, `rgba(22,75,82,${0.035 + snapshot.laws.interference * 0.025 + breathing})`);
    gradient.addColorStop(0.45, "rgba(4,21,27,0.018)");
    gradient.addColorStop(1, "rgba(2,6,9,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);
  }

  drawWorldlines(context, snapshot, time) {
    const visible = snapshot.events
      .filter((event) => event.envelope.pressure > 0.012)
      .sort((a, b) => b.envelope.pressure - a.envelope.pressure)
      .slice(0, this.width < 600 ? 28 : 52);
    context.save();
    context.globalCompositeOperation = "screen";
    for (const event of visible) {
      const envelope = event.envelope;
      const x = event.x * this.width;
      const y = event.y * this.height;
      const future = envelope.dt > 0;
      const reach = Math.min(this.width, this.height) * (0.11 + Math.min(Math.abs(envelope.dt), 8) * 0.016);
      const direction = event.phase + (future ? envelope.dt * 0.06 : -envelope.dt * 0.025);
      const tangentX = Math.cos(direction) * reach;
      const tangentY = Math.sin(direction) * reach * 0.74;
      const bend = Math.sin(event.phase * 1.7 + time * 0.06) * reach * 0.52;
      context.beginPath();
      context.moveTo(x - tangentX, y - tangentY);
      context.bezierCurveTo(
        x - tangentX * 0.32 - tangentY * 0.42,
        y - tangentY * 0.32 + tangentX * 0.24 + bend,
        x + tangentX * 0.28 + tangentY * 0.36,
        y + tangentY * 0.28 - tangentX * 0.2 - bend,
        x + tangentX,
        y + tangentY,
      );
      const certainty = future
        ? ease(1 - clamp(envelope.dt / 10, 0, 1))
        : envelope.memory;
      context.strokeStyle = future
        ? `rgba(190,246,240,${envelope.anticipation * (0.07 + certainty * 0.18)})`
        : `rgba(78,213,206,${envelope.memory * 0.075})`;
      context.lineWidth = 0.45 + envelope.pressure * 1.15;
      context.stroke();

      if (envelope.impact > 0.18) {
        context.beginPath();
        context.moveTo(x - tangentY * 0.26, y + tangentX * 0.2);
        context.lineTo(x + tangentY * 0.26, y - tangentX * 0.2);
        context.strokeStyle = `rgba(235,255,250,${envelope.impact * 0.68})`;
        context.lineWidth = 0.8 + envelope.impact * 2.4;
        context.stroke();
      }
    }
    context.restore();
  }

  traceFilament(context, nodes) {
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    context.beginPath();
    context.moveTo(
      midpoint(last.x, first.x) * this.width,
      midpoint(last.y, first.y) * this.height,
    );
    for (let index = 0; index < nodes.length; index += 1) {
      const current = nodes[index];
      const next = nodes[(index + 1) % nodes.length];
      context.quadraticCurveTo(
        current.x * this.width,
        current.y * this.height,
        midpoint(current.x, next.x) * this.width,
        midpoint(current.y, next.y) * this.height,
      );
    }
    context.closePath();
  }

  drawMatter(context, snapshot, spectrum, energy, time) {
    const spectrumLift = spectrum?.length
      ? (spectrum[3] + spectrum[17] + spectrum[41]) / (255 * 3)
      : 0;
    context.save();
    context.globalCompositeOperation = "screen";
    for (const filament of snapshot.filaments) {
      const lineagePhase = filament.phase + time * (0.018 + filament.lineage * 0.0008);
      const pulse = this.reducedMotion ? 0 : Math.sin(lineagePhase) * 0.018;
      this.traceFilament(context, filament.nodes);
      context.strokeStyle = `rgba(49,195,193,${0.035 + snapshot.laws.interference * 0.032 + pulse})`;
      context.lineWidth = 4.5 + energy * 2.5;
      context.shadowColor = "rgba(40,218,211,.18)";
      context.shadowBlur = 13 + spectrumLift * 12;
      context.stroke();

      this.traceFilament(context, filament.nodes);
      const pale = filament.lineage % 3 === 0;
      context.strokeStyle = pale
        ? `rgba(207,252,246,${0.12 + spectrumLift * 0.07})`
        : `rgba(82,222,214,${0.15 + energy * 0.055})`;
      context.lineWidth = pale ? 0.72 : 0.52;
      context.shadowBlur = 0;
      context.stroke();
    }
    context.restore();
  }

  drawScars(context, snapshot) {
    context.save();
    context.globalCompositeOperation = "screen";
    for (const scar of snapshot.scars) {
      const persistence = Math.exp(-scar.age / 19);
      if (persistence < 0.03) continue;
      const x = scar.x * this.width;
      const y = scar.y * this.height;
      const radius = Math.min(this.width, this.height) *
        (0.012 + Math.sqrt(scar.age + 0.08) * 0.016) *
        (0.72 + scar.strength * 0.5);
      const fragments = scar.kind === "bass" || scar.kind === "chord" ? 5 : 3;
      for (let fragment = 0; fragment < fragments; fragment += 1) {
        const phase = scar.phase + fragment * (TAU / fragments) + scar.age * 0.012;
        const span = 0.42 + ((scar.lineage + fragment) % 4) * 0.17;
        context.beginPath();
        context.ellipse(
          x,
          y,
          radius * (1.1 + fragment * 0.13),
          radius * (0.34 + ((scar.lineage + fragment) % 3) * 0.12),
          phase,
          phase - span,
          phase + span,
        );
        context.strokeStyle = fragment === 0
          ? `rgba(224,255,250,${persistence * scar.strength * 0.28})`
          : `rgba(50,203,198,${persistence * scar.strength * 0.12})`;
        context.lineWidth = fragment === 0 ? 0.9 : 0.55;
        context.stroke();
      }
    }
    context.restore();
  }

  drawTemporalInterference(context, snapshot, time) {
    const active = snapshot.events
      .filter((event) => event.envelope.anticipation > 0.06)
      .slice(0, 18);
    if (active.length < 2) return;
    context.save();
    context.globalCompositeOperation = "screen";
    for (let index = 0; index < active.length; index += 1) {
      const event = active[index];
      const partner = active[(index + 3) % active.length];
      const pressure = Math.min(event.envelope.anticipation, partner.envelope.anticipation);
      const x1 = event.x * this.width;
      const y1 = event.y * this.height;
      const x2 = partner.x * this.width;
      const y2 = partner.y * this.height;
      const drift = Math.sin(time * 0.05 + event.phase) * Math.min(this.width, this.height) * 0.06;
      context.beginPath();
      context.moveTo(x1, y1);
      context.bezierCurveTo(
        midpoint(x1, x2) - drift,
        y1 + drift,
        midpoint(x1, x2) + drift,
        y2 - drift,
        x2,
        y2,
      );
      context.strokeStyle = `rgba(150,238,231,${pressure * 0.055})`;
      context.lineWidth = 0.5;
      context.stroke();
    }
    context.restore();
  }

  rememberFrame() {
    if (!this.feedbackContext) return;
    this.feedbackContext.setTransform(1, 0, 0, 1, 0, 0);
    this.feedbackContext.drawImage(
      this.canvas,
      0,
      0,
      this.feedbackCanvas.width,
      this.feedbackCanvas.height,
    );
    this.hasFeedback = true;
  }

  render({ now, audioNow = null, spectrum, energy = 0.42 }) {
    if (!this.context || !this.width || !this.height) return;
    const time = Number(now) / 1000;
    const elapsed = this.lastRenderTime == null
      ? 1 / 60
      : clamp(time - this.lastRenderTime, 0, 0.12);
    this.lastRenderTime = time;
    this.world.advance({
      delta: this.reducedMotion ? Math.min(elapsed, 1 / 15) : elapsed,
      audibleTime: this.running ? audioNow : null,
      energy,
    });
    const snapshot = this.world.snapshot(this.running ? audioNow : null);
    const context = this.context;
    this.drawRememberedFrame(context, snapshot.laws, time);
    this.drawAmbientField(context, snapshot, time);
    this.drawTemporalInterference(context, snapshot, time);
    this.drawWorldlines(context, snapshot, time);
    this.drawMatter(context, snapshot, spectrum, energy, time);
    this.drawScars(context, snapshot);
    this.rememberFrame();
  }
}
