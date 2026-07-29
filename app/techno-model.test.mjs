import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MOVEMENT_BARS,
  VIBES,
  blendProfileObjects,
  blendProfiles,
  buildBarPlan,
  createMovement,
  hash32,
  makeRng,
  nextPhraseBoundary,
  planNotesBelongToMode,
  planPatternSignature,
  profileDistance,
  profileForVibe,
  transitionDurationFor,
  transitionProgress,
} from "./techno-model.js";

test("canonical supplied generator remains byte-identical", () => {
  const source = readFileSync(
    new URL("../reference/infinite-hypnotic-techno.html", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "03014fca7b13962ca166090df82c8045e2ea9758c9dfa78e5c72ca575d57ed57",
  );
});

test("hash and random stream are deterministic", () => {
  assert.equal(hash32("techno", 42, 9), 1073666127);
  const first = makeRng(0x12345678);
  const second = makeRng(0x12345678);
  assert.deepEqual(
    Array.from({ length: 8 }, () => first()),
    Array.from({ length: 8 }, () => second()),
  );
});

test("every movement is a complete long-form arrangement", () => {
  for (const tonality of ["minor", "major", "neutral"]) {
    for (let index = 0; index < 32; index += 1) {
      const movement = createMovement(0xa11ce, index, tonality);
      assert.equal(movement.sections[0].startBar, 0);
      assert.equal(movement.sections.at(-1).endBar, MOVEMENT_BARS);
      assert.equal(
        movement.sections.reduce((sum, section) => sum + section.duration, 0),
        MOVEMENT_BARS,
      );
      assert.ok(movement.sections.every((section) => section.duration % 8 === 0));
      assert.ok(movement.sections.every((section) => section.duration >= 8));
      assert.equal(movement.mode.tonality, tonality);
    }
  }
});

test("bar plans are stable, bounded, and harmonically legal", () => {
  const input = {
    seed: 0xdecafbad,
    bar: 847,
    vibeId: "detroit",
    tonality: "major",
    profile: profileForVibe("detroit"),
  };
  const first = buildBarPlan(input);
  const second = buildBarPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.kick.length, 16);
  assert.equal(first.bass.length, 16);
  assert.ok(first.energy >= 0 && first.energy <= 1);
  assert.ok(planNotesBelongToMode(first));
});

test("all vibe and tonality combinations survive a long scan", () => {
  for (const vibe of VIBES) {
    for (const tonality of ["minor", "major", "neutral"]) {
      for (let bar = 0; bar < 2048; bar += 17) {
        const plan = buildBarPlan({
          seed: 0x51eed,
          bar,
          vibeId: vibe.id,
          tonality,
          profile: profileForVibe(vibe.id),
        });
        assert.ok(Number.isFinite(plan.energy));
        assert.ok(planNotesBelongToMode(plan));
        for (const lane of [
          "kick",
          "clap",
          "hat",
          "openHat",
          "shaker",
          "rim",
          "ride",
          "metallic",
          "tom",
        ]) {
          assert.equal(plan[lane].length, 16);
          assert.ok(plan[lane].every((value) => Number.isFinite(value) && value >= 0));
        }
        for (const note of plan.bass.filter(Boolean)) {
          assert.ok(Number.isFinite(note.midi));
          assert.ok(note.midi >= 34 && note.midi <= 55);
          assert.ok(note.length >= 1 && note.length <= 3);
        }
      }
    }
  }
});

test("vibe transitions interpolate instead of switching", () => {
  const start = blendProfiles("dub", "peak", 0);
  const middle = blendProfiles("dub", "peak", 0.5);
  const end = blendProfiles("dub", "peak", 1);
  assert.equal(start.space, profileForVibe("dub").space);
  assert.equal(end.drive, profileForVibe("peak").drive);
  assert.ok(middle.space < start.space && middle.space > end.space);
  assert.ok(middle.drive > start.drive && middle.drive < end.drive);
  assert.ok(profileDistance("dub", "peak") > profileDistance("dub", "hypnotic"));
  assert.ok([64, 96, 128].includes(transitionDurationFor("dub", "peak")));
});

test("retargeting begins from the current interpolated profile", () => {
  const captured = blendProfiles("dub", "peak", 0.37);
  const retargetedStart = blendProfileObjects(captured, profileForVibe("acid"), 0);
  assert.deepEqual(retargetedStart, captured);
});

test("transition timing is phrase-quantized and monotonic", () => {
  assert.equal(nextPhraseBoundary(0), 8);
  assert.equal(nextPhraseBoundary(7), 8);
  assert.equal(nextPhraseBoundary(8), 16);
  let previous = 0;
  for (let bar = 31; bar <= 129; bar += 1) {
    const progress = transitionProgress(bar, 32, 96);
    assert.ok(progress >= previous);
    assert.ok(progress >= 0 && progress <= 1);
    previous = progress;
  }
  assert.equal(transitionProgress(31, 32, 96), 0);
  assert.equal(transitionProgress(128, 32, 96), 1);
});

test("major, minor, and neutral create distinct pitch material", () => {
  const common = { seed: 112233, bar: 210, vibeId: "hypnotic" };
  const minor = buildBarPlan({ ...common, tonality: "minor" });
  const major = buildBarPlan({ ...common, tonality: "major" });
  const neutral = buildBarPlan({ ...common, tonality: "neutral" });
  assert.notDeepEqual(minor.movement.mode.intervals, major.movement.mode.intervals);
  assert.notDeepEqual(neutral.movement.mode.intervals, major.movement.mode.intervals);
  assert.ok(planNotesBelongToMode(minor));
  assert.ok(planNotesBelongToMode(major));
  assert.ok(planNotesBelongToMode(neutral));
});

test("long phrase scans avoid exact recent pattern repetition", () => {
  for (const vibe of VIBES) {
    const recent = [];
    for (let bar = 0; bar < 4096; bar += 8) {
      const plan = buildBarPlan({
        seed: 0x51eed,
        bar,
        vibeId: vibe.id,
        tonality: "minor",
        profile: profileForVibe(vibe.id),
      });
      const signature = planPatternSignature(plan);
      assert.equal(
        recent.includes(signature),
        false,
        `${vibe.id} repeated an exact phrase pattern near bar ${bar}`,
      );
      recent.push(signature);
      if (recent.length > 64) recent.shift();
    }
  }
});
