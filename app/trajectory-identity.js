import { hash32 } from "./generative-utils.js";

export const TRAJECTORY_BITS = 128;
export const TRAJECTORY_ID_PATTERN = /^[0-9a-f]{32}$/i;
export const LEGACY_SEED_PATTERN = /^[0-9a-f]{1,8}$/i;

const INITIAL_VIBES = Object.freeze([
  "hypnotic",
  "dub",
  "detroit",
  "acid",
  "peak",
]);
const INITIAL_TONALITIES = Object.freeze(["minor", "neutral", "major"]);

function fallbackTrajectoryId() {
  const now = Date.now();
  const fineTime =
    typeof performance !== "undefined" && Number.isFinite(performance.now())
      ? Math.floor(performance.now() * 1000)
      : 0;
  return Array.from({ length: 4 }, (_, index) =>
    hash32(now, fineTime, index, "trajectory-fallback")
      .toString(16)
      .padStart(8, "0"),
  ).join("");
}

export function freshTrajectoryId(cryptoSource = globalThis.crypto) {
  if (cryptoSource?.getRandomValues) {
    const words = cryptoSource.getRandomValues(new Uint32Array(4));
    return [...words]
      .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
      .join("");
  }
  return fallbackTrajectoryId();
}

export function parseTrajectoryId(value) {
  const text = String(value || "").trim();
  if (TRAJECTORY_ID_PATTERN.test(text)) return text.toLowerCase();
  if (LEGACY_SEED_PATTERN.test(text)) return Number.parseInt(text, 16) >>> 0;
  return undefined;
}

export function normalizeTrajectoryId(value) {
  if (typeof value === "string" && TRAJECTORY_ID_PATTERN.test(value)) {
    return value.toLowerCase();
  }
  if (Number.isFinite(value)) return Number(value) >>> 0;
  return undefined;
}

export function trajectoryIdForUrl(value) {
  const normalized = normalizeTrajectoryId(value);
  return typeof normalized === "string"
    ? normalized
    : (normalized >>> 0).toString(16).padStart(8, "0");
}

export function formatTrajectoryId(value) {
  const normalized = normalizeTrajectoryId(value);
  const hex =
    typeof normalized === "string"
      ? normalized.toUpperCase()
      : (normalized >>> 0).toString(16).toUpperCase().padStart(8, "0");
  if (hex.length === 32) {
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}…${hex.slice(-8, -4)}-${hex.slice(-4)}`;
  }
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function deriveInitialDirection(trajectoryId) {
  const normalized = normalizeTrajectoryId(trajectoryId);
  const seed = normalized === undefined ? 0 : normalized;
  return Object.freeze({
    vibe:
      INITIAL_VIBES[
        hash32(seed, "initial-vibe") % INITIAL_VIBES.length
      ],
    tonality:
      INITIAL_TONALITIES[
        hash32(seed, "initial-tonality") % INITIAL_TONALITIES.length
      ],
  });
}
