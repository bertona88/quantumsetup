import { renderCoreTrajectoryAudio } from "/app/audio-similarity.js?v=1.2.0-reference-listener-4";

const ALL_FIXTURES = Object.freeze([
  Object.freeze({ seed: "00000000000000000000000000000001", startBar: 32, bars: 32, mix: "full" }),
  Object.freeze({ seed: "00000000000000000000000000000001", startBar: 128, bars: 32, mix: "full" }),
  Object.freeze({ seed: "6e789e6aa1b965f406c45d188009454f", startBar: 32, bars: 32, mix: "full" }),
  Object.freeze({ seed: "6e789e6aa1b965f406c45d188009454f", startBar: 128, bars: 32, mix: "full" }),
  Object.freeze({ seed: "d81a8d2b5a4485acdb01602b100b9ed7", startBar: 32, bars: 32, mix: "full" }),
  Object.freeze({ seed: "d81a8d2b5a4485acdb01602b100b9ed7", startBar: 128, bars: 32, mix: "full" }),
  Object.freeze({ seed: "00000001000000000000000000000000", startBar: 32, bars: 32, mix: "full" }),
  Object.freeze({ seed: "00000001000000000000000000000000", startBar: 128, bars: 32, mix: "full" }),
  ...[32, 128].flatMap((startBar) =>
    [
      "bass",
      "drums",
      "non-anchors",
      "harmony",
      "synth",
      "secondary-percussion",
    ].map((mix) =>
      Object.freeze({
        seed: "d81a8d2b5a4485acdb01602b100b9ed7",
        startBar,
        bars: 32,
        mix,
      }),
    ),
  ),
]);
const only = new URLSearchParams(location.search).get("only");
let selectedFixtures = [...ALL_FIXTURES];
if (only === "patient") {
  selectedFixtures = ALL_FIXTURES.filter((fixture) =>
    fixture.seed.startsWith("00000001"),
  );
} else if (only === "detail") {
  selectedFixtures = ALL_FIXTURES.filter(
    (fixture) => fixture.mix === "secondary-percussion",
  );
} else if (only === "full") {
  selectedFixtures = ALL_FIXTURES.filter((fixture) => fixture.mix === "full");
} else if (only === "components") {
  selectedFixtures = ALL_FIXTURES.filter((fixture) => fixture.mix !== "full");
}
const FIXTURES = Object.freeze(selectedFixtures);

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function audioBufferToWav(buffer) {
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
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
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

function filenameFor(fixture) {
  return `quantumsetup-${fixture.seed.slice(0, 8)}-bar-${fixture.startBar}-${fixture.mix}.wav`;
}

async function renderAndSave(fixture, row) {
  row.querySelector("small").textContent = "Rendering…";
  const rendered = await renderCoreTrajectoryAudio({
    ...fixture,
    sampleRate: 24_000,
  });
  const wav = audioBufferToWav(rendered.buffer);
  const filename = filenameFor(fixture);
  const response = await fetch(`/__reference_capture/${filename}`, {
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: wav,
  });
  if (!response.ok) throw new Error(`Capture failed with ${response.status}`);
  row.querySelector("audio").src = URL.createObjectURL(wav);
  row.querySelector("small").textContent = `${rendered.musicalSeconds.toFixed(1)} s · ${(wav.size / 1_048_576).toFixed(1)} MiB`;
  return Object.freeze({ ...fixture, sampleRate: 24_000, filename, bytes: wav.size });
}

function mount() {
  const container = document.querySelector("#captures");
  const rows = FIXTURES.map((fixture) => {
    const row = document.createElement("article");
    row.innerHTML = `<strong>seed ${fixture.seed.slice(0, 8)} · bars ${fixture.startBar}–${fixture.startBar + fixture.bars - 1} · ${fixture.mix}</strong><br><small>Pending</small><audio controls preload="none"></audio>`;
    container.append(row);
    return row;
  });
  document.querySelector("#capture-all").addEventListener("click", async (event) => {
    const captureButton = event.currentTarget;
    captureButton.disabled = true;
    const status = document.querySelector("#status");
    const manifest = [];
    try {
      for (let index = 0; index < FIXTURES.length; index += 1) {
        status.textContent = `Capture ${index + 1} of ${FIXTURES.length}`;
        manifest.push(await renderAndSave(FIXTURES[index], rows[index]));
      }
      const response = await fetch("/__reference_manifest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schema: "quantumsetup.reference-captures.v1", fixtures: manifest }, null, 2),
      });
      if (!response.ok) throw new Error(`Manifest failed with ${response.status}`);
      document.body.dataset.captureStatus = "ready";
      globalThis.__REFERENCE_CAPTURES__ = Object.freeze(manifest);
      status.textContent = `${manifest.length} real-engine captures saved`;
    } catch (error) {
      document.body.dataset.captureStatus = "error";
      globalThis.__REFERENCE_CAPTURE_ERROR__ = error?.stack || String(error);
      status.textContent = error?.message || String(error);
      throw error;
    } finally {
      captureButton.disabled = false;
    }
  });
}

mount();
