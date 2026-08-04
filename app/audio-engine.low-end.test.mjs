import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMixControls } from "./performance-controls.js";

class FakeAudioParam {
  constructor(value = 1) {
    this.value = value;
    this.events = [];
  }

  cancelAndHoldAtTime(time) {
    this.events.push({ type: "hold", time });
  }

  cancelScheduledValues(time) {
    this.events.push({ type: "cancel", time });
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: "set", value, time });
  }

  exponentialRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: "ramp", value, time });
  }

  setTargetAtTime(value, time, constant) {
    this.value = value;
    this.events.push({ type: "target", value, time, constant });
  }
}

class FakeAudioNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.starts = [];
    this.stops = [];
    this.gain = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
    this.Q = new FakeAudioParam();
    this.detune = new FakeAudioParam();
    this.delayTime = new FakeAudioParam();
    this.playbackRate = new FakeAudioParam();
    this.pan = new FakeAudioParam();
    this.threshold = new FakeAudioParam();
    this.knee = new FakeAudioParam();
    this.ratio = new FakeAudioParam();
    this.attack = new FakeAudioParam();
    this.release = new FakeAudioParam();
  }

  connect(node, ...args) {
    this.connections.push({
      node,
      args,
      gainAtConnect: this.gain.value,
    });
    return node;
  }

  disconnect() {}

  start(...args) {
    this.starts.push(args);
  }

  stop(...args) {
    this.stops.push(args);
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.nodes = [];
    this.gains = [];
    this.filters = [];
    this.oscillators = [];
    this.bufferSources = [];
    this.shapers = [];
    this.destination = this.makeNode("destination");
  }

  makeNode(kind) {
    const node = new FakeAudioNode(kind);
    this.nodes.push(node);
    return node;
  }

  createGain() {
    const node = this.makeNode("gain");
    this.gains.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = this.makeNode("filter");
    this.filters.push(node);
    return node;
  }

  createWaveShaper() {
    const node = this.makeNode("shaper");
    this.shapers.push(node);
    return node;
  }

  createDynamicsCompressor() {
    return this.makeNode("compressor");
  }

  createAnalyser() {
    return this.makeNode("analyser");
  }

  createDelay() {
    return this.makeNode("delay");
  }

  createConvolver() {
    return this.makeNode("convolver");
  }

  createOscillator() {
    const node = this.makeNode("oscillator");
    this.oscillators.push(node);
    return node;
  }

  createBufferSource() {
    const node = this.makeNode("buffer-source");
    this.bufferSources.push(node);
    return node;
  }

  createStereoPanner() {
    return this.makeNode("stereo-panner");
  }

  createBuffer(channels, length) {
    const data = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return {
      getChannelData(channel) {
        return data[channel];
      },
    };
  }
}

globalThis.window = {
  AudioContext: class {},
  AudioWorkletNode: null,
  clearInterval() {},
  clearTimeout() {},
  setInterval() {
    return 1;
  },
  setTimeout(callback) {
    queueMicrotask(callback);
    return 1;
  },
  crypto: {
    getRandomValues(values) {
      values[0] = 0x12345678;
      return values;
    },
  },
};

const { InfiniteTechnoEngine } = await import("./audio-engine.js");

function makeEngine(onEvent = () => {}) {
  const context = new FakeAudioContext();
  const engine = new InfiniteTechnoEngine(onEvent, { seed: 0x51eed });
  engine.ctx = context;
  return { context, engine };
}

function connectionTargets(node) {
  return node.connections.map((connection) => connection.node);
}

function lastEvent(param, type) {
  return param.events.filter((event) => event.type === type).at(-1);
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function approximatelyEqual(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} differed from ${expected}`,
  );
}

test("the graph keeps kick, bass, rumble, and music on distinct bounded buses", () => {
  const { engine } = makeEngine();
  engine.buildGraph();

  assert.notEqual(engine.kickBus, engine.bassBus);
  assert.notEqual(engine.kickBus, engine.rumbleBus);
  assert.notEqual(engine.kickBus, engine.musicBus);
  assert.notEqual(engine.bassBus, engine.rumbleBus);
  assert.notEqual(engine.bassBus, engine.musicBus);
  assert.notEqual(engine.rumbleBus, engine.musicBus);

  assert.deepEqual(connectionTargets(engine.kickBus), [
    engine.kickPerformanceGain,
  ]);
  assert.deepEqual(connectionTargets(engine.kickPerformanceGain), [
    engine.preMaster,
    engine.rumbleSendGain,
  ]);
  assert.deepEqual(connectionTargets(engine.bassBus), [
    engine.bassPerformanceGain,
  ]);
  assert.deepEqual(connectionTargets(engine.bassPerformanceGain), [
    engine.preMaster,
  ]);
  assert.deepEqual(connectionTargets(engine.rumbleBus), [engine.preMaster]);
  assert.deepEqual(connectionTargets(engine.musicBus), [engine.toneFilter]);
  assert.deepEqual(connectionTargets(engine.rumbleWet), [engine.rumbleBus]);
  assert.deepEqual(connectionTargets(engine.echoAscentIn), [
    engine.echoAscentHighpass,
  ]);
  assert.deepEqual(connectionTargets(engine.echoAscentHighpass), [
    engine.echoAscentLeftDelay,
  ]);
  assert.deepEqual(connectionTargets(engine.echoAscentLeftFeedback), [
    engine.echoAscentRightDelay,
  ]);
  assert.deepEqual(connectionTargets(engine.echoAscentRightFeedback), [
    engine.echoAscentLeftDelay,
  ]);
  assert.deepEqual(connectionTargets(engine.echoAscentWet), [engine.musicBus]);
  assert.deepEqual(connectionTargets(engine.highpass), [engine.lowEq]);
  assert.deepEqual(connectionTargets(engine.lowEq), [engine.midEq]);
  assert.deepEqual(connectionTargets(engine.midEq), [engine.highEq]);
  assert.deepEqual(connectionTargets(engine.highEq), [engine.softClip]);

  const feedbackConnection = engine.rumbleFeedback.connections[0];
  assert.equal(feedbackConnection.node, engine.rumbleDelay);
  assert.equal(feedbackConnection.gainAtConnect, 0.32);
  assert.ok(feedbackConnection.gainAtConnect <= 0.58);

  engine.syncEffects(
    {
      space: 0.5,
      rumble: 0.7,
      warmth: 0.5,
    },
    {
      filterOpen: 0.7,
      kickTimbre: {
        rumbleSend: 9,
        rumbleCutoffHz: 999,
        rumbleFeedback: 9,
      },
    },
    true,
  );
  assert.equal(lastEvent(engine.rumbleSendGain.gain, "target").value, 0.14);
  assert.equal(lastEvent(engine.rumbleFilter.frequency, "target").value, 176);
  assert.equal(lastEvent(engine.rumbleFeedback.gain, "target").value, 0.58);

  engine.syncEffects(
    { space: 0.5, rumble: 0.7, warmth: 0.5 },
    {
      filterOpen: 0.7,
      echoAscent: {
        delaySteps: 3,
        feedback: 9,
        wet: 9,
      },
    },
    true,
  );
  assert.equal(
    lastEvent(engine.echoAscentLeftDelay.delayTime, "target").value,
    (60 / engine.currentTempo) * 0.75,
  );
  assert.equal(
    lastEvent(engine.echoAscentRightDelay.delayTime, "target").value,
    (60 / engine.currentTempo) * 0.75,
  );
  assert.equal(
    lastEvent(engine.echoAscentLeftFeedback.gain, "target").value,
    0.55,
  );
  assert.equal(
    lastEvent(engine.echoAscentRightFeedback.gain, "target").value,
    0.55,
  );
  assert.equal(lastEvent(engine.echoAscentWet.gain, "target").value, 0.74);

  engine.syncEffects(
    { space: 0.5, rumble: 0.7, warmth: 0.5 },
    {
      filterOpen: 0.7,
      kickTimbre: {
        rumbleSend: 0,
        rumbleCutoffHz: 120,
        rumbleFeedback: 0,
      },
    },
    true,
  );
  assert.equal(lastEvent(engine.rumbleSendGain.gain, "target").value, 0);
  assert.equal(lastEvent(engine.rumbleFeedback.gain, "target").value, 0);
});

test("live EQ applies in dB and beat-quantized cuts preserve separate gain stages", () => {
  const events = [];
  const { engine } = makeEngine((event) => events.push(event));
  engine.requestMixControl("low", -12);
  engine.requestDirectionControl("bassPresence", 1);
  engine.buildGraph();

  assert.equal(engine.lowEq.gain.value, -12);
  assert.equal(engine.midEq.gain.value, 0);
  assert.equal(engine.highEq.gain.value, 0);
  assert.ok(engine.bassPerformanceGain.gain.value > 1);
  assert.equal(engine.bassBus.gain.value, 0.96);

  engine.running = true;
  engine.bar = 2;
  engine.step = 5;
  assert.equal(engine.requestMixControl("kick", true), true);
  assert.equal(engine.mixControls.kickCut, false);
  assert.equal(engine.pendingMixCuts.kickCut, true);
  assert.deepEqual(
    events.at(-1),
    {
      type: "performance-mix",
      control: "kick",
      value: true,
      pending: true,
      applyAtBar: 2,
      applyAtStep: 8,
      mix: engine.mixControls,
    },
  );

  engine.applyPendingMixCuts(3);
  assert.equal(engine.mixControls.kickCut, true);
  assert.equal(engine.pendingMixCuts, null);
  assert.equal(
    lastEvent(engine.kickPerformanceGain.gain, "target").value,
    0.0001,
  );
  assert.equal(engine.kickBus.gain.value, 0.84);
  assert.ok(
    [engine.lowEq, engine.midEq, engine.highEq].every((filter) =>
      filter.gain.events.every((event) =>
        event.value === undefined || Number.isFinite(event.value)
      )
    ),
  );
});

test("active cuts suppress synthesis, kick ducking, and visual pulses", () => {
  const { engine } = makeEngine();
  const empty = Array(16).fill(null);
  engine.planBar = 0;
  engine.planState = {
    dominantVibe: "hypnotic",
    dominantTonality: "minor",
    vibeProgress: 0,
    tonalityProgress: 0,
  };
  engine.plan = {
    profile: { swing: 0, warmth: 0.5, metallic: 0.5, drive: 0.5 },
    movement: {
      index: 0,
      rootName: "A",
      mode: { label: "minor" },
      timbre: {
        swingBias: 0,
        clapTone: 0.5,
        hatColor: 0.5,
        rimTone: 0.5,
        filterBias: 0.5,
      },
    },
    kick: [1, ...empty.slice(1)],
    kickTimbre: {},
    lowEnd: {},
    clap: empty,
    hat: empty,
    openHat: empty,
    shaker: empty,
    ride: empty,
    rim: empty,
    metallic: empty,
    tom: empty,
    bass: [{ midi: 36, velocity: 0.7 }, ...empty.slice(1)],
    bassVoice: "sub",
    activeSynthEngines: [],
    synth: {},
    synthPalette: {},
    chord: empty,
    pad: null,
    texture: false,
    riser: false,
    downlifter: false,
    section: { kind: "DRIVE" },
    sectionProgress: 0.5,
    sectionStart: false,
    ensembleScene: null,
    councilVerdict: null,
    energy: 0.7,
  };
  engine.phraseInstrumentation = Object.freeze([]);
  let kicks = 0;
  let ducks = 0;
  let basses = 0;
  let visual = null;
  engine.kick = () => { kicks += 1; };
  engine.duck = () => { ducks += 1; };
  engine.bass = () => { basses += 1; };
  engine.queueVisual = (_time, event) => { visual = event; };
  engine.mixControls = normalizeMixControls({ kickCut: true, bassCut: true });

  engine.scheduleStep(0, 0, 1, 0.1, {});
  assert.equal(kicks, 0);
  assert.equal(ducks, 0);
  assert.equal(basses, 0);
  assert.equal(visual.kick, 0);
  assert.equal(visual.bass, 0);
});

test("kick synthesis consumes physical timbre fields and always stops finitely", () => {
  const { context, engine } = makeEngine();
  engine.kickBus = context.createGain();
  engine.noiseBuffer = context.createBuffer(1, 64);
  let registration = null;
  engine.registerVoice = (sources, nodes) => {
    registration = { sources, nodes };
    return true;
  };

  const startTime = 2;
  engine.kick(startTime, 0.88, {
    bodyHz: 49,
    pitchStartHz: 188,
    pitchDropSeconds: 0.04,
    decaySeconds: 0.54,
    clickHz: 6100,
    clickLevel: 0.13,
    drive: 3.1,
  });

  assert.ok(registration);
  assert.equal(registration.sources.length, 2);
  const oscillator = context.oscillators[0];
  const bufferSource = context.bufferSources[0];
  assert.deepEqual(oscillator.frequency.events.slice(0, 2), [
    { type: "set", value: 188, time: startTime },
    { type: "ramp", value: 49, time: startTime + 0.04 },
  ]);
  approximatelyEqual(
    oscillator.frequency.events[2].value,
    49 * 0.86,
  );
  approximatelyEqual(
    oscillator.frequency.events[2].time,
    startTime + 0.54 * 0.9,
  );
  assert.deepEqual(oscillator.stops, [[startTime + 0.58]]);
  assert.ok(oscillator.stops.flat().every(Number.isFinite));
  assert.equal(bufferSource.starts.length, 1);
  assert.ok(bufferSource.starts[0].every(Number.isFinite));
  assert.equal(context.filters[0].frequency.value, 6100);

  const bodyDrive = registration.nodes.find((node) => node.kind === "shaper");
  assert.ok(bodyDrive?.curve instanceof Float32Array);
  assert.ok(
    [...bodyDrive.curve].every(
      (sample) => Number.isFinite(sample) && Math.abs(sample) <= 1,
    ),
  );
});

test("music and bass duck independently and restore their declared bus levels", () => {
  const { context, engine } = makeEngine();
  engine.musicBus = context.createGain();
  engine.bassBus = context.createGain();
  engine.musicBus.gain.value = 1;
  engine.bassBus.gain.value = 0.96;

  engine.duck(3, 0.9, {
    musicDuckDepth: 0.5,
    bassDuckDepth: 0.72,
  });

  const musicRamps = engine.musicBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  const bassRamps = engine.bassBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  approximatelyEqual(musicRamps[0].value, 0.55);
  approximatelyEqual(musicRamps[0].time, 3.008);
  assert.equal(musicRamps[1].value, 1);
  approximatelyEqual(musicRamps[1].time, 3.14);

  approximatelyEqual(bassRamps[0].value, 0.96 * (1 - 0.72 * 0.9));
  approximatelyEqual(bassRamps[0].time, 3.006);
  assert.equal(bassRamps[1].value, 0.96);
  approximatelyEqual(bassRamps[1].time, 3.105);
  assert.ok(0.105 < 60 / 140 / 4);
  assert.ok(musicRamps[0].value > 0);
  assert.ok(bassRamps[0].value > 0);
  assert.notEqual(musicRamps[0].value, bassRamps[0].value);

  engine.musicBus.gain.events.length = 0;
  engine.bassBus.gain.events.length = 0;
  engine.duck(
    4,
    0.9,
    { musicDuckDepth: 0.5, bassDuckDepth: 0.72 },
    "pickup",
  );
  const pickupMusicRamps = engine.musicBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  const pickupBassRamps = engine.bassBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  approximatelyEqual(pickupMusicRamps[0].value, 1 - 0.5 * 0.32 * 0.9);
  approximatelyEqual(
    pickupBassRamps[0].value,
    0.96 * (1 - 0.72 * 0.32 * 0.9),
  );
  approximatelyEqual(pickupMusicRamps[1].time, 4.065);
  approximatelyEqual(pickupBassRamps[1].time, 4.055);

  engine.musicBus.gain.events.length = 0;
  engine.bassBus.gain.events.length = 0;
  engine.duck(
    5,
    0.9,
    { musicDuckDepth: 0.5, bassDuckDepth: 0.72 },
    "roll",
  );
  const rollMusicRamps = engine.musicBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  const rollBassRamps = engine.bassBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  approximatelyEqual(rollMusicRamps[0].value, 1 - 0.5 * 0.5 * 0.9);
  approximatelyEqual(
    rollBassRamps[0].value,
    0.96 * (1 - 0.72 * 0.5 * 0.9),
  );
  approximatelyEqual(rollMusicRamps[1].time, 5.085);
  approximatelyEqual(rollBassRamps[1].time, 5.075);
});

test("dense bass dynamically opens bounded space in the rumble bus", () => {
  const { context, engine } = makeEngine();
  engine.rumbleBus = context.createGain();

  engine.duckRumbleForBass(2, { rumbleBassDuckDepth: 0.62 }, 0.12);
  const ramps = engine.rumbleBus.gain.events.filter(
    (event) => event.type === "ramp",
  );
  approximatelyEqual(ramps[0].value, 0.92 * 0.38);
  approximatelyEqual(ramps[0].time, 2.005);
  approximatelyEqual(ramps[1].value, 0.92);
  approximatelyEqual(ramps[1].time, 2 + 0.12 * 0.82);

  engine.rumbleBus.gain.events.length = 0;
  engine.duckRumbleForBass(3, { rumbleBassDuckDepth: 0 }, 0.12);
  assert.equal(engine.rumbleBus.gain.events.length, 0);
});

test("acid, pulse, and both sub oscillators share bounded slide timing", () => {
  const { context, engine } = makeEngine();
  engine.bassBus = context.createGain();
  engine.musicBus = context.createGain();
  engine.delayIn = context.createGain();
  engine.reverbIn = context.createGain();
  engine.registerVoice = () => true;
  const note = {
    midi: 39,
    slideTo: 43,
    slideSteps: 2,
    length: 2,
    velocity: 0.75,
    accent: true,
  };
  const profile = {
    acid: 0.8,
    drive: 0.7,
    space: 0.4,
    warmth: 0.6,
  };
  const stepDuration = 0.12;

  engine.acidBass(1, note, stepDuration, 0.5, profile);
  engine.subBass(2, note, stepDuration, profile);
  engine.pulseBass(3, note, stepDuration, profile);

  assert.equal(context.oscillators.length, 4);
  const targetMidis = [43, 43, 55, 43];
  const startTimes = [1, 2, 2, 3];
  for (let index = 0; index < context.oscillators.length; index += 1) {
    const oscillator = context.oscillators[index];
    const ramp = oscillator.frequency.events.find(
      (event) => event.type === "ramp",
    );
    approximatelyEqual(ramp.value, midiToHz(targetMidis[index]));
    approximatelyEqual(ramp.time, startTimes[index] + 0.24);
    assert.equal(oscillator.stops.length, 1);
    const stopTime = oscillator.stops[0][0];
    assert.ok(Number.isFinite(stopTime));
    assert.ok(stopTime > ramp.time);
    assert.ok(stopTime <= startTimes[index] + 0.925);
  }
});

test("routing clamps dry, shared effects, and echo-ascent sends before connecting", () => {
  const { context, engine } = makeEngine();
  engine.bassBus = context.createGain();
  engine.musicBus = context.createGain();
  engine.kickBus = context.createGain();
  engine.rumbleBus = context.createGain();
  engine.delayIn = context.createGain();
  engine.reverbIn = context.createGain();
  engine.echoAscentIn = context.createGain();
  const output = context.createGain();

  const routes = engine.route(output, 4, 3, 2, "bass", 9);

  assert.equal(routes.length, 4);
  assert.deepEqual(
    routes.map((route) => route.gain.value),
    [1, 0.42, 0.55, 0.6],
  );
  assert.deepEqual(connectionTargets(routes[0]), [engine.bassBus]);
  assert.deepEqual(connectionTargets(routes[1]), [engine.delayIn]);
  assert.deepEqual(connectionTargets(routes[2]), [engine.reverbIn]);
  assert.deepEqual(connectionTargets(routes[3]), [engine.echoAscentIn]);
});

test("echo-ascent percussion is bright, finitely stopped, and routed only to its transition bus", () => {
  const { context, engine } = makeEngine();
  engine.musicBus = context.createGain();
  engine.delayIn = context.createGain();
  engine.reverbIn = context.createGain();
  engine.echoAscentIn = context.createGain();
  engine.noiseBuffer = context.createBuffer(1, 16_000);
  const registrations = [];
  engine.registerVoice = (sources, nodes) => {
    registrations.push({ sources, nodes });
    return true;
  };

  engine.echoAscentHit(2, {
    voice: "metallic",
    velocity: 0.28,
    brightness: 0.94,
    send: 4,
    pan: 0.48,
  });
  engine.echoAscentHit(3, {
    voice: "shaker",
    velocity: 0.12,
    brightness: 0.88,
    send: 0.3,
    pan: -0.58,
  });

  assert.equal(registrations.length, 2);
  assert.equal(registrations[0].sources.length, 4);
  assert.equal(registrations[1].sources.length, 1);
  assert.ok(
    registrations.flatMap((entry) => entry.sources).every((source) =>
      source.stops.flat().every(Number.isFinite)
    ),
  );
  assert.ok(
    registrations[1].sources[0].starts[0].every(Number.isFinite),
    "noise voices should receive finite start parameters",
  );
  assert.ok(
    registrations[1].sources[0].starts[0][2] > 0,
    "noise voices should have a finite positive playback duration",
  );
  const echoSends = registrations.flatMap((entry) =>
    entry.nodes.filter((node) =>
      connectionTargets(node).includes(engine.echoAscentIn)
    ),
  );
  assert.deepEqual(
    echoSends.map((node) => node.gain.value),
    [0.6, 0.3],
  );
  assert.ok(
    context.oscillators.every(
      (oscillator) => oscillator.frequency.value >= 2_000,
    ),
  );
});

test("advanced notes retain a small worklet message lead after scheduler stalls", () => {
  const { context, engine } = makeEngine();
  context.currentTime = 10;
  const messages = [];
  engine.synthWorkletReady = true;
  engine.synthBank = {
    port: {
      postMessage(message) {
        messages.push(message);
      },
    },
  };
  const note = {
    midi: 57,
    velocity: 0.7,
    length: 2,
    priority: 2,
    delaySend: 0.1,
    reverbSend: 0.2,
  };
  const genome = { id: "fm-test", durationScale: 1 };
  const profile = { space: 0.5 };

  engine.scheduleSynthNote("fm", 9.95, note, 0.12, genome, profile);
  engine.scheduleSynthNote("fm", 10.1, note, 0.12, genome, profile);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].startFrame, Math.round(10.05 * context.sampleRate));
  assert.equal(messages[1].startFrame, Math.round(10.1 * context.sampleRate));
  assert.ok(messages.every((message) => Number.isFinite(message.startFrame)));
});
