import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTH_ENGINE_IDS,
  createSynthCandidates,
  validateSynthGenome,
} from "./synth-genomes.js";
import {
  SIGNAL_DECK_STORAGE_KEY,
  SignalDeckModel,
  createSignalSpecimen,
} from "./signal-deck.js";
import {
  applyTasteDecision,
  normalizeTasteProfile,
  tasteScoreForGenome,
} from "./taste-model.js";
import { profileForVibe } from "./techno-model.js";

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

class ThrowingStorage {
  getItem() {
    throw new Error("storage unavailable");
  }

  setItem() {
    throw new Error("storage unavailable");
  }
}

class ReadableWriteFailingStorage extends MemoryStorage {
  setItem() {
    throw new Error("storage is read-only");
  }
}

function tasteFrom(genome, decision, count = 4) {
  let profile = normalizeTasteProfile(null);
  for (let index = 0; index < count; index += 1) {
    profile = applyTasteDecision(profile, genome, decision);
  }
  return profile;
}

test("signal specimens are deterministic, bounded, and cycle every engine and vibe", () => {
  const first = createSignalSpecimen({
    deckSeed: 0x51eed,
    cursor: 19,
    candidateCount: 80,
  });
  const second = createSignalSpecimen({
    deckSeed: 0x51eed,
    cursor: 19,
    candidateCount: 80,
  });
  assert.deepEqual(first, second);
  assert.ok(first);
  assert.ok(validateSynthGenome(first.genome));
  assert.ok(SYNTH_ENGINE_IDS.includes(first.engine));
  assert.equal(first.family.id, first.engine);
  assert.ok(first.traits.length <= 2);
  assert.ok(first.poolSize >= 1 && first.poolSize <= 8);

  const engines = new Set();
  const vibes = new Set();
  for (let cursor = 0; cursor < 15; cursor += 1) {
    const specimen = createSignalSpecimen({
      deckSeed: 0xa11ce,
      cursor,
    });
    assert.ok(specimen);
    assert.ok(validateSynthGenome(specimen.genome));
    engines.add(specimen.engine);
    vibes.add(specimen.vibeId);
  }
  assert.deepEqual([...engines].sort(), [...SYNTH_ENGINE_IDS].sort());
  assert.deepEqual(
    [...vibes].sort(),
    ["acid", "detroit", "dub", "hypnotic", "peak"],
  );
});

test("preference ranking responds to likes and passes while every fifth choice explores", () => {
  const anchor = createSynthCandidates({
    seed: 0xabc,
    engine: "fm",
    epoch: 0,
    vibeId: "hypnotic",
    profile: profileForVibe("hypnotic"),
    candidateCount: 1,
  })[0];
  const liked = tasteFrom(anchor, "like", 12);
  const passed = tasteFrom(anchor, "pass", 12);
  assert.ok(
    tasteScoreForGenome(liked, anchor) >
      tasteScoreForGenome(passed, anchor),
  );

  let preferenceChangedSelection = false;
  for (let cursor = 0; cursor < 90; cursor += 1) {
    const likedSpecimen = createSignalSpecimen({
      deckSeed: 0xdecafbad,
      cursor,
      tasteProfile: liked,
    });
    const passedSpecimen = createSignalSpecimen({
      deckSeed: 0xdecafbad,
      cursor,
      tasteProfile: passed,
    });
    if (likedSpecimen?.id !== passedSpecimen?.id) {
      preferenceChangedSelection = true;
      break;
    }
  }
  assert.equal(preferenceChangedSelection, true);

  const likedBeforeFifth = tasteFrom(anchor, "like", 4);
  const passedBeforeFifth = tasteFrom(anchor, "pass", 4);
  const likedExploration = createSignalSpecimen({
    deckSeed: 0xdecafbad,
    cursor: 7,
    tasteProfile: likedBeforeFifth,
  });
  const passedExploration = createSignalSpecimen({
    deckSeed: 0xdecafbad,
    cursor: 7,
    tasteProfile: passedBeforeFifth,
  });
  assert.equal(likedBeforeFifth.decisions, 4);
  assert.equal(likedExploration.exploration, true);
  assert.equal(passedExploration.exploration, true);
  assert.equal(likedExploration.id, passedExploration.id);
});

test("model decisions are idempotent, counted, persisted, and keep recent ids bounded", () => {
  const storage = new MemoryStorage();
  const session = new MemoryStorage();
  const model = new SignalDeckModel({
    storage,
    sessionStorage: session,
    deckSeed: 0x12345678,
  });
  const musicalSeedKeys = Object.keys(model.getSnapshot()).filter((key) =>
    /music/i.test(key),
  );
  assert.deepEqual(musicalSeedKeys, []);

  const firstId = model.currentSpecimen.id;
  const liked = model.decide(firstId, "like");
  assert.equal(liked.accepted, true);
  assert.equal(liked.previousId, firstId);
  assert.equal(model.tasteProfile.likes, 1);
  assert.equal(model.tasteProfile.passes, 0);
  assert.equal(model.tasteProfile.decisions, 1);
  assert.equal(model.getSnapshot().cursor, 1);

  const duplicate = model.decide(firstId, "like");
  assert.equal(duplicate.accepted, false);
  assert.equal(model.tasteProfile.likes, 1);
  assert.equal(model.getSnapshot().cursor, 1);
  assert.equal(model.getSnapshot().revision, 1);

  const recent = [];
  for (let index = 0; index < 48; index += 1) {
    const specimen = model.currentSpecimen;
    assert.ok(specimen);
    assert.equal(recent.slice(-24).includes(specimen.id), false);
    recent.push(specimen.id);
    const result = model.decide(
      specimen.id,
      index % 2 === 0 ? "pass" : "like",
    );
    assert.equal(result.accepted, true);
  }
  const snapshot = model.getSnapshot();
  assert.equal(snapshot.recentIds.length, 24);
  assert.equal(new Set(snapshot.recentIds).size, 24);
  assert.equal(snapshot.tasteProfile.likes, 25);
  assert.equal(snapshot.tasteProfile.passes, 24);
  assert.equal(snapshot.tasteProfile.decisions, 49);

  const persisted = JSON.parse(storage.getItem(SIGNAL_DECK_STORAGE_KEY));
  assert.equal(persisted.schemaVersion, 1);
  assert.equal(persisted.deckSeed, 0x12345678);
  assert.equal(persisted.cursor, 49);
  assert.equal(persisted.revision, 49);
  assert.equal(persisted.recentIds.length, 24);
  assert.equal(Object.hasOwn(persisted, "musicalSeed"), false);

  const reloaded = new SignalDeckModel({
    storage,
    sessionStorage: session,
    deckSeed: 0,
  });
  assert.equal(reloaded.getSnapshot().cursor, snapshot.cursor);
  assert.equal(reloaded.getSnapshot().revision, snapshot.revision);
  assert.deepEqual(reloaded.tasteProfile, snapshot.tasteProfile);
  assert.equal(reloaded.currentSpecimen.id, model.currentSpecimen.id);
  assert.equal(
    reloaded.reset({ deckSeed: snapshot.deckSeed }).revision,
    snapshot.revision + 1,
  );
});

test("schema-v1 state without a revision remains loadable", () => {
  const storage = new MemoryStorage();
  const original = new SignalDeckModel({
    storage,
    sessionStorage: new MemoryStorage(),
    deckSeed: 0x1e9ac7,
  });
  const firstId = original.currentSpecimen.id;
  assert.equal(original.decide(firstId, "like").accepted, true);
  const legacy = JSON.parse(storage.getItem(SIGNAL_DECK_STORAGE_KEY));
  delete legacy.revision;
  storage.setItem(SIGNAL_DECK_STORAGE_KEY, JSON.stringify(legacy));

  const reloaded = new SignalDeckModel({
    storage,
    sessionStorage: new MemoryStorage(),
    deckSeed: 0,
  });
  assert.equal(reloaded.getSnapshot().revision, 0);
  assert.equal(reloaded.getSnapshot().cursor, 1);
  assert.equal(reloaded.tasteProfile.likes, 1);
});

test("corrupt and oversized local state reset to a safe bounded schema", () => {
  const corrupt = new MemoryStorage([
    [SIGNAL_DECK_STORAGE_KEY, "{not-json"],
  ]);
  const model = new SignalDeckModel({
    storage: corrupt,
    sessionStorage: new MemoryStorage(),
    deckSeed: 77,
  });
  assert.equal(model.getSnapshot().deckSeed, 77);
  assert.equal(model.getSnapshot().cursor, 0);
  assert.deepEqual(model.getSnapshot().recentIds, []);
  assert.equal(model.tasteProfile.decisions, 0);

  corrupt.setItem(
    SIGNAL_DECK_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      deckSeed: 0xffffffff + 9,
      cursor: Number.MAX_SAFE_INTEGER,
      revision: Number.MAX_SAFE_INTEGER,
      recentIds: Array.from(
        { length: 80 },
        (_, index) => `fm-${String(index).padStart(8, "0")}`,
      ),
      tasteProfile: {
        schemaVersion: 1,
        weights: { brightness: 200, warmth: -200 },
        likes: Number.MAX_SAFE_INTEGER,
        passes: -20,
      },
    }),
  );
  const boundedModel = new SignalDeckModel({
    storage: corrupt,
    sessionStorage: new MemoryStorage(),
  });
  const bounded = boundedModel.getSnapshot();
  assert.equal(bounded.deckSeed, 8);
  assert.equal(bounded.cursor, 1_000_000_000);
  assert.equal(bounded.revision, 1_000_000_000);
  assert.equal(bounded.recentIds.length, 24);
  assert.ok(bounded.tasteProfile.weights.brightness <= 1);
  assert.ok(bounded.tasteProfile.weights.warmth >= -1);
  assert.ok(Number.isSafeInteger(bounded.tasteProfile.decisions));
  assert.equal(
    boundedModel.decide(boundedModel.currentSpecimen.id, "like").accepted,
    true,
  );
  assert.equal(boundedModel.getSnapshot().revision, 1_000_000_000);
});

test("storage failures use a persistent session adapter", () => {
  const session = new MemoryStorage();
  const first = new SignalDeckModel({
    storage: new ThrowingStorage(),
    sessionStorage: session,
    deckSeed: 0xbeef,
  });
  assert.equal(first.storageMode, "session");
  const firstId = first.currentSpecimen.id;
  assert.equal(first.decide(firstId, "like").accepted, true);
  assert.ok(session.getItem(SIGNAL_DECK_STORAGE_KEY));

  const second = new SignalDeckModel({
    storage: new ThrowingStorage(),
    sessionStorage: session,
    deckSeed: 0,
  });
  assert.equal(second.storageMode, "session");
  assert.equal(second.getSnapshot().deckSeed, 0xbeef);
  assert.equal(second.getSnapshot().cursor, 1);
  assert.equal(second.tasteProfile.likes, 1);
  assert.equal(second.currentSpecimen.id, first.currentSpecimen.id);
});

test("newer session fallback wins when readable local state became stale", () => {
  const writableLocal = new MemoryStorage();
  const bootstrap = new SignalDeckModel({
    storage: writableLocal,
    sessionStorage: new MemoryStorage(),
    deckSeed: 0x51a1e,
  });
  const staleLocalValue = writableLocal.getItem(SIGNAL_DECK_STORAGE_KEY);
  assert.equal(bootstrap.getSnapshot().revision, 0);

  const readOnlyLocal = new ReadableWriteFailingStorage([
    [SIGNAL_DECK_STORAGE_KEY, staleLocalValue],
  ]);
  const session = new MemoryStorage();
  const first = new SignalDeckModel({
    storage: readOnlyLocal,
    sessionStorage: session,
    deckSeed: 0,
  });
  const firstId = first.currentSpecimen.id;
  assert.equal(first.decide(firstId, "like").accepted, true);
  assert.equal(first.storageMode, "session");
  assert.equal(first.getSnapshot().revision, 1);
  assert.equal(
    JSON.parse(readOnlyLocal.getItem(SIGNAL_DECK_STORAGE_KEY)).revision,
    0,
  );
  assert.equal(
    JSON.parse(session.getItem(SIGNAL_DECK_STORAGE_KEY)).revision,
    1,
  );

  const reloaded = new SignalDeckModel({
    storage: readOnlyLocal,
    sessionStorage: session,
    deckSeed: 0,
  });
  assert.equal(reloaded.storageMode, "session");
  assert.equal(reloaded.getSnapshot().revision, 1);
  assert.equal(reloaded.getSnapshot().cursor, 1);
  assert.equal(reloaded.tasteProfile.likes, 1);
  assert.equal(reloaded.currentSpecimen.id, first.currentSpecimen.id);
});
