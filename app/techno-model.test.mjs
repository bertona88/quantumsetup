import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ENSEMBLE_SCENES,
  MOVEMENT_BARS,
  VIBES,
  blendProfileObjects,
  blendProfiles,
  buildBarPlan,
  buildEnsemblePhrase,
  createMovement,
  hash32,
  makeRng,
  nextPhraseBoundary,
  planInstrumentSignature,
  planNotesBelongToMode,
  planPatternSignature,
  profileDistance,
  profileForVibe,
  selectEnsembleScene,
  stageEnsembleRoles,
  transitionDurationFor,
  transitionProgress,
} from "./techno-model.js";
import {
  synthMutationEngineForPhrase,
  validateSynthGenome,
} from "./synth-genomes.js";

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
        assert.ok(plan.activeSynthEngines.length >= 1);
        assert.ok(plan.activeSynthEngines.length <= 3);
        for (const engine of ["fm", "modal", "string"]) {
          assert.equal(plan.synth[engine].length, 16);
          assert.ok(validateSynthGenome(plan.synthPalette[engine]));
          for (const note of plan.synth[engine].filter(Boolean)) {
            assert.ok(Number.isFinite(note.midi));
            assert.ok(note.midi >= 45 && note.midi <= 88);
            assert.ok(note.velocity >= 0 && note.velocity <= 1);
            assert.ok(note.length >= 1 && note.length <= 4);
            assert.ok(note.delaySend >= 0 && note.delaySend <= 0.42);
            assert.ok(note.reverbSend >= 0 && note.reverbSend <= 0.55);
            assert.ok(note.priority >= 0 && note.priority <= 3);
          }
        }
      }
    }
  }
});

test("instrument plans stay stable inside phrases and expose renderer-backed identities", () => {
  for (let phrase = 0; phrase < 96; phrase += 1) {
    const startBar = phrase * 8;
    const first = buildBarPlan({
      seed: 0x1a57,
      bar: startBar,
      vibeId: "detroit",
      tonality: "minor",
      profile: profileForVibe("detroit"),
    });
    const last = buildBarPlan({
      seed: 0x1a57,
      bar: startBar + 7,
      vibeId: "detroit",
      tonality: "minor",
      profile: profileForVibe("detroit"),
    });
    assert.deepEqual(
      Object.fromEntries(
        ["fm", "modal", "string"].map((engine) => [
          engine,
          first.synthPalette[engine].id,
        ]),
      ),
      Object.fromEntries(
        ["fm", "modal", "string"].map((engine) => [
          engine,
          last.synthPalette[engine].id,
        ]),
      ),
    );
    assert.equal(first.bassVoice, last.bassVoice);
    assert.ok(planInstrumentSignature(first).length > 0);
    assert.ok(
      first.instrumentation.every(
        (item) =>
          typeof item.id === "string" &&
          typeof item.role === "string" &&
          typeof item.label === "string",
      ),
    );
  }
});

test("ensemble scenes are deterministic, section-stable, reachable, and recalled", () => {
  const reached = new Set();
  for (let seed = 0; seed < 64; seed += 1) {
    const movement = createMovement(seed, 0, "minor");
    let previousSceneId = "";
    for (const section of movement.sections) {
      const first = selectEnsembleScene(seed, movement, section);
      const second = selectEnsembleScene(seed, movement, section);
      assert.deepEqual(first, second);
      assert.ok(first.label.length <= 14);
      reached.add(first.id);

      for (const bar of [section.startBar, section.endBar - 1]) {
        const plan = buildBarPlan({
          seed,
          bar,
          vibeId: "hypnotic",
          tonality: "minor",
          profile: profileForVibe("hypnotic"),
        });
        assert.equal(plan.ensembleScene.id, first.id);
      }

      if (section.kind === "RETURN") {
        assert.equal(first.recalled, true);
        assert.equal(
          first.id,
          selectEnsembleScene(
            seed,
            movement,
            movement.sections[first.sourceSectionIndex],
          ).id,
        );
      } else if (previousSceneId) {
        assert.notEqual(first.id, previousSceneId);
      }
      previousSceneId = first.id;
    }
  }
  assert.deepEqual(
    [...reached].sort(),
    ENSEMBLE_SCENES.map((scene) => scene.id).sort(),
  );
});

test("ensemble phrases are pure scored conversations with bounded placements", () => {
  const seed = 0x1a57;
  const movement = createMovement(seed, 0, "minor");
  const section =
    movement.sections.find((candidate) => candidate.kind === "PEAK") ||
    movement.sections[0];
  const phraseIndex = section.startBar / 8;
  const profile = profileForVibe("peak");

  for (const scene of ENSEMBLE_SCENES) {
    const input = {
      seed,
      phraseIndex,
      movement,
      section,
      profile,
      roles: scene.roles,
    };
    const first = buildEnsemblePhrase(input);
    buildEnsemblePhrase({
      ...input,
      phraseIndex: phraseIndex + 1,
    });
    const second = buildEnsemblePhrase(input);
    assert.deepEqual(first, second);

    for (const engine of ["fm", "modal", "string"]) {
      assert.ok(
        first[engine].some((bar) => bar.some(Boolean)),
        `${scene.id}/${engine} is not note-bearing`,
      );
    }

    for (let bar = 0; bar < 8; bar += 1) {
      let starts = 0;
      for (let step = 0; step < 16; step += 1) {
        const attacks = ["fm", "modal", "string"].filter(
          (engine) => first[engine][bar][step],
        );
        assert.ok(attacks.length <= 1);
        if (attacks.length > 0) {
          starts += 1;
          assert.equal([0, 4, 8, 12].includes(step), false);
        }
        for (const engine of attacks) {
          const note = first[engine][bar][step];
          const role = scene.roles[engine];
          assert.ok(note.midi >= role.range[0] && note.midi <= role.range[1]);
          assert.equal(note.ensembleRole, role.id);
          assert.equal(note.sourceSceneId, scene.id);
          assert.ok(note.velocity <= 0.82);
          assert.ok(note.length >= 1 && note.length <= 4);
          assert.ok(note.delaySend >= 0 && note.delaySend <= 0.42);
          assert.ok(note.reverbSend >= 0 && note.reverbSend <= 0.55);
        }
      }
      assert.ok(starts <= 8);
    }
  }
});

test("ensemble role handoffs follow the same one-engine phrase sequence as timbre", () => {
  let runtime = stageEnsembleRoles(
    null,
    ENSEMBLE_SCENES[0].roles,
    0,
  );
  assert.equal(runtime, ENSEMBLE_SCENES[0].roles);

  for (let phraseIndex = 1; phraseIndex <= 12; phraseIndex += 1) {
    const candidate =
      ENSEMBLE_SCENES[phraseIndex % ENSEMBLE_SCENES.length].roles;
    const staged = stageEnsembleRoles(
      runtime,
      candidate,
      phraseIndex,
    );
    const changed = ["fm", "modal", "string"].filter(
      (engine) => staged[engine] !== runtime[engine],
    );
    assert.deepEqual(changed, [
      synthMutationEngineForPhrase(phraseIndex),
    ]);
    for (const engine of ["fm", "modal", "string"]) {
      assert.equal(
        staged[engine],
        engine === synthMutationEngineForPhrase(phraseIndex)
          ? candidate[engine]
          : runtime[engine],
      );
    }
    runtime = staged;
  }
});

test("runtime-style section changes become stable one-engine hybrid phrases", () => {
  const seed = 0xdecafbad;
  const profile = profileForVibe("detroit");
  let runtime = null;

  for (let phraseIndex = 0; phraseIndex < 48; phraseIndex += 1) {
    const phraseStart = phraseIndex * 8;
    const candidate = buildBarPlan({
      seed,
      bar: phraseStart,
      vibeId: "detroit",
      tonality: "minor",
      profile,
      instrumentProfile: profile,
    });
    const previous = runtime;
    runtime = stageEnsembleRoles(
      runtime,
      candidate.ensembleTargetRoles,
      phraseIndex,
    );
    assert.deepEqual(
      ["fm", "string", "modal"].map(
        (engine) => runtime[engine].register,
      ),
      ["low", "mid", "high"],
    );

    if (previous) {
      const mutationEngine =
        synthMutationEngineForPhrase(phraseIndex);
      const changed = ["fm", "modal", "string"].filter(
        (engine) => runtime[engine] !== previous[engine],
      );
      assert.deepEqual(
        changed,
        candidate.ensembleTargetRoles[mutationEngine] ===
          previous[mutationEngine]
          ? []
          : [mutationEngine],
      );
    }

    for (let offset = 0; offset < 8; offset += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phraseStart + offset,
        vibeId: "detroit",
        tonality: "minor",
        profile,
        instrumentProfile: profile,
        ensembleRoles: runtime,
      });
      assert.equal(plan.ensembleScene.roles, runtime);
      assert.equal(
        plan.ensembleScene.hybrid,
        ["fm", "modal", "string"].some(
          (engine) =>
            runtime[engine].sourceSceneId !== plan.ensembleScene.id,
        ),
      );
    }
  }
});

test("arrangement-aware ensemble lanes avoid unscored collisions and stay inside budgets", () => {
  for (const seed of [0x51eed, 0xa11ce]) {
    for (const vibe of VIBES) {
      const profile = profileForVibe(vibe.id);
      for (let bar = 0; bar < 2048; bar += 11) {
        const plan = buildBarPlan({
          seed,
          bar,
          vibeId: vibe.id,
          tonality: "minor",
          profile,
          instrumentProfile: profile,
        });
        let starts = 0;
        for (let step = 0; step < 16; step += 1) {
          const attacks = ["fm", "modal", "string"].filter(
            (engine) => plan.synth[engine][step],
          );
          assert.ok(attacks.length <= 1);
          if (attacks.length === 0) continue;
          starts += 1;
          assert.equal([0, 4, 8, 12].includes(step), false);
          const engine = attacks[0];
          const note = plan.synth[engine][step];
          const role = plan.ensembleScene.roles[engine];
          assert.ok(note.midi >= role.range[0] && note.midi <= role.range[1]);
          if (engine === "modal") {
            assert.equal(Boolean(plan.metallic[step] || plan.ride[step]), false);
          } else {
            assert.equal(
              [step - 1, step, step + 1].some(
                (target) =>
                  target >= 0 && target < 16 && plan.chord[target],
              ),
              false,
            );
            if (role.register === "low") {
              assert.equal(Boolean(plan.bass[step]), false);
            }
          }
        }
        const maximum = ["VOID", "RELEASE"].includes(plan.section.kind)
          ? 2
          : plan.section.kind === "PEAK"
            ? 8
            : 6;
        assert.ok(starts <= maximum);
      }
    }
  }
});

test("bar-wise Vibe morphing cannot switch instruments inside a phrase", () => {
  const instrumentProfile = blendProfiles("dub", "hypnotic", 24 / 64);
  const signatures = [];
  for (let bar = 32; bar < 40; bar += 1) {
    const profile = blendProfiles("dub", "hypnotic", (bar - 8) / 64);
    const plan = buildBarPlan({
      seed: 2,
      bar,
      vibeId: "dub",
      tonality: "minor",
      profile,
      instrumentProfile,
    });
    signatures.push({
      bassVoice: plan.bassVoice,
      engines: plan.activeSynthEngines,
      ensemble: {
        id: plan.ensembleScene.id,
        roles: ["fm", "modal", "string"].map((engine) => {
          const role = plan.ensembleScene.roles[engine];
          return `${engine}:${role.sourceSceneId}:${role.id}:${role.register}`;
        }),
      },
      palette: ["fm", "modal", "string"].map(
        (engine) => plan.synthPalette[engine].id,
      ),
    });
  }
  assert.ok(signatures.every((signature) => signature.bassVoice === signatures[0].bassVoice));
  assert.ok(
    signatures.every(
      (signature) =>
        JSON.stringify(signature.engines) === JSON.stringify(signatures[0].engines),
    ),
  );
  assert.ok(
    signatures.every(
      (signature) =>
        JSON.stringify(signature.ensemble) ===
        JSON.stringify(signatures[0].ensemble),
    ),
  );
  assert.ok(
    signatures.every(
      (signature) =>
        JSON.stringify(signature.palette) === JSON.stringify(signatures[0].palette),
    ),
  );
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
