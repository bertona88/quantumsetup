import {
  calculateTransmission,
  collapseFieldState,
  createFieldState,
  createParticleDescriptors,
  measurePosition,
  sampleProbabilityField,
  updateFieldState,
} from "./field-model.js";

const PRESETS = Object.freeze({
  ghost: {
    label: "Ghost tunnel",
    energy: 0.48,
    barrierHeight: 0.82,
    coherence: 0.92,
    exposure: 1.35,
    barrierWidth: 0.13,
  },
  resonance: {
    label: "Resonance",
    energy: 0.89,
    barrierHeight: 0.86,
    coherence: 0.76,
    exposure: 1.22,
    barrierWidth: 0.18,
  },
  deep: {
    label: "Deep barrier",
    energy: 0.31,
    barrierHeight: 1.06,
    coherence: 0.64,
    exposure: 1.62,
    barrierWidth: 0.2,
  },
  plasma: {
    label: "Plasma",
    energy: 1.08,
    barrierHeight: 0.52,
    coherence: 0.47,
    exposure: 1.74,
    barrierWidth: 0.08,
  },
});

const canvas = document.querySelector("#field-canvas");
const context = canvas.getContext("2d", { alpha: false });
const lowCanvas = document.createElement("canvas");
const lowContext = lowCanvas.getContext("2d", { alpha: true });
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const elements = {
  announcer: document.querySelector("#announcer"),
  barrier: document.querySelector("#barrier"),
  barrierOutput: document.querySelector("#barrier-output"),
  barrierPhase: document.querySelector("#barrier-phase"),
  coherence: document.querySelector("#coherence"),
  coherenceOutput: document.querySelector("#coherence-output"),
  energy: document.querySelector("#energy"),
  energyOutput: document.querySelector("#energy-output"),
  entropy: document.querySelector("#entropy-readout"),
  exposure: document.querySelector("#exposure"),
  exposureOutput: document.querySelector("#exposure-output"),
  measurementLabel: document.querySelector("#measurement-label"),
  measurementValue: document.querySelector("#measurement-value"),
  norm: document.querySelector("#norm-readout"),
  runButton: document.querySelector("#toggle-run"),
  runIcon: document.querySelector("#toggle-run .transport-icon"),
  runLabel: document.querySelector("#toggle-run-label"),
  seed: document.querySelector("#seed-readout"),
  stateIndex: document.querySelector("#state-index"),
  statusLight: document.querySelector(".status-light"),
  transmission: document.querySelector("#transmission-readout"),
  transportLabel: document.querySelector("#transport-label"),
};

if (!context || !lowContext) {
  canvas.hidden = true;
  elements.transportLabel.textContent = "CANVAS UNAVAILABLE";
  elements.announcer.textContent =
    "The probability field could not start because Canvas 2D is unavailable.";
  throw new Error("QuantumSetup requires a Canvas 2D rendering context");
}

const integrationPort = new EventTarget();
const MAX_CANVAS_PIXELS = 4_194_304;
let presetName = "ghost";
let stateCounter = 1;
let state = createFieldState(readInitialSeed(), PRESETS[presetName]);
let particles = createParticleDescriptors(state.seed);
let running = true;
let mode = "lab";
let clock = 0;
let lastTimestamp = performance.now();
let lastRenderedAt = -Infinity;
let animationFrame = 0;
let measurementFlash = null;
let frameEventAt = -Infinity;
let lastField = null;
let viewport = { width: 1, height: 1, dpr: 1 };

function readInitialSeed() {
  const urlSeed = new URL(window.location.href).searchParams.get("seed");
  return urlSeed || `QS-${new Date().toISOString().slice(0, 10)}-A`;
}

function generateSeed() {
  const values = new Uint32Array(2);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
  } else {
    values[0] = Date.now() >>> 0;
    values[1] = Math.floor(performance.now() * 1000) >>> 0;
  }
  return `${values[0].toString(36)}-${values[1].toString(36)}`;
}

function publish(type, detail) {
  const payload = Object.freeze({ ...detail });
  integrationPort.dispatchEvent(new CustomEvent(type, { detail: payload }));
  window.dispatchEvent(new CustomEvent(`quantumsetup:${type}`, { detail: payload }));
}

function currentSnapshot() {
  return Object.freeze({
    version: 1,
    seed: state.seed,
    seedLabel: state.seedLabel,
    time: clock,
    running,
    mode,
    preset: presetName,
    controls: Object.freeze({
      energy: state.energy,
      barrierHeight: state.barrierHeight,
      barrierWidth: state.barrierWidth,
      coherence: state.coherence,
      exposure: state.exposure,
    }),
    transmission: calculateTransmission(
      state.energy,
      state.barrierHeight,
      state.barrierWidth,
    ),
  });
}

window.QuantumSetup = Object.freeze({
  version: "0.2.0",
  port: integrationPort,
  getSnapshot: currentSnapshot,
  subscribe(type, listener) {
    integrationPort.addEventListener(type, listener);
    return () => integrationPort.removeEventListener(type, listener);
  },
});

function resize() {
  const bounds = canvas.getBoundingClientRect();
  const requestedDpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  let pixelWidth = Math.max(1, Math.round(width * requestedDpr));
  let pixelHeight = Math.max(1, Math.round(height * requestedDpr));

  if (pixelWidth * pixelHeight > MAX_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_CANVAS_PIXELS / (pixelWidth * pixelHeight));
    pixelWidth = Math.max(1, Math.floor(pixelWidth * scale));
    pixelHeight = Math.max(1, Math.floor(pixelHeight * scale));
  }

  viewport = {
    width,
    height,
    dpr: Math.min(pixelWidth / width, pixelHeight / height),
  };
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
  restartRender();
}

function fieldDimensions() {
  const aspect = viewport.width / Math.max(1, viewport.height);
  const rows = reducedMotion.matches ? 42 : 58;
  return {
    columns: Math.round(rows * Math.max(1.2, Math.min(2.35, aspect))),
    rows,
  };
}

function renderProbabilityTexture(field) {
  if (lowCanvas.width !== field.columns || lowCanvas.height !== field.rows) {
    lowCanvas.width = field.columns;
    lowCanvas.height = field.rows;
  }

  const image = lowContext.createImageData(field.columns, field.rows);
  const maximum = Math.max(1e-9, field.maximum);
  const exposure = state.exposure;

  for (let index = 0; index < field.density.length; index += 1) {
    const normalized = Math.min(1, field.density[index] / maximum);
    const light = Math.pow(normalized, 0.46) * exposure;
    const phase = field.phase[index];
    const spectral = Math.sin(phase * 0.37) * 0.5 + 0.5;
    const flare = Math.max(0, Math.sin(phase * 0.19 + 1.4));
    const offset = index * 4;

    image.data[offset] = Math.min(255, 12 + light * (92 + spectral * 146 + flare * 34));
    image.data[offset + 1] = Math.min(255, 7 + light * (54 + (1 - spectral) * 118));
    image.data[offset + 2] = Math.min(255, 24 + light * (145 + spectral * 108));
    image.data[offset + 3] = Math.min(255, 18 + light * 245);
  }

  lowContext.putImageData(image, 0, 0);
}

function drawGrid() {
  if (mode !== "lab") return;

  context.save();
  context.strokeStyle = "rgba(188, 208, 255, 0.055)";
  context.lineWidth = 1;
  for (let column = 1; column < 12; column += 1) {
    const x = (viewport.width * column) / 12;
    context.beginPath();
    context.moveTo(x, 88);
    context.lineTo(x, viewport.height);
    context.stroke();
  }
  for (let row = 1; row < 8; row += 1) {
    const y = 88 + ((viewport.height - 88) * row) / 8;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(viewport.width, y);
    context.stroke();
  }
  context.restore();
}

function drawField(field, forceClear) {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle =
    forceClear || !running || reducedMotion.matches ? "#06040d" : "rgba(6, 4, 13, 0.33)";
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.restore();

  drawGrid();
  renderProbabilityTexture(field);

  const destinationY = viewport.height * 0.09;
  const destinationHeight = viewport.height * 0.77;
  context.save();
  context.globalCompositeOperation = "screen";
  context.imageSmoothingEnabled = true;
  context.globalAlpha = mode === "trip" ? 0.85 : 0.66;
  context.filter = `blur(${mode === "trip" ? 18 : 12}px) saturate(150%)`;
  context.drawImage(lowCanvas, 0, destinationY, viewport.width, destinationHeight);
  context.globalAlpha = mode === "trip" ? 0.86 : 0.72;
  context.filter = "none";
  context.drawImage(lowCanvas, 0, destinationY, viewport.width, destinationHeight);
  context.restore();
}

function drawRibbons(field) {
  const maximum = Math.max(...field.marginalX);
  const deckTop = Math.max(viewport.height * 0.63, viewport.height - 195);
  const usableHeight = Math.max(150, deckTop - viewport.height * 0.2);
  const ribbonCount = mode === "trip" ? 8 : 5;

  context.save();
  context.globalCompositeOperation = "screen";
  context.lineWidth = mode === "trip" ? 1.15 : 0.8;

  for (let ribbon = 0; ribbon < ribbonCount; ribbon += 1) {
    const ratio = ribbon / Math.max(1, ribbonCount - 1);
    const baseY = viewport.height * 0.27 + ratio * usableHeight * 0.67;
    context.beginPath();
    for (let column = 0; column < field.columns; column += 1) {
      const x = (column / (field.columns - 1)) * viewport.width;
      const probability = field.marginalX[column] / Math.max(1e-9, maximum);
      const oscillation =
        Math.sin(
          column * (0.2 + state.energy * 0.16) -
            clock * (1.2 + ratio * 0.36) +
            ribbon * 1.47,
        ) *
        probability *
        (12 + state.coherence * 32);
      const y = baseY + oscillation;
      if (column === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    const alpha = 0.09 + (1 - ratio) * 0.13 + state.coherence * 0.06;
    context.strokeStyle =
      ribbon % 2 === 0
        ? `rgba(119, 239, 255, ${alpha})`
        : `rgba(195, 128, 255, ${alpha})`;
    context.stroke();
  }
  context.restore();
}

function drawBarrier(field) {
  const center = state.barrierCenter * viewport.width;
  const width = state.barrierWidth * viewport.width;
  const top = viewport.height * 0.16;
  const bottom = Math.max(viewport.height * 0.65, viewport.height - 175);

  document.documentElement.style.setProperty("--barrier-screen-x", `${state.barrierCenter * 100}%`);

  context.save();
  context.globalCompositeOperation = "screen";
  const gradient = context.createLinearGradient(center - width / 2, 0, center + width / 2, 0);
  gradient.addColorStop(0, "rgba(255, 74, 179, 0.04)");
  gradient.addColorStop(0.5, "rgba(190, 89, 255, 0.13)");
  gradient.addColorStop(1, "rgba(112, 238, 255, 0.035)");
  context.fillStyle = gradient;
  context.fillRect(center - width / 2, top, width, bottom - top);

  context.setLineDash(mode === "lab" ? [3, 7] : [2, 13]);
  context.lineWidth = 1;
  context.strokeStyle = `rgba(216, 162, 255, ${0.18 + field.transmission * 0.22})`;
  context.beginPath();
  context.moveTo(center - width / 2, top);
  context.lineTo(center - width / 2, bottom);
  context.moveTo(center + width / 2, top);
  context.lineTo(center + width / 2, bottom);
  context.stroke();

  if (mode === "lab") {
    context.setLineDash([]);
    context.fillStyle = "rgba(216, 222, 245, 0.4)";
    context.font = "500 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.fillText(`T = ${field.transmission.toFixed(4)}`, center, bottom + 17);
  }
  context.restore();
}

function drawParticles(field) {
  if (reducedMotion.matches) return;
  const left = state.barrierCenter - state.barrierWidth / 2;
  const right = state.barrierCenter + state.barrierWidth / 2;
  const top = viewport.height * 0.18;
  const height = Math.max(160, viewport.height * 0.42);

  context.save();
  context.globalCompositeOperation = "screen";
  for (const particle of particles) {
    let progress = (particle.start + clock * particle.speed * 0.045) % 1;
    const tunnels = particle.gate <= field.transmission;

    if (!tunnels && progress > left) {
      const reflectedProgress = (progress - left) % Math.max(0.04, left);
      progress = Math.max(0.01, left - reflectedProgress);
    } else if (tunnels && progress > left && progress < right) {
      progress = left + (progress - left) * (0.42 + field.transmission * 0.58);
    }

    const x = progress * viewport.width;
    const laneCurve =
      Math.sin(progress * Math.PI * (2 + state.transverse * 0.3) + particle.phase) *
      (10 + state.coherence * 18);
    const y = top + particle.lane * height + laneCurve;
    const pulse = 0.55 + 0.45 * Math.sin(clock * 2.1 + particle.phase);
    const alpha = (0.1 + pulse * 0.42) * (0.55 + state.exposure * 0.25);
    context.fillStyle =
      particle.hueMix > 0.62
        ? `rgba(103, 244, 255, ${alpha})`
        : particle.hueMix > 0.28
          ? `rgba(180, 119, 255, ${alpha})`
          : `rgba(255, 84, 190, ${alpha * 0.76})`;
    context.beginPath();
    context.arc(x, y, particle.size * (mode === "trip" ? 1.28 : 1), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawMeasurement(timestamp) {
  if (!measurementFlash) return;
  const age = (timestamp - measurementFlash.startedAt) / 1000;
  const reduced = reducedMotion.matches;
  const duration = reduced ? 0.65 : 2.2;
  if (age > duration) {
    measurementFlash = null;
    elements.measurementLabel.classList.remove("is-visible");
    return;
  }

  const x = measurementFlash.position * viewport.width;
  const progress = Math.min(1, age / (reduced ? duration : 1.4));
  const top = viewport.height * 0.14;
  const bottom = Math.max(viewport.height * 0.67, viewport.height - 175);
  const alpha = Math.max(0, 1 - progress);

  context.save();
  context.globalCompositeOperation = "screen";
  if (!reduced) {
    const beam = context.createLinearGradient(x - 30, 0, x + 30, 0);
    beam.addColorStop(0, "rgba(100, 240, 255, 0)");
    beam.addColorStop(0.5, `rgba(117, 246, 255, ${alpha * 0.5})`);
    beam.addColorStop(1, "rgba(100, 240, 255, 0)");
    context.fillStyle = beam;
    context.fillRect(x - 30, top, 60, bottom - top);
  }

  context.strokeStyle = `rgba(177, 249, 255, ${alpha * (reduced ? 0.34 : 0.8)})`;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, top);
  context.lineTo(x, bottom);
  context.stroke();

  if (!reduced) {
    context.beginPath();
    context.arc(x, viewport.height * 0.42, 18 + progress * 96, 0, Math.PI * 2);
    context.strokeStyle = `rgba(190, 136, 255, ${alpha * 0.7})`;
    context.stroke();
  }
  context.restore();
}

function updateReadouts(field) {
  elements.seed.textContent = state.seedLabel;
  elements.stateIndex.textContent = String(stateCounter).padStart(2, "0");
  elements.transmission.textContent = field.transmission.toFixed(3);
  elements.norm.textContent = field.norm.toFixed(3);
  elements.entropy.textContent = field.entropy.toFixed(3);
  elements.barrierPhase.textContent =
    state.energy < state.barrierHeight ? "SUB-THRESHOLD" : "ABOVE-THRESHOLD";
}

function render(timestamp, forceClear = false) {
  const minimumFrameInterval = reducedMotion.matches ? 1000 / 15 : 1000 / 60;
  if (!forceClear && timestamp - lastRenderedAt < minimumFrameInterval) {
    animationFrame = requestAnimationFrame(render);
    return;
  }

  const elapsed = Math.min(0.05, Math.max(0, (timestamp - lastTimestamp) / 1000));
  lastTimestamp = timestamp;
  lastRenderedAt = timestamp;
  if (running) clock += elapsed;

  lastField = sampleProbabilityField(state, clock, fieldDimensions());
  drawField(lastField, forceClear);
  drawRibbons(lastField);
  drawBarrier(lastField);
  drawParticles(lastField);
  drawMeasurement(timestamp);
  updateReadouts(lastField);

  if (timestamp - frameEventAt >= 100) {
    frameEventAt = timestamp;
    publish("frame", {
      ...currentSnapshot(),
      field: Object.freeze({
        norm: lastField.norm,
        entropy: lastField.entropy,
        maximum: lastField.maximum,
      }),
    });
  }

  if (running || measurementFlash) {
    animationFrame = requestAnimationFrame(render);
  } else {
    animationFrame = 0;
  }
}

function restartRender() {
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame((timestamp) => render(timestamp, true));
}

function syncControls() {
  elements.energy.value = state.energy;
  elements.barrier.value = state.barrierHeight;
  elements.coherence.value = state.coherence;
  elements.exposure.value = state.exposure;
  elements.energyOutput.value = state.energy.toFixed(2);
  elements.barrierOutput.value = state.barrierHeight.toFixed(2);
  elements.coherenceOutput.value = `${Math.round(state.coherence * 100)}%`;
  elements.exposureOutput.value = state.exposure.toFixed(2);
}

function setMode(nextMode) {
  mode = nextMode === "trip" ? "trip" : "lab";
  document.body.dataset.mode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.announcer.textContent = `${mode.toUpperCase()} mode`;
  publish("mode", currentSnapshot());
  restartRender();
}

function setPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  presetName = name;
  state = updateFieldState(state, {
    ...preset,
    collapseCenter: null,
    collapsedAt: null,
  });
  document.querySelectorAll(".preset").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.preset === name);
  });
  syncControls();
  elements.announcer.textContent = `${preset.label} field loaded`;
  publish("state", currentSnapshot());
  restartRender();
}

function updateControl(control) {
  const value = Number(control.value);
  const changes =
    control.id === "energy"
      ? { energy: value }
      : control.id === "barrier"
        ? { barrierHeight: value }
        : control.id === "coherence"
          ? { coherence: value }
          : { exposure: value };
  state = updateFieldState(state, changes);
  presetName = "custom";
  document.querySelectorAll(".preset").forEach((button) => button.classList.remove("is-active"));
  syncControls();
  publish("controls", currentSnapshot());
  restartRender();
}

function setRunning(nextRunning) {
  running = Boolean(nextRunning);
  elements.runLabel.textContent = running ? "PAUSE" : "RUN";
  elements.runIcon.classList.toggle("pause-icon", running);
  elements.runIcon.classList.toggle("play-icon", !running);
  elements.transportLabel.textContent = running ? "FIELD RUNNING" : "FIELD PAUSED";
  elements.statusLight.classList.toggle("is-paused", !running);
  elements.runButton.setAttribute("aria-label", running ? "Pause field" : "Run field");
  elements.announcer.textContent = running ? "Field running" : "Field paused";
  publish("transport", currentSnapshot());
  restartRender();
}

function measure() {
  const result = measurePosition(state, clock, state.collapseNonce + 1);
  state = collapseFieldState(state, result);
  measurementFlash = {
    position: result.position,
    startedAt: performance.now(),
  };
  elements.measurementValue.textContent = `u = ${result.position.toFixed(3)}`;
  elements.measurementLabel.style.left = `${result.position * 100}%`;
  elements.measurementLabel.classList.add("is-visible");
  elements.announcer.textContent = `Measurement collapsed at position ${result.position.toFixed(3)}`;
  publish("measure", {
    ...currentSnapshot(),
    measurement: result,
  });
  restartRender();
}

function newState() {
  stateCounter += 1;
  const seed = generateSeed();
  const controls = {
    energy: state.energy,
    barrierHeight: state.barrierHeight,
    coherence: state.coherence,
    exposure: state.exposure,
  };
  state = createFieldState(seed, controls);
  presetName = "custom";
  particles = createParticleDescriptors(seed);
  clock = 0;
  measurementFlash = null;
  document.querySelectorAll(".preset").forEach((button) => button.classList.remove("is-active"));
  elements.measurementLabel.classList.remove("is-visible");
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  window.history.replaceState(null, "", url);
  elements.announcer.textContent = `New deterministic state ${state.seedLabel}`;
  publish("state", currentSnapshot());
  restartRender();
}

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => setPreset(button.dataset.preset));
});

[elements.energy, elements.barrier, elements.coherence, elements.exposure].forEach((control) => {
  control.addEventListener("input", () => updateControl(control));
});

elements.runButton.addEventListener("click", () => setRunning(!running));
document.querySelector("#measure").addEventListener("click", measure);
document.querySelector("#new-state").addEventListener("click", newState);

document.addEventListener("keydown", (event) => {
  if (event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const interactive = Boolean(
    event.target?.closest?.(
      "button, input, textarea, select, summary, a, [contenteditable='true']",
    ),
  );
  if (interactive) return;

  if (event.code === "Space") {
    event.preventDefault();
    setRunning(!running);
  } else if (event.key.toLowerCase() === "m") {
    measure();
  } else if (event.key.toLowerCase() === "n") {
    newState();
  } else if (event.key.toLowerCase() === "l") {
    setMode("lab");
  } else if (event.key.toLowerCase() === "t") {
    setMode("trip");
  } else if (/^[1-4]$/.test(event.key)) {
    setPreset(Object.keys(PRESETS)[Number(event.key) - 1]);
  }
});

canvas.addEventListener("dblclick", (event) => {
  const bounds = canvas.getBoundingClientRect();
  const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  const result = { position, time: clock, nonce: state.collapseNonce + 1 };
  state = collapseFieldState(state, result);
  measurementFlash = { position, startedAt: performance.now() };
  elements.measurementValue.textContent = `u = ${position.toFixed(3)}`;
  elements.measurementLabel.style.left = `${position * 100}%`;
  elements.measurementLabel.classList.add("is-visible");
  elements.announcer.textContent = `Direct measurement at position ${position.toFixed(3)}`;
  publish("measure", { ...currentSnapshot(), measurement: result });
  restartRender();
});

let resizeObserver = null;
if ("ResizeObserver" in window) {
  resizeObserver = new window.ResizeObserver(resize);
  resizeObserver.observe(canvas);
} else {
  window.addEventListener("resize", resize);
}

const handleMotionChange = () => restartRender();
if (typeof reducedMotion.addEventListener === "function") {
  reducedMotion.addEventListener("change", handleMotionChange);
} else {
  reducedMotion.addListener?.(handleMotionChange);
}

function handlePageHide(event) {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  if (event.persisted) return;
  resizeObserver?.disconnect();
  window.removeEventListener("resize", resize);
  reducedMotion.removeEventListener?.("change", handleMotionChange);
  reducedMotion.removeListener?.(handleMotionChange);
  window.removeEventListener("pageshow", handlePageShow);
}

function handlePageShow(event) {
  if (!event.persisted) return;
  lastTimestamp = performance.now();
  resize();
}

window.addEventListener("pagehide", handlePageHide);
window.addEventListener("pageshow", handlePageShow);
syncControls();
resize();
publish("ready", currentSnapshot());
