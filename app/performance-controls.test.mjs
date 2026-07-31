import assert from "node:assert/strict";
import test from "node:test";

import {
  BASS_CHARACTERS,
  DEFAULT_DIRECTION_CONTROLS,
  DEFAULT_MIX_CONTROLS,
  applyDirectionToForm,
  applyDirectionToProfile,
  dbToGain,
  directionControlsEqual,
  interpolateDirectionControls,
  normalizeDirectionControls,
  normalizeMixControls,
} from "./performance-controls.js";

const PROFILE = Object.freeze({
  id: "test",
  bpm: Object.freeze([126, 134]),
  density: 0.5,
  drive: 0.5,
  space: 0.5,
  swing: 0.5,
  acid: 0.5,
  metallic: 0.5,
  rumble: 0.5,
  warmth: 0.5,
  syncopation: 0.5,
  breakDepth: 0.5,
});

test("performance control defaults are frozen and neutral", () => {
  assert.ok(Object.isFrozen(DEFAULT_MIX_CONTROLS));
  assert.ok(Object.isFrozen(DEFAULT_DIRECTION_CONTROLS));
  assert.equal(
    applyDirectionToProfile(PROFILE, DEFAULT_DIRECTION_CONTROLS),
    PROFILE,
  );
});

test("mix and direction inputs normalize to bounded values", () => {
  assert.deepEqual(normalizeMixControls({
    low: -99,
    mid: "3",
    high: Infinity,
    kickCut: true,
    bassCut: "true",
  }), {
    low: -24,
    mid: 3,
    high: 0,
    kickCut: true,
    bassCut: false,
  });
  assert.deepEqual(normalizeDirectionControls({
    energy: 4,
    density: -4,
    bassCharacter: "invalid",
  }), {
    ...DEFAULT_DIRECTION_CONTROLS,
    energy: 1,
    density: -1,
  });
  assert.deepEqual(BASS_CHARACTERS, [
    "auto",
    "sub",
    "rolling",
    "acid",
    "syncopated",
  ]);
});

test("direction interpolation keeps discrete bass character phrase-stable", () => {
  const target = normalizeDirectionControls({
    energy: 1,
    space: -1,
    bassCharacter: "acid",
  });
  const halfway = interpolateDirectionControls(
    DEFAULT_DIRECTION_CONTROLS,
    target,
    0.5,
  );
  assert.equal(halfway.energy, 0.5);
  assert.equal(halfway.space, -0.5);
  assert.equal(halfway.bassCharacter, "auto");
  assert.equal(
    interpolateDirectionControls(DEFAULT_DIRECTION_CONTROLS, target, 1)
      .bassCharacter,
    "acid",
  );
  assert.equal(directionControlsEqual(target, { ...target }), true);
});

test("direction macros shape bounded musical profiles and form debt", () => {
  const direction = normalizeDirectionControls({
    energy: 1,
    density: 1,
    brightness: 1,
    space: -1,
    swing: 1,
    acid: 1,
    bassPresence: 1,
    changeFrequency: 1,
    breakdownDepth: 1,
    bassCharacter: "acid",
  });
  const shaped = applyDirectionToProfile(PROFILE, direction);
  assert.ok(shaped.density > PROFILE.density);
  assert.ok(shaped.drive > PROFILE.drive);
  assert.ok(shaped.space < PROFILE.space);
  assert.ok(shaped.metallic > PROFILE.metallic);
  assert.ok(shaped.swing > PROFILE.swing);
  assert.equal(shaped.acid, 1);
  assert.equal(shaped.performanceBassCharacter, "acid");
  assert.ok(Object.values(shaped).every((value) =>
    typeof value !== "number" || Number.isFinite(value)
  ));

  const form = Object.freeze({ noveltyDebt: 0.5, fatigue: 0.5 });
  const shapedForm = applyDirectionToForm(form, direction);
  assert.ok(Math.abs(shapedForm.noveltyDebt - 0.82) < 1e-12);
  assert.ok(Math.abs(shapedForm.fatigue - 0.68) < 1e-12);
});

test("decibel conversion stays finite and monotonic", () => {
  assert.equal(dbToGain(0), 1);
  assert.ok(dbToGain(-24) < dbToGain(-6));
  assert.ok(dbToGain(6) > 1);
  assert.ok(Number.isFinite(dbToGain(Infinity)));
});
