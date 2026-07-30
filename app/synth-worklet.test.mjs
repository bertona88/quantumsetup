import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTH_QUEUE_LIMIT,
  SYNTH_VOICE_LIMIT,
} from "./synth-dsp.js";
import { createSynthPalette } from "./synth-genomes.js";

function outputs(frameCount = 128) {
  return Array.from({ length: 3 }, () => [
    new Float32Array(frameCount),
    new Float32Array(frameCount),
  ]);
}

test("worklet bank enforces queue and voice limits with clean shutdown", async () => {
  const originalProcessor = globalThis.AudioWorkletProcessor;
  const originalRegister = globalThis.registerProcessor;
  const originalSampleRate = globalThis.sampleRate;
  const originalCurrentFrame = globalThis.currentFrame;
  const posted = [];
  let Processor;

  globalThis.sampleRate = 48000;
  globalThis.currentFrame = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (message) => posted.push(message),
      };
    }
  };
  globalThis.registerProcessor = (name, constructor) => {
    assert.equal(name, "quantum-synth-bank");
    Processor = constructor;
  };

  try {
    await import(`./synth-worklet.js?test=${Date.now()}`);
    assert.equal(typeof Processor, "function");
    const processor = new Processor({
      processorOptions: { maxVoices: SYNTH_VOICE_LIMIT },
    });
    const palette = createSynthPalette({ seed: 0x51eed, bar: 0 });
    for (const engine of ["fm", "modal", "string"]) {
      processor.handleMessage({
        type: "define-genome",
        genome: palette[engine],
      });
    }

    for (let index = 0; index < SYNTH_VOICE_LIMIT; index += 1) {
      processor.handleMessage({
        type: "note",
        engine: "fm",
        genomeId: palette.fm.id,
        midi: 48 + (index % 12),
        velocity: 0.7,
        startFrame: 0,
        durationFrames: 12000,
        noteSeed: index,
        priority: 1,
      });
    }
    const first = outputs();
    processor.process([], first);
    assert.equal(processor.voices.length, SYNTH_VOICE_LIMIT);
    assert.ok(
      first.flat().every((channel) =>
        channel.every((sample) => Number.isFinite(sample)),
      ),
    );

    processor.handleMessage({
      type: "note",
      engine: "string",
      genomeId: palette.string.id,
      midi: 52,
      velocity: 0.8,
      startFrame: 128,
      durationFrames: 12000,
      noteSeed: 100,
      priority: 3,
    });
    globalThis.currentFrame = 128;
    processor.process([], outputs(1));
    assert.equal(processor.voices.length, SYNTH_VOICE_LIMIT);
    assert.ok(processor.fadeTailRemaining.some((remaining) => remaining > 0));

    processor.handleMessage({ type: "all-notes-off" });
    assert.equal(processor.voices.length, 0);
    assert.equal(processor.queue.length, 0);
    assert.ok(processor.fadeTailRemaining.every((remaining) => remaining === 0));

    const droppedBefore = processor.droppedEvents;
    for (let index = 0; index < SYNTH_QUEUE_LIMIT + 44; index += 1) {
      processor.handleMessage({
        type: "note",
        engine: "modal",
        genomeId: palette.modal.id,
        midi: 60 + (index % 8),
        velocity: 0.6,
        startFrame: 256 + index,
        durationFrames: 4800,
        noteSeed: 200 + index,
        priority: 0,
      });
    }
    assert.equal(processor.queue.length, SYNTH_QUEUE_LIMIT);
    assert.equal(processor.droppedEvents - droppedBefore, 44);

    processor.handleMessage({ type: "all-notes-off" });
    assert.equal(processor.voices.length, 0);
    assert.equal(processor.queue.length, 0);
    assert.ok(posted.some((message) => message.type === "stats"));
  } finally {
    globalThis.AudioWorkletProcessor = originalProcessor;
    globalThis.registerProcessor = originalRegister;
    globalThis.sampleRate = originalSampleRate;
    globalThis.currentFrame = originalCurrentFrame;
  }
});
