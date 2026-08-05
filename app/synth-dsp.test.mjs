import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTH_HARD_LIFETIME_SECONDS,
  createSynthVoice,
  renderSynthNote,
  renderSynthVoice,
} from "./synth-dsp.js";
import {
  SYNTH_BASE_ARCHITECTURES,
  createSynthPalette,
  synthStructuralSignature,
} from "./synth-genomes.js";
import { profileForVibe } from "./techno-model.js";

function signalStats(rendered) {
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let count = 0;
  for (const channel of [rendered.left, rendered.right]) {
    for (const sample of channel) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
      sum += sample;
      count += 1;
    }
  }
  return {
    peak,
    rms: Math.sqrt(sumSquares / Math.max(1, count)),
    dc: sum / Math.max(1, count),
  };
}

function signalDifference(first, second) {
  let difference = 0;
  for (let index = 0; index < first.left.length; index += 1) {
    difference += Math.abs(first.left[index] - second.left[index]);
    difference += Math.abs(first.right[index] - second.right[index]);
  }
  return difference;
}

function maxAdjacentDelta(channel) {
  let maximum = 0;
  for (let index = 1; index < channel.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(channel[index] - channel[index - 1]));
  }
  return maximum;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

test("all three DSP engines render finite, bounded, non-silent audio", () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    for (const [index, engine] of ["fm", "modal", "string"].entries()) {
      const palette = createSynthPalette({
        seed: 0x5157 + index,
        bar: 64,
        vibeId: "acid",
        profile: profileForVibe("acid"),
      });
      const rendered = renderSynthNote(
        {
          engine,
          genome: palette[engine],
          midi: 48 + index * 9,
          velocity: 0.78,
          startFrame: 0,
          durationFrames: Math.round(sampleRate * 0.3),
          noteSeed: 0xabc + index,
        },
        Math.round(sampleRate * 1.25),
        sampleRate,
      );
      assert.ok(rendered);
      const stats = signalStats(rendered);
      assert.ok(stats.peak > 0.001, `${engine} was silent at ${sampleRate} Hz`);
      assert.ok(stats.peak < 0.5, `${engine} exceeded the bounded peak`);
      assert.ok(stats.rms > 0.00005);
      assert.ok(Math.abs(stats.dc) < 0.02);
      assert.ok(
        rendered.hardEndFrame <= sampleRate * SYNTH_HARD_LIFETIME_SECONDS,
      );
    }
  }
});

test("FM square operators retain pulse colour without raw discontinuities", () => {
  const palette = createSynthPalette({ seed: 22, bar: 0 });
  const genome = {
    ...palette.fm,
    algorithm: "parallel",
    ratios: [1, 1, 1, 1],
    waves: ["square", "square", "square", "square"],
    levels: [1, 0.01, 0.01, 0.01],
    modulationIndex: 0.22,
    feedback: 0,
    toneHz: 11_200,
    filterQ: 0.55,
    filterEnvelope: 0.08,
    drive: 1.05,
  };
  const rendered = renderSynthNote(
    {
      engine: "fm",
      genome,
      midi: 69,
      velocity: 1,
      startFrame: 0,
      durationFrames: 12_000,
      noteSeed: 1,
    },
    12_000,
    48_000,
  );

  assert.ok(rendered);
  const stats = signalStats(rendered);
  assert.ok(stats.peak > 0.02, "rounded pulse lost its audible body");
  assert.ok(
    maxAdjacentDelta(rendered.left) < 0.01,
    "square operator exposed a raw sample discontinuity",
  );
});

test("advanced engines have bounded and comparable representative foreground peaks", () => {
  const peaks = {
    fm: [],
    modal: [],
    string: [],
  };
  const vibes = ["hypnotic", "dub", "detroit", "acid", "peak"];
  for (let seed = 0; seed < 32; seed += 1) {
    const vibeId = vibes[seed % vibes.length];
    const palette = createSynthPalette({
      seed,
      bar: seed * 8,
      vibeId,
      profile: profileForVibe(vibeId),
    });
    for (const engine of Object.keys(peaks)) {
      const rendered = renderSynthNote(
        {
          engine,
          genome: palette[engine],
          midi: 60,
          velocity: 0.66,
          startFrame: 0,
          durationFrames: 14400,
          noteSeed: seed,
        },
        72000,
        48000,
      );
      const stats = signalStats(rendered);
      assert.ok(stats.peak > 0.001, `${engine} representative was silent`);
      assert.ok(stats.peak < 0.5, `${engine} representative exceeded the peak bound`);
      peaks[engine].push(stats.peak);
    }
  }

  const medians = Object.fromEntries(
    Object.entries(peaks).map(([engine, values]) => [engine, median(values)]),
  );
  assert.ok(
    medians.string >= Math.min(medians.fm, medians.modal) * 0.75,
    `string median peak ${medians.string} was materially below FM ${medians.fm} and modal ${medians.modal}`,
  );
  assert.ok(
    medians.string <= Math.max(medians.fm, medians.modal) * 1.5,
    `string median peak ${medians.string} exceeded FM ${medians.fm} and modal ${medians.modal}`,
  );
});

test("all 208 structural forms render finite, bounded, non-silent audio", () => {
  const representatives = new Map();
  for (const vibeId of ["hypnotic", "dub", "detroit", "acid", "peak"]) {
    for (
      let bar = 0;
      bar < 8192 && representatives.size < SYNTH_BASE_ARCHITECTURES;
      bar += 8
    ) {
      const palette = createSynthPalette({
        seed: 0x51eed,
        bar,
        vibeId,
        profile: profileForVibe(vibeId),
        form: {
          phraseIndex: bar / 8,
          motifOperation: "replace",
          motifLineageId: bar / 8 + 1,
          motifMutationCount: 0,
        },
      });
      for (const engine of ["fm", "modal", "string"]) {
        const genome = palette[engine];
        const signature = synthStructuralSignature(genome);
        if (!representatives.has(signature)) {
          representatives.set(signature, genome);
        }
      }
    }
  }
  assert.equal(representatives.size, SYNTH_BASE_ARCHITECTURES);

  for (const [signature, genome] of representatives) {
    const rendered = renderSynthNote(
      {
        engine: genome.engine,
        genome,
        midi: genome.engine === "modal" ? 67 : genome.engine === "string" ? 52 : 57,
        velocity: 0.72,
        startFrame: 0,
        durationFrames: 7200,
        noteSeed: 0x208,
      },
      8192,
      48000,
    );
    assert.ok(rendered, signature);
    const stats = signalStats(rendered);
    assert.ok(stats.peak > 0.0001, `${signature} was silent`);
    assert.ok(stats.peak < 0.5, `${signature} exceeded the peak bound`);
    assert.ok(Math.abs(stats.dc) < 0.02, `${signature} exceeded the DC bound`);
  }
});

test("DSP output is sample-deterministic for an identical note genome", () => {
  const palette = createSynthPalette({
    seed: 0x1234,
    bar: 128,
    vibeId: "detroit",
    profile: profileForVibe("detroit"),
  });
  for (const engine of ["fm", "modal", "string"]) {
    const event = {
      engine,
      genome: palette[engine],
      midi: 57,
      velocity: 0.66,
      startFrame: 0,
      durationFrames: 7200,
      noteSeed: 99,
    };
    const first = renderSynthNote(event, 8192, 48000);
    const second = renderSynthNote(event, 8192, 48000);
    assert.deepEqual(first.left, second.left);
    assert.deepEqual(first.right, second.right);
  }
});

test("FM resonance and string damper controls materially change the rendered signal", () => {
  const sampleRate = 48000;
  const palette = createSynthPalette({
    seed: 0x5157,
    bar: 64,
    vibeId: "acid",
    profile: profileForVibe("acid"),
  });
  const event = {
    engine: "fm",
    midi: 57,
    velocity: 0.74,
    startFrame: 0,
    durationFrames: 9600,
    noteSeed: 71,
  };
  const lowResonance = renderSynthNote(
    { ...event, genome: { ...palette.fm, filterQ: 0.6 } },
    16000,
    sampleRate,
  );
  const highResonance = renderSynthNote(
    { ...event, genome: { ...palette.fm, filterQ: 7.5 } },
    16000,
    sampleRate,
  );
  assert.ok(signalDifference(lowResonance, highResonance) > 0.01);

  let dampedString;
  for (let seed = 0; seed < 64 && !dampedString; seed += 1) {
    const candidate = createSynthPalette({ seed, bar: 0 }).string;
    if (candidate.termination === "damped") dampedString = candidate;
  }
  assert.ok(dampedString);
  const stringEvent = {
    engine: "string",
    midi: 52,
    velocity: 0.74,
    startFrame: 0,
    durationFrames: 9600,
    noteSeed: 72,
  };
  const softDamper = renderSynthNote(
    {
      ...stringEvent,
      genome: { ...dampedString, damperStiffness: 0.05 },
    },
    16000,
    sampleRate,
  );
  const stiffDamper = renderSynthNote(
    {
      ...stringEvent,
      genome: { ...dampedString, damperStiffness: 0.9 },
    },
    16000,
    sampleRate,
  );
  assert.ok(signalDifference(softDamper, stiffDamper) > 0.01);
});

test("voices reject malformed genomes and stop at a finite hard frame", () => {
  const palette = createSynthPalette({ seed: 9, bar: 0 });
  assert.equal(
    createSynthVoice({
      engine: "fm",
      genome: { ...palette.fm, modulationIndex: Number.POSITIVE_INFINITY },
      midi: 60,
      velocity: 1,
      startFrame: 0,
      durationFrames: 1000,
      sampleRate: 48000,
    }),
    null,
  );

  for (const engine of ["fm", "modal", "string"]) {
    const voice = createSynthVoice({
      engine,
      genome: palette[engine],
      midi: 60,
      velocity: 0.7,
      startFrame: 10,
      durationFrames: 4800,
      sampleRate: 48000,
      noteSeed: 4,
    });
    assert.ok(voice);
    const scratch = new Float64Array(2);
    assert.equal(renderSynthVoice(voice, 0, scratch), true);
    assert.equal(renderSynthVoice(voice, voice.hardEndFrame, scratch), false);
    assert.deepEqual([...scratch], [0, 0]);
  }

  const shortFm = createSynthVoice({
    engine: "fm",
    genome: {
      ...palette.fm,
      attacks: [1.2, 1.2, 1.2, 1.2],
      decays: [1.2, 1.2, 1.2, 1.2],
      releases: [0.001, 0.001, 0.001, 0.001],
    },
    midi: 60,
    velocity: 0.8,
    startFrame: 0,
    durationFrames: 1200,
    sampleRate: 48000,
  });
  assert.ok(shortFm);
  const tail = new Float64Array(2);
  for (let frame = 0; frame < shortFm.hardEndFrame; frame += 1) {
    renderSynthVoice(shortFm, frame, tail);
  }
  assert.ok(Math.abs(tail[0]) + Math.abs(tail[1]) < 1e-8);
});

test("a genome fuzz scan never creates non-finite DSP state", () => {
  const scratch = new Float64Array(2);
  for (let seed = 0; seed < 48; seed += 1) {
    const palette = createSynthPalette({
      seed,
      bar: seed * 8,
      vibeId: seed % 2 ? "peak" : "dub",
      profile: profileForVibe(seed % 2 ? "peak" : "dub"),
    });
    for (const engine of ["fm", "modal", "string"]) {
      const voice = createSynthVoice({
        engine,
        genome: palette[engine],
        midi: 36 + (seed % 55),
        velocity: (seed % 11) / 10,
        startFrame: 0,
        durationFrames: 2400 + seed * 7,
        sampleRate: seed % 3 === 0 ? 44100 : seed % 3 === 1 ? 48000 : 96000,
        noteSeed: seed,
      });
      assert.ok(voice);
      for (let frame = 0; frame < 2048; frame += 1) {
        renderSynthVoice(voice, frame, scratch);
        assert.ok(Number.isFinite(scratch[0]));
        assert.ok(Number.isFinite(scratch[1]));
      }
    }
  }
});
