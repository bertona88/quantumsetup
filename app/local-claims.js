export const LOCAL_CLAIM_SCHEMA_VERSION = 1;
export const MAX_LOCAL_CLAIMS = 256;

export const LOCAL_CLAIMS_STORAGE_KEY =
  "quantumsetup.deviceLocalClaims.v1";
export const INSTALLATION_ID_STORAGE_KEY =
  "quantumsetup.deviceLocalInstallationId.v1";

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAX_BAR = 10_000_000;

function shortText(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function boundedInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function materialSummary(value) {
  const direct = shortText(value?.materialSummary, 240);
  if (direct) return direct;

  const material = value?.material;
  if (typeof material === "string") return shortText(material, 240);
  if (!material || typeof material !== "object") {
    return shortText(value?.materialFingerprint, 240);
  }

  const parts = [
    material.summary,
    material.phraseFingerprint,
    material.fingerprint,
    material.gesture,
    material.scene,
  ]
    .map((part) => shortText(part, 96))
    .filter(Boolean);
  return parts.join(" / ").slice(0, 240);
}

function normalizedInstrumentation(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const identifiers = value
    .map((entry) =>
      shortText(
        typeof entry === "string"
          ? entry
          : entry?.id ?? entry?.label,
        80,
      ),
    )
    .filter(Boolean);
  return Object.freeze([...new Set(identifiers)].sort().slice(0, 24));
}

/**
 * Reduce a live musical moment to the fields evidenced by a local claim.
 * Claim time is deliberately excluded so the same installation and moment
 * always produce the same token code.
 */
export function canonicalLocalMoment(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("A musical moment is required");
  }

  const trajectoryId = shortText(
    value.trajectoryId ?? value.trajectory ?? value.seed,
    160,
  );
  const generatorVersion = shortText(
    value.generatorVersion ?? value.generator,
    64,
  );
  if (!trajectoryId || !generatorVersion) {
    throw new TypeError("A moment needs a trajectory and generator version");
  }

  const material = value.material && typeof value.material === "object"
    ? value.material
    : {};
  return Object.freeze({
    trajectoryId,
    generatorVersion,
    bar: boundedInteger(value.bar, 0, MAX_BAR),
    step: boundedInteger(value.step, 0, 15),
    phraseFingerprint: shortText(
      value.phraseFingerprint ?? value.materialFingerprint ??
        material.phraseFingerprint ?? material.fingerprint,
      120,
    ),
    coreSignature: shortText(
      value.coreSignature ?? material.coreSignature,
      120,
    ),
    sceneId: shortText(
      value.sceneId ?? value.ensembleScene?.id ?? material.scene,
      80,
    ),
    instrumentation: normalizedInstrumentation(value.instrumentation),
    materialSummary: materialSummary(value),
  });
}

export function canonicalLocalMomentPayload(value) {
  return JSON.stringify(canonicalLocalMoment(value));
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase32(bytes) {
  let bits = 0;
  let buffer = 0;
  let result = "";
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += TOKEN_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += TOKEN_ALPHABET[(buffer << (5 - bits)) & 31];
  return result;
}

function requireCrypto(cryptoProvider) {
  if (
    !cryptoProvider ||
    typeof cryptoProvider.getRandomValues !== "function" ||
    typeof cryptoProvider.subtle?.digest !== "function"
  ) {
    throw new Error("Web Crypto is required for device-local claims");
  }
  return cryptoProvider;
}

function createSafeStorage(storage) {
  const fallback = new Map();
  const dirtyKeys = new Set();
  const persistentKeys = new Set();
  return {
    getItem(key) {
      // Once a write fails, the in-memory value is newer than whatever stale
      // value localStorage may still return. Keep using it for this page.
      if (dirtyKeys.has(key)) return fallback.get(key) ?? null;
      try {
        const value = storage?.getItem(key);
        if (typeof value === "string") {
          fallback.set(key, value);
          persistentKeys.add(key);
          return value;
        }
        persistentKeys.delete(key);
      } catch {
        // Private browsing and full storage can make localStorage throw.
      }
      return fallback.get(key) ?? null;
    },
    setItem(key, value) {
      fallback.set(key, value);
      try {
        if (!storage || typeof storage.setItem !== "function") {
          throw new Error("Persistent storage is unavailable");
        }
        storage.setItem(key, value);
        dirtyKeys.delete(key);
        persistentKeys.add(key);
        return true;
      } catch {
        // The in-memory copy keeps claims usable for this page lifetime.
        dirtyKeys.add(key);
        persistentKeys.delete(key);
        return false;
      }
    },
    isPersistent(key) {
      return persistentKeys.has(key) && !dirtyKeys.has(key);
    },
  };
}

function defaultLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateInstallationId(storage, cryptoProvider) {
  const existing = storage.getItem(INSTALLATION_ID_STORAGE_KEY);
  if (/^install_[a-f0-9]{32}$/.test(existing || "")) return existing;

  const bytes = new Uint8Array(16);
  requireCrypto(cryptoProvider).getRandomValues(bytes);
  const installationId = `install_${bytesToHex(bytes)}`;
  storage.setItem(INSTALLATION_ID_STORAGE_KEY, installationId);
  return installationId;
}

async function digestMoment(installationId, moment, cryptoProvider) {
  const input = new TextEncoder().encode(
    `${installationId}\n${canonicalLocalMomentPayload(moment)}`,
  );
  const buffer = await requireCrypto(cryptoProvider).subtle.digest(
    "SHA-256",
    input,
  );
  const digest = new Uint8Array(buffer);
  return {
    localDigest: bytesToHex(digest),
    tokenCode: `LOCAL-${bytesToBase32(digest.slice(0, 10))}`,
  };
}

/** Derive the display token without writing a claim. */
export async function localTokenCodeForMoment(
  installationId,
  moment,
  cryptoProvider = globalThis.crypto,
) {
  if (!/^install_[a-f0-9]{32}$/.test(installationId || "")) {
    throw new TypeError("A valid local installation ID is required");
  }
  return (await digestMoment(installationId, moment, cryptoProvider)).tokenCode;
}

function readClaims(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(LOCAL_CLAIMS_STORAGE_KEY) || "null");
    if (parsed?.schemaVersion !== LOCAL_CLAIM_SCHEMA_VERSION) return [];
    if (!Array.isArray(parsed.claims)) return [];
    return parsed.claims
      .filter(
        (claim) =>
          claim &&
          claim.scope === "device-local" &&
          typeof claim.localDigest === "string" &&
          typeof claim.tokenCode === "string",
      )
      .slice(-MAX_LOCAL_CLAIMS);
  } catch {
    return [];
  }
}

function writeClaims(storage, claims) {
  return storage.setItem(
    LOCAL_CLAIMS_STORAGE_KEY,
    JSON.stringify({ schemaVersion: LOCAL_CLAIM_SCHEMA_VERSION, claims }),
  );
}

function timestampFrom(now) {
  const value = typeof now === "function" ? now() : Date.now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("The claim clock returned an invalid time");
  }
  return date.toISOString();
}

/**
 * Create an offline ledger. Its records are evidence local to this browser
 * installation; they are not blockchain transactions or ownership certificates.
 */
export function createLocalClaimLedger({
  storage,
  crypto = globalThis.crypto,
  now = Date.now,
  maxClaims = MAX_LOCAL_CLAIMS,
} = {}) {
  const safeStorage = createSafeStorage(
    storage === undefined ? defaultLocalStorage() : storage,
  );
  const capacity = boundedInteger(maxClaims, 1, MAX_LOCAL_CLAIMS);

  function claimResult(claim) {
    const persistence =
      safeStorage.isPersistent(INSTALLATION_ID_STORAGE_KEY) &&
      safeStorage.isPersistent(LOCAL_CLAIMS_STORAGE_KEY)
        ? "device"
        : "session";
    return {
      ...claim,
      persistence,
      moment: { ...claim.moment },
    };
  }

  function installationId() {
    return getOrCreateInstallationId(safeStorage, crypto);
  }

  function listClaims() {
    return readClaims(safeStorage).map(claimResult);
  }

  async function claimMoment(value) {
    const moment = canonicalLocalMoment(value);
    const localInstallationId = installationId();
    const { localDigest, tokenCode } = await digestMoment(
      localInstallationId,
      moment,
      crypto,
    );

    const claims = readClaims(safeStorage);
    const existing = claims.find((claim) => claim.localDigest === localDigest);
    if (existing) return claimResult(existing);

    const claim = {
      schemaVersion: LOCAL_CLAIM_SCHEMA_VERSION,
      scope: "device-local",
      installationId: localInstallationId,
      localDigest,
      tokenCode,
      claimedAt: timestampFrom(now),
      moment,
    };
    writeClaims(safeStorage, [...claims, claim].slice(-capacity));
    return claimResult(claim);
  }

  return Object.freeze({
    installationId,
    listClaims,
    claimMoment,
  });
}
