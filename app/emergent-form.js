import { clamp, hash32, lerp } from "./generative-utils.js";
import { createTrackDNA } from "./track-dna.js";

export const FORM_RULES = Object.freeze({
  climax: Object.freeze({
    minTension: 0.58,
    minFloorTrust: 0.7,
    minPayoffDebt: 0.52,
    cooldownPhrases: 18,
    minimumPhrases: 2,
    maximumPhrases: 8,
    continuationTension: 0.24,
  }),
  kickWithdrawal: Object.freeze({
    minTension: 0.54,
    minFloorTrust: 0.71,
    cooldownPhrases: 10,
    maximumPhrases: 2,
  }),
  kickFamily: Object.freeze({
    cooldownPhrases: 24,
  }),
  motif: Object.freeze({
    minimumReplaceAge: 10,
    replaceDebt: 0.6,
    minimumMutationAge: 3,
    maximumMutationCount: 2,
    mutationCooldownPhrases: 3,
    minimumRecallAge: 6,
    recallCooldownPhrases: 12,
  }),
  fill: Object.freeze({
    cooldownPhrases: 4,
  }),
  riser: Object.freeze({
    cooldownPhrases: 8,
  }),
  echoAscent: Object.freeze({
    cooldownPhrases: 8,
  }),
  dialogue: Object.freeze({
    cooldownPhrases: 2,
  }),
  harmony: Object.freeze({
    cooldownPhrases: 3,
  }),
  bassVoice: Object.freeze({
    cooldownPhrases: 16,
  }),
  tonalMaterial: Object.freeze({
    cooldownPhrases: 24,
  }),
});

export const FORM_LENS_IDS = Object.freeze([
  "floor-authority",
  "long-arc",
  "radical-reduction",
  "machine-soul",
]);

const UINT32_MAX = 0xffffffff;
const INTERIOR_MIN = 0.006;
const INTERIOR_MAX = 0.994;
const MAX_TRACE_COUNT = 4096;
const MAX_REPLAY_DISTANCE = 65536;
const TRACE_CACHE_SEED_LIMIT = 8;
const TRACE_RECENT_LIMIT = 512;
const TRACE_CHECKPOINT_INTERVAL = 64;
const TRACE_CHECKPOINT_LIMIT = 256;
const traceCache = new Map();

const EVOLUTION = Object.freeze({
  energy: Object.freeze({ center: 0.58, reversion: 0.026 }),
  tension: Object.freeze({ center: 0.425, reversion: 0.052 }),
  density: Object.freeze({ center: 0.54, reversion: 0.026 }),
  space: Object.freeze({ center: 0.52, reversion: 0.024 }),
  floorTrust: Object.freeze({ center: 0.52, reversion: 0.05 }),
  fatigue: Object.freeze({ center: 0.4, reversion: 0.028 }),
  contrastDebt: Object.freeze({ center: 0.42, reversion: 0.018 }),
  payoffDebt: Object.freeze({ center: 0.48, reversion: 0.016 }),
  noveltyDebt: Object.freeze({ center: 0.46, reversion: 0.018 }),
  motifSalience: Object.freeze({ center: 0.65, reversion: 0.024 }),
});

const FORM_PHENOTYPES = Object.freeze({
  "patient-hypnosis": Object.freeze({
    centers: Object.freeze({
      energy: 0.5,
      tension: 0.38,
      density: 0.45,
      space: 0.62,
      floorTrust: 0.51,
      fatigue: 0.36,
      contrastDebt: 0.5,
      payoffDebt: 0.5,
      noveltyDebt: 0.44,
      motifSalience: 0.76,
    }),
    lensBias: Object.freeze({
      "floor-authority": -0.02,
      "long-arc": 0.2,
      "radical-reduction": 0.02,
      "machine-soul": 0.04,
    }),
    motifReplaceGate: 0.74,
    motifMutateGate: 0.68,
    floorTrustScale: 1,
    climaxGateRelief: -0.01,
  }),
  "pressure-ratchet": Object.freeze({
    centers: Object.freeze({
      energy: 0.72,
      tension: 0.56,
      density: 0.68,
      space: 0.3,
      floorTrust: 0.65,
      fatigue: 0.46,
      contrastDebt: 0.45,
      payoffDebt: 0.6,
      noveltyDebt: 0.54,
      motifSalience: 0.66,
    }),
    lensBias: Object.freeze({
      "floor-authority": 0.18,
      "long-arc": 0.08,
      "radical-reduction": -0.06,
      "machine-soul": -0.02,
    }),
    motifReplaceGate: 0.64,
    motifMutateGate: 0.62,
    floorTrustScale: 0.96,
    climaxGateRelief: 0.025,
  }),
  "peak-and-release": Object.freeze({
    centers: Object.freeze({
      energy: 0.66,
      tension: 0.58,
      density: 0.62,
      space: 0.38,
      floorTrust: 0.58,
      fatigue: 0.5,
      contrastDebt: 0.56,
      payoffDebt: 0.64,
      noveltyDebt: 0.57,
      motifSalience: 0.62,
    }),
    lensBias: Object.freeze({
      "floor-authority": 0.1,
      "long-arc": 0.12,
      "radical-reduction": 0.08,
      "machine-soul": -0.04,
    }),
    motifReplaceGate: 0.62,
    motifMutateGate: 0.61,
    floorTrustScale: 0.95,
    climaxGateRelief: 0.08,
  }),
  "negative-space": Object.freeze({
    centers: Object.freeze({
      energy: 0.42,
      tension: 0.43,
      density: 0.34,
      space: 0.78,
      floorTrust: 0.52,
      fatigue: 0.34,
      contrastDebt: 0.58,
      payoffDebt: 0.48,
      noveltyDebt: 0.56,
      motifSalience: 0.68,
    }),
    lensBias: Object.freeze({
      "floor-authority": -0.08,
      "long-arc": 0.03,
      "radical-reduction": 0.22,
      "machine-soul": 0.05,
    }),
    motifReplaceGate: 0.62,
    motifMutateGate: 0.6,
    floorTrustScale: 1.12,
    climaxGateRelief: -0.02,
  }),
  "machine-funk": Object.freeze({
    centers: Object.freeze({
      energy: 0.58,
      tension: 0.4,
      density: 0.57,
      space: 0.48,
      floorTrust: 0.5,
      fatigue: 0.4,
      contrastDebt: 0.46,
      payoffDebt: 0.5,
      noveltyDebt: 0.68,
      motifSalience: 0.8,
    }),
    lensBias: Object.freeze({
      "floor-authority": 0.01,
      "long-arc": -0.02,
      "radical-reduction": -0.02,
      "machine-soul": 0.24,
    }),
    motifReplaceGate: 0.56,
    motifMutateGate: 0.54,
    floorTrustScale: 0.88,
    climaxGateRelief: 0.015,
  }),
});

function formPhenotypeConfig(id) {
  return FORM_PHENOTYPES[id] || FORM_PHENOTYPES["patient-hypnosis"];
}

function evolutionFor(state, key) {
  const base = EVOLUTION[key];
  const phenotype = formPhenotypeConfig(state.formPhenotype);
  const pressure = state.formPressureBias || 0;
  const space = state.formSpaceBias || 0;
  const pulse = state.formPulseBias || 0;
  const centerOffset = {
    energy: pressure * 0.075 + pulse * 0.025,
    tension: pressure * 0.055 - space * 0.02,
    density: pulse * 0.14 - space * 0.05,
    space: space * 0.16 - pressure * 0.05,
    floorTrust: pressure * 0.04,
    fatigue: pressure * 0.025,
    contrastDebt: -pulse * 0.035 + space * 0.025,
    payoffDebt: pressure * 0.04,
    noveltyDebt: pulse * 0.05,
    motifSalience: -pulse * 0.025 + space * 0.02,
  }[key] || 0;
  return {
    center: clamp(
      (phenotype.centers[key] ?? base.center) + centerOffset,
      0.08,
      0.92,
    ),
    reversion: base.reversion,
  };
}

function coordinate(seed, phraseIndex, name) {
  return (hash32(seed, phraseIndex, name) >>> 0) / UINT32_MAX;
}

function signedCoordinate(seed, phraseIndex, name) {
  return coordinate(seed, phraseIndex, name) * 2 - 1;
}

function bounded(value) {
  return clamp(value, 0, 1);
}

function evolveBounded(current, impulse, { center, reversion }) {
  const headroom = impulse >= 0 ? 1 - current : current;
  return clamp(
    current + impulse * headroom + (center - current) * reversion,
    INTERIOR_MIN,
    INTERIOR_MAX,
  );
}

function validateNonnegativeSafeInteger(value, name, maximum) {
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    (maximum !== undefined && value > maximum)
  ) {
    const suffix =
      maximum === undefined ? "" : ` no greater than ${maximum}`;
    throw new RangeError(`${name} must be a finite safe nonnegative integer${suffix}`);
  }
  return value;
}

function initialState(seed) {
  const trackDNA = createTrackDNA(seed);
  const formPhenotype = trackDNA.formPhenotype;
  const phenotype = formPhenotypeConfig(formPhenotype);
  const formPressureBias = signedCoordinate(
    seed,
    0,
    "form-pressure-bias",
  );
  const formSpaceBias = signedCoordinate(seed, 0, "form-space-bias");
  const formPulseBias = signedCoordinate(seed, 0, "form-pulse-bias");
  const around = (key, coordinateName, spread) =>
    clamp(
      phenotype.centers[key] +
        (coordinate(seed, 0, coordinateName) - 0.5) * spread,
      0.08,
      0.92,
    );
  const energy = around("energy", "origin-energy", 0.3);
  const tension = around("tension", "origin-tension", 0.28);
  const density = around("density", "origin-density", 0.34);
  const space = around("space", "origin-space", 0.36);
  const floorTrust = around("floorTrust", "origin-trust", 0.3);
  const fatigue = around("fatigue", "origin-fatigue", 0.24);
  const motifSalience = around(
    "motifSalience",
    "origin-motif",
    0.3,
  );
  const displayLabel =
    energy > 0.68 && floorTrust > 0.58
      ? "DRIVE"
      : tension > 0.5
        ? "ASCENT"
        : fatigue > 0.25 && space > 0.6
          ? "BRIDGE"
          : motifSalience < 0.46
            ? "MOTIF"
            : energy < 0.42
              ? "IGNITION"
              : "TRANSITION";
  const lineageId = hash32(seed, "bass-lineage-origin") >>> 0;
  const kickFamilyId = hash32(seed, "kick-family-origin") >>> 0;
  const tonalMaterialId = hash32(seed, "tonal-material-origin") >>> 0;
  const harmonyMaterialId = hash32(seed, "harmony-material-origin") >>> 0;
  const sceneMaterialId =
    hash32(seed, lineageId, "scene-material") >>> 0;
  const bassVoiceMaterialId =
    hash32(seed, "bass-voice-material-origin") >>> 0;
  return {
    formPhenotype,
    formPressureBias,
    formSpaceBias,
    formPulseBias,
    energy,
    tension,
    density,
    space,
    floorTrust,
    fatigue,
    contrastDebt: around("contrastDebt", "origin-contrast", 0.34),
    payoffDebt: around("payoffDebt", "origin-payoff", 0.36),
    noveltyDebt: around("noveltyDebt", "origin-novelty", 0.38),
    motifSalience,
    climaxAppetite: 0.18 + coordinate(seed, 0, "climax-appetite") * 0.82,
    chair: null,
    chairResidency: 0,
    displayLabel,
    labelResidency: 0,
    formEpochId: hash32(seed, displayLabel, "form-epoch-origin") >>> 0,
    climax: false,
    climaxAge: 0,
    climaxCooldown: Math.floor(coordinate(seed, 0, "origin-climax-cooldown") * 21),
    phrasesSinceClimax: Math.floor(
      coordinate(seed, 0, "origin-since-climax") * 49,
    ),
    kickPolicy: energy < 0.45 ? "thin" : "anchor",
    kickWithdrawalAge: 0,
    kickCooldown: 3 + Math.floor(coordinate(seed, 0, "origin-kick-cooldown") * 5),
    kickFamilyId,
    priorKickFamilyId: null,
    kickFamilyMorphCooldown: Math.floor(
      coordinate(seed, 0, "origin-kick-family-cooldown") *
        (FORM_RULES.kickFamily.cooldownPhrases + 1),
    ),
    motifLineageId: lineageId,
    archivedLineageId: null,
    lineageAge: 0,
    motifMutationCount: 0,
    motifMutationCooldown: 0,
    motifRecallCooldown: 0,
    tonalMaterialId,
    tonalCooldown: Math.floor(
      coordinate(seed, 0, "origin-tonal-cooldown") *
        (FORM_RULES.tonalMaterial.cooldownPhrases + 1),
    ),
    harmonyMaterialId,
    harmonyPosition:
      hash32(seed, harmonyMaterialId, "harmony-position-origin") % 4,
    harmonyCooldown: Math.floor(
      coordinate(seed, 0, "origin-harmony-cooldown") *
        (FORM_RULES.harmony.cooldownPhrases + 1),
    ),
    sceneMaterialId,
    bassVoiceMaterialId,
    bassVoiceCooldown: Math.floor(
      coordinate(seed, 0, "origin-bass-voice-cooldown") *
        (FORM_RULES.bassVoice.cooldownPhrases + 1),
    ),
    fillCooldown: Math.floor(coordinate(seed, 0, "origin-fill-cooldown") * 3),
    riserCooldown: Math.floor(coordinate(seed, 0, "origin-riser-cooldown") * 5),
    echoAscentCooldown: Math.floor(
      coordinate(seed, 0, "origin-echo-ascent-cooldown") * 7,
    ),
    dialogueCooldown: 0,
    lastEnergyDelta: 0,
    lastTensionDelta: 0,
  };
}

function lensScores(state, seed, phraseIndex) {
  const phenotype = formPhenotypeConfig(state.formPhenotype);
  const scores = {
    "floor-authority":
      0.2 +
      (1 - state.floorTrust) * 0.34 +
      Math.max(0, 0.68 - state.energy) * 0.34 +
      (state.kickPolicy === "withdraw" ? 0.34 : 0) +
      signedCoordinate(seed, phraseIndex, "floor-drive") * 0.08,
    "long-arc":
      0.2 +
      (1 - state.tension) * 0.14 +
      state.floorTrust * 0.2 +
      state.payoffDebt * 0.24 +
      Math.min(0.18, state.phrasesSinceClimax * 0.012) -
      state.fatigue * 0.18 +
      signedCoordinate(seed, phraseIndex, "arc-drive") * 0.08,
    "radical-reduction":
      0.08 +
      state.fatigue * 0.56 +
      state.contrastDebt * 0.35 +
      Math.max(0, state.energy - 0.78) * 0.35 +
      signedCoordinate(seed, phraseIndex, "reduction-drive") * 0.08,
    "machine-soul":
      0.12 +
      state.noveltyDebt * 0.46 +
      (1 - state.motifSalience) * 0.28 +
      (state.kickPolicy === "withdraw" ? 0.1 : 0) +
      signedCoordinate(seed, phraseIndex, "soul-drive") * 0.08,
  };
  for (const lens of FORM_LENS_IDS) {
    scores[lens] += phenotype.lensBias[lens] || 0;
  }

  if (state.chair) {
    if (state.chairResidency < 2) scores[state.chair] += 0.24;
    if (state.chairResidency > 4) {
      scores[state.chair] -= Math.min(0.3, (state.chairResidency - 4) * 0.08);
    }
  }
  return scores;
}

function selectLens(state, seed, phraseIndex) {
  const scores = lensScores(state, seed, phraseIndex);
  return FORM_LENS_IDS.reduce((winner, candidate) =>
    scores[candidate] > scores[winner] ? candidate : winner,
  );
}

function lensDeltas(chair, state, seed, phraseIndex) {
  const drift = signedCoordinate(seed, phraseIndex, "form-drift");
  if (chair === "floor-authority") {
    return {
      energy: 0.055 + (1 - state.energy) * 0.055 + drift * 0.012,
      tension: 0.04 + state.floorTrust * 0.025,
      density: 0.065,
      space: -0.055,
      floorTrust: 0.075,
      fatigue: 0.045 + state.energy * 0.025,
      contrastDebt: 0.045,
      payoffDebt: 0.025,
      noveltyDebt: 0.025,
      motifSalience: 0.03,
    };
  }
  if (chair === "long-arc") {
    return {
      energy: 0.035 + drift * 0.012,
      tension: 0.09 + state.floorTrust * 0.025,
      density: 0.025,
      space: 0.018,
      floorTrust: 0.035,
      fatigue: 0.03,
      contrastDebt: 0.02,
      payoffDebt: 0.07,
      noveltyDebt: 0.035,
      motifSalience: -0.018,
    };
  }
  if (chair === "radical-reduction") {
    return {
      energy: -0.11 + drift * 0.015,
      tension: state.floorTrust * 0.065 - 0.025,
      density: -0.14,
      space: 0.15,
      floorTrust: state.energy > 0.68 ? 0.012 : -0.018,
      fatigue: -0.16,
      contrastDebt: -0.18,
      payoffDebt: 0.035,
      noveltyDebt: 0.03,
      motifSalience: -0.025,
    };
  }
  return {
    energy: (0.67 - state.energy) * 0.18 + drift * 0.012,
    tension: -0.025,
    density: (0.58 - state.density) * 0.16,
    space: (0.5 - state.space) * 0.1,
    floorTrust: 0.065,
    fatigue: -0.045,
    contrastDebt: -0.035,
    payoffDebt: -0.035,
    noveltyDebt: -0.16,
    motifSalience: 0.15,
  };
}

function climaxReadiness(state, seed, phraseIndex) {
  const historyPressure = Math.min(1, state.phrasesSinceClimax / 64);
  return bounded(
    state.tension * 0.3 +
      state.floorTrust * 0.18 +
      state.payoffDebt * 0.32 +
      state.energy * 0.1 -
      state.fatigue * 0.16 +
      historyPressure * 0.14 +
      (state.climaxAppetite - 0.5) * 0.04 +
      coordinate(seed, phraseIndex, "climax-readiness") * 0.12,
  );
}

function climaxPermission(state) {
  return bounded(
    state.payoffDebt * 0.48 +
      state.tension * 0.16 +
      state.floorTrust * 0.12 +
      state.energy * 0.06 -
      state.fatigue * 0.08 +
      Math.min(0.2, state.phrasesSinceClimax * 0.005) +
      (state.climaxAppetite - 0.5) * 0.04,
  );
}

function shouldEnterClimax(state, readiness, seed, phraseIndex) {
  const phenotype = formPhenotypeConfig(state.formPhenotype);
  const earnedPermission = climaxPermission(state);
  const historyPressure = Math.min(
    0.05,
    state.phrasesSinceClimax * 0.0012,
  );
  const debtPressure = Math.max(0, state.payoffDebt - 0.52) * 0.08;
  const readinessPressure = Math.max(0, readiness - 0.62) * 0.08;
  const entryGate =
    coordinate(seed, phraseIndex, "climax-entry") >
    clamp(
      0.97 -
        historyPressure -
        debtPressure -
        readinessPressure -
        phenotype.climaxGateRelief,
      0.82,
      0.96,
    );
  return (
    !state.climax &&
    state.climaxCooldown === 0 &&
    state.tension >= FORM_RULES.climax.minTension &&
    state.floorTrust >= FORM_RULES.climax.minFloorTrust &&
    state.payoffDebt >= FORM_RULES.climax.minPayoffDebt &&
    earnedPermission >= 0.58 &&
    readiness >= 0.62 &&
    entryGate
  );
}

function shouldContinueClimax(state, seed, phraseIndex) {
  if (!state.climax) return false;
  if (state.climaxAge < FORM_RULES.climax.minimumPhrases) return true;
  if (state.climaxAge >= FORM_RULES.climax.maximumPhrases) return false;
  const hold =
    state.tension * 0.26 +
    state.floorTrust * 0.14 +
    (1 - state.fatigue) * 0.16 +
    state.motifSalience * 0.08 +
    coordinate(seed, phraseIndex, "climax-hold") * 0.28 -
    state.climaxAge * 0.015;
  return state.tension >= FORM_RULES.climax.continuationTension && hold >= 0.44;
}

function updateMotif(state, chair, seed, phraseIndex) {
  const phenotype = formPhenotypeConfig(state.formPhenotype);
  let motifLineageId = state.motifLineageId;
  let archivedLineageId = state.archivedLineageId;
  let lineageAge = state.lineageAge + 1;
  let motifMutationCount = state.motifMutationCount;
  let motifMutationCooldown = Math.max(0, state.motifMutationCooldown - 1);
  let motifRecallCooldown = Math.max(0, state.motifRecallCooldown - 1);
  let motifOperation = "hold";

  const recallReady =
    ({
      "patient-hypnosis": ["machine-soul", "long-arc"],
      "pressure-ratchet": ["machine-soul"],
      "peak-and-release": ["machine-soul", "long-arc"],
      "negative-space": ["machine-soul", "radical-reduction"],
      "machine-funk": ["machine-soul"],
    }[state.formPhenotype] || ["machine-soul"]).includes(chair) &&
    archivedLineageId !== null &&
    state.lineageAge >= FORM_RULES.motif.minimumRecallAge &&
    state.motifRecallCooldown === 0 &&
    state.motifSalience > 0.64 &&
    coordinate(seed, phraseIndex, "motif-recall") > 0.84;
  const replaceReady =
    state.lineageAge >= FORM_RULES.motif.minimumReplaceAge &&
    state.noveltyDebt >= FORM_RULES.motif.replaceDebt &&
    coordinate(seed, phraseIndex, "motif-replace") >
      phenotype.motifReplaceGate;
  const mutateReady =
    state.lineageAge >= FORM_RULES.motif.minimumMutationAge &&
    state.motifMutationCount < FORM_RULES.motif.maximumMutationCount &&
    motifMutationCooldown === 0 &&
    state.noveltyDebt > 0.5 &&
    coordinate(seed, phraseIndex, "motif-mutate") >
      phenotype.motifMutateGate;

  if (recallReady) {
    const current = motifLineageId;
    motifLineageId = archivedLineageId;
    archivedLineageId = current;
    lineageAge = 0;
    motifMutationCount = 0;
    motifMutationCooldown = 0;
    motifRecallCooldown = FORM_RULES.motif.recallCooldownPhrases;
    motifOperation = "recall";
  } else if (replaceReady) {
    archivedLineageId = motifLineageId;
    motifLineageId = hash32(
      seed,
      phraseIndex,
      motifLineageId,
      "bass-lineage-replace",
    ) >>> 0;
    lineageAge = 0;
    motifMutationCount = 0;
    motifMutationCooldown = 0;
    motifOperation = "replace";
  } else if (mutateReady) {
    motifMutationCount += 1;
    motifMutationCooldown = FORM_RULES.motif.mutationCooldownPhrases;
    motifOperation = "mutate";
  }

  return {
    motifLineageId,
    archivedLineageId,
    lineageAge,
    motifMutationCount,
    motifMutationCooldown,
    motifRecallCooldown,
    motifOperation,
  };
}

function deriveDisplayLabel({
  state,
  chair,
  energy,
  tensionDelta,
  climax,
  climaxOnset,
  release,
  kickPolicy,
  motifOperation,
  space,
}) {
  if (climax) return "PEAK";
  if (release) return "RELEASE";
  if (kickPolicy === "withdraw") return "VOID";
  if (motifOperation === "recall") return "RETURN";
  if (state.floorTrust < 0.69 && energy < 0.55) return "IGNITION";
  if (chair === "radical-reduction") return space > 0.68 ? "BRIDGE" : "DRIFT";
  if (tensionDelta > 0.055 || climaxOnset) return "ASCENT";
  if (energy > 0.78 && state.floorTrust > 0.72) return "DRIVE";
  if (energy > 0.7) return "LOCK";
  if (chair === "machine-soul") return "MOTIF";
  return "TRANSITION";
}

function advanceState(state, seed, phraseIndex) {
  const readiness = climaxReadiness(state, seed, phraseIndex);
  const climaxOnset = shouldEnterClimax(state, readiness, seed, phraseIndex);
  const continueClimax = shouldContinueClimax(state, seed, phraseIndex);
  const climax = climaxOnset || continueClimax;
  const release = state.climax && !climax;

  let chair = selectLens(state, seed, phraseIndex);
  if (climax) chair = "floor-authority";
  if (release) chair = "radical-reduction";

  let deltas = lensDeltas(chair, state, seed, phraseIndex);
  if (climax) {
    deltas = {
      energy: 0.065 + Math.max(0, 0.9 - state.energy) * 0.12,
      tension: -0.04 - state.climaxAge * 0.004,
      density: 0.07,
      space: -0.07,
      floorTrust: 0.055,
      fatigue: 0.075,
      contrastDebt: 0.065,
      payoffDebt: -0.12,
      noveltyDebt: 0.025,
      motifSalience: 0.045,
    };
  } else if (release) {
    deltas = {
      energy: -0.16,
      tension: -0.13,
      density: -0.18,
      space: 0.18,
      floorTrust: -0.015,
      fatigue: -0.14,
      contrastDebt: -0.2,
      payoffDebt: -0.16,
      noveltyDebt: 0.035,
      motifSalience: -0.025,
    };
  }
  deltas = {
    ...deltas,
    floorTrust:
      deltas.floorTrust *
      formPhenotypeConfig(state.formPhenotype).floorTrustScale,
  };

  const energy = evolveBounded(
    state.energy,
    deltas.energy,
    evolutionFor(state, "energy"),
  );
  const tension = evolveBounded(
    state.tension,
    deltas.tension,
    evolutionFor(state, "tension"),
  );
  const density = evolveBounded(
    state.density,
    deltas.density,
    evolutionFor(state, "density"),
  );
  const space = evolveBounded(
    state.space,
    deltas.space,
    evolutionFor(state, "space"),
  );
  const floorTrust = evolveBounded(
    state.floorTrust,
    deltas.floorTrust,
    evolutionFor(state, "floorTrust"),
  );
  const fatigue = evolveBounded(
    state.fatigue,
    deltas.fatigue,
    evolutionFor(state, "fatigue"),
  );
  const contrastDebt = evolveBounded(
    state.contrastDebt,
    deltas.contrastDebt,
    evolutionFor(state, "contrastDebt"),
  );
  const payoffDebt = evolveBounded(
    state.payoffDebt,
    deltas.payoffDebt,
    evolutionFor(state, "payoffDebt"),
  );
  const noveltyDebt = evolveBounded(
    state.noveltyDebt,
    deltas.noveltyDebt,
    evolutionFor(state, "noveltyDebt"),
  );
  const motifSalience = evolveBounded(
    state.motifSalience,
    deltas.motifSalience,
    evolutionFor(state, "motifSalience"),
  );
  const energyDelta = energy - state.energy;
  const tensionDelta = tension - state.tension;

  const withdrawalReadiness =
    state.tension * 0.28 +
    state.floorTrust * 0.3 +
    state.fatigue * 0.2 +
    space * 0.12 +
    coordinate(seed, phraseIndex, "kick-withdrawal") * 0.1;
  const mayEnterWithdrawal =
    !climax &&
    chair === "radical-reduction" &&
    state.kickCooldown === 0 &&
    state.tension >= FORM_RULES.kickWithdrawal.minTension &&
    state.floorTrust >= FORM_RULES.kickWithdrawal.minFloorTrust &&
    withdrawalReadiness > 0.61 &&
    coordinate(seed, phraseIndex, "kick-withdrawal-gate") > 0.73;
  const mayContinueWithdrawal =
    state.kickPolicy === "withdraw" &&
    state.kickWithdrawalAge < FORM_RULES.kickWithdrawal.maximumPhrases &&
    chair === "radical-reduction" &&
    !climax;
  const kickPolicy =
    mayEnterWithdrawal || mayContinueWithdrawal
      ? "withdraw"
      : energy < 0.48 || (chair === "radical-reduction" && space > 0.62)
        ? "thin"
        : "anchor";
  const kickReason =
    kickPolicy === "withdraw"
      ? mayEnterWithdrawal
        ? "earned-withdrawal"
        : "withheld-pressure"
      : kickPolicy === "thin"
        ? "negative-space"
        : state.kickPolicy === "withdraw"
          ? "floor-return"
          : "floor-continuity";

  const availableKickFamilyMorphCooldown = Math.max(
    0,
    state.kickFamilyMorphCooldown - 1,
  );
  const floorRecommit =
    kickPolicy === "anchor" && state.kickPolicy !== "anchor";
  const kickFamilyMorphReadiness = bounded(
    noveltyDebt * 0.28 +
      contrastDebt * 0.3 +
      floorTrust * 0.18 +
      (1 - fatigue) * 0.1 +
      (release ? 0.14 : 0) +
      (floorRecommit ? 0.12 : 0),
  );
  const kickFamilyMorph =
    !climax &&
    availableKickFamilyMorphCooldown === 0 &&
    (release || floorRecommit) &&
    kickFamilyMorphReadiness > 0.58 &&
    coordinate(seed, phraseIndex, "kick-family-morph-permission") > 0.55;
  let kickFamilyId = state.kickFamilyId;
  let priorKickFamilyId = state.priorKickFamilyId;
  if (kickFamilyMorph) {
    priorKickFamilyId = kickFamilyId;
    const candidate =
      hash32(
        seed,
        phraseIndex,
        kickFamilyId,
        "kick-family-morph",
      ) >>> 0;
    kickFamilyId =
      candidate === priorKickFamilyId
        ? (candidate + 0x9e3779b9) >>> 0
        : candidate;
  }
  const kickFamilyMorphCooldown = kickFamilyMorph
    ? FORM_RULES.kickFamily.cooldownPhrases
    : availableKickFamilyMorphCooldown;

  const motif = updateMotif(state, chair, seed, phraseIndex);
  const availableBassVoiceCooldown = Math.max(
    0,
    state.bassVoiceCooldown - 1,
  );
  const bassVoiceChangeReadiness = bounded(
    noveltyDebt * 0.28 +
      contrastDebt * 0.24 +
      (release ? 0.24 : 0) +
      (floorRecommit ? 0.18 : 0) +
      coordinate(seed, phraseIndex, "bass-voice-change-readiness") * 0.06,
  );
  const bassVoiceChange =
    !climax &&
    motif.motifOperation === "hold" &&
    availableBassVoiceCooldown === 0 &&
    (release || floorRecommit) &&
    bassVoiceChangeReadiness > 0.48 &&
    coordinate(seed, phraseIndex, "bass-voice-change-permission") > 0.4;
  const bassVoiceMaterialId = bassVoiceChange
    ? hash32(
        seed,
        phraseIndex,
        state.bassVoiceMaterialId,
        "bass-voice-material-change",
      ) >>> 0
    : state.bassVoiceMaterialId;
  const bassVoiceCooldown = bassVoiceChange
    ? FORM_RULES.bassVoice.cooldownPhrases
    : availableBassVoiceCooldown;
  const availableTonalCooldown = Math.max(0, state.tonalCooldown - 1);
  const tonalPivotReadiness = bounded(
    noveltyDebt * 0.34 +
      contrastDebt * 0.22 +
      space * 0.18 +
      (1 - fatigue) * 0.12 +
      coordinate(seed, phraseIndex, "tonal-pivot-readiness") * 0.14,
  );
  const tonalPivot =
    motif.motifOperation === "hold" &&
    release &&
    availableTonalCooldown === 0 &&
    tonalPivotReadiness > 0.52 &&
    coordinate(seed, phraseIndex, "tonal-pivot-permission") > 0.46;
  const tonalMaterialId = tonalPivot
    ? hash32(
        seed,
        phraseIndex,
        state.tonalMaterialId,
        motif.motifLineageId,
        "tonal-material-pivot",
      ) >>> 0
    : state.tonalMaterialId;
  const tonalCooldown = tonalPivot
    ? FORM_RULES.tonalMaterial.cooldownPhrases
    : availableTonalCooldown;
  const harmonyMaterialId = tonalPivot
    ? hash32(
        seed,
        phraseIndex,
        state.harmonyMaterialId,
        tonalMaterialId,
        "harmony-material-pivot",
      ) >>> 0
    : state.harmonyMaterialId;

  const availableHarmonyCooldown = Math.max(
    0,
    state.harmonyCooldown - 1,
  );
  const harmonyTurnReadiness = bounded(
    payoffDebt * 0.3 +
      tension * 0.2 +
      motifSalience * 0.14 +
      Math.max(0, tensionDelta) * 1.4 +
      (chair === "long-arc" ? 0.14 : 0) +
      (chair === "machine-soul" ? 0.08 : 0) -
      fatigue * 0.12,
  );
  const harmonyTurn =
    motif.motifOperation === "hold" &&
    !climax &&
    !release &&
    !tonalPivot &&
    availableHarmonyCooldown === 0 &&
    ["long-arc", "machine-soul"].includes(chair) &&
    harmonyTurnReadiness > 0.46 &&
    coordinate(seed, phraseIndex, "harmony-turn-permission") > 0.64;
  const harmonyDirection =
    coordinate(seed, phraseIndex, "harmony-turn-direction") >= 0.5
      ? 1
      : -1;
  const harmonyLeap =
    coordinate(seed, phraseIndex, "harmony-turn-leap") > 0.88 ? 2 : 1;
  const harmonyPosition = harmonyTurn
    ? ((state.harmonyPosition + harmonyDirection * harmonyLeap) % 4 + 4) % 4
    : state.harmonyPosition;
  const harmonyCooldown = harmonyTurn
    ? FORM_RULES.harmony.cooldownPhrases
    : availableHarmonyCooldown;

  const targetSceneMaterialId =
    hash32(seed, motif.motifLineageId, "scene-material") >>> 0;
  const sceneHandoff =
    ["mutate", "replace", "recall"].includes(
      motif.motifOperation,
    ) &&
    state.sceneMaterialId !== targetSceneMaterialId;
  const sceneMaterialId = sceneHandoff
    ? targetSceneMaterialId
    : state.sceneMaterialId;
  const displayLabel = deriveDisplayLabel({
    state,
    chair,
    energy,
    tensionDelta,
    climax,
    climaxOnset,
    release,
    kickPolicy,
    motifOperation: motif.motifOperation,
    space,
  });
  const chairResidency = chair === state.chair ? state.chairResidency + 1 : 1;
  const labelResidency =
    displayLabel === state.displayLabel ? state.labelResidency + 1 : 1;
  const formEpochId =
    displayLabel === state.displayLabel
      ? state.formEpochId
      : hash32(
          seed,
          phraseIndex,
          displayLabel,
          state.formEpochId,
          "form-epoch",
        ) >>> 0;
  const climaxAge = climax ? (state.climax ? state.climaxAge + 1 : 1) : 0;
  const climaxCooldown =
    climax || release
      ? FORM_RULES.climax.cooldownPhrases
      : Math.max(0, state.climaxCooldown - 1);
  const kickWithdrawalAge =
    kickPolicy === "withdraw"
      ? state.kickPolicy === "withdraw"
        ? state.kickWithdrawalAge + 1
        : 1
      : 0;
  const kickCooldown =
    mayEnterWithdrawal
      ? FORM_RULES.kickWithdrawal.cooldownPhrases
      : Math.max(0, state.kickCooldown - 1);
  const anticipation = bounded(
    readiness * 0.62 +
      Math.max(0, tensionDelta) * 1.8 +
      payoffDebt * 0.18 -
      (climax ? 0.45 : 0),
  );
  const intentionalRest =
    kickPolicy === "withdraw" && density < 0.48 && space > 0.64;
  const availableDialogueCooldown = Math.max(0, state.dialogueCooldown - 1);
  const dialogueReadiness = bounded(
    tension * 0.28 +
      floorTrust * 0.22 +
      motifSalience * 0.22 +
      (1 - fatigue) * 0.16 +
      coordinate(seed, phraseIndex, "dialogue-readiness") * 0.12,
  );
  const recallDialogue =
    motif.motifOperation === "recall" && floorTrust > 0.7;
  const earnedDialogue =
    recallDialogue ||
    (climax &&
      climaxAge >= 2 &&
      availableDialogueCooldown === 0 &&
      dialogueReadiness > 0.62 &&
      coordinate(seed, phraseIndex, "dialogue-permission") > 0.7);
  const dialogueCooldown = earnedDialogue
    ? FORM_RULES.dialogue.cooldownPhrases
    : availableDialogueCooldown;

  const availableFillCooldown = Math.max(0, state.fillCooldown - 1);
  const allowFill =
    !intentionalRest &&
    kickPolicy !== "withdraw" &&
    availableFillCooldown === 0 &&
    ((release &&
      coordinate(seed, phraseIndex, "fill-release-permission") > 0.62) ||
      (climax &&
        tension < state.tension &&
        coordinate(seed, phraseIndex, "fill-permission") > 0.78));
  const fillCooldown = allowFill
    ? FORM_RULES.fill.cooldownPhrases
    : availableFillCooldown;

  const availableEchoAscentCooldown = Math.max(
    0,
    state.echoAscentCooldown - 1,
  );
  const echoAscentReadiness = bounded(
    anticipation * 0.38 +
      Math.max(0, tensionDelta) * 2.4 +
      Math.max(0, energyDelta) * 1.4 +
      density * 0.12 +
      floorTrust * 0.12 -
      fatigue * 0.1,
  );
  const allowEchoAscent =
    !climax &&
    !release &&
    !intentionalRest &&
    availableEchoAscentCooldown === 0 &&
    anticipation > 0.48 &&
    tensionDelta > 0.004 &&
    density > 0.45 &&
    echoAscentReadiness > 0.39 &&
    coordinate(seed, phraseIndex, "echo-ascent-permission") > 0.4;
  const echoAscentVariantCoordinate = coordinate(
    seed,
    phraseIndex,
    "echo-ascent-variant",
  );
  const echoAscentVariant = !allowEchoAscent
    ? null
    : echoAscentVariantCoordinate < 0.7
      ? "restrained"
      : echoAscentVariantCoordinate < 0.93
        ? "widening"
        : "late-throw";
  const echoAscentCooldown = allowEchoAscent
    ? FORM_RULES.echoAscent.cooldownPhrases
    : availableEchoAscentCooldown;

  const availableRiserCooldown = Math.max(0, state.riserCooldown - 1);
  const riserReadiness = bounded(
    anticipation * 0.48 +
      Math.max(0, tensionDelta) * 2.2 +
      payoffDebt * 0.2 +
      floorTrust * 0.12 -
      fatigue * 0.12,
  );
  const allowRiser =
    !climax &&
    !release &&
    !intentionalRest &&
    !allowEchoAscent &&
    availableRiserCooldown === 0 &&
    anticipation > 0.58 &&
    tensionDelta > 0.008 &&
    riserReadiness > 0.54 &&
    coordinate(seed, phraseIndex, "riser-permission") > 0.68;
  const riserCooldown = allowRiser
    ? FORM_RULES.riser.cooldownPhrases
    : availableRiserCooldown;

  const snapshot = Object.freeze({
    phraseIndex,
    formPhenotype: state.formPhenotype,
    formPressureBias: state.formPressureBias,
    formSpaceBias: state.formSpaceBias,
    formPulseBias: state.formPulseBias,
    label: displayLabel,
    chair,
    chairResidency,
    labelResidency,
    formEpochId,
    energyFrom: state.energy,
    energyTo: energy,
    energy: lerp(state.energy, energy, 0.5),
    energyDelta,
    tension,
    tensionDelta,
    density,
    space,
    brightness: bounded(0.22 + energy * 0.5 + tension * 0.2 - space * 0.12),
    floorTrust,
    fatigue,
    contrastDebt,
    payoffDebt,
    noveltyDebt,
    motifSalience,
    climaxAppetite: state.climaxAppetite,
    climaxReadiness: readiness,
    climaxPermission: climaxPermission(state),
    climax,
    climaxOnset,
    climaxAge,
    climaxCooldown,
    phrasesSinceClimax: climax ? 0 : state.phrasesSinceClimax + 1,
    release,
    anticipation,
    intentionalRest,
    earnedDialogue,
    dialogueReadiness,
    dialogueCooldown,
    allowFill,
    fillCooldown,
    allowRiser,
    riserReadiness,
    riserCooldown,
    allowEchoAscent,
    echoAscentVariant,
    echoAscentReadiness,
    echoAscentCooldown,
    kickPolicy,
    kickReason,
    kickCooldown,
    kickWithdrawalAge,
    kickFamilyId,
    priorKickFamilyId,
    kickFamilyMorph,
    kickFamilyMorphReadiness,
    kickFamilyMorphCooldown,
    motifLineageId: motif.motifLineageId,
    archivedLineageId: motif.archivedLineageId,
    motifOperation: motif.motifOperation,
    motifMutationCount: motif.motifMutationCount,
    motifMutationCooldown: motif.motifMutationCooldown,
    motifRecallCooldown: motif.motifRecallCooldown,
    lineageAge: motif.lineageAge,
    tonalMaterialId,
    tonalOperation: tonalPivot ? "pivot" : "hold",
    tonalPivotReadiness,
    tonalCooldown,
    harmonyMaterialId,
    harmonyPosition,
    harmonyOperation: harmonyTurn ? "turn" : "hold",
    harmonyTurnReadiness,
    harmonyCooldown,
    sceneMaterialId,
    sceneOperation: sceneHandoff ? "handoff" : "hold",
    bassVoiceMaterialId,
    bassVoiceOperation: bassVoiceChange ? "change" : "hold",
    bassVoiceChangeReadiness,
    bassVoiceCooldown,
  });

  return {
    snapshot,
    state: {
      formPhenotype: state.formPhenotype,
      formPressureBias: state.formPressureBias,
      formSpaceBias: state.formSpaceBias,
      formPulseBias: state.formPulseBias,
      energy,
      tension,
      density,
      space,
      floorTrust,
      fatigue,
      contrastDebt,
      payoffDebt,
      noveltyDebt,
      motifSalience,
      climaxAppetite: state.climaxAppetite,
      chair,
      chairResidency,
      displayLabel,
      labelResidency,
      formEpochId,
      climax,
      climaxAge,
      climaxCooldown,
      phrasesSinceClimax: climax ? 0 : state.phrasesSinceClimax + 1,
      kickPolicy,
      kickWithdrawalAge,
      kickCooldown,
      kickFamilyId,
      priorKickFamilyId,
      kickFamilyMorphCooldown,
      motifLineageId: motif.motifLineageId,
      archivedLineageId: motif.archivedLineageId,
      lineageAge: motif.lineageAge,
      motifMutationCount: motif.motifMutationCount,
      motifMutationCooldown: motif.motifMutationCooldown,
      motifRecallCooldown: motif.motifRecallCooldown,
      tonalMaterialId,
      tonalCooldown,
      harmonyMaterialId,
      harmonyPosition,
      harmonyCooldown,
      sceneMaterialId,
      bassVoiceMaterialId,
      bassVoiceCooldown,
      fillCooldown,
      riserCooldown,
      echoAscentCooldown,
      dialogueCooldown,
      lastEnergyDelta: energyDelta,
      lastTensionDelta: tensionDelta,
    },
  };
}

function seedCacheKey(seed) {
  return `${typeof seed}:${String(seed)}`;
}

function getTraceCache(seed) {
  const key = seedCacheKey(seed);
  const existing = traceCache.get(key);
  if (existing) {
    traceCache.delete(key);
    traceCache.set(key, existing);
    return existing;
  }

  const origin = Object.freeze(initialState(seed));
  const created = {
    seed,
    origin,
    tailIndex: -1,
    tailState: origin,
    recent: new Map(),
    checkpoints: new Map(),
  };
  traceCache.set(key, created);
  while (traceCache.size > TRACE_CACHE_SEED_LIMIT) {
    traceCache.delete(traceCache.keys().next().value);
  }
  return created;
}

function trimOldest(map, limit) {
  while (map.size > limit) map.delete(map.keys().next().value);
}

function rememberAdvance(cache, phraseIndex, advanced) {
  const state = Object.freeze(advanced.state);
  const record = Object.freeze({ snapshot: advanced.snapshot, state });
  cache.recent.delete(phraseIndex);
  cache.recent.set(phraseIndex, record);
  trimOldest(cache.recent, TRACE_RECENT_LIMIT);

  if (phraseIndex % TRACE_CHECKPOINT_INTERVAL === 0) {
    cache.checkpoints.delete(phraseIndex);
    cache.checkpoints.set(phraseIndex, state);
    trimOldest(cache.checkpoints, TRACE_CHECKPOINT_LIMIT);
  }
  if (phraseIndex > cache.tailIndex) {
    cache.tailIndex = phraseIndex;
    cache.tailState = state;
  }
  return record;
}

function findAnchor(cache, startPhrase) {
  let index = -1;
  let state = cache.origin;
  const consider = (candidateIndex, candidateState) => {
    if (candidateIndex < startPhrase && candidateIndex > index) {
      index = candidateIndex;
      state = candidateState;
    }
  };

  consider(cache.tailIndex, cache.tailState);
  for (const [candidateIndex, candidateState] of cache.checkpoints) {
    consider(candidateIndex, candidateState);
  }
  for (const [candidateIndex, record] of cache.recent) {
    consider(candidateIndex, record.state);
  }
  return { index, state };
}

export function traceEmergentForm(seed, startPhrase, count) {
  const safeStart = validateNonnegativeSafeInteger(
    startPhrase,
    "startPhrase",
  );
  const safeCount = validateNonnegativeSafeInteger(
    count,
    "count",
    MAX_TRACE_COUNT,
  );
  if (safeCount === 0) return Object.freeze([]);
  if (safeStart > Number.MAX_SAFE_INTEGER - (safeCount - 1)) {
    throw new RangeError("startPhrase plus count exceeds the safe integer range");
  }

  const cache = getTraceCache(seed);
  const lastPhrase = safeStart + safeCount - 1;
  const cachedTrace = [];
  let allRecent = true;
  for (
    let phraseIndex = safeStart;
    phraseIndex <= lastPhrase;
    phraseIndex += 1
  ) {
    const record = cache.recent.get(phraseIndex);
    if (!record) {
      allRecent = false;
      break;
    }
    cachedTrace.push(record.snapshot);
  }
  if (allRecent) return Object.freeze(cachedTrace);

  const anchor = findAnchor(cache, safeStart);
  const replayDistance = lastPhrase - anchor.index;
  if (replayDistance > MAX_REPLAY_DISTANCE) {
    throw new RangeError(
      `requested trace requires replaying ${replayDistance} phrases; warm the seed sequentially in chunks of ${MAX_TRACE_COUNT}`,
    );
  }
  let state = anchor.state;
  const trace = [];
  for (
    let phraseIndex = anchor.index + 1;
    phraseIndex <= lastPhrase;
    phraseIndex += 1
  ) {
    const advanced = advanceState(state, seed, phraseIndex);
    const record = rememberAdvance(cache, phraseIndex, advanced);
    state = record.state;
    if (phraseIndex >= safeStart) trace.push(record.snapshot);
  }
  return Object.freeze(trace);
}

export function derivePhraseState(seed, phraseIndex) {
  const safePhraseIndex = validateNonnegativeSafeInteger(
    phraseIndex,
    "phraseIndex",
  );
  return traceEmergentForm(seed, safePhraseIndex, 1)[0];
}
