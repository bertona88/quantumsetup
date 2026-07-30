import { InfiniteTechnoEngine, formatSeed } from "./audio-engine.js";
import { GENERATOR_VERSION, profileForVibe } from "./techno-model.js";
import { SYNTH_BASE_ARCHITECTURES } from "./synth-genomes.js";

const app = document.querySelector("#app");
const transportButton = document.querySelector("#transport-button");
const trajectoryButton = document.querySelector("#trajectory-button");
const statusText = document.querySelector("#status-text");
const nowVibe = document.querySelector("#now-vibe");
const sectionReadout = document.querySelector("#section-readout");
const keyReadout = document.querySelector("#key-readout");
const bpmReadout = document.querySelector("#bpm-readout");
const barReadout = document.querySelector("#bar-readout");
const seedReadout = document.querySelector("#seed-readout");
const transitionCopy = document.querySelector("#transition-copy");
const transitionFill = document.querySelector("#transition-fill");
const liveRegion = document.querySelector("#live-region");
const instrumentRoster = document.querySelector("#instrument-roster");
const instrumentCount = document.querySelector("#instrument-count");
const vibeButtons = [...document.querySelectorAll("[data-vibe]")];
const tonalityButtons = [...document.querySelectorAll("[data-tonality]")];

const params = new URLSearchParams(window.location.search);
const seedText = params.get("seed");
const parsedSeed =
  seedText && /^[0-9a-f]{1,8}$/i.test(seedText)
    ? Number.parseInt(seedText, 16) >>> 0
    : undefined;

const visualState = {
  kick: 0,
  bass: 0,
  hat: 0,
  chord: 0,
  synth: 0,
  energy: 0.42,
  bar: 0,
  step: 0,
  movement: 0,
  sectionProgress: 0,
  transitionProgress: 0,
  seedFlash: 0,
  running: false,
};

const engine = new InfiniteTechnoEngine(handleEngineEvent, {
  seed: parsedSeed,
  vibe: "hypnotic",
  tonality: "minor",
});

let uiBusy = false;
let targetVibe = "hypnotic";
let targetTonality = "minor";
let instrumentationSignature = "";
let displayedInstrumentCount = 0;
let advancedSynthAvailable = null;
let currentInstrumentation = [];

function titleCase(text) {
  return String(text)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setStatus(message, state = "idle") {
  statusText.textContent = message;
  app.classList.toggle("is-running", engine.running);
  app.classList.toggle("is-error", state === "error");
  visualState.running = engine.running;
}

function updateSeed(seed) {
  seedReadout.textContent = formatSeed(seed);
  const url = new URL(window.location.href);
  url.searchParams.set("seed", (seed >>> 0).toString(16).padStart(8, "0"));
  window.history.replaceState(null, "", url);
}

function selectTarget(buttons, attribute, value) {
  for (const button of buttons) {
    const active = button.dataset[attribute] === value;
    button.setAttribute("aria-pressed", String(active));
  }
}

function updateInstrumentCount() {
  const capability =
    advancedSynthAvailable === false
      ? "CORE ENGINE FALLBACK"
      : `${SYNTH_BASE_ARCHITECTURES} BASE FORMS`;
  instrumentCount.textContent = `${String(displayedInstrumentCount).padStart(2, "0")} VOICES · ${capability}`;
}

function renderInstrumentation(items = []) {
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  const signature = unique.map((item) => item.id).join("|");
  currentInstrumentation = unique;
  displayedInstrumentCount = unique.length;
  updateInstrumentCount();
  if (signature === instrumentationSignature) return;
  instrumentationSignature = signature;
  const visible = unique.slice(0, 6);
  const fragment = document.createDocumentFragment();
  if (visible.length === 0) {
    const item = document.createElement("li");
    item.textContent = "GENERATOR DORMANT";
    fragment.append(item);
  } else {
    for (const entry of visible) {
      const item = document.createElement("li");
      item.dataset.role = entry.role || "voice";
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.append(label);
      if (entry.detail) {
        const detail = document.createElement("small");
        detail.textContent = `/ ${entry.detail}`;
        item.append(detail);
        item.title = `${entry.label} — ${entry.detail}`;
      }
      fragment.append(item);
    }
    if (unique.length > visible.length) {
      const remainder = document.createElement("li");
      remainder.className = "roster-remainder";
      remainder.textContent = `+${unique.length - visible.length} MORE`;
      fragment.append(remainder);
    }
    if (unique.length > 2) {
      const mobileRemainder = document.createElement("li");
      mobileRemainder.className = "mobile-roster-remainder";
      mobileRemainder.textContent = `+${unique.length - 2} MORE`;
      fragment.append(mobileRemainder);
    }
  }
  instrumentRoster.replaceChildren(fragment);
  instrumentRoster.classList.remove("is-updating");
  window.requestAnimationFrame(() => instrumentRoster.classList.add("is-updating"));
}

function describeIntent(event) {
  if (event.immediate) {
    transitionCopy.textContent = `${event.kind.toUpperCase()} SET · ${titleCase(event.active)}`;
    transitionFill.style.width = "0%";
    return;
  }
  const destination =
    event.kind === "seed" ? formatSeed(event.seed) : titleCase(event.to);
  transitionCopy.textContent = `QUEUED ${destination} · BAR ${event.startBar + 1} · ${event.duration || 16} BARS`;
  transitionFill.style.width = "0%";
  liveRegion.textContent = `${event.kind} change queued for bar ${event.startBar + 1}`;
}

function handleEngineEvent(event) {
  if (event.type === "state") {
    transportButton.querySelector(".transport-icon").textContent = event.running ? "■" : "▶";
    transportButton.querySelector("strong").textContent = event.running
      ? "STOP THE SET"
      : "START THE SET";
    const interrupted = !event.running && event.reason === "interrupted";
    setStatus(
      event.running
        ? "RUNNING — CONTINUOUS SET"
        : interrupted
          ? "PAUSED BY BROWSER — TAP START"
          : "READY — TAP START",
      interrupted ? "error" : event.running ? "running" : "idle",
    );
    if (!event.running) {
      sectionReadout.textContent = "DORMANT";
      renderInstrumentation([]);
    }
  }

  if (event.type === "synth-state") {
    advancedSynthAvailable = event.available;
    app.classList.toggle("synth-degraded", !event.available);
    app.dataset.synthBank = event.available ? "ready" : "fallback";
    app.dataset.synthVoices = "0";
    app.dataset.synthQueued = "0";
    app.dataset.synthLateEvents = "0";
    app.dataset.synthDroppedEvents = "0";
    app.dataset.synthStartedEvents = "0";
    updateInstrumentCount();
    if (!event.available) {
      renderInstrumentation(
        currentInstrumentation.filter((item) => item.role !== "synth"),
      );
      liveRegion.textContent =
        event.message || "Advanced synthesis is unavailable; the core engine continues.";
    }
  }

  if (event.type === "synth-stats") {
    app.dataset.synthVoices = String(event.voices);
    app.dataset.synthQueued = String(event.queued);
    app.dataset.synthLateEvents = String(event.lateEvents);
    app.dataset.synthDroppedEvents = String(event.droppedEvents);
    app.dataset.synthStartedEvents = String(event.startedEvents);
  }

  if (event.type === "error") {
    setStatus(event.message.toUpperCase(), "error");
  }

  if (event.type === "intent") describeIntent(event);

  if (event.type === "seed") {
    updateSeed(event.seed);
    visualState.seedFlash = 1;
    transitionCopy.textContent = "NEW MUSICAL DNA ENTERED THE MIX";
    transitionFill.style.width = "0%";
    liveRegion.textContent = `New trajectory ${formatSeed(event.seed)} entered at bar ${event.bar + 1}`;
  }

  if (event.type === "step") {
    visualState.kick = Math.max(visualState.kick, event.kick);
    visualState.bass = Math.max(visualState.bass, event.bass);
    visualState.hat = Math.max(visualState.hat, event.hat);
    visualState.chord = Math.max(visualState.chord, event.chord);
    visualState.synth = Math.max(visualState.synth, event.synth || 0);
    visualState.energy = event.energy;
    visualState.bar = event.bar;
    visualState.step = event.step;
    visualState.movement = event.movement;
    visualState.sectionProgress = event.sectionProgress;
    visualState.transitionProgress = event.transition?.progress || 0;

    if (event.step === 0) {
      renderInstrumentation(event.instrumentation || []);
      const vibe = profileForVibe(event.vibe);
      nowVibe.textContent = vibe.label.toUpperCase();
      sectionReadout.textContent = event.section;
      keyReadout.textContent = `${event.root} · ${event.mode.toUpperCase()}`;
      bpmReadout.textContent = event.bpm.toFixed(1);
      barReadout.textContent = String(event.bar + 1).padStart(5, "0");
      if (event.transition) {
        const progress = Math.round(event.transition.progress * 100);
        transitionCopy.textContent = `DRIFTING TOWARD ${titleCase(event.transition.to).toUpperCase()} · ${progress}%`;
        transitionFill.style.width = `${progress}%`;
      } else {
        transitionCopy.textContent = `${event.section} · MOVEMENT ${String(event.movement + 1).padStart(2, "0")} · SELF-GENERATING`;
        transitionFill.style.width = `${Math.round(event.sectionProgress * 100)}%`;
      }
    }
  }
}

async function toggleTransport() {
  if (uiBusy) return;
  uiBusy = true;
  transportButton.disabled = true;
  transportButton.setAttribute("aria-busy", "true");
  try {
    if (engine.running) {
      engine.stop();
    } else {
      setStatus("STARTING AUDIO…");
      await engine.start();
    }
  } catch (error) {
    setStatus(error?.message?.toUpperCase() || "AUDIO COULD NOT START", "error");
  } finally {
    uiBusy = false;
    transportButton.disabled = false;
    transportButton.setAttribute("aria-busy", "false");
  }
}

transportButton.addEventListener("click", toggleTransport);
trajectoryButton.addEventListener("click", () => engine.requestNewTrajectory());

for (const button of vibeButtons) {
  button.addEventListener("click", () => {
    targetVibe = button.dataset.vibe;
    selectTarget(vibeButtons, "vibe", targetVibe);
    engine.requestVibe(targetVibe);
  });
}

for (const button of tonalityButtons) {
  button.addEventListener("click", () => {
    targetTonality = button.dataset.tonality;
    selectTarget(tonalityButtons, "tonality", targetTonality);
    engine.requestTonality(targetTonality);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const interactive = Boolean(
    event.target?.closest?.(
      "button, input, textarea, select, summary, a, [contenteditable='true']",
    ),
  );
  if (event.code === "Space" && !interactive) {
    event.preventDefault();
    toggleTransport();
  }
  if (event.key.toLowerCase() === "n" && !interactive) {
    event.preventDefault();
    engine.requestNewTrajectory();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && engine.running && engine.ctx?.state !== "running") {
    engine.stop("interrupted");
  }
});

window.addEventListener("pagehide", () => engine.stop());

window.QuantumTechno = Object.freeze({
  version: GENERATOR_VERSION,
  getSnapshot: () => engine.getSnapshot(),
  requestVibe: (vibe) => engine.requestVibe(vibe),
  requestTonality: (tonality) => engine.requestTonality(tonality),
});

updateSeed(engine.seed);
bpmReadout.textContent = engine.currentTempo.toFixed(1);

const canvas = document.querySelector("#quantum-contour");
const canvasContext = canvas?.getContext?.("2d", { alpha: false }) || null;
const spectrum = new Uint8Array(512);
const reducedMotion = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };
let canvasWidth = 0;
let canvasHeight = 0;
let lastFrame = performance.now();
let renderHandle = null;
let renderTimer = null;

function resizeCanvas() {
  if (!canvas || !canvasContext) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasWidth = rect.width;
  canvasHeight = rect.height;
}

function drawBackdrop(context, width, height, time) {
  const gradient = context.createRadialGradient(
    width * 0.69,
    height * 0.38,
    10,
    width * 0.69,
    height * 0.38,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(
    0,
    `rgba(91, 55, 170, ${0.15 + visualState.chord * 0.13 + visualState.synth * 0.055})`,
  );
  gradient.addColorStop(0.36, "rgba(26, 15, 48, 0.16)");
  gradient.addColorStop(1, "#070609");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.16;
  context.strokeStyle = "#8b79bb";
  context.lineWidth = 1;
  const cell = Math.max(48, Math.min(width, height) / 11);
  const drift = reducedMotion.matches ? 0 : (time * 3.5) % cell;
  for (let x = -cell + drift; x < width + cell; x += cell) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += cell) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawProbabilityContours(context, width, height, time, running) {
  const left = width * 0.08;
  const right = width * 0.96;
  const span = right - left;
  const center = height * 0.42;
  const points = Math.max(72, Math.min(180, Math.floor(width / 8)));
  const motion = reducedMotion.matches ? 0 : 1;
  const contourCount = width < 700 ? 5 : 8;

  context.save();
  context.globalCompositeOperation = "screen";
  for (let layer = 0; layer < contourCount; layer += 1) {
    const offset = (layer - (contourCount - 1) / 2) * (9 + visualState.energy * 5);
    context.beginPath();
    for (let index = 0; index <= points; index += 1) {
      const ratio = index / points;
      const bin = spectrum[(index * 2 + visualState.bar * 3 + layer * 11) % 280] / 255;
      const packet =
        Math.exp(-((ratio - 0.55) ** 2) / (0.06 + visualState.energy * 0.07)) *
        (34 + visualState.energy * 82);
      const interference =
        Math.sin(ratio * Math.PI * (9 + (visualState.bar % 7)) + time * 0.6 * motion + layer) *
        (7 + bin * 21) *
        motion;
      const bassPull = visualState.bass * Math.sin(ratio * Math.PI * 3) * 18;
      const kickLift = visualState.kick * packet * 0.23;
      const seedRipple =
        visualState.seedFlash * Math.sin(ratio * Math.PI * 28) * 19;
      const synthesisFold =
        visualState.synth *
        Math.sin(ratio * Math.PI * (5 + layer * 0.72) + time * 1.2 * motion) *
        (8 + bin * 18);
      const x = left + ratio * span;
      const y =
        center +
        offset +
        interference +
        bassPull -
        packet * (0.18 + layer * 0.025) -
        kickLift +
        synthesisFold +
        seedRipple;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    const alpha = running ? 0.11 + layer * 0.025 + visualState.hat * 0.12 : 0.055;
    context.strokeStyle =
      layer % 3 === 0
        ? `rgba(213,255,63,${alpha * 0.78})`
        : layer % 2
          ? `rgba(100,233,226,${alpha})`
          : `rgba(154,124,255,${alpha * 1.24})`;
    context.lineWidth = layer === Math.floor(contourCount / 2) ? 1.7 : 0.8;
    context.shadowColor = layer % 2 ? "rgba(100,233,226,.25)" : "rgba(154,124,255,.3)";
    context.shadowBlur = running ? 8 + visualState.kick * 16 : 0;
    context.stroke();
  }
  context.restore();

  const playheadX = left + (visualState.step / 15) * span;
  context.save();
  context.strokeStyle = `rgba(213,255,63,${running ? 0.22 + visualState.kick * 0.42 : 0.08})`;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(playheadX, height * 0.19);
  context.lineTo(playheadX, height * 0.68);
  context.stroke();
  context.fillStyle = "rgba(213,255,63,.7)";
  context.fillRect(playheadX - 1, height * 0.68, 2, 14);
  context.restore();
}

function render(now) {
  if (!canvasContext) return;
  const delta = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const running = engine.fillSpectrum(spectrum);
  const context = canvasContext;
  const time = now / 1000;
  drawBackdrop(context, canvasWidth, canvasHeight, time);
  drawProbabilityContours(context, canvasWidth, canvasHeight, time, running);

  visualState.kick *= Math.exp(-delta * 8.8);
  visualState.bass *= Math.exp(-delta * 5.8);
  visualState.hat *= Math.exp(-delta * 13);
  visualState.chord *= Math.exp(-delta * 2.4);
  visualState.synth *= Math.exp(-delta * 3.8);
  visualState.seedFlash *= Math.exp(-delta * 3.2);
  if (engine.running && !reducedMotion.matches) {
    renderHandle = window.requestAnimationFrame(render);
  } else {
    renderTimer = window.setTimeout(
      () => {
        renderTimer = null;
        renderHandle = window.requestAnimationFrame(render);
      },
      engine.running ? 100 : 420,
    );
  }
}

if (canvasContext) {
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", resizeCanvas);
  }
  resizeCanvas();
  renderHandle = window.requestAnimationFrame(render);
} else {
  setStatus("VISUAL CONTOUR UNAVAILABLE — AUDIO CAN STILL RUN", "error");
}

window.addEventListener("pagehide", () => {
  if (renderHandle) window.cancelAnimationFrame(renderHandle);
  if (renderTimer) window.clearTimeout(renderTimer);
});
