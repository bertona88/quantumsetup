import { hash32 } from "./generative-utils.js";
import {
  SYNTH_ENGINE_DEFINITIONS,
  SYNTH_ENGINE_IDS,
  createSynthCandidates,
  validateSynthGenome,
} from "./synth-genomes.js";
import {
  applyTasteDecision,
  normalizeTasteProfile,
  tasteScoreForGenome,
  tasteStrength,
  tasteTraitLabels,
} from "./taste-model.js";
import { profileForVibe } from "./techno-model.js";

export const SIGNAL_DECK_STORAGE_KEY = "quantumsetup.signalDeck.v1";

const SIGNAL_DECK_SCHEMA_VERSION = 1;
const MAX_CANDIDATES = 8;
const MAX_RECENT_IDS = 24;
const MAX_CURSOR = 1_000_000_000;
const MAX_STATE_REVISION = 1_000_000_000;
const MAX_ID_LENGTH = 96;
const EXPLORATION_INTERVAL = 5;
const VIBE_IDS = Object.freeze([
  "hypnotic",
  "dub",
  "detroit",
  "acid",
  "peak",
]);
const ENGINE_DEFINITIONS = new Map(
  SYNTH_ENGINE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const sessionMemory = new Map();
const sessionMemoryStorage = Object.freeze({
  getItem(key) {
    return sessionMemory.has(key) ? sessionMemory.get(key) : null;
  },
  setItem(key, value) {
    sessionMemory.set(key, String(value));
  },
  removeItem(key) {
    sessionMemory.delete(key);
  },
});

function clampInteger(value, minimum, maximum, fallback = minimum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function safeGlobalStorage(name) {
  try {
    const storage = globalThis?.[name];
    return isStorageAdapter(storage) ? storage : null;
  } catch {
    return null;
  }
}

function isStorageAdapter(value) {
  return Boolean(
    value &&
      typeof value.getItem === "function" &&
      typeof value.setItem === "function",
  );
}

function freshDeckSeed() {
  try {
    if (globalThis.crypto?.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    }
  } catch {
    // A deterministic coordinate is persisted immediately after this fallback.
  }
  return hash32(
    "signal-deck",
    Date.now(),
    typeof performance === "object" ? performance.now() * 1000 : 0,
  );
}

function normalizeRecentIds(value) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set();
  const reversed = [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const id = source[index];
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > MAX_ID_LENGTH ||
      seen.has(id)
    ) {
      continue;
    }
    seen.add(id);
    reversed.push(id);
    if (reversed.length >= MAX_RECENT_IDS) break;
  }
  return Object.freeze(reversed.reverse());
}

function freezeState({
  deckSeed,
  cursor,
  revision,
  recentIds,
  tasteProfile,
}) {
  return Object.freeze({
    schemaVersion: SIGNAL_DECK_SCHEMA_VERSION,
    deckSeed: deckSeed >>> 0,
    cursor: clampInteger(cursor, 0, MAX_CURSOR, 0),
    revision: clampInteger(revision, 0, MAX_STATE_REVISION, 0),
    recentIds: normalizeRecentIds(recentIds),
    tasteProfile: normalizeTasteProfile(tasteProfile),
  });
}

function nextRevision(revision) {
  return Math.min(
    MAX_STATE_REVISION,
    clampInteger(revision, 0, MAX_STATE_REVISION, 0) + 1,
  );
}

function createEmptyState(deckSeed = freshDeckSeed(), revision = 0) {
  return freezeState({
    deckSeed,
    cursor: 0,
    revision,
    recentIds: [],
    tasteProfile: normalizeTasteProfile(null),
  });
}

function parseState(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 32_768) {
    return null;
  }
  try {
    const value = JSON.parse(text);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      value.schemaVersion !== SIGNAL_DECK_SCHEMA_VERSION ||
      !Number.isFinite(value.deckSeed)
    ) {
      return null;
    }
    return freezeState({
      deckSeed: value.deckSeed,
      cursor: value.cursor,
      revision: value.revision,
      recentIds: value.recentIds,
      tasteProfile: value.tasteProfile,
    });
  } catch {
    return null;
  }
}

function serializedState(state) {
  return JSON.stringify({
    schemaVersion: SIGNAL_DECK_SCHEMA_VERSION,
    deckSeed: state.deckSeed,
    cursor: state.cursor,
    revision: state.revision,
    recentIds: [...state.recentIds],
    tasteProfile: state.tasteProfile,
  });
}

class StorageBridge {
  constructor(primary, session) {
    this.primary = isStorageAdapter(primary) ? primary : null;
    this.session = isStorageAdapter(session)
      ? session
      : sessionMemoryStorage;
    this.mode = this.primary ? "local" : "session";
    this.primaryReadable = Boolean(this.primary);
  }

  read(storage, key) {
    if (!storage) return { ok: false, value: null };
    try {
      const value = storage.getItem(key);
      return {
        ok: true,
        value: typeof value === "string" ? value : null,
      };
    } catch {
      return { ok: false, value: null };
    }
  }

  load(key) {
    const primary = this.read(this.primary, key);
    this.primaryReadable = primary.ok;
    const session = this.read(this.session, key);
    return { primary, session };
  }

  selectMode(mode) {
    this.mode = mode === "local" && this.primaryReadable ? "local" : "session";
  }

  save(key, value) {
    if (this.mode === "local" && this.primary) {
      try {
        this.primary.setItem(key, value);
        return true;
      } catch {
        this.mode = "session";
      }
    }
    try {
      this.session.setItem(key, value);
      this.mode = "session";
      return true;
    } catch {
      return false;
    }
  }
}

function candidateUnit(...coordinates) {
  return (hash32(...coordinates) >>> 0) / 4_294_967_295;
}

function traitsForGenome(genome) {
  let probe = normalizeTasteProfile(null);
  for (let index = 0; index < 3; index += 1) {
    probe = applyTasteDecision(probe, genome, "like");
  }
  return tasteTraitLabels(probe, 2);
}

function scoreCandidates({
  candidates,
  deckSeed,
  cursor,
  tasteProfile,
  exploration,
}) {
  const strength = tasteStrength(tasteProfile);
  return candidates
    .map((genome) => {
      const explorationScore =
        candidateUnit(deckSeed, cursor, genome.id, "signal-explore") * 2 - 1;
      const preferenceScore =
        tasteScoreForGenome(tasteProfile, genome) * strength;
      const score = exploration
        ? explorationScore
        : Math.max(
            -1,
            Math.min(
              1,
              preferenceScore +
                explorationScore * (1 - strength) * 0.16,
            ),
          );
      return { genome, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.genome.id.localeCompare(right.genome.id),
    );
}

export function createSignalSpecimen({
  deckSeed,
  cursor = 0,
  recentIds = [],
  tasteProfile = null,
  candidateCount = MAX_CANDIDATES,
} = {}) {
  const safeDeckSeed = Number.isFinite(deckSeed)
    ? deckSeed >>> 0
    : hash32("signal-deck-default");
  const safeCursor = clampInteger(cursor, 0, MAX_CURSOR, 0);
  const engineIndex = safeCursor % SYNTH_ENGINE_IDS.length;
  const vibeIndex =
    Math.floor(safeCursor / SYNTH_ENGINE_IDS.length) % VIBE_IDS.length;
  const engine = SYNTH_ENGINE_IDS[engineIndex];
  const vibeId = VIBE_IDS[vibeIndex];
  const epoch = Math.floor(
    safeCursor / (SYNTH_ENGINE_IDS.length * VIBE_IDS.length),
  );
  const count = clampInteger(candidateCount, 1, MAX_CANDIDATES, MAX_CANDIDATES);
  const poolSeed = hash32(
    safeDeckSeed,
    safeCursor,
    engine,
    vibeId,
    "signal-pool",
  );
  const seen = new Set(normalizeRecentIds(recentIds));
  const candidateIds = new Set();
  const candidates = createSynthCandidates({
    seed: poolSeed,
    engine,
    epoch,
    vibeId,
    profile: profileForVibe(vibeId),
    candidateCount: count,
  }).filter((genome) => {
    if (
      !validateSynthGenome(genome) ||
      seen.has(genome.id) ||
      candidateIds.has(genome.id)
    ) {
      return false;
    }
    candidateIds.add(genome.id);
    return true;
  });
  if (candidates.length === 0) return null;

  const taste = normalizeTasteProfile(tasteProfile);
  const decisionOrdinal = taste.decisions + 1;
  const exploration =
    decisionOrdinal > 0 && decisionOrdinal % EXPLORATION_INTERVAL === 0;
  const selected = scoreCandidates({
    candidates,
    deckSeed: safeDeckSeed,
    cursor: safeCursor,
    tasteProfile: taste,
    exploration,
  })[0];
  const family =
    ENGINE_DEFINITIONS.get(selected.genome.engine) ||
    Object.freeze({
      id: selected.genome.engine,
      label: selected.genome.engine.toUpperCase(),
      detail: "SYNTH",
    });

  return Object.freeze({
    id: selected.genome.id,
    cursor: safeCursor,
    engine: selected.genome.engine,
    family,
    vibeId,
    vibeLabel: profileForVibe(vibeId).label,
    label: selected.genome.label,
    detail: selected.genome.detail,
    traits: traitsForGenome(selected.genome),
    exploration,
    poolSize: candidates.length,
    score: selected.score,
    genome: selected.genome,
  });
}

function nextCursorState(state) {
  if (state.cursor < MAX_CURSOR) {
    return { deckSeed: state.deckSeed, cursor: state.cursor + 1 };
  }
  return {
    deckSeed: hash32(state.deckSeed, "signal-deck-rollover"),
    cursor: 0,
  };
}

export class SignalDeckModel {
  constructor({
    storage = safeGlobalStorage("localStorage"),
    sessionStorage = safeGlobalStorage("sessionStorage"),
    storageKey = SIGNAL_DECK_STORAGE_KEY,
    deckSeed,
    candidateCount = MAX_CANDIDATES,
  } = {}) {
    this.storageKey =
      typeof storageKey === "string" && storageKey.length > 0
        ? storageKey.slice(0, 160)
        : SIGNAL_DECK_STORAGE_KEY;
    this.candidateCount = clampInteger(
      candidateCount,
      1,
      MAX_CANDIDATES,
      MAX_CANDIDATES,
    );
    this.storage = new StorageBridge(
      storage,
      sessionStorage || sessionMemoryStorage,
    );
    const loaded = this.storage.load(this.storageKey);
    const primaryState = parseState(loaded.primary.value);
    const sessionState = parseState(loaded.session.value);
    if (
      primaryState &&
      (!sessionState || primaryState.revision >= sessionState.revision)
    ) {
      this.storage.selectMode("local");
      this.state = primaryState;
    } else if (sessionState) {
      this.storage.selectMode("session");
      this.state = sessionState;
    } else {
      this.storage.selectMode(loaded.primary.ok ? "local" : "session");
      this.state = createEmptyState(
        Number.isFinite(deckSeed) ? deckSeed >>> 0 : freshDeckSeed(),
      );
      this.persist();
    }
    this.current = this.createCurrent();
  }

  createCurrent() {
    let state = this.state;
    for (let attempts = 0; attempts <= MAX_RECENT_IDS; attempts += 1) {
      const specimen = createSignalSpecimen({
        deckSeed: state.deckSeed,
        cursor: state.cursor,
        recentIds: state.recentIds,
        tasteProfile: state.tasteProfile,
        candidateCount: this.candidateCount,
      });
      if (specimen) {
        if (state !== this.state) {
          this.state = state;
          this.persist();
        }
        return specimen;
      }
      const next = nextCursorState(state);
      state = freezeState({
        ...state,
        ...next,
        revision: nextRevision(state.revision),
      });
    }
    return null;
  }

  persist() {
    return this.storage.save(this.storageKey, serializedState(this.state));
  }

  get storageMode() {
    return this.storage.mode;
  }

  get currentSpecimen() {
    return this.current;
  }

  get tasteProfile() {
    return this.state.tasteProfile;
  }

  getSnapshot() {
    return Object.freeze({
      schemaVersion: SIGNAL_DECK_SCHEMA_VERSION,
      deckSeed: this.state.deckSeed,
      cursor: this.state.cursor,
      revision: this.state.revision,
      recentIds: this.state.recentIds,
      tasteProfile: this.state.tasteProfile,
      storageMode: this.storageMode,
      current: this.current,
    });
  }

  decide(expectedId, decision) {
    const normalizedDecision =
      typeof decision === "string" ? decision.toLowerCase() : "";
    if (
      !this.current ||
      expectedId !== this.current.id ||
      !["like", "pass"].includes(normalizedDecision)
    ) {
      return Object.freeze({
        accepted: false,
        decision: null,
        previousId: null,
        current: this.current,
        snapshot: this.getSnapshot(),
      });
    }

    const previous = this.current;
    const tasteProfile = applyTasteDecision(
      this.state.tasteProfile,
      previous.genome,
      normalizedDecision,
    );
    const recentIds = normalizeRecentIds([
      ...this.state.recentIds,
      previous.id,
    ]);
    const next = nextCursorState(this.state);
    this.state = freezeState({
      ...this.state,
      ...next,
      revision: nextRevision(this.state.revision),
      recentIds,
      tasteProfile,
    });
    this.persist();
    this.current = this.createCurrent();

    return Object.freeze({
      accepted: true,
      decision: normalizedDecision,
      previousId: previous.id,
      current: this.current,
      snapshot: this.getSnapshot(),
    });
  }

  reset({ deckSeed = this.state.deckSeed } = {}) {
    this.state = createEmptyState(
      Number.isFinite(deckSeed) ? deckSeed >>> 0 : this.state.deckSeed,
      nextRevision(this.state.revision),
    );
    this.persist();
    this.current = this.createCurrent();
    return this.getSnapshot();
  }
}
