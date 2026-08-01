import { clamp, hash32 } from "./techno-model.js";

function valueAt(lane, step, mapper = Number) {
  const value = lane?.[step];
  return value ? clamp(mapper(value) || 0, 0, 1) : 0;
}

export function visualUnit(seed, ...coordinates) {
  return hash32(seed, "visual", ...coordinates) / 0xffffffff;
}

export function visualGenesForPhrase(seed, phraseIndex) {
  const phrase = Math.max(0, Math.floor(Number(phraseIndex) || 0));
  const gene = (name) => visualUnit(seed, "gene", phrase, name);
  return Object.freeze({
    interference: 0.58 + gene("interference") * 0.42,
    orbit: 0.2 + gene("orbit") * 0.62,
    cellular: 0.08 + gene("cellular") * 0.58,
    symmetry: 3 + Math.floor(gene("symmetry") * 7),
    curl: gene("curl") * 2 - 1,
    eccentricity: 0.72 + gene("eccentricity") * 0.72,
    memory: 0.86 + gene("memory") * 0.105,
    warp: (gene("warp") * 2 - 1) * 0.0032,
    grain: 0.4 + gene("grain") * 0.6,
  });
}

export function createVisualForecast({
  seed,
  phrasePlans,
  bar,
  stepDuration,
  kickCut = false,
  bassCut = false,
  horizonBars = 8,
}) {
  if (!Array.isArray(phrasePlans) || phrasePlans.length === 0) return null;
  const safeBar = Math.max(0, Math.floor(Number(bar) || 0));
  const phraseIndex = Math.floor(safeBar / 8);
  const firstOffset = safeBar % 8;
  const availableBars = Math.min(
    Math.max(1, Math.floor(horizonBars)),
    phrasePlans.length - firstOffset,
  );
  const events = [];
  const totals = {
    kick: 0,
    bass: 0,
    hat: 0,
    chord: 0,
    synth: 0,
    percussion: 0,
  };

  for (let barOffset = 0; barOffset < availableBars; barOffset += 1) {
    const plan = phrasePlans[firstOffset + barOffset];
    for (let step = 0; step < 16; step += 1) {
      const channels = {
        kick: kickCut ? 0 : valueAt(plan.kick, step),
        bass: bassCut
          ? 0
          : valueAt(plan.bass, step, (note) => (note.accent ? 1 : 0.62)),
        hat: Math.max(
          valueAt(plan.hat, step),
          valueAt(plan.openHat, step),
          valueAt(plan.ride, step),
        ),
        chord: valueAt(plan.chord, step, (note) => note.velocity),
        synth: Math.max(
          0,
          ...(plan.activeSynthEngines || []).map((engine) =>
            valueAt(plan.synth?.[engine], step, (note) => note.velocity),
          ),
        ),
        percussion: Math.max(
          valueAt(plan.clap, step),
          valueAt(plan.shaker, step),
          valueAt(plan.rim, step),
          valueAt(plan.metallic, step),
          valueAt(plan.tom, step),
        ),
      };
      const weight = Math.max(...Object.values(channels));
      if (weight <= 0) continue;
      for (const [name, value] of Object.entries(channels)) totals[name] += value;
      const kind = Object.entries(channels).sort((a, b) => b[1] - a[1])[0][0];
      events.push(
        Object.freeze({
          bar: safeBar + barOffset,
          step,
          offsetSteps: barOffset * 16 + step,
          kind,
          weight,
          channels: Object.freeze(channels),
          coordinate: hash32(seed, "visual-event", safeBar + barOffset, step, kind),
        }),
      );
    }
  }

  const totalSteps = Math.max(16, availableBars * 16);
  const metric = (name) => clamp(totals[name] / totalSteps, 0, 1);
  return Object.freeze({
    seed,
    bar: safeBar,
    phraseIndex,
    stepDuration: clamp(Number(stepDuration) || 0.115, 0.04, 0.3),
    horizonSteps: totalSteps,
    genes: visualGenesForPhrase(seed, phraseIndex),
    metrics: Object.freeze({
      floor: metric("kick"),
      gravity: metric("bass"),
      particles: clamp(metric("hat") + metric("percussion") * 0.5, 0, 1),
      field: clamp(metric("chord") + metric("synth") * 0.7, 0, 1),
      density: clamp(events.length / totalSteps, 0, 1),
    }),
    events: Object.freeze(events),
  });
}
