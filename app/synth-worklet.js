import {
  SYNTH_QUEUE_LIMIT,
  SYNTH_VOICE_LIMIT,
  createSynthVoice,
  renderSynthVoice,
} from "./synth-dsp.js";
import { validateSynthGenome } from "./synth-genomes.js";

const GENOME_CACHE_LIMIT = 128;
const STEAL_FADE_FRAMES = 64;

class QuantumSynthBankProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.maxVoices = Math.min(
      SYNTH_VOICE_LIMIT,
      Math.max(1, options?.processorOptions?.maxVoices || SYNTH_VOICE_LIMIT),
    );
    this.genomes = new Map();
    this.queue = [];
    this.voices = [];
    this.scratch = new Float64Array(2);
    this.fadeTailLeft = new Float64Array(this.maxVoices);
    this.fadeTailRight = new Float64Array(this.maxVoices);
    this.fadeTailRemaining = new Uint16Array(this.maxVoices);
    this.lateEvents = 0;
    this.droppedEvents = 0;
    this.startedEvents = 0;
    this.lastStatsFrame = 0;
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (!message || typeof message.type !== "string") return;
    if (message.type === "define-genome") {
      if (!validateSynthGenome(message.genome)) {
        this.droppedEvents += 1;
        return;
      }
      if (this.genomes.has(message.genome.id)) {
        this.genomes.delete(message.genome.id);
      }
      this.genomes.set(message.genome.id, message.genome);
      this.trimGenomeCache();
      return;
    }
    if (message.type === "note") {
      const genome = this.genomes.get(message.genomeId);
      if (
        typeof message.genomeId !== "string" ||
        !Number.isFinite(message.startFrame) ||
        !Number.isFinite(message.durationFrames) ||
        !genome ||
        genome.engine !== message.engine ||
        this.queue.length >= SYNTH_QUEUE_LIMIT
      ) {
        this.droppedEvents += 1;
        return;
      }
      const voice = createSynthVoice({
        engine: message.engine,
        genome,
        midi: message.midi,
        velocity: message.velocity,
        startFrame: Math.max(0, Math.round(message.startFrame)),
        durationFrames: Math.max(1, Math.round(message.durationFrames)),
        noteSeed: message.noteSeed,
        priority: message.priority,
        delaySend: message.delaySend,
        reverbSend: message.reverbSend,
        sampleRate,
      });
      if (!voice) {
        this.droppedEvents += 1;
        return;
      }
      const note = { startFrame: voice.startFrame, voice };
      let insertionIndex = this.queue.length;
      while (
        insertionIndex > 0 &&
        note.startFrame < this.queue[insertionIndex - 1].startFrame
      ) {
        insertionIndex -= 1;
      }
      this.queue.splice(insertionIndex, 0, note);
      return;
    }
    if (message.type === "all-notes-off") {
      this.queue.length = 0;
      this.voices.length = 0;
      this.fadeTailRemaining.fill(0);
      this.postStats(true);
    }
  }

  trimGenomeCache() {
    if (this.genomes.size <= GENOME_CACHE_LIMIT) return;
    const protectedIds = new Set([
      ...this.voices.map((voice) => voice.genome.id),
      ...this.queue.map((event) => event.voice.genome.id),
    ]);
    for (const id of this.genomes.keys()) {
      if (protectedIds.has(id)) continue;
      this.genomes.delete(id);
      if (this.genomes.size <= GENOME_CACHE_LIMIT) return;
    }
  }

  stealVoice(priority) {
    if (this.voices.length < this.maxVoices) return;
    let victimIndex = 0;
    for (let index = 1; index < this.voices.length; index += 1) {
      const candidate = this.voices[index];
      const victim = this.voices[victimIndex];
      if (
        candidate.priority < victim.priority ||
        (candidate.priority === victim.priority &&
          candidate.startFrame < victim.startFrame)
      ) {
        victimIndex = index;
      }
    }
    if (this.voices[victimIndex].priority > priority) {
      this.droppedEvents += 1;
      return false;
    }
    this.beginStealFade(this.voices[victimIndex]);
    this.voices[victimIndex] = this.voices.at(-1);
    this.voices.pop();
    return true;
  }

  beginStealFade(voice) {
    let target = 0;
    for (let index = 1; index < this.fadeTailRemaining.length; index += 1) {
      if (this.fadeTailRemaining[index] === 0) {
        target = index;
        break;
      }
      if (this.fadeTailRemaining[index] < this.fadeTailRemaining[target]) {
        target = index;
      }
    }
    this.fadeTailLeft[target] = Number.isFinite(voice.lastOutputLeft)
      ? voice.lastOutputLeft
      : 0;
    this.fadeTailRight[target] = Number.isFinite(voice.lastOutputRight)
      ? voice.lastOutputRight
      : 0;
    this.fadeTailRemaining[target] = STEAL_FADE_FRAMES;
  }

  startEvent(event, frame) {
    const voice = event.voice;
    if (event.startFrame < frame) {
      const offset = frame - event.startFrame;
      event.startFrame = frame;
      voice.startFrame = frame;
      voice.hardEndFrame += offset;
      this.lateEvents += 1;
    }
    if (
      this.voices.length >= this.maxVoices &&
      this.stealVoice(voice.priority) === false
    ) {
      return;
    }
    this.voices.push(voice);
    this.startedEvents += 1;
  }

  postStats(force = false) {
    if (!force && currentFrame - this.lastStatsFrame < sampleRate) return;
    this.lastStatsFrame = currentFrame;
    this.port.postMessage({
      type: "stats",
      voices: this.voices.length,
      queued: this.queue.length,
      lateEvents: this.lateEvents,
      droppedEvents: this.droppedEvents,
      startedEvents: this.startedEvents,
    });
  }

  process(_inputs, outputs) {
    const dry = outputs[0];
    const delay = outputs[1];
    const reverb = outputs[2];
    const frameCount = dry?.[0]?.length || 128;
    for (const output of outputs) {
      for (const channel of output) channel.fill(0);
    }
    let queueCursor = 0;
    for (let offset = 0; offset < frameCount; offset += 1) {
      const frame = currentFrame + offset;
      while (
        queueCursor < this.queue.length &&
        this.queue[queueCursor].startFrame <= frame
      ) {
        this.startEvent(this.queue[queueCursor], frame);
        queueCursor += 1;
      }
      let left = 0;
      let right = 0;
      let delayLeft = 0;
      let delayRight = 0;
      let reverbLeft = 0;
      let reverbRight = 0;
      for (let index = this.voices.length - 1; index >= 0; index -= 1) {
        const voice = this.voices[index];
        const active = renderSynthVoice(voice, frame, this.scratch);
        voice.lastOutputLeft = this.scratch[0];
        voice.lastOutputRight = this.scratch[1];
        left += this.scratch[0];
        right += this.scratch[1];
        delayLeft += this.scratch[0] * voice.delaySend;
        delayRight += this.scratch[1] * voice.delaySend;
        reverbLeft += this.scratch[0] * voice.reverbSend;
        reverbRight += this.scratch[1] * voice.reverbSend;
        if (!active) {
          this.voices[index] = this.voices.at(-1);
          this.voices.pop();
        }
      }
      for (let index = 0; index < this.fadeTailRemaining.length; index += 1) {
        const remaining = this.fadeTailRemaining[index];
        if (remaining === 0) continue;
        const gain = remaining / STEAL_FADE_FRAMES;
        left += this.fadeTailLeft[index] * gain;
        right += this.fadeTailRight[index] * gain;
        this.fadeTailRemaining[index] = remaining - 1;
      }
      if (dry?.[0]) dry[0][offset] = Math.tanh(left * 1.24);
      if (dry?.[1]) dry[1][offset] = Math.tanh(right * 1.24);
      if (delay?.[0]) delay[0][offset] = Math.tanh(delayLeft);
      if (delay?.[1]) delay[1][offset] = Math.tanh(delayRight);
      if (reverb?.[0]) reverb[0][offset] = Math.tanh(reverbLeft);
      if (reverb?.[1]) reverb[1][offset] = Math.tanh(reverbRight);
    }
    if (queueCursor > 0) {
      for (let index = queueCursor; index < this.queue.length; index += 1) {
        this.queue[index - queueCursor] = this.queue[index];
      }
      this.queue.length -= queueCursor;
    }
    this.postStats();
    return true;
  }
}

registerProcessor("quantum-synth-bank", QuantumSynthBankProcessor);
