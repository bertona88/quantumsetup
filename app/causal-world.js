import { clamp } from "./techno-model.js";
import { visualUnit } from "./visual-grammar.js";

const EVENT_KINDS = Object.freeze([
  "kick",
  "bass",
  "hat",
  "chord",
  "synth",
  "percussion",
]);

const TEMPORAL_LAWS = Object.freeze({
  kick: Object.freeze({ horizon: 4.5, memory: 13, force: 1.15 }),
  bass: Object.freeze({ horizon: 7.5, memory: 24, force: 1.35 }),
  hat: Object.freeze({ horizon: 2.4, memory: 7, force: 0.48 }),
  chord: Object.freeze({ horizon: 10, memory: 28, force: 0.86 }),
  synth: Object.freeze({ horizon: 6.5, memory: 19, force: 0.72 }),
  percussion: Object.freeze({ horizon: 3.2, memory: 9, force: 0.56 }),
});

function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

export function temporalEnvelope(eventTime, audibleTime, kind = "synth") {
  const law = TEMPORAL_LAWS[kind] || TEMPORAL_LAWS.synth;
  const dt = Number(eventTime) - Number(audibleTime);
  if (!Number.isFinite(dt)) {
    return Object.freeze({ dt: 0, anticipation: 0, impact: 0, memory: 0, pressure: 0 });
  }
  const anticipation = dt > 0 && dt < law.horizon
    ? smoothstep(1 - dt / law.horizon) * Math.exp(-dt / (law.horizon * 1.35))
    : 0;
  const impact = Math.exp(-Math.abs(dt) * 10.5);
  const memory = dt <= 0 ? Math.exp(dt / law.memory) : 0;
  return Object.freeze({
    dt,
    anticipation,
    impact,
    memory,
    pressure: clamp(anticipation * 0.74 + impact + memory * 0.32, 0, 1.8),
  });
}

export function createSpacetimeEvents({ forecast, audioTime }) {
  if (!forecast || !Number.isFinite(Number(audioTime))) return Object.freeze([]);
  const events = [];
  for (const stepEvent of forecast.events || []) {
    for (const kind of EVENT_KINDS) {
      const energy = clamp(Number(stepEvent.channels?.[kind]) || 0, 0, 1);
      if (energy <= 0) continue;
      const coordinate = `${stepEvent.coordinate}:${kind}`;
      events.push(Object.freeze({
        id: `${forecast.seed}:${stepEvent.bar}:${stepEvent.step}:${kind}`,
        seed: forecast.seed,
        bar: stepEvent.bar,
        step: stepEvent.step,
        kind,
        energy,
        time: Number(audioTime) + stepEvent.offsetSteps * forecast.stepDuration,
        x: 0.12 + visualUnit(forecast.seed, coordinate, "world-x") * 0.76,
        y: 0.12 + visualUnit(forecast.seed, coordinate, "world-y") * 0.7,
        phase: visualUnit(forecast.seed, coordinate, "world-phase") * Math.PI * 2,
        lineage: Math.floor(visualUnit(forecast.seed, kind, "lineage") * 9),
      }));
    }
  }
  return Object.freeze(events.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id)));
}

function boundedVelocity(value) {
  return clamp(value, -0.24, 0.24);
}

export class CausalWorld {
  constructor(seed = "0") {
    this.seed = String(seed);
    this.running = false;
    this.events = [];
    this.eventIndex = new Map();
    this.struck = new Set();
    this.scars = [];
    this.previousAudibleTime = null;
    this.simulationTime = 0;
    this.energy = 0.42;
    this.laws = {
      curl: 0,
      memory: 0.94,
      eccentricity: 1,
      interference: 0.75,
    };
    this.targetLaws = { ...this.laws };
    this.filaments = [];
    this.resetMatter();
  }

  resetMatter() {
    this.events = [];
    this.eventIndex.clear();
    this.struck.clear();
    this.scars = [];
    this.previousAudibleTime = null;
    this.simulationTime = 0;
    this.filaments = Array.from({ length: 9 }, (_, lineage) => {
      const nodeCount = 24;
      const radius = 0.12 + lineage * 0.022 + visualUnit(this.seed, "matter", lineage) * 0.035;
      const eccentricity = 0.58 + visualUnit(this.seed, "matter-e", lineage) * 0.34;
      const rotation = visualUnit(this.seed, "matter-r", lineage) * Math.PI * 2;
      const offsetX = (visualUnit(this.seed, "matter-x", lineage) - 0.5) * 0.08;
      const offsetY = (visualUnit(this.seed, "matter-y", lineage) - 0.5) * 0.07;
      return {
        id: `${this.seed}:${lineage}`,
        lineage,
        phase: visualUnit(this.seed, "matter-p", lineage) * Math.PI * 2,
        nodes: Array.from({ length: nodeCount }, (_, order) => {
          const angle = rotation + (order / nodeCount) * Math.PI * 2;
          const roughness = (visualUnit(this.seed, "matter-n", lineage, order) - 0.5) * 0.025;
          const x = 0.5 + offsetX + Math.cos(angle) * (radius + roughness);
          const y = 0.44 + offsetY + Math.sin(angle) * (radius + roughness) * eccentricity;
          return {
            order,
            x,
            y,
            previousX: x,
            previousY: y,
            vx: (visualUnit(this.seed, "matter-vx", lineage, order) - 0.5) * 0.002,
            vy: (visualUnit(this.seed, "matter-vy", lineage, order) - 0.5) * 0.002,
          };
        }),
      };
    });
  }

  setSeed(seed) {
    const nextSeed = String(seed);
    if (nextSeed === this.seed) return;
    this.seed = nextSeed;
    this.resetMatter();
  }

  setRunning(running, audibleTime = null) {
    this.running = running === true;
    this.previousAudibleTime = this.running && Number.isFinite(Number(audibleTime))
      ? Number(audibleTime)
      : null;
  }

  ingestForecast({ forecast, audioTime }) {
    if (!forecast) return;
    this.setSeed(forecast.seed);
    this.targetLaws = {
      curl: clamp(Number(forecast.genes?.curl) || 0, -1, 1),
      memory: clamp(Number(forecast.genes?.memory) || 0.94, 0.84, 0.985),
      eccentricity: clamp(Number(forecast.genes?.eccentricity) || 1, 0.65, 1.5),
      interference: clamp(Number(forecast.genes?.interference) || 0.75, 0.45, 1),
    };
    for (const event of createSpacetimeEvents({ forecast, audioTime })) {
      const existing = this.eventIndex.get(event.id);
      if (existing && existing.time <= event.time) continue;
      this.eventIndex.set(event.id, event);
    }
    this.events = [...this.eventIndex.values()].sort(
      (a, b) => a.time - b.time || a.id.localeCompare(b.id),
    );
  }

  strike(event, strength = 1) {
    if (!event || this.struck.has(event.id)) return;
    this.struck.add(event.id);
    this.scars.push({
      id: event.id,
      kind: event.kind,
      lineage: event.lineage,
      x: event.x,
      y: event.y,
      phase: event.phase,
      strength: clamp(event.energy * strength, 0.08, 1),
      age: 0,
    });
    this.scars = this.scars.slice(-72);
  }

  ingestImpact(stepEvent) {
    for (const kind of EVENT_KINDS) {
      if (!(Number(stepEvent?.[kind]) > 0)) continue;
      const id = `${this.seed}:${stepEvent.bar}:${stepEvent.step}:${kind}`;
      const event = this.eventIndex.get(id);
      if (event) this.strike(event, Number(stepEvent[kind]));
    }
  }

  advance({ delta, audibleTime = null, energy = 0.42 }) {
    const safeDelta = clamp(Number(delta) || 0, 0, 0.12);
    if (safeDelta <= 0) return;
    this.energy = clamp(Number(energy) || 0.42, 0, 1);
    const substeps = Math.max(1, Math.ceil(safeDelta / (1 / 45)));
    const dt = safeDelta / substeps;
    const finalAudible = this.running && Number.isFinite(Number(audibleTime))
      ? Number(audibleTime)
      : null;
    const audibleStart = this.previousAudibleTime;

    for (let substep = 0; substep < substeps; substep += 1) {
      this.simulationTime += dt;
      const mix = 1 - Math.exp(-dt * 0.38);
      for (const name of Object.keys(this.laws)) {
        this.laws[name] += (this.targetLaws[name] - this.laws[name]) * mix;
      }
      const audibleNow = finalAudible == null
        ? null
        : audibleStart == null
          ? finalAudible
          : audibleStart + (finalAudible - audibleStart) * ((substep + 1) / substeps);
      this.advanceMatter(dt, audibleNow);
      for (const scar of this.scars) scar.age += dt;
    }

    if (finalAudible != null) {
      if (audibleStart != null) {
        for (const event of this.events) {
          if (event.time > audibleStart && event.time <= finalAudible) this.strike(event);
        }
      }
      this.previousAudibleTime = finalAudible;
      for (const [id, event] of this.eventIndex) {
        if (finalAudible - event.time > 36) this.eventIndex.delete(id);
      }
      this.events = [...this.eventIndex.values()].sort(
        (a, b) => a.time - b.time || a.id.localeCompare(b.id),
      );
    }
    this.scars = this.scars.filter((scar) => scar.age < 38);
  }

  advanceMatter(dt, audibleTime) {
    const activeEvents = audibleTime == null
      ? []
      : this.events
        .map((event) => ({
          event,
          envelope: temporalEnvelope(event.time, audibleTime, event.kind),
        }))
        .filter(({ envelope }) => envelope.pressure > 0.004 && envelope.dt < 11 && envelope.dt > -30)
        .sort((a, b) => b.envelope.pressure - a.envelope.pressure)
        .slice(0, 24);
    const damping = Math.pow(0.932, dt * 60);

    for (const filament of this.filaments) {
      const accelerations = filament.nodes.map(() => ({ x: 0, y: 0 }));
      const count = filament.nodes.length;
      for (let index = 0; index < count; index += 1) {
        const node = filament.nodes[index];
        const previous = filament.nodes[(index - 1 + count) % count];
        const next = filament.nodes[(index + 1) % count];
        const acceleration = accelerations[index];
        acceleration.x += (previous.x + next.x - node.x * 2) * 2.4;
        acceleration.y += (previous.y + next.y - node.y * 2) * 2.4;
        acceleration.x += (0.5 - node.x) * 0.052;
        acceleration.y += (0.44 - node.y) * 0.052;

        const flowPhase = this.simulationTime * 0.08 + filament.phase;
        acceleration.x += Math.sin(node.y * 10.5 + flowPhase) * 0.0045;
        acceleration.y += Math.cos(node.x * 9.2 - flowPhase) * 0.0038;
        acceleration.x += -(node.y - 0.44) * this.laws.curl * 0.009;
        acceleration.y += (node.x - 0.5) * this.laws.curl * 0.009;

        for (const active of activeEvents) {
          const { event, envelope } = active;
          const dx = event.x - node.x;
          const dy = event.y - node.y;
          const distanceSquared = dx * dx + dy * dy + 0.008;
          const law = TEMPORAL_LAWS[event.kind] || TEMPORAL_LAWS.synth;
          const magnitude = law.force * event.energy * envelope.pressure * 0.0011 / distanceSquared;
          if (event.kind === "kick") {
            const direction = envelope.impact > 0.32 ? -1 : 0.78;
            acceleration.x += dx * magnitude * direction;
            acceleration.y += dy * magnitude * direction;
          } else if (event.kind === "bass") {
            acceleration.x += dx * magnitude;
            acceleration.y += dy * magnitude;
          } else if (event.kind === "chord") {
            acceleration.x += -dy * magnitude * 0.72;
            acceleration.y += dx * magnitude * 0.72;
          } else if (event.kind === "hat" || event.kind === "percussion") {
            const shear = Math.sin(event.phase + filament.lineage) > 0 ? 1 : -1;
            acceleration.x += -dy * magnitude * shear;
            acceleration.y += dx * magnitude * shear;
          } else {
            acceleration.x += (dx - dy * 0.42) * magnitude * 0.7;
            acceleration.y += (dy + dx * 0.42) * magnitude * 0.7;
          }
        }
        acceleration.x = clamp(acceleration.x, -0.22, 0.22);
        acceleration.y = clamp(acceleration.y, -0.22, 0.22);
      }

      for (let index = 0; index < count; index += 1) {
        const node = filament.nodes[index];
        node.previousX = node.x;
        node.previousY = node.y;
        node.vx = boundedVelocity((node.vx + accelerations[index].x * dt) * damping);
        node.vy = boundedVelocity((node.vy + accelerations[index].y * dt) * damping);
        node.x += node.vx * dt;
        node.y += node.vy * dt;
        if (node.x < 0.025 || node.x > 0.975) {
          node.x = clamp(node.x, 0.025, 0.975);
          node.vx *= -0.68;
        }
        if (node.y < 0.035 || node.y > 0.92) {
          node.y = clamp(node.y, 0.035, 0.92);
          node.vy *= -0.68;
        }
      }
    }
  }

  snapshot(audibleTime = null) {
    return Object.freeze({
      seed: this.seed,
      running: this.running,
      simulationTime: this.simulationTime,
      laws: Object.freeze({ ...this.laws }),
      events: Object.freeze(this.events.map((event) => Object.freeze({
        ...event,
        envelope: audibleTime == null
          ? Object.freeze({ dt: 0, anticipation: 0, impact: 0, memory: 0, pressure: 0 })
          : temporalEnvelope(event.time, audibleTime, event.kind),
      }))),
      scars: Object.freeze(this.scars.map((scar) => Object.freeze({ ...scar }))),
      filaments: this.filaments,
    });
  }
}
