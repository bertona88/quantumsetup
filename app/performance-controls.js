import { clamp, lerp } from "./generative-utils.js";

export const EQ_MIN_DB = -24;
export const EQ_MAX_DB = 6;

export const MIX_EQ_KEYS = Object.freeze(["low", "mid", "high"]);
export const MIX_CUT_KEYS = Object.freeze(["kick", "bass"]);
export const DIRECTION_KEYS = Object.freeze([
  "energy",
  "density",
  "brightness",
  "space",
  "swing",
  "acid",
  "bassPresence",
  "changeFrequency",
  "breakdownDepth",
]);
export const BASS_CHARACTERS = Object.freeze([
  "auto",
  "sub",
  "rolling",
  "acid",
  "syncopated",
]);

export const DEFAULT_MIX_CONTROLS = Object.freeze({
  low: 0,
  mid: 0,
  high: 0,
  kickCut: false,
  bassCut: false,
});

export const DEFAULT_DIRECTION_CONTROLS = Object.freeze({
  energy: 0,
  density: 0,
  brightness: 0,
  space: 0,
  swing: 0,
  acid: 0,
  bassPresence: 0,
  changeFrequency: 0,
  breakdownDepth: 0,
  bassCharacter: "auto",
});

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function normalizeMixControls(source = {}) {
  return Object.freeze({
    low: clamp(finiteOr(source.low, 0), EQ_MIN_DB, EQ_MAX_DB),
    mid: clamp(finiteOr(source.mid, 0), EQ_MIN_DB, EQ_MAX_DB),
    high: clamp(finiteOr(source.high, 0), EQ_MIN_DB, EQ_MAX_DB),
    kickCut: source.kickCut === true,
    bassCut: source.bassCut === true,
  });
}

export function normalizeDirectionControls(source = {}) {
  const normalized = Object.fromEntries(
    DIRECTION_KEYS.map((key) => [
      key,
      clamp(finiteOr(source[key], 0), -1, 1),
    ]),
  );
  normalized.bassCharacter = BASS_CHARACTERS.includes(source.bassCharacter)
    ? source.bassCharacter
    : "auto";
  return Object.freeze(normalized);
}

export function directionControlsEqual(left, right) {
  return (
    DIRECTION_KEYS.every((key) => left?.[key] === right?.[key]) &&
    left?.bassCharacter === right?.bassCharacter
  );
}

export function interpolateDirectionControls(from, to, progress) {
  const amount = clamp(Number(progress) || 0, 0, 1);
  const continuous = Object.fromEntries(
    DIRECTION_KEYS.map((key) => [
      key,
      lerp(from[key], to[key], amount),
    ]),
  );
  continuous.bassCharacter = amount >= 1
    ? to.bassCharacter
    : from.bassCharacter;
  return normalizeDirectionControls(continuous);
}

export function applyDirectionToProfile(profile, direction) {
  const controls = normalizeDirectionControls(direction);
  const neutral =
    DIRECTION_KEYS.every((key) => controls[key] === 0) &&
    controls.bassCharacter === "auto";
  if (neutral) return profile;

  const shaped = {
    ...profile,
    bpm: [...profile.bpm],
    density: clamp(
      profile.density + controls.density * 0.3 + controls.energy * 0.08,
      0,
      1,
    ),
    drive: clamp(profile.drive + controls.energy * 0.28, 0, 1),
    space: clamp(profile.space + controls.space * 0.38, 0, 1),
    swing: clamp(profile.swing + controls.swing * 0.26, 0, 1),
    acid: clamp(profile.acid + controls.acid * 0.48, 0, 1),
    metallic: clamp(
      profile.metallic + controls.brightness * 0.22,
      0,
      1,
    ),
    warmth: clamp(
      profile.warmth - controls.brightness * 0.2,
      0,
      1,
    ),
    rumble: clamp(
      profile.rumble + controls.energy * 0.12 + controls.bassPresence * 0.08,
      0,
      1,
    ),
    syncopation: clamp(
      profile.syncopation +
        controls.changeFrequency * 0.08 +
        (controls.bassCharacter === "rolling" ? 0.12 : 0) +
        (controls.bassCharacter === "acid" ? 0.14 : 0) +
        (controls.bassCharacter === "syncopated" ? 0.26 : 0),
      0,
      1,
    ),
    breakDepth: clamp(
      profile.breakDepth + controls.breakdownDepth * 0.42,
      0,
      1,
    ),
    performanceBassPresence: controls.bassPresence,
    performanceBrightness: controls.brightness,
    performanceChangeFrequency: controls.changeFrequency,
    performanceBreakdownDepth: controls.breakdownDepth,
    performanceBassCharacter: controls.bassCharacter,
  };

  if (controls.bassCharacter === "sub") {
    shaped.acid = clamp(shaped.acid - 0.22, 0, 1);
    shaped.warmth = clamp(shaped.warmth + 0.18, 0, 1);
  } else if (controls.bassCharacter === "rolling") {
    shaped.density = clamp(shaped.density + 0.12, 0, 1);
  } else if (controls.bassCharacter === "acid") {
    shaped.acid = clamp(shaped.acid + 0.32, 0, 1);
  }

  return Object.freeze({
    ...shaped,
    bpm: Object.freeze(shaped.bpm),
  });
}

export function applyDirectionToForm(form, direction) {
  const controls = normalizeDirectionControls(direction);
  if (
    controls.changeFrequency === 0 &&
    controls.breakdownDepth === 0
  ) {
    return form;
  }
  return Object.freeze({
    ...form,
    noveltyDebt: clamp(
      form.noveltyDebt + controls.changeFrequency * 0.32,
      0,
      1,
    ),
    fatigue: clamp(
      form.fatigue + controls.breakdownDepth * 0.18,
      0,
      1,
    ),
  });
}

export function dbToGain(db) {
  return 10 ** (clamp(finiteOr(db, 0), -60, 12) / 20);
}
