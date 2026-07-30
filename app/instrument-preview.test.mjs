import assert from "node:assert/strict";
import test from "node:test";

import {
  InstrumentAuditioner,
  renderInstrumentPreview,
} from "./instrument-preview.js";
import { createSynthPalette } from "./synth-genomes.js";
import { profileForVibe } from "./techno-model.js";

function stats(preview) {
  let peak = 0;
  let sumSquares = 0;
  for (const channel of [preview.left, preview.right]) {
    for (const sample of channel) {
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
    }
  }
  return {
    peak,
    rms: Math.sqrt(
      sumSquares / Math.max(1, preview.left.length + preview.right.length),
    ),
  };
}

test("all engines produce deterministic finite bounded three-note previews", () => {
  const palette = createSynthPalette({
    seed: 0x51eed,
    bar: 64,
    vibeId: "detroit",
    profile: profileForVibe("detroit"),
  });

  for (const engine of ["fm", "modal", "string"]) {
    const first = renderInstrumentPreview(palette[engine]);
    const second = renderInstrumentPreview(palette[engine]);
    assert.equal(first.sampleRate, 48000);
    assert.ok(first.durationSeconds > 0);
    assert.ok(first.durationSeconds <= 3);
    assert.equal(first.left.length, first.right.length);
    assert.ok(first.left instanceof Float32Array);
    assert.ok(first.right instanceof Float32Array);
    assert.deepEqual(first.left, second.left);
    assert.deepEqual(first.right, second.right);
    const signal = stats(first);
    assert.ok(signal.rms > 0.003, `${engine} preview was effectively silent`);
    assert.ok(signal.peak > 0.005, `${engine} preview had no audible peak`);
    assert.ok(signal.peak <= 0.240001, `${engine} preview exceeded its ceiling`);
    assert.equal(first.peak, signal.peak);
    assert.ok(Math.abs(first.rms - signal.rms) < 1e-9);
  }
});

test("preview loudness stays near-comparable across synth engines", () => {
  const rmsValues = [];
  for (const [index, engine] of ["fm", "modal", "string"].entries()) {
    const vibeId = ["hypnotic", "detroit", "dub"][index];
    const palette = createSynthPalette({
      seed: 0xa11ce + index,
      bar: 128,
      vibeId,
      profile: profileForVibe(vibeId),
    });
    rmsValues.push(renderInstrumentPreview(palette[engine]).rms);
  }
  const quietest = Math.min(...rmsValues);
  const loudest = Math.max(...rmsValues);
  assert.ok(quietest > 0);
  assert.ok(
    loudest / quietest <= 2.25,
    `preview RMS spread was ${loudest / quietest}`,
  );
});

test("preview rendering rejects invalid genomes and unsafe sample rates", () => {
  const genome = createSynthPalette({ seed: 7, bar: 0 }).fm;
  assert.throws(
    () => renderInstrumentPreview({ ...genome, drive: Number.NaN }),
    /valid deterministic synth genome/,
  );
  assert.throws(() => renderInstrumentPreview(genome, 7999), /sample rate/);
  assert.throws(() => renderInstrumentPreview(genome, 192001), /sample rate/);
});

class FakeAudioParam {
  constructor() {
    this.value = 0;
  }

  cancelScheduledValues() {}

  setValueAtTime(value) {
    this.value = value;
  }

  linearRampToValueAtTime(value) {
    this.value = value;
  }
}

class FakeNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
  }

  disconnect() {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

class FakeSource extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
    this.started = [];
    this.stopped = [];
    this.onended = null;
  }

  start(time) {
    this.started.push(time);
  }

  stop(time) {
    this.stopped.push(time);
  }
}

class FakeGain extends FakeNode {
  constructor() {
    super();
    this.gain = new FakeAudioParam();
  }
}

class FakeBuffer {
  constructor(channels, length) {
    this.channels = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
  }

  copyToChannel(values, channel) {
    this.channels[channel].set(values);
  }
}

test("browser auditioner is lazy, replaces its source, and fully closes", async () => {
  const contexts = [];
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 8000;
      this.currentTime = 1;
      this.state = "suspended";
      this.destination = new FakeNode();
      this.sources = [];
      this.closeCount = 0;
      contexts.push(this);
    }

    async resume() {
      this.state = "running";
    }

    createBufferSource() {
      const source = new FakeSource();
      this.sources.push(source);
      return source;
    }

    createGain() {
      return new FakeGain();
    }

    createBuffer(channels, length) {
      return new FakeBuffer(channels, length);
    }

    async close() {
      this.closeCount += 1;
      this.state = "closed";
    }
  }

  const palette = createSynthPalette({ seed: 11, bar: 0 });
  const auditioner = new InstrumentAuditioner({
    AudioContextClass: FakeAudioContext,
  });
  assert.equal(auditioner.active, false);
  assert.equal(contexts.length, 0);

  await auditioner.audition(palette.fm);
  assert.equal(contexts.length, 1);
  assert.equal(auditioner.active, true);
  assert.equal(contexts[0].sources.length, 1);
  assert.equal(contexts[0].sources[0].started.length, 1);

  await auditioner.audition(palette.string);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].sources.length, 2);
  assert.ok(contexts[0].sources[0].stopped.length >= 1);

  await auditioner.close();
  assert.equal(auditioner.active, false);
  assert.equal(contexts[0].state, "closed");
  assert.equal(contexts[0].closeCount, 1);
  assert.ok(contexts[0].sources[1].stopped.length >= 1);

  await auditioner.close();
  assert.equal(contexts[0].closeCount, 1);
});

test("browser auditioner waits for a prior context close before constructing another", async () => {
  const contexts = [];
  let releaseClose;
  class DelayedCloseAudioContext {
    constructor() {
      this.sampleRate = 8000;
      this.currentTime = 1;
      this.state = "suspended";
      this.destination = new FakeNode();
      this.sources = [];
      contexts.push(this);
    }

    async resume() {
      this.state = "running";
    }

    createBufferSource() {
      const source = new FakeSource();
      this.sources.push(source);
      return source;
    }

    createGain() {
      return new FakeGain();
    }

    createBuffer(channels, length) {
      return new FakeBuffer(channels, length);
    }

    async close() {
      if (this === contexts[0]) {
        await new Promise((resolve) => {
          releaseClose = resolve;
        });
      }
      this.state = "closed";
    }
  }

  const palette = createSynthPalette({ seed: 19, bar: 0 });
  const auditioner = new InstrumentAuditioner({
    AudioContextClass: DelayedCloseAudioContext,
  });
  await auditioner.audition(palette.fm);
  assert.equal(contexts.length, 1);

  const closing = auditioner.close();
  const nextAudition = auditioner.audition(palette.modal);
  await Promise.resolve();
  assert.equal(contexts.length, 1);

  releaseClose();
  await closing;
  await nextAudition;
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0].state, "closed");
  assert.equal(contexts[1].state, "running");

  await auditioner.close();
});
