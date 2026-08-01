import { InfiniteTechnoEngine, formatSeed } from "./audio-engine.js";
import { InstrumentAuditioner } from "./instrument-preview.js";
import { SignalDeckModel } from "./signal-deck.js";
import { GENERATOR_VERSION, profileForVibe } from "./techno-model.js";
import {
  DEFAULT_DIRECTION_CONTROLS,
  DEFAULT_MIX_CONTROLS,
  normalizeDirectionControls,
  normalizeMixControls,
} from "./performance-controls.js";
import {
  deriveInitialDirection,
  freshTrajectoryId,
  parseTrajectoryId,
  trajectoryIdForUrl,
} from "./trajectory-identity.js";
import { QuantumPremonitionVisual } from "./quantum-visual.js";

const app = document.querySelector("#app");
const transportButton = document.querySelector("#transport-button");
const portalTransportButton = document.querySelector("#portal-transport-button");
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
const ensembleMeta = document.querySelector("#ensemble-meta");
const signalCard = document.querySelector("#signal-card");
const signalFamily = document.querySelector("#signal-family");
const signalName = document.querySelector("#signal-name");
const signalDetail = document.querySelector("#signal-detail");
const signalTraits = document.querySelector("#signal-traits");
const signalTasteCount = document.querySelector("#signal-taste-count");
const signalPassButton = document.querySelector("#signal-pass");
const signalAuditionButton = document.querySelector("#signal-audition");
const signalKeepButton = document.querySelector("#signal-keep");
const signalLive = document.querySelector("#signal-live");
const vibeButtons = [...document.querySelectorAll("[data-vibe]")];
const tonalityButtons = [...document.querySelectorAll("[data-tonality]")];
const mixInputs = [...document.querySelectorAll("[data-mix-param]")];
const directionInputs = [
  ...document.querySelectorAll("[data-direction-param]"),
];
const cutButtons = [...document.querySelectorAll("[data-cut-target]")];
const bassCharacterButtons = [
  ...document.querySelectorAll("[data-bassline-character]"),
];
const directionTarget = document.querySelector("#direction-target");

const PERFORMANCE_STORAGE_KEY = "quantumsetup.performance.v1";

function loadPerformancePreferences() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PERFORMANCE_STORAGE_KEY));
    return {
      mix: normalizeMixControls({
        ...(parsed?.mix || DEFAULT_MIX_CONTROLS),
        kickCut: false,
        bassCut: false,
      }),
      direction: normalizeDirectionControls(
        parsed?.direction || DEFAULT_DIRECTION_CONTROLS,
      ),
    };
  } catch (_) {
    return {
      mix: DEFAULT_MIX_CONTROLS,
      direction: DEFAULT_DIRECTION_CONTROLS,
    };
  }
}

const performancePreferences = loadPerformancePreferences();

const params = new URLSearchParams(window.location.search);
const seedText = params.get("seed");
const parsedSeed = parseTrajectoryId(seedText);
const initialSeed = parsedSeed ?? freshTrajectoryId(window.crypto);
const initialDirection = deriveInitialDirection(initialSeed);

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

const signalDeck = new SignalDeckModel();
const signalAuditioner = new InstrumentAuditioner();
const engine = new InfiniteTechnoEngine(handleEngineEvent, {
  seed: initialSeed,
  vibe: initialDirection.vibe,
  tonality: initialDirection.tonality,
  tasteProfile: signalDeck.tasteProfile,
  mixControls: performancePreferences.mix,
  directionControls: performancePreferences.direction,
});

let uiBusy = false;
let targetVibe = initialDirection.vibe;
let targetTonality = initialDirection.tonality;
let instrumentationSignature = "";
let displayedInstrumentCount = 0;
let advancedSynthAvailable = null;
let currentInstrumentation = [];
let currentEnsembleScene = null;
let currentSignal = signalDeck.currentSpecimen;
let signalDecisionLocked = false;
let signalPointer = null;
let signalAuditionTimer = null;
let targetDirectionControls = performancePreferences.direction;
let premonitionVisual = null;

function titleCase(text) {
  return String(text)
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function signedValue(value, suffix = "") {
  const number = Number(value) || 0;
  if (number === 0) return suffix ? `0${suffix}` : "CENTER";
  return `${number > 0 ? "+" : ""}${number}${suffix}`;
}

function setRangePresentation(input) {
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const value = Number(input.value);
  const progress = ((value - minimum) / (maximum - minimum)) * 100;
  input.closest(".performance-range")?.style.setProperty(
    "--range-progress",
    `${Math.max(0, Math.min(100, progress))}%`,
  );
  const output = document.querySelector(`#${input.id}-output`);
  if (input.dataset.mixParam) {
    const text = signedValue(value, " dB");
    if (output) output.textContent = text;
    input.setAttribute("aria-valuetext", text);
    return;
  }
  const text = signedValue(value);
  if (output) output.textContent = text;
  input.setAttribute(
    "aria-valuetext",
    value === 0
      ? "center"
      : `${Math.abs(value)} percent ${value > 0 ? "more" : "less"}`,
  );
}

function directionIsNeutral(direction) {
  return (
    direction.bassCharacter === "auto" &&
    directionInputs.every(
      (input) => Math.abs(direction[input.dataset.directionParam] || 0) < 0.001,
    )
  );
}

function renderDirectionTarget(event = null) {
  const label = directionIsNeutral(targetDirectionControls)
    ? "NEUTRAL"
    : "CUSTOM";
  directionTarget.textContent = event?.immediate === false
    ? `TARGET · ${label} · BAR ${event.startBar + 1}`
    : `TARGET · ${label}`;
}

function renderCutButton(button, active, pending = false, target = active) {
  button.setAttribute("aria-pressed", String(active));
  button.dataset.pending = String(pending);
  button.dataset.pendingValue = String(target);
  const status = button.querySelector("small");
  if (status) {
    status.textContent = pending
      ? `NEXT ${target ? "CUT" : "ON"}`
      : active
        ? "MUTED"
        : "ON";
  }
}

function savePerformancePreferences() {
  try {
    window.localStorage.setItem(
      PERFORMANCE_STORAGE_KEY,
      JSON.stringify({
        mix: {
          low: Number(mixInputs.find((input) => input.dataset.mixParam === "low")?.value) || 0,
          mid: Number(mixInputs.find((input) => input.dataset.mixParam === "mid")?.value) || 0,
          high: Number(mixInputs.find((input) => input.dataset.mixParam === "high")?.value) || 0,
        },
        direction: targetDirectionControls,
      }),
    );
  } catch (_) {
    // Performance preferences are optional and never block audio.
  }
}

function initializePerformanceControls() {
  for (const input of mixInputs) {
    input.value = String(performancePreferences.mix[input.dataset.mixParam]);
    setRangePresentation(input);
  }
  for (const input of directionInputs) {
    input.value = String(
      Math.round(
        performancePreferences.direction[input.dataset.directionParam] * 100,
      ),
    );
    setRangePresentation(input);
  }
  for (const button of cutButtons) renderCutButton(button, false);
  selectTarget(
    bassCharacterButtons,
    "basslineCharacter",
    performancePreferences.direction.bassCharacter,
  );
  renderDirectionTarget();
}

function setStatus(message, state = "idle") {
  statusText.textContent = message;
  app.classList.toggle("is-running", engine.running);
  app.classList.toggle("is-error", state === "error");
  visualState.running = engine.running;
}

function updateSeed(seed, { writeUrl = true } = {}) {
  seedReadout.textContent = formatSeed(seed);
  seedReadout.title = `Full 128-bit trajectory ID: ${trajectoryIdForUrl(seed)}`;
  if (!writeUrl) return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", trajectoryIdForUrl(seed));
  window.history.replaceState(null, "", url);
}

function selectTarget(buttons, attribute, value) {
  for (const button of buttons) {
    const active = button.dataset[attribute] === value;
    button.setAttribute("aria-pressed", String(active));
  }
}

function signalControlsAvailable() {
  return Boolean(
    currentSignal &&
      !engine.running &&
      !engine.starting &&
      !engine.contextReleasing &&
      !uiBusy &&
      !signalDecisionLocked,
  );
}

function resetSignalDrag() {
  signalCard.classList.remove("is-dragging");
  signalCard.style.setProperty("--signal-drag-x", "0px");
  signalCard.style.setProperty("--signal-drag-rotate", "0deg");
  signalCard.style.setProperty("--signal-pass-opacity", "0");
  signalCard.style.setProperty("--signal-keep-opacity", "0");
}

function updateSignalAvailability() {
  const available = signalControlsAvailable();
  for (const button of [
    signalPassButton,
    signalAuditionButton,
    signalKeepButton,
  ]) {
    button.disabled = !available;
  }
  signalCard.setAttribute("aria-disabled", String(!available));
  signalCard.dataset.availability = engine.running
    ? "transport-running"
    : available
      ? "ready"
      : "busy";
}

function renderSignalSpecimen(specimen = currentSignal) {
  currentSignal = specimen || null;
  const snapshot = signalDeck.getSnapshot();
  const count = String(snapshot.tasteProfile.decisions).padStart(2, "0");
  const storageLabel =
    snapshot.storageMode === "local" ? "LOCAL" : "SESSION";
  signalTasteCount.textContent = `${count} SIGNALS · ${storageLabel}`;
  app.dataset.signalStorage = snapshot.storageMode;
  app.dataset.signalDecisions = String(snapshot.tasteProfile.decisions);
  if (!currentSignal) {
    signalFamily.textContent = "SIGNAL UNAVAILABLE";
    signalName.textContent = "NO VALID SPECIMEN";
    signalDetail.textContent = "THE SET WILL CONTINUE WITHOUT TASTE BIAS";
    signalTraits.textContent = "UNTRAINED";
    signalCard.dataset.engine = "";
    signalCard.dataset.specimenId = "";
    signalCard.dataset.exploration = "false";
    updateSignalAvailability();
    return;
  }
  signalFamily.textContent = `SPECIMEN ${String(currentSignal.cursor + 1).padStart(3, "0")} · ${currentSignal.family.label} · ${currentSignal.vibeLabel}`;
  signalName.textContent = currentSignal.label;
  signalDetail.textContent = currentSignal.detail;
  signalTraits.textContent =
    currentSignal.traits.length > 0
      ? currentSignal.traits.join(" / ").toUpperCase()
      : "UNMAPPED TIMBRE";
  signalCard.dataset.engine = currentSignal.engine;
  signalCard.dataset.specimenId = currentSignal.id;
  signalCard.dataset.exploration = String(currentSignal.exploration);
  updateSignalAvailability();
}

function stopSignalAudition() {
  const wasActive =
    signalAuditioner.active ||
    signalCard.classList.contains("is-auditioning");
  if (signalAuditionTimer) {
    window.clearTimeout(signalAuditionTimer);
    signalAuditionTimer = null;
  }
  signalCard.classList.remove("is-auditioning");
  if (wasActive) {
    app.dataset.signalAudition = "stopped";
    signalLive.textContent = "Instrument preview stopped.";
  }
  return signalAuditioner.close();
}

async function auditionSignal() {
  if (!signalControlsAvailable()) return;
  signalDecisionLocked = true;
  updateSignalAvailability();
  signalCard.classList.add("is-auditioning");
  signalLive.textContent = `Playing ${currentSignal.label}.`;
  try {
    await engine.waitForContextRelease();
    if (engine.running || engine.starting || uiBusy) return;
    const result = await signalAuditioner.audition(currentSignal.genome);
    if (!result) return;
    app.dataset.signalAudition = "started";
    if (signalAuditionTimer) window.clearTimeout(signalAuditionTimer);
    signalAuditionTimer = window.setTimeout(() => {
      signalAuditionTimer = null;
      signalCard.classList.remove("is-auditioning");
      app.dataset.signalAudition = "ended";
    }, Math.ceil(result.durationSeconds * 1000));
  } catch (error) {
    signalCard.classList.remove("is-auditioning");
    app.dataset.signalAudition = "error";
    signalLive.textContent =
      error?.message || "This instrument could not be previewed.";
  } finally {
    signalDecisionLocked = false;
    updateSignalAvailability();
  }
}

function decideSignal(decision) {
  if (!signalControlsAvailable()) return;
  const previous = currentSignal;
  const result = signalDeck.decide(previous.id, decision);
  if (!result.accepted) return;
  signalDecisionLocked = true;
  updateSignalAvailability();
  resetSignalDrag();
  const previewRelease = stopSignalAudition();
  engine.setTasteProfile(signalDeck.tasteProfile);
  signalCard.classList.add(decision === "like" ? "is-keeping" : "is-passing");
  const nextLabel = result.current?.label || "the next signal";
  signalLive.textContent = `${decision === "like" ? "Kept" : "Passed"} ${previous.label}. Next: ${nextLabel}.`;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const transitionDelay = new Promise((resolve) =>
    window.setTimeout(resolve, reduced ? 1 : 190),
  );
  void Promise.all([previewRelease, transitionDelay]).then(() => {
    signalCard.classList.remove("is-keeping", "is-passing");
    currentSignal = result.current;
    signalDecisionLocked = false;
    renderSignalSpecimen(currentSignal);
  });
}

function updateEnsembleMeta(scene = currentEnsembleScene) {
  const count = String(displayedInstrumentCount).padStart(2, "0");
  if (!scene || displayedInstrumentCount === 0) {
    ensembleMeta.textContent = "UNFORMED · 00 PARTS";
    return;
  }
  if (advancedSynthAvailable === false) {
    ensembleMeta.textContent = `CORE FALLBACK · ${count} PARTS`;
    return;
  }
  ensembleMeta.textContent = `${scene.label} · ${count} PARTS`;
}

const ROSTER_ROLE_PRIORITY = Object.freeze({
  foundation: 0,
  "low-end": 1,
  synth: 2,
  harmony: 3,
  backbeat: 4,
  tops: 5,
  percussion: 6,
  atmosphere: 7,
  transition: 8,
});

const SYNTH_ENGINE_PRIORITY = Object.freeze({
  fm: 0,
  modal: 1,
  string: 2,
});

function renderEnsemble(scene, items = []) {
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  unique.sort(
    (left, right) =>
      (ROSTER_ROLE_PRIORITY[left.role] ?? 99) -
        (ROSTER_ROLE_PRIORITY[right.role] ?? 99) ||
      (SYNTH_ENGINE_PRIORITY[left.engine] ?? 99) -
        (SYNTH_ENGINE_PRIORITY[right.engine] ?? 99),
  );
  const signature = `${scene?.id || ""}:${scene?.hybrid ? 1 : 0}:${unique
    .map((item) => item.id)
    .join("|")}`;
  currentEnsembleScene = scene || null;
  currentInstrumentation = unique;
  displayedInstrumentCount = unique.length;
  updateEnsembleMeta(scene);
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
    portalTransportButton.querySelector("span").textContent = event.running ? "■" : "▶";
    portalTransportButton.setAttribute(
      "aria-label",
      event.running ? "Stop the set" : "Start the set",
    );
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
      renderEnsemble(null, []);
      premonitionVisual?.setRunning(false);
    } else {
      premonitionVisual?.setRunning(true, engine.ctx?.currentTime || 0);
    }
    app.dataset.visualEngine = "causal-world";
    if (event.running) void stopSignalAudition();
    updateSignalAvailability();
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
    updateEnsembleMeta();
    if (!event.available) {
      renderEnsemble(
        currentEnsembleScene,
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

  if (event.type === "performance-mix") {
    const button = cutButtons.find(
      (candidate) => candidate.dataset.cutTarget === event.control,
    );
    if (button) {
      const active = event.mix?.[`${event.control}Cut`] === true;
      renderCutButton(button, active, event.pending, event.value);
      liveRegion.textContent = event.pending
        ? `${titleCase(event.control)} ${event.value ? "cut" : "return"} queued for the next beat.`
        : `${titleCase(event.control)} is ${event.value ? "cut" : "on"}.`;
    }
  }

  if (event.type === "performance-direction") {
    targetDirectionControls = event.direction;
    selectTarget(
      bassCharacterButtons,
      "basslineCharacter",
      targetDirectionControls.bassCharacter,
    );
    renderDirectionTarget(event);
  }

  if (event.type === "intent") describeIntent(event);

  if (event.type === "seed") {
    updateSeed(event.seed);
    premonitionVisual?.setSeed(event.seed);
    visualState.seedFlash = 1;
    transitionCopy.textContent = "NEW MUSICAL DNA ENTERED THE MIX";
    transitionFill.style.width = "0%";
    liveRegion.textContent = `New trajectory ${formatSeed(event.seed)} entered at bar ${event.bar + 1}`;
  }

  if (event.type === "visual-forecast") {
    premonitionVisual?.ingestForecast(event);
    app.dataset.visualHorizon = String(event.forecast?.horizonSteps || 0);
  }

  if (event.type === "trajectory-rejected") {
    transitionCopy.textContent =
      "NO DISTINCT TRAJECTORY FOUND · CURRENT SET CONTINUES";
    liveRegion.textContent =
      "The candidate pool was too close to the current musical DNA, so no trajectory change was made.";
  }

  if (event.type === "step") {
    premonitionVisual?.ingestImpact(event);
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
      if (event.performance?.directionTarget) {
        targetDirectionControls = event.performance.directionTarget;
        const transition = event.performance.directionTransition;
        if (transition && event.bar < transition.startBar) {
          directionTarget.textContent = `TARGET · ${directionIsNeutral(targetDirectionControls) ? "NEUTRAL" : "CUSTOM"} · BAR ${transition.startBar + 1}`;
        } else if (transition) {
          directionTarget.textContent = `MORPH · ${Math.round(transition.progress * 100)}%`;
        } else {
          renderDirectionTarget();
        }
      }
      renderEnsemble(
        event.ensembleScene || null,
        event.instrumentation || [],
      );
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
        const direction = event.council?.directive || "DIRECTED ARC";
        const phase = event.council?.phase || event.section;
        transitionCopy.textContent = `${direction} · ${phase}`;
        transitionFill.style.width = `${Math.round(event.sectionProgress * 100)}%`;
      }
    }
  }
}

async function toggleTransport() {
  if (uiBusy) return;
  uiBusy = true;
  updateSignalAvailability();
  transportButton.disabled = true;
  transportButton.setAttribute("aria-busy", "true");
  try {
    if (engine.running) {
      await engine.stop();
    } else {
      await stopSignalAudition();
      setStatus("STARTING AUDIO…");
      await engine.start();
    }
  } catch (error) {
    setStatus(error?.message?.toUpperCase() || "AUDIO COULD NOT START", "error");
  } finally {
    uiBusy = false;
    updateSignalAvailability();
    transportButton.disabled = false;
    transportButton.setAttribute("aria-busy", "false");
  }
}

transportButton.addEventListener("click", toggleTransport);
portalTransportButton.addEventListener("click", toggleTransport);
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

for (const input of mixInputs) {
  input.addEventListener("input", () => {
    setRangePresentation(input);
    engine.requestMixControl(input.dataset.mixParam, Number(input.value));
  });
  input.addEventListener("change", () => {
    savePerformancePreferences();
    liveRegion.textContent = `${titleCase(input.dataset.mixParam)} EQ set to ${signedValue(input.value, " decibels")}.`;
  });
}

for (const button of cutButtons) {
  button.addEventListener("click", () => {
    const pending = button.dataset.pending === "true";
    const currentTarget = pending
      ? button.dataset.pendingValue === "true"
      : button.getAttribute("aria-pressed") === "true";
    engine.requestMixControl(button.dataset.cutTarget, !currentTarget);
  });
}

for (const input of directionInputs) {
  input.addEventListener("input", () => {
    setRangePresentation(input);
    const name = input.dataset.directionParam;
    targetDirectionControls = normalizeDirectionControls({
      ...targetDirectionControls,
      [name]: Number(input.value) / 100,
    });
    renderDirectionTarget();
    engine.requestDirectionControl(name, Number(input.value) / 100);
  });
  input.addEventListener("change", () => {
    savePerformancePreferences();
    liveRegion.textContent = `${titleCase(input.dataset.directionParam)} direction set to ${signedValue(input.value)}.`;
  });
}

for (const button of bassCharacterButtons) {
  button.addEventListener("click", () => {
    const character = button.dataset.basslineCharacter;
    targetDirectionControls = normalizeDirectionControls({
      ...targetDirectionControls,
      bassCharacter: character,
    });
    selectTarget(bassCharacterButtons, "basslineCharacter", character);
    renderDirectionTarget();
    engine.requestBassCharacter(character);
    savePerformancePreferences();
    liveRegion.textContent = `${titleCase(character)} bassline character selected.`;
  });
}

signalPassButton.addEventListener("click", () => decideSignal("pass"));
signalAuditionButton.addEventListener("click", auditionSignal);
signalKeepButton.addEventListener("click", () => decideSignal("like"));

signalCard.addEventListener("pointerdown", (event) => {
  if (
    !signalControlsAvailable() ||
    event.button !== 0 ||
    event.target.closest("button")
  ) {
    return;
  }
  signalPointer = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    dx: 0,
    dragging: false,
    vertical: false,
  };
  signalCard.setPointerCapture?.(event.pointerId);
});

signalCard.addEventListener("pointermove", (event) => {
  if (!signalPointer || signalPointer.id !== event.pointerId) return;
  const dx = event.clientX - signalPointer.startX;
  const dy = event.clientY - signalPointer.startY;
  signalPointer.dx = dx;
  if (!signalPointer.dragging) {
    if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
      signalPointer.vertical = true;
      return;
    }
    if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    signalPointer.dragging = true;
    signalCard.classList.add("is-dragging");
  }
  if (signalPointer.vertical) return;
  event.preventDefault();
  const maximum = Math.max(90, signalCard.clientWidth * 0.42);
  const bounded = Math.max(-maximum, Math.min(maximum, dx));
  const ratio = bounded / maximum;
  signalCard.style.setProperty("--signal-drag-x", `${bounded}px`);
  signalCard.style.setProperty(
    "--signal-drag-rotate",
    `${(ratio * 2).toFixed(3)}deg`,
  );
  signalCard.style.setProperty(
    "--signal-pass-opacity",
    String(Math.max(0, -ratio)),
  );
  signalCard.style.setProperty(
    "--signal-keep-opacity",
    String(Math.max(0, ratio)),
  );
});

function finishSignalPointer(event, cancelled = false) {
  if (!signalPointer || signalPointer.id !== event.pointerId) return;
  const pointer = signalPointer;
  signalPointer = null;
  if (signalCard.hasPointerCapture?.(event.pointerId)) {
    signalCard.releasePointerCapture(event.pointerId);
  }
  signalCard.classList.remove("is-dragging");
  const threshold = Math.max(72, signalCard.clientWidth * 0.28);
  if (
    !cancelled &&
    pointer.dragging &&
    !pointer.vertical &&
    Math.abs(pointer.dx) >= threshold
  ) {
    decideSignal(pointer.dx > 0 ? "like" : "pass");
    return;
  }
  resetSignalDrag();
}

signalCard.addEventListener("pointerup", (event) =>
  finishSignalPointer(event),
);
signalCard.addEventListener("pointercancel", (event) =>
  finishSignalPointer(event, true),
);
signalCard.addEventListener("keydown", (event) => {
  if (event.target !== signalCard || event.repeat) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    decideSignal("pass");
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    decideSignal("like");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  const interactive = Boolean(
    event.target?.closest?.(
      "button, input, textarea, select, summary, a, [tabindex], [contenteditable='true']",
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
  if (document.hidden) void stopSignalAudition();
  if (!document.hidden && engine.running && engine.ctx?.state !== "running") {
    engine.stop("interrupted");
  }
});

window.addEventListener("pagehide", () => {
  void stopSignalAudition();
  engine.stop();
});

window.QuantumTechno = Object.freeze({
  version: GENERATOR_VERSION,
  getSnapshot: () => engine.getSnapshot(),
  requestVibe: (vibe) => engine.requestVibe(vibe),
  requestTonality: (tonality) => engine.requestTonality(tonality),
  setMixControl: (name, value) => engine.requestMixControl(name, value),
  setDirectionControl: (name, value) =>
    engine.requestDirectionControl(name, value),
  setBassCharacter: (character) => engine.requestBassCharacter(character),
});

updateSeed(engine.seed, { writeUrl: parsedSeed !== undefined });
nowVibe.textContent = profileForVibe(initialDirection.vibe).label.toUpperCase();
selectTarget(vibeButtons, "vibe", initialDirection.vibe);
selectTarget(tonalityButtons, "tonality", initialDirection.tonality);
initializePerformanceControls();
bpmReadout.textContent = engine.currentTempo.toFixed(1);
renderSignalSpecimen(currentSignal);

const canvas = document.querySelector("#quantum-contour");
const spectrum = new Uint8Array(512);
const reducedMotion = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };
let lastFrame = performance.now();
let renderHandle = null;
let renderTimer = null;

function resizeCanvas() {
  premonitionVisual?.resize();
}

function render(now) {
  if (!premonitionVisual?.context) return;
  const delta = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const running = engine.fillSpectrum(spectrum);
  premonitionVisual.render({
    now,
    audioNow: engine.ctx?.currentTime || 0,
    spectrum,
    energy: visualState.energy,
  });

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

premonitionVisual = new QuantumPremonitionVisual(canvas, {
  reducedMotion: reducedMotion.matches,
});
premonitionVisual.setSeed(engine.seed);
app.dataset.visualEngine = "causal-world";

if (premonitionVisual.context) {
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
