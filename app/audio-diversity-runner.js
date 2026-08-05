import {
  AUDIO_STRUCTURE_MIN_DISTANCE,
  audioStructuralDistance,
  extractAudioStructure,
  renderCoreTrajectoryAudio,
} from "./audio-similarity.js?v=1.1.0-total-variation-1";

export const AUDIO_AUDIT_SEEDS = Object.freeze([
  "00000000000000000000000000000001",
  "00000000000000000000000000000002",
  "00000000000000000000000000000003",
  "0123456789abcdeffedcba9876543210",
  "11111111111111111111111111111111",
  "55555555555555555555555555555555",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "deadbeefdeadbeefdeadbeefdeadbeef",
  "fedcba98765432100123456789abcdef",
  "ffffffffffffffffffffffffffffffff",
]);

function rounded(value) {
  return Number(value.toFixed(6));
}

export async function runRenderedAudioDiversityAudit({
  seeds = AUDIO_AUDIT_SEEDS,
  bars = 4,
  sampleRate = 16000,
  threshold = AUDIO_STRUCTURE_MIN_DISTANCE,
  onProgress = () => {},
} = {}) {
  const summaries = [];
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index];
    onProgress({ seed, index, count: seeds.length, stage: "full" });
    const full = await renderCoreTrajectoryAudio({
      seed,
      bars,
      sampleRate,
      mix: "full",
    });
    onProgress({ seed, index, count: seeds.length, stage: "bass" });
    const bass = await renderCoreTrajectoryAudio({
      seed,
      bars,
      sampleRate,
      mix: "bass",
    });
    summaries.push(Object.freeze({
      seed,
      full: extractAudioStructure(full.buffer, sampleRate, {
        stepDuration: full.stepDuration,
      }),
      bass: extractAudioStructure(bass.buffer, sampleRate, {
        stepDuration: bass.stepDuration,
      }),
    }));
  }

  const comparisons = [];
  for (let left = 0; left < summaries.length; left += 1) {
    for (let right = left + 1; right < summaries.length; right += 1) {
      const fullDistance = audioStructuralDistance(
        summaries[left].full,
        summaries[right].full,
      );
      const bassDistance = audioStructuralDistance(
        summaries[left].bass,
        summaries[right].bass,
      );
      comparisons.push(Object.freeze({
        left: summaries[left].seed,
        right: summaries[right].seed,
        fullDistance: rounded(fullDistance),
        bassDistance: rounded(bassDistance),
        distance: rounded(fullDistance * 0.42 + bassDistance * 0.58),
      }));
    }
  }
  comparisons.sort((left, right) => left.distance - right.distance);
  const nearest = comparisons[0] || null;
  return Object.freeze({
    passed: Boolean(nearest && nearest.distance >= threshold),
    threshold,
    bars,
    sampleRate,
    seedCount: seeds.length,
    pairCount: comparisons.length,
    nearest,
    suspiciousPairs: Object.freeze(
      comparisons.filter(({ distance }) => distance < threshold),
    ),
    comparisons: Object.freeze(comparisons),
  });
}

async function runPageAudit() {
  const output = document.querySelector("#audio-audit-output");
  if (!output) return;
  const parameters = new URLSearchParams(location.search);
  const bars = Math.max(1, Math.min(8, Number(parameters.get("bars")) || 4));
  const seedCount = Math.max(
    2,
    Math.min(AUDIO_AUDIT_SEEDS.length, Number(parameters.get("seeds")) || 10),
  );
  try {
    const report = await runRenderedAudioDiversityAudit({
      bars,
      seeds: AUDIO_AUDIT_SEEDS.slice(0, seedCount),
      onProgress({ seed, index, count, stage }) {
        output.textContent = `Rendering ${index + 1}/${count} ${stage}: ${seed}`;
      },
    });
    document.body.dataset.auditStatus = report.passed ? "passed" : "failed";
    globalThis.__QUANTUM_AUDIO_AUDIT__ = report;
    output.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    document.body.dataset.auditStatus = "error";
    output.textContent = error?.stack || error?.message || String(error);
  }
}

if (typeof document !== "undefined") runPageAudit();
