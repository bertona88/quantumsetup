import assert from "node:assert/strict";
import test from "node:test";

import { hash32 } from "./generative-utils.js";
import {
  TRACK_DNA_FIELDS,
  TRACK_DNA_SELECTION_MIN_CHANGED_DOMAINS,
  TRACK_DNA_SELECTION_MIN_CORE_CHANGED_DOMAINS,
  TRACK_DNA_SELECTION_MIN_DISTANCE,
  TRACK_DNA_VALUES,
  TRACK_DNA_VERSION,
  TRACK_DNA_WEIGHTS,
  createTrackDNA,
  selectDistinctTrajectorySeed,
  trackDNADistance,
} from "./track-dna.js";

function auditSeed(index, namespace = "track-dna-test") {
  return Array.from({ length: 4 }, (_, word) =>
    hash32(namespace, index, word).toString(16).padStart(8, "0"),
  ).join("");
}

function changedDomains(left, right) {
  return TRACK_DNA_FIELDS.filter((field) => left[field] !== right[field]);
}

test("track DNA is deterministic, flat, frozen, and uses compatible engine fields", () => {
  const seed = "0123456789abcdeffedcba9876543210";
  const first = createTrackDNA(seed);
  const replay = createTrackDNA(seed.toUpperCase());

  assert.deepEqual(first, replay);
  assert.equal(first.version, TRACK_DNA_VERSION);
  assert.equal(first.seedKey, seed);
  assert.equal(Object.isFrozen(first), true);
  assert.ok(
    Object.values(first).every(
      (value) =>
        value === null ||
        ["string", "number", "boolean"].includes(typeof value),
    ),
  );
  assert.ok(["acid", "sub", "pulse"].includes(first.bassVoiceBias));
  assert.ok(["fm", "modal", "string"].includes(first.foregroundEngine));
  for (const field of TRACK_DNA_FIELDS) {
    assert.ok(
      TRACK_DNA_VALUES[field].includes(first[field]),
      `${field} escaped its curated vocabulary`,
    );
  }
});

test("every categorical domain is reached with a balanced deterministic distribution", () => {
  const sampleCount = 8192;
  const counts = Object.fromEntries(
    TRACK_DNA_FIELDS.map((field) => [
      field,
      new Map(TRACK_DNA_VALUES[field].map((value) => [value, 0])),
    ]),
  );

  for (let index = 0; index < sampleCount; index += 1) {
    const dna = createTrackDNA(auditSeed(index, "track-dna-distribution"));
    for (const field of TRACK_DNA_FIELDS) {
      counts[field].set(dna[field], counts[field].get(dna[field]) + 1);
    }
  }

  for (const field of TRACK_DNA_FIELDS) {
    const expected = sampleCount / TRACK_DNA_VALUES[field].length;
    for (const [value, count] of counts[field]) {
      assert.ok(count > 0, `${field}:${value} was unreachable`);
      assert.ok(
        count >= expected * 0.88 && count <= expected * 1.12,
        `${field}:${value} was imbalanced at ${count}/${sampleCount}`,
      );
    }
  }
});

test("distance is symmetric, normalized, and weights musical domains", () => {
  const original = createTrackDNA(auditSeed(1));
  const oneField = Object.freeze({
    ...original,
    grooveFamily:
      TRACK_DNA_VALUES.grooveFamily[
        (TRACK_DNA_VALUES.grooveFamily.indexOf(original.grooveFamily) + 1) %
          TRACK_DNA_VALUES.grooveFamily.length
      ],
  });
  const allFields = Object.freeze({
    ...original,
    ...Object.fromEntries(
      TRACK_DNA_FIELDS.map((field) => {
        const values = TRACK_DNA_VALUES[field];
        return [field, values[(values.indexOf(original[field]) + 1) % values.length]];
      }),
    ),
  });

  assert.equal(trackDNADistance(original, original), 0);
  assert.equal(trackDNADistance(original, allFields), 1);
  assert.equal(
    trackDNADistance(original, oneField),
    trackDNADistance(oneField, original),
  );
  const totalWeight = Object.values(TRACK_DNA_WEIGHTS).reduce(
    (total, weight) => total + weight,
    0,
  );
  assert.equal(
    trackDNADistance(original, oneField),
    TRACK_DNA_WEIGHTS.grooveFamily / totalWeight,
  );

  for (let index = 2; index < 128; index += 1) {
    const distance = trackDNADistance(original, createTrackDNA(auditSeed(index)));
    assert.ok(distance >= 0 && distance <= 1);
    assert.equal(
      distance,
      trackDNADistance(createTrackDNA(auditSeed(index)), original),
    );
  }
});

test("distinct trajectory selection is deterministic and order independent", () => {
  const current = auditSeed(0, "track-dna-selection");
  const candidates = Array.from({ length: 16 }, (_, index) =>
    auditSeed(index + 1, "track-dna-selection"),
  );
  const selected = selectDistinctTrajectorySeed(current, candidates);
  const reversed = selectDistinctTrajectorySeed(current, [...candidates].reverse());

  assert.ok(selected);
  assert.deepEqual(selected, reversed);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.dna), true);
  assert.ok(selected.distance >= TRACK_DNA_SELECTION_MIN_DISTANCE);
  assert.ok(
    selected.changedDomains >= TRACK_DNA_SELECTION_MIN_CHANGED_DOMAINS,
  );
  assert.equal(
    selected.distance,
    Math.max(
      ...candidates
        .map((seed) => {
          const dna = createTrackDNA(seed);
          const changes = changedDomains(createTrackDNA(current), dna);
          const coreChanges = changes.filter((field) =>
            [
              "grooveFamily",
              "kickArchitecture",
              "bassBehavior",
              "harmonyBehavior",
              "formPhenotype",
            ].includes(field),
          ).length;
          const distance = trackDNADistance(current, dna);
          return changes.length >= TRACK_DNA_SELECTION_MIN_CHANGED_DOMAINS &&
            coreChanges >= TRACK_DNA_SELECTION_MIN_CORE_CHANGED_DOMAINS &&
            distance >= TRACK_DNA_SELECTION_MIN_DISTANCE
            ? distance
            : -1;
        }),
    ),
  );
  assert.equal(selectDistinctTrajectorySeed(current, [current, current]), null);
  assert.equal(selectDistinctTrajectorySeed(current, []), null);
});

test("selection rejects candidates whose novelty is only cosmetic", () => {
  const current = auditSeed(0, "track-dna-cosmetic");
  const currentDNA = createTrackDNA(current);
  let cosmeticCandidate = null;

  for (let index = 1; index < 200000; index += 1) {
    const seed = auditSeed(index, "track-dna-cosmetic");
    const candidate = createTrackDNA(seed);
    const changes = changedDomains(currentDNA, candidate);
    if (
      changes.length > 0 &&
      (changes.length < TRACK_DNA_SELECTION_MIN_CHANGED_DOMAINS ||
        trackDNADistance(currentDNA, candidate) <
          TRACK_DNA_SELECTION_MIN_DISTANCE)
    ) {
      cosmeticCandidate = seed;
      break;
    }
  }

  assert.ok(cosmeticCandidate, "expected a nearby deterministic candidate");
  assert.equal(
    selectDistinctTrajectorySeed(current, [cosmeticCandidate]),
    null,
  );
});
