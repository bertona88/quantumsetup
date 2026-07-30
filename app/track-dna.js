import { hash32 } from "./generative-utils.js";

export const TRACK_DNA_VERSION = "1.0.0";

const freezeValues = (values) => Object.freeze([...values]);

export const TRACK_DNA_VALUES = Object.freeze({
  grooveFamily: freezeValues([
    "straight-pressure",
    "rolling-syncopation",
    "triplet-weave",
    "broken-machine",
    "swung-motor",
  ]),
  kickArchitecture: freezeValues([
    "short-punch",
    "deep-round",
    "click-forward",
    "saturated-tail",
    "sub-drop",
  ]),
  percussionKit: freezeValues([
    "dry-machine",
    "bright-club",
    "metallic-yard",
    "dusty-electro",
    "dub-chamber",
  ]),
  bassBehavior: freezeValues([
    "offbeat-pulse",
    "rolling-cell",
    "acid-serpent",
    "sub-sustain",
    "syncopated-stabs",
  ]),
  bassVoiceBias: freezeValues(["acid", "sub", "pulse"]),
  harmonyBehavior: freezeValues([
    "tonic-drone",
    "dub-stabs",
    "modal-turns",
    "detroit-voicings",
    "suspended-space",
  ]),
  foregroundEngine: freezeValues(["fm", "modal", "string"]),
  foregroundRole: freezeValues([
    "motor",
    "call-response",
    "counterline",
    "punctuation",
    "atmospheric-tail",
  ]),
  spectralProfile: freezeValues([
    "sub-dark",
    "warm-tilt",
    "mid-forward",
    "bright-metal",
    "open-air",
  ]),
  spatialProfile: freezeValues([
    "dry-close",
    "short-room",
    "mono-pressure",
    "dub-depth",
    "wide-haze",
  ]),
  formPhenotype: freezeValues([
    "patient-hypnosis",
    "pressure-ratchet",
    "peak-and-release",
    "negative-space",
    "machine-funk",
  ]),
});

export const TRACK_DNA_FIELDS = Object.freeze(Object.keys(TRACK_DNA_VALUES));

export const TRACK_DNA_CORE_FIELDS = Object.freeze([
  "grooveFamily",
  "kickArchitecture",
  "bassBehavior",
  "harmonyBehavior",
  "formPhenotype",
]);

export const TRACK_DNA_WEIGHTS = Object.freeze({
  grooveFamily: 1.3,
  kickArchitecture: 1.3,
  percussionKit: 0.8,
  bassBehavior: 1.3,
  bassVoiceBias: 0.8,
  harmonyBehavior: 1,
  foregroundEngine: 0.8,
  foregroundRole: 0.8,
  spectralProfile: 1,
  spatialProfile: 0.8,
  formPhenotype: 1.4,
});

export const TRACK_DNA_SELECTION_MIN_DISTANCE = 0.55;
export const TRACK_DNA_SELECTION_MIN_CHANGED_DOMAINS = 5;
export const TRACK_DNA_SELECTION_MIN_CORE_CHANGED_DOMAINS = 3;

const TRACK_DNA_WEIGHT_TOTAL = TRACK_DNA_FIELDS.reduce(
  (total, field) => total + TRACK_DNA_WEIGHTS[field],
  0,
);

function canonicalSeed(seed) {
  if (typeof seed === "string") {
    const text = seed.trim();
    if (!text) throw new TypeError("track DNA seed must not be empty");
    if (/^[0-9a-f]{32}$/i.test(text)) return text.toLowerCase();
    if (/^[0-9a-f]{1,8}$/i.test(text)) {
      return Number.parseInt(text, 16) >>> 0;
    }
    return text;
  }
  if (Number.isFinite(seed)) return Number(seed) >>> 0;
  throw new TypeError("track DNA seed must be a string or finite number");
}

function seedKeyFor(seed) {
  return typeof seed === "number"
    ? seed.toString(16).padStart(8, "0")
    : seed;
}

function selectValue(seedKey, field) {
  const values = TRACK_DNA_VALUES[field];
  return values[
    hash32(TRACK_DNA_VERSION, seedKey, field, "track-phenotype") %
      values.length
  ];
}

function isTrackDNA(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.version === TRACK_DNA_VERSION &&
      typeof value.seedKey === "string" &&
      TRACK_DNA_FIELDS.every((field) =>
        TRACK_DNA_VALUES[field].includes(value[field]),
      ),
  );
}

function asTrackDNA(value) {
  return isTrackDNA(value) ? value : createTrackDNA(value);
}

function differenceSummary(left, right) {
  let changedDomains = 0;
  let coreChangedDomains = 0;
  let changedWeight = 0;
  for (const field of TRACK_DNA_FIELDS) {
    if (left[field] === right[field]) continue;
    changedDomains += 1;
    changedWeight += TRACK_DNA_WEIGHTS[field];
    if (TRACK_DNA_CORE_FIELDS.includes(field)) coreChangedDomains += 1;
  }
  return {
    changedDomains,
    coreChangedDomains,
    distance: changedWeight / TRACK_DNA_WEIGHT_TOTAL,
  };
}

export function createTrackDNA(seed) {
  const normalizedSeed = canonicalSeed(seed);
  const seedKey = seedKeyFor(normalizedSeed);
  return Object.freeze({
    version: TRACK_DNA_VERSION,
    seedKey,
    ...Object.fromEntries(
      TRACK_DNA_FIELDS.map((field) => [
        field,
        selectValue(seedKey, field),
      ]),
    ),
  });
}

export function trackDNADistance(left, right) {
  return differenceSummary(asTrackDNA(left), asTrackDNA(right)).distance;
}

export function selectDistinctTrajectorySeed(currentSeed, candidates) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("track DNA candidates must be an array");
  }
  const currentDNA = createTrackDNA(currentSeed);
  const uniqueCandidates = new Map();
  for (const candidate of candidates) {
    const normalizedSeed = canonicalSeed(candidate);
    const dna = createTrackDNA(normalizedSeed);
    if (dna.seedKey === currentDNA.seedKey || uniqueCandidates.has(dna.seedKey)) {
      continue;
    }
    uniqueCandidates.set(dna.seedKey, {
      seed: normalizedSeed,
      dna,
      ...differenceSummary(currentDNA, dna),
    });
  }

  const eligible = [...uniqueCandidates.values()].filter(
    (candidate) =>
      candidate.distance >= TRACK_DNA_SELECTION_MIN_DISTANCE &&
      candidate.changedDomains >= TRACK_DNA_SELECTION_MIN_CHANGED_DOMAINS &&
      candidate.coreChangedDomains >=
        TRACK_DNA_SELECTION_MIN_CORE_CHANGED_DOMAINS,
  );
  if (eligible.length === 0) return null;

  eligible.sort(
    (left, right) =>
      right.distance - left.distance ||
      right.changedDomains - left.changedDomains ||
      right.coreChangedDomains - left.coreChangedDomains ||
      (hash32(
        currentDNA.seedKey,
        right.dna.seedKey,
        "track-dna-selection-tie",
      ) >>> 0) -
        (hash32(
          currentDNA.seedKey,
          left.dna.seedKey,
          "track-dna-selection-tie",
        ) >>> 0) ||
      left.dna.seedKey.localeCompare(right.dna.seedKey),
  );

  const selected = eligible[0];
  return Object.freeze({
    seed: selected.seed,
    dna: selected.dna,
    distance: selected.distance,
    changedDomains: selected.changedDomains,
  });
}
