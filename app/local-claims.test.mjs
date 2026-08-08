import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import {
  LOCAL_CLAIMS_STORAGE_KEY,
  canonicalLocalMomentPayload,
  createLocalClaimLedger,
  localTokenCodeForMoment,
} from "./local-claims.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function moment(overrides = {}) {
  return {
    trajectoryId: "0123456789abcdef",
    generatorVersion: "2.4.0",
    bar: 72,
    step: 9,
    phraseFingerprint: "phrase:72:ABCD",
    coreSignature: "core:rolling-open",
    sceneId: "acid-relay",
    instrumentation: ["string-reply", "matrix-call", "matrix-call"],
    materialSummary: "rolling bass / open-hat tail / acid relay",
    ...overrides,
  };
}

test("an installation identity is random once and persists in local storage", () => {
  const storage = new MemoryStorage();
  let randomCalls = 0;
  const crypto = {
    subtle: webcrypto.subtle,
    getRandomValues(bytes) {
      randomCalls += 1;
      bytes.fill(0x2a);
      return bytes;
    },
  };

  const first = createLocalClaimLedger({ storage, crypto }).installationId();
  const second = createLocalClaimLedger({ storage, crypto }).installationId();

  assert.equal(first, "install_2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a");
  assert.equal(second, first);
  assert.equal(randomCalls, 1);
});

test("canonical payloads include musical coordinates but not claim time", () => {
  const payload = canonicalLocalMomentPayload({
    generator: "2.4.0",
    trajectory: "trajectory-7",
    bar: 12.9,
    step: 18,
    material: {
      scene: "relay",
      fingerprint: "phrase:12:ABCD",
      coreSignature: "core:12:WXYZ",
      gesture: "displace",
    },
    instrumentation: [
      { id: "string-reply" },
      { id: "matrix-call" },
      { id: "string-reply" },
    ],
    claimedAt: "not part of the musical moment",
  });

  assert.deepEqual(JSON.parse(payload), {
    trajectoryId: "trajectory-7",
    generatorVersion: "2.4.0",
    bar: 12,
    step: 15,
    phraseFingerprint: "phrase:12:ABCD",
    coreSignature: "core:12:WXYZ",
    sceneId: "relay",
    instrumentation: ["matrix-call", "string-reply"],
    materialSummary: "phrase:12:ABCD / displace / relay",
  });
  assert.doesNotMatch(payload, /claimedAt/);
});

test("one-tap claims are idempotent and preserve their first timestamp", async () => {
  const storage = new MemoryStorage();
  let clockCalls = 0;
  const ledger = createLocalClaimLedger({
    storage,
    crypto: webcrypto,
    now: () => {
      clockCalls += 1;
      return Date.UTC(2026, 7, 8, 1, clockCalls, 0);
    },
  });

  const first = await ledger.claimMoment(moment());
  const second = await ledger.claimMoment(moment());

  assert.deepEqual(second, first);
  assert.equal(clockCalls, 1);
  assert.equal(ledger.listClaims().length, 1);
  assert.equal(first.scope, "device-local");
  assert.equal(first.persistence, "device");
  assert.equal(first.claimedAt, "2026-08-08T01:01:00.000Z");
  assert.match(first.tokenCode, /^LOCAL-[A-Z2-7]{16}$/);
  assert.deepEqual(first.moment, {
    trajectoryId: "0123456789abcdef",
    generatorVersion: "2.4.0",
    bar: 72,
    step: 9,
    phraseFingerprint: "phrase:72:ABCD",
    coreSignature: "core:rolling-open",
    sceneId: "acid-relay",
    instrumentation: ["matrix-call", "string-reply"],
    materialSummary: "rolling bass / open-hat tail / acid relay",
  });
});

test("tokens are deterministic per installation and moment", async () => {
  const firstInstallation = "install_11111111111111111111111111111111";
  const secondInstallation = "install_22222222222222222222222222222222";

  const first = await localTokenCodeForMoment(
    firstInstallation,
    moment(),
    webcrypto,
  );
  const repeat = await localTokenCodeForMoment(
    firstInstallation,
    moment(),
    webcrypto,
  );
  const anotherMoment = await localTokenCodeForMoment(
    firstInstallation,
    moment({ step: 10 }),
    webcrypto,
  );
  const anotherInstallation = await localTokenCodeForMoment(
    secondInstallation,
    moment(),
    webcrypto,
  );

  assert.equal(repeat, first);
  assert.notEqual(anotherMoment, first);
  assert.notEqual(anotherInstallation, first);
});

test("instrument order is canonical while a different combination changes the token", async () => {
  const installation = "install_11111111111111111111111111111111";
  const first = await localTokenCodeForMoment(
    installation,
    moment({ instrumentation: ["kick", "bass", "matrix"] }),
    webcrypto,
  );
  const reordered = await localTokenCodeForMoment(
    installation,
    moment({ instrumentation: ["matrix", "kick", "bass", "kick"] }),
    webcrypto,
  );
  const changed = await localTokenCodeForMoment(
    installation,
    moment({ instrumentation: ["kick", "bass", "string"] }),
    webcrypto,
  );

  assert.equal(reordered, first);
  assert.notEqual(changed, first);
});

test("the ledger keeps only its bounded newest records", async () => {
  const storage = new MemoryStorage();
  const ledger = createLocalClaimLedger({
    storage,
    crypto: webcrypto,
    maxClaims: 3,
    now: () => 1_800_000_000_000,
  });

  for (let step = 0; step < 5; step += 1) {
    await ledger.claimMoment(moment({ step }));
  }

  assert.deepEqual(
    ledger.listClaims().map((claim) => claim.moment.step),
    [2, 3, 4],
  );
  assert.equal(JSON.parse(storage.getItem(LOCAL_CLAIMS_STORAGE_KEY)).claims.length, 3);
});

test("storage failures fall back safely for the page lifetime", async () => {
  const brokenStorage = {
    getItem() {
      throw new Error("storage disabled");
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  const ledger = createLocalClaimLedger({
    storage: brokenStorage,
    crypto: webcrypto,
    now: () => 1_800_000_000_000,
  });

  const first = await ledger.claimMoment(moment());
  const repeat = await ledger.claimMoment(moment());

  assert.deepEqual(repeat, first);
  assert.equal(first.persistence, "session");
  assert.equal(ledger.listClaims().length, 1);
});

test("a failed quota write keeps newer claims ahead of stale readable storage", async () => {
  const readableButFullStorage = new MemoryStorage();
  const initialLedger = createLocalClaimLedger({
    storage: readableButFullStorage,
    crypto: webcrypto,
    now: () => 1_700_000_000_000,
  });
  const oldClaim = await initialLedger.claimMoment(moment({ step: 1 }));
  assert.equal(oldClaim.persistence, "device");

  const quotaStorage = {
    getItem(key) {
      return readableButFullStorage.getItem(key);
    },
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  const ledger = createLocalClaimLedger({
    storage: quotaStorage,
    crypto: webcrypto,
    now: () => 1_800_000_000_000,
  });

  const first = await ledger.claimMoment(moment({ step: 2 }));
  const repeat = await ledger.claimMoment(moment({ step: 2 }));

  assert.deepEqual(repeat, first);
  assert.equal(first.persistence, "session");
  assert.deepEqual(
    ledger.listClaims().map((claim) => claim.moment.step),
    [1, 2],
  );
});

test("the default ledger capacity is 256 records", async () => {
  const storage = new MemoryStorage();
  const ledger = createLocalClaimLedger({
    storage,
    crypto: webcrypto,
    now: () => 1_800_000_000_000,
  });

  for (let index = 0; index < 257; index += 1) {
    await ledger.claimMoment(moment({ bar: index, step: index % 16 }));
  }

  const claims = ledger.listClaims();
  assert.equal(claims.length, 256);
  assert.equal(claims[0].moment.bar, 1);
  assert.equal(claims.at(-1).moment.bar, 256);
});

test("claims require Web Crypto and complete moment identity", async () => {
  const ledger = createLocalClaimLedger({
    storage: new MemoryStorage(),
    crypto: {},
  });

  await assert.rejects(() => ledger.claimMoment(moment()), /Web Crypto/);
  assert.throws(
    () => canonicalLocalMomentPayload({ bar: 1, step: 2 }),
    /trajectory and generator version/,
  );
});
