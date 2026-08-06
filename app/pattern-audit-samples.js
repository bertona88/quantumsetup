import { renderCoreTrajectoryAudio } from "./audio-similarity.js?v=1.1.0-non-anchor-stems-1";

export const PATTERN_AUDIT_SAMPLES = Object.freeze([
  Object.freeze({
    id: "bass-sub-cell",
    label: "Bass — recurrent sub cell",
    seed: "d81a8d2b5a4485acdb01602b100b9ed7",
    startBar: 104,
    bars: 8,
    mix: "bass",
    note: "Representative of the most common exact active bass signature in the 96 × 192-bar audit.",
  }),
  Object.freeze({
    id: "harmony-single-stabs",
    label: "Harmony — single-stab grammar",
    seed: "6e789e6aa1b965f406c45d188009454f",
    startBar: 72,
    bars: 8,
    mix: "harmony",
    note: "A real phrase from the engine; active chord bars currently contain exactly one chord event.",
  }),
  Object.freeze({
    id: "foreground-string",
    label: "Foreground — String engine",
    seed: "6e789e6aa1b965f406c45d188009454f",
    startBar: 96,
    bars: 8,
    mix: "synth",
    note: "The advanced foreground worklet alone, with all drums, bass, harmony, and transitions muted.",
  }),
  Object.freeze({
    id: "secondary-percussion",
    label: "Secondary percussion",
    seed: "6e789e6aa1b965f406c45d188009454f",
    startBar: 24,
    bars: 8,
    mix: "secondary-percussion",
    note: "Shaker, ride, rim, metallic, and tom only; kick, clap/snare, and hats are absent.",
  }),
  Object.freeze({
    id: "restrained-echo-transition",
    label: "Transition — restrained echo ascent",
    seed: "6e789e6aa1b965f406c45d188009454f",
    startBar: 16,
    bars: 8,
    mix: "transitions",
    note: "A restrained macro variant with a resident-derived contour, including its real effects routing and tail.",
  }),
  Object.freeze({
    id: "same-phrase-non-anchors",
    label: "Same phrase — all non-anchors",
    seed: "6e789e6aa1b965f406c45d188009454f",
    startBar: 16,
    bars: 8,
    mix: "non-anchors",
    note: "Bass, harmony, foreground, secondary percussion, atmosphere, and transitions together; kick, clap/snare, and hats muted.",
  }),
]);

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function audioBufferToWav(buffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const dataBytes = frameCount * channels * bytesPerSample;
  const array = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(array);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  const channelData = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame] || 0));
      view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
      offset += bytesPerSample;
    }
  }
  return new Blob([array], { type: "audio/wav" });
}

function blobDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsDataURL(blob);
  });
}

const renderedWavs = new Map();

async function renderFixture(fixture, row) {
  const status = row.querySelector("[data-status]");
  const audio = row.querySelector("audio");
  const download = row.querySelector("[data-download]");
  status.textContent = "Rendering real engine stem…";
  row.dataset.state = "rendering";
  const rendered = await renderCoreTrajectoryAudio({
    ...fixture,
    sampleRate: 24000,
  });
  const wav = audioBufferToWav(rendered.buffer);
  renderedWavs.set(fixture.id, wav);
  const url = await blobDataUrl(wav);
  audio.src = url;
  download.href = url;
  download.download = `quantumsetup-${fixture.id}-${fixture.seed.slice(0, 8)}-bar-${fixture.startBar}.wav`;
  download.hidden = false;
  status.textContent = `${rendered.musicalSeconds.toFixed(1)} s phrase + bounded tail · 24 kHz WAV`;
  row.dataset.state = "ready";
  return Object.freeze({ ...fixture, bytes: wav.size, url });
}

async function renderAll() {
  const button = document.querySelector("#render-all");
  button.disabled = true;
  const results = [];
  try {
    for (const fixture of PATTERN_AUDIT_SAMPLES) {
      const row = document.querySelector(`[data-sample="${fixture.id}"]`);
      results.push(await renderFixture(fixture, row));
    }
    globalThis.__QUANTUM_PATTERN_SAMPLES__ = Object.freeze(results);
    document.body.dataset.renderStatus = "ready";
    document.querySelector("#save-all").disabled = false;
  } catch (error) {
    document.body.dataset.renderStatus = "error";
    globalThis.__QUANTUM_PATTERN_SAMPLE_ERROR__ = error?.stack || String(error);
    throw error;
  } finally {
    button.disabled = false;
  }
}

async function saveAll() {
  const button = document.querySelector("#save-all");
  const prior = button.textContent;
  button.disabled = true;
  try {
    for (const fixture of PATTERN_AUDIT_SAMPLES) {
      button.textContent = `Saving ${fixture.label}…`;
      const filename = `quantumsetup-${fixture.id}-${fixture.seed.slice(0, 8)}-bar-${fixture.startBar}.wav`;
      const response = await fetch(`/__capture/${filename}`, {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: renderedWavs.get(fixture.id),
      });
      if (!response.ok) throw new Error(`Capture server returned ${response.status}`);
    }
    button.textContent = "Saved to artifacts/pattern-audit";
    document.body.dataset.saveStatus = "ready";
  } catch (error) {
    button.textContent = "Local capture server unavailable";
    document.body.dataset.saveStatus = "error";
    throw error;
  } finally {
    button.disabled = false;
    setTimeout(() => {
      if (button.textContent !== prior) button.textContent = prior;
    }, 5000);
  }
}

function mount() {
  const list = document.querySelector("#samples");
  for (const fixture of PATTERN_AUDIT_SAMPLES) {
    const row = document.createElement("article");
    row.className = "sample";
    row.dataset.sample = fixture.id;
    row.innerHTML = `
      <div>
        <h2>${fixture.label}</h2>
        <p>${fixture.note}</p>
        <small>seed ${fixture.seed} · bars ${fixture.startBar}–${fixture.startBar + fixture.bars - 1}</small>
      </div>
      <audio controls preload="none"></audio>
      <div class="sample-actions">
        <span data-status>Not rendered</span>
        <a data-download hidden>Download WAV</a>
      </div>`;
    list.append(row);
  }
  document.querySelector("#render-all").addEventListener("click", renderAll);
  document.querySelector("#save-all").addEventListener("click", saveAll);
}

if (typeof document !== "undefined") mount();
