import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";

import {
  ARTISTIC_COUNCIL,
  ECHO_ASCENT_VARIANTS,
  ENSEMBLE_SCENES,
  GENERATOR_VERSION,
  MOVEMENT_BARS,
  REFERENCE_TENDENCIES,
  VIBES,
  blendProfileObjects,
  blendProfiles,
  buildBarPlan,
  buildEnsemblePhrase,
  conveneCouncil,
  createMovement,
  detailContourForBar,
  derivePhraseState,
  hash32,
  makeRng,
  nextPhraseBoundary,
  planInstrumentSignature,
  planNotesBelongToMode,
  planPatternSignature,
  profileDistance,
  profileForVibe,
  referenceTendencyFor,
  selectEnsembleScene,
  stageEnsembleRoles,
  transitionDurationFor,
  transitionProgress,
} from "./techno-model.js";
import {
  synthHandoffForForm,
  validateSynthGenome,
} from "./synth-genomes.js";
import {
  applyTasteDecision,
  createTasteProfile,
} from "./taste-model.js";

test("canonical supplied generator remains byte-identical", () => {
  const source = readFileSync(
    new URL("../reference/infinite-hypnotic-techno.html", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "03014fca7b13962ca166090df82c8045e2ea9758c9dfa78e5c72ca575d57ed57",
  );
});

test("the versioned high-level browser API remains source-compatible", () => {
  assert.equal(GENERATOR_VERSION, "2.4.0");
  const source = readFileSync(
    new URL("./main.js", import.meta.url),
    "utf8",
  );
  for (const fragment of [
    "window.QuantumTechno = Object.freeze({",
    "version: GENERATOR_VERSION",
    "getSnapshot: () => engine.getSnapshot()",
    "requestVibe: (vibe) => engine.requestVibe(vibe)",
    "requestTonality: (tonality) => engine.requestTonality(tonality)",
    "setMixControl: (name, value) => engine.requestMixControl(name, value)",
    "setDirectionControl: (name, value)",
    "setBassCharacter: (character) => engine.requestBassCharacter(character)",
  ]) {
    assert.ok(source.includes(fragment), `${fragment} browser contract was removed`);
  }
});

test("trajectory DNA makes kick rumble absent, short, or deep for the whole track", () => {
  const plans = Object.fromEntries(
    [
      ["off", 0],
      ["short", 4],
      ["deep", 2],
    ].map(([mode, seed]) => [mode, buildBarPlan({ seed, bar: 0 })]),
  );
  for (const [mode, plan] of Object.entries(plans)) {
    assert.equal(plan.trackDNA.kickRumbleMode, mode);
    assert.equal(plan.lowEnd.kickRumbleMode, mode);
  }
  assert.equal(plans.off.kickTimbre.rumbleSend, 0);
  assert.equal(plans.off.kickTimbre.rumbleFeedback, 0);
  assert.ok(plans.short.kickTimbre.rumbleSend > 0);
  assert.ok(plans.short.kickTimbre.rumbleFeedback > 0);
  assert.ok(plans.short.kickTimbre.rumbleFeedback <= 0.29);
  assert.ok(plans.deep.kickTimbre.rumbleSend > 0);
  assert.ok(plans.deep.kickTimbre.rumbleFeedback > 0.29);
  const baseProfile = profileForVibe("hypnotic");
  const unprotectedDeep = buildBarPlan({
    seed: 2,
    bar: 0,
    profile: {
      ...baseProfile,
      performanceBassCharacter: "sub",
    },
  });
  const bassProtectedDeep = buildBarPlan({
    seed: 2,
    bar: 0,
    profile: {
      ...baseProfile,
      performanceBassCharacter: "acid",
    },
  });
  assert.deepEqual(unprotectedDeep.trackDNA, bassProtectedDeep.trackDNA);
  assert.equal(bassProtectedDeep.trackDNA.kickRumbleMode, "deep");
  for (const field of [
    "bodyHz",
    "pitchStartHz",
    "pitchDropSeconds",
    "decaySeconds",
    "clickHz",
    "clickLevel",
    "drive",
  ]) {
    assert.equal(
      bassProtectedDeep.kickTimbre[field],
      unprotectedDeep.kickTimbre[field],
      `${field} changed in the rumble-protection comparison`,
    );
  }
  assert.ok(
    Math.abs(
      bassProtectedDeep.kickTimbre.rumbleSend /
        unprotectedDeep.kickTimbre.rumbleSend -
        0.46,
    ) <= 1e-9,
  );
  assert.ok(
    bassProtectedDeep.kickTimbre.rumbleFeedback <
      unprotectedDeep.kickTimbre.rumbleFeedback,
  );
  assert.ok(bassProtectedDeep.kickTimbre.rumbleCutoffHz <= 112);
  assert.equal(bassProtectedDeep.lowEnd.rumbleBassDuckDepth, 0.62);
});

test("acid climax phrases authorize one bounded ultra-long decay", () => {
  const profile = {
    ...profileForVibe("acid"),
    performanceBassCharacter: "acid",
  };
  const plans = Array.from({ length: 8 }, (_, offset) =>
    buildBarPlan({
      seed: 0,
      bar: 96 + offset,
      vibeId: "acid",
      profile,
      instrumentProfile: profile,
    }),
  );
  assert.ok(plans.every((plan) => plan.form.climax));
  const tails = plans.filter(
    (plan) => plan.lowEnd.acidClimaxTailSeconds > 0,
  );
  assert.equal(tails.length, 1);
  const [tailPlan] = tails;
  assert.equal(tailPlan.bassVoice, "acid");
  assert.ok(tailPlan.lowEnd.acidClimaxTailSeconds >= 1.4);
  assert.ok(tailPlan.lowEnd.acidClimaxTailSeconds <= 3.2);
  assert.equal(
    tailPlan.bass[tailPlan.lowEnd.acidClimaxTailStep].acidDecaySeconds,
    tailPlan.lowEnd.acidClimaxTailSeconds,
  );

  const ordinary = buildBarPlan({
    seed: 0,
    bar: 0,
    vibeId: "acid",
    profile,
    instrumentProfile: profile,
  });
  assert.equal(ordinary.form.climax, false);
  assert.equal(ordinary.lowEnd.acidClimaxTailSeconds, 0);
});

test("pulse bass stays below the lead register while preserving modal pitch classes", () => {
  const profile = {
    ...profileForVibe("acid"),
    performanceBassCharacter: "syncopated",
  };
  let noteCount = 0;
  for (const seed of [
    ...Array.from({ length: 12 }, (_, index) => index),
    "aea7f054715ef84575f0efba069b1ec1",
  ]) {
    const bars = typeof seed === "string"
      ? Array.from({ length: 8 }, (_, offset) => 40 + offset)
      : Array.from({ length: 16 }, (_, bar) => bar);
    for (const bar of bars) {
      const plan = buildBarPlan({
        seed,
        bar,
        vibeId: "acid",
        tonality: "neutral",
        profile,
        instrumentProfile: profile,
      });
      assert.equal(plan.bassVoice, "pulse");
      assert.equal(planNotesBelongToMode(plan), true);
      for (const note of plan.bass.filter(Boolean)) {
        noteCount += 1;
        assert.ok(note.midi >= 34);
        assert.ok(note.midi <= 47);
        if (Number.isFinite(note.slideTo)) {
          assert.ok(note.slideTo >= 34);
          assert.ok(note.slideTo <= 47);
        }
      }
    }
  }
  assert.ok(noteCount > 300);
});

test("pulse timbre is frozen with resident material and reaches every uniform variant", () => {
  const profile = {
    ...profileForVibe("acid"),
    performanceBassCharacter: "syncopated",
  };
  const reached = new Set();

  for (let seed = 0; seed < 64; seed += 1) {
    const first = buildBarPlan({
      seed,
      bar: 0,
      vibeId: "acid",
      tonality: "neutral",
      profile,
      instrumentProfile: profile,
    });
    const last = buildBarPlan({
      seed,
      bar: 7,
      vibeId: "acid",
      tonality: "neutral",
      profile,
      instrumentProfile: profile,
    });
    assert.equal(first.bassVoice, "pulse");
    assert.equal(first.form.bassVoiceMaterialId, last.form.bassVoiceMaterialId);
    assert.equal(first.pulseBassTimbre, last.pulseBassTimbre);
    assert.equal(first.lowEnd.pulseBassTimbre, first.pulseBassTimbre);
    assert.equal(first.lowEnd.pulseBassTimbreId, first.pulseBassTimbre.id);
    assert.equal(Object.isFrozen(first.pulseBassTimbre), true);
    assert.ok(
      first.instrumentation.some(
        (item) =>
          item.id === "bass-pulse" &&
          item.detail === first.pulseBassTimbre.label,
      ),
    );
    reached.add(first.pulseBassTimbre.id);
  }

  assert.deepEqual([...reached].sort(), [
    "all-layer-hybrid",
    "filtered",
    "neuro-reese",
    "raw-square",
    "wobble-growl",
  ]);
});

test("final kick thinning and withdrawal never vacate resident bass events", () => {
  let reducedKickBars = 0;
  let restoredVacatedEvents = 0;
  let lowEndDropoutBars = 0;
  for (let seed = 0; seed < 16; seed += 1) {
    for (let bar = 0; bar < 384; bar += 1) {
      const plan = buildBarPlan({ seed, bar });
      if (["thin", "withdraw"].includes(plan.form.kickPolicy)) {
        reducedKickBars += 1;
      }
      if (plan.form.intentionalRest || plan.lowEnd.dropoutActive) {
        assert.equal(plan.lowEnd.bassDensity, 0);
        assert.equal(plan.lowEnd.restoredBassDensity, 0);
      } else {
        assert.equal(
          plan.lowEnd.bassDensity,
          plan.lowEnd.materialBassDensity +
            plan.lowEnd.restoredBassDensity,
          `seed ${seed} bar ${bar} emitted an unaccounted bass density`,
        );
        assert.equal(
          plan.lowEnd.vacatedBassDensity,
          plan.lowEnd.restoredBassDensity +
            plan.lowEnd.blockedVacatedBassDensity,
          `seed ${seed} bar ${bar} lost vacated-anchor provenance`,
        );
        restoredVacatedEvents += plan.lowEnd.restoredBassDensity;
      }
      if (plan.lowEnd.dropoutActive) {
        lowEndDropoutBars += 1;
        assert.equal(plan.kick.some(Boolean), false);
        assert.equal(plan.bass.some(Boolean), false);
        assert.equal(plan.lowEnd.bassDensity, 0);
        assert.ok([2, 4].includes(plan.lowEnd.dropoutBars));
        assert.equal(
          plan.lowEnd.dropoutStartBar + plan.lowEnd.dropoutBars,
          8,
        );
      }
    }
  }
  assert.ok(reducedKickBars > 0);
  assert.ok(restoredVacatedEvents > 0);
  assert.ok(lowEndDropoutBars > 0);
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

test("pads avoid the opening phrase and vary later entrances and modulation", () => {
  const entryBars = new Set();
  const attackRatios = new Set();
  const modulationRates = new Set();
  const oscillatorTypes = new Set();
  let padCount = 0;

  for (let seed = 0; seed < 48; seed += 1) {
    for (let bar = 0; bar < 96; bar += 1) {
      const plan = buildBarPlan({ seed, bar });
      if (bar < 8) assert.equal(plan.pad, null);
      if (!plan.pad) continue;

      padCount += 1;
      const barInPhrase = bar % 8;
      entryBars.add(barInPhrase);
      attackRatios.add(plan.pad.attackRatio.toFixed(4));
      modulationRates.add(plan.pad.modulation.rateHz.toFixed(4));
      plan.pad.oscillatorTypes.forEach((type) => oscillatorTypes.add(type));
      assert.ok(plan.pad.durationBars >= 1);
      assert.ok(plan.pad.durationBars <= 8 - barInPhrase);
      assert.ok(plan.pad.attackRatio >= 0.08 && plan.pad.attackRatio <= 0.36);
      assert.ok(plan.pad.releaseStartRatio >= plan.pad.attackRatio + 0.18);
      assert.ok(plan.pad.releaseStartRatio <= 0.86);
      assert.ok(
        plan.pad.modulation.rateHz >= 8 &&
          plan.pad.modulation.rateHz <= 22,
      );
      assert.ok(
        plan.pad.modulation.depth >= 0.06 &&
          plan.pad.modulation.depth <= 0.16,
      );
    }
  }

  assert.ok(padCount > 100);
  assert.ok(entryBars.size >= 6);
  assert.ok(attackRatios.size > 20);
  assert.ok(modulationRates.size > 20);
  assert.deepEqual([...oscillatorTypes].sort(), ["sawtooth", "sine", "triangle"]);
});

test("the full 128-bit trajectory identity affects the musical plan", () => {
  const common = {
    bar: 0,
    vibeId: "hypnotic",
    tonality: "minor",
    profile: profileForVibe("hypnotic"),
  };
  const first = buildBarPlan({
    ...common,
    seed: "0123456789abcdeffedcba9876543210",
  });
  const changedTail = buildBarPlan({
    ...common,
    seed: "0123456789abcdeffedcba9876543211",
  });
  assert.notDeepEqual(first, changedTail);
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

test("reference-informed detail contours create bounded eight-bar motion and favor offbeats", () => {
  const contourSignatures = new Set();
  const offbeats = [];
  const quarters = [];
  for (let seed = 0; seed < 32; seed += 1) {
    const plans = Array.from({ length: 8 }, (_, bar) =>
      buildBarPlan({ seed, bar: 32 + bar }),
    );
    const contour = plans.map((plan) => plan.detailEnergy);
    contour.forEach((value) => assert.ok(value >= 0.78 && value <= 1.26));
    assert.ok(Math.max(...contour) - Math.min(...contour) >= 0.025);
    contourSignatures.add(contour.map((value) => value.toFixed(3)).join(":"));

    for (const plan of plans) {
      plan.hat.forEach((velocity, step) => {
        if (!velocity) return;
        if (step % 4 === 2) offbeats.push(velocity / plan.detailEnergy);
        if (step % 4 === 0) quarters.push(velocity / plan.detailEnergy);
      });
      assert.equal(
        plan.detailEnergy,
        detailContourForBar({
          seed,
          phraseIndex: plan.phraseIndex,
          barInPhrase: plan.barInPhrase,
          form: plan.form,
          tendency: plan.referenceTendency,
        }),
      );
    }
  }
  assert.ok(contourSignatures.size >= 24);
  assert.ok(offbeats.length > 100);
  assert.ok(quarters.length > 40);
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(offbeats) > mean(quarters) + 0.08);
});

test("three abstract reference tendencies are deterministic and broadly reachable", () => {
  const counts = Object.fromEntries(
    Object.keys(REFERENCE_TENDENCIES).map((id) => [id, 0]),
  );
  for (let seed = 0; seed < 192; seed += 1) {
    const plan = buildBarPlan({ seed, bar: 0 });
    assert.equal(plan.referenceTendency, referenceTendencyFor(plan.trackDNA));
    assert.equal(Object.isFrozen(plan.referenceTendency), true);
    counts[plan.referenceTendency.id] += 1;
  }
  assert.ok(Object.values(counts).every((count) => count >= 40));
});

test("earned echo ascents freeze a bounded bright-percussion phrase contour", () => {
  const fixtures = [
    { seed: 0, phraseIndex: 5, variant: "restrained" },
    { seed: 0, phraseIndex: 65, variant: "widening" },
    { seed: 0, phraseIndex: 46, variant: "late-throw" },
  ];
  for (const fixture of fixtures) {
    const phraseStart = fixture.phraseIndex * 8;
    const plans = Array.from({ length: 8 }, (_, barInPhrase) =>
      buildBarPlan({
        seed: fixture.seed,
        bar: phraseStart + barInPhrase,
      }),
    );
    const variant = ECHO_ASCENT_VARIANTS[fixture.variant];
    const activeCounts = [];
    const activeSends = [];
    for (const plan of plans) {
      assert.equal(plan.form.allowEchoAscent, true);
      assert.equal(plan.form.echoAscentVariant, fixture.variant);
      assert.equal(plan.councilVerdict.echoAscent, true);
      assert.equal(plan.echoAscent.variant, fixture.variant);
      assert.match(plan.echoAscent.contourId, /^resident-[1-8]$/);
      assert.ok(["percussion", "fm", "modal", "string", "bass-answer"].includes(
        plan.echoAscent.sourceLane,
      ));
      assert.equal(plan.echoAscent.startBar, variant.startBar);
      assert.ok(plan.echoAscent.feedback > 0);
      assert.ok(plan.echoAscent.feedback <= 0.55);
      assert.ok(plan.echoAscent.wet > 0 && plan.echoAscent.wet <= 0.74);
      const hits = plan.echoAscent.hits.filter(Boolean);
      if (plan.barInPhrase < variant.startBar) {
        assert.equal(plan.echoAscent.active, false);
        assert.deepEqual(hits, []);
        continue;
      }
      assert.equal(plan.echoAscent.active, true);
      assert.ok(hits.length >= 6 && hits.length <= 11);
      assert.ok(
        plan.instrumentation.some(
          (item) => item.id === "transition-echo-ascent",
        ),
      );
      assert.ok(
        plan.activeSynthEngines.every(
          (engine) => plan.ensembleScene.roles[engine].register !== "high",
        ),
      );
      for (const hit of hits) {
        assert.ok(["rim", "metallic", "shaker", "ride"].includes(hit.voice));
        assert.ok(hit.velocity >= 0.06 && hit.velocity <= 0.42);
        assert.ok(hit.brightness >= 0 && hit.brightness <= 1);
        assert.ok(hit.send >= 0 && hit.send <= 0.6);
        assert.ok(hit.pan >= -0.68 && hit.pan <= 0.68);
      }
      activeCounts.push(hits.length);
      activeSends.push(Math.max(...hits.map((hit) => hit.send)));
    }
    assert.ok(activeCounts.every((count, index) => index === 0 || count >= activeCounts[index - 1]));
    assert.ok(activeSends.every((send, index) => index === 0 || send >= activeSends[index - 1]));
  }

  const ordinary = buildBarPlan({ seed: 0, bar: 0 });
  assert.equal(ordinary.form.allowEchoAscent, false);
  assert.equal(ordinary.echoAscent, null);
});

test("rendered bar lanes preserve their selected material provenance", () => {
  const fixtures = [
    { seed: 0, bar: 2, vibeId: "peak" },
    { seed: 0, bar: 46, vibeId: "peak" },
    { seed: 0, bar: 0, vibeId: "detroit" },
    { seed: 0, bar: 297, vibeId: "peak" },
    { seed: 0, bar: 543, vibeId: "detroit" },
    { seed: 2, bar: 0, vibeId: "peak" },
    { seed: 0, bar: 1, vibeId: "hypnotic" },
    { seed: 0, bar: 103, vibeId: "hypnotic" },
    { seed: 33, bar: 55, vibeId: "hypnotic" },
    { seed: 20, bar: 120, vibeId: "peak" },
    { seed: 0, bar: 575, vibeId: "peak" },
  ];
  const directLanes = {
    kick: "kick",
    clap: "clap",
    hat: "hats",
    openHat: "openHats",
    bass: "bass",
  };
  const percussionVoices = ["shaker", "rim", "ride", "metallic", "tom"];
  const synthEngines = ["fm", "modal", "string"];
  const renderedCounts = Object.fromEntries(
    [
      ...Object.keys(directLanes),
      ...percussionVoices,
      ...synthEngines,
    ].map((lane) => [lane, 0]),
  );
  let relocatedLeadCount = 0;

  for (const fixture of fixtures) {
    const plan = buildBarPlan({
      ...fixture,
      tonality: "minor",
      profile: profileForVibe(fixture.vibeId),
    });
    const phraseOffset = plan.barInPhrase * 16;
    const slice = (lane) =>
      plan.materialState.phrase.patterns[lane].slice(
        phraseOffset,
        phraseOffset + 16,
      );
    const assertMaterialOnsets = (renderedLane, materialLane, label) => {
      renderedLane.forEach((event, step) => {
        if (!event) return;
        renderedCounts[label] += 1;
        assert.equal(
          Boolean(materialLane[step]),
          true,
          `${label} created an onset outside material phrase ${plan.phraseIndex}, bar ${plan.barInPhrase}, step ${step}`,
        );
      });
    };

    assert.equal(plan.materialState.phraseIndex, plan.phraseIndex);
    for (const [renderedLane, materialLane] of Object.entries(directLanes)) {
      assertMaterialOnsets(plan[renderedLane], slice(materialLane), renderedLane);
    }
    assert.equal(
      plan.openHat.some((velocity, step) => velocity > 0 && plan.hat[step] > 0),
      false,
    );

    const percussion = slice("percussion");
    const selectedVoices = slice("percussionVoices");
    for (const voice of percussionVoices) {
      assertMaterialOnsets(
        plan[voice],
        percussion.map(
          (active, step) => active && selectedVoices[step] === voice,
        ),
        voice,
      );
    }

    const ensemblePhrase = buildEnsemblePhrase({
      seed: fixture.seed,
      phraseIndex: plan.phraseIndex,
      movement: plan.movement,
      section: plan.section,
      profile: plan.profile,
      roles: plan.ensembleScene.roles,
      activeEngines: plan.activeSynthEngines,
      councilVerdict: plan.councilVerdict,
      materialState: plan.materialState,
    });
    let barRelocations = 0;
    for (const engine of synthEngines) {
      const sourceLane = ensemblePhrase[engine][plan.barInPhrase];
      const materialLane =
        plan.materialState.phrase.patterns.synth[engine].slice(
          phraseOffset,
          phraseOffset + 16,
        );
      plan.synth[engine].forEach((renderedNote, renderedStep) => {
        if (!renderedNote) return;
        renderedCounts[engine] += 1;
        const sourceSteps = sourceLane.flatMap((sourceNote, sourceStep) =>
          sourceNote && isDeepStrictEqual(sourceNote, renderedNote)
            ? [sourceStep]
            : [],
        );
        assert.equal(
          sourceSteps.length,
          1,
          `${engine} note does not trace to exactly one selected phrase event`,
        );
        const sourceStep = sourceSteps[0];
        assert.equal(
          Boolean(materialLane[sourceStep]),
          true,
          `${engine} note source is absent from the selected material slice`,
        );
        if (sourceStep === renderedStep) return;

        // Arrangement fitting may relocate one priority lead to a vocabulary
        // onset no farther than two sixteenths; every other onset stays put.
        barRelocations += 1;
        relocatedLeadCount += 1;
        assert.ok(renderedNote.priority >= 3);
        assert.ok(Math.abs(renderedStep - sourceStep) <= 2);
        assert.ok(
          ensemblePhrase[engine].some(
            (phraseBar) => phraseBar[renderedStep],
          ),
        );
      });
    }
    assert.ok(barRelocations <= 1);
  }

  for (const [lane, count] of Object.entries(renderedCounts)) {
    assert.ok(count > 0, `${lane} provenance assertion was not exercised`);
  }
  assert.ok(relocatedLeadCount > 0);
});

test("legacy fixed rhythm vocabularies and authored onset masks stay absent", () => {
  const source = readFileSync(
    new URL("./techno-model.js", import.meta.url),
    "utf8",
  );
  for (const legacyFragment of [
    "GROOVE_VOCABULARIES",
    "alternatingPattern",
    "sparsePattern",
    "role.pattern",
    "shuffled([1, 3, 5, 7, 9, 11, 13, 15]",
  ]) {
    assert.equal(
      source.includes(legacyFragment),
      false,
      `${legacyFragment} reintroduced fixed onset authority`,
    );
  }
  for (const scene of ENSEMBLE_SCENES) {
    for (const role of Object.values(scene.roles)) {
      assert.equal(Object.hasOwn(role, "pattern"), false);
    }
  }
});

test("successive echo ascents rotate resident-material contours instead of replaying a fixed hit array", () => {
  const events = [];
  for (let seed = 0; seed < 8; seed += 1) {
    let priorContour = null;
    for (let phraseIndex = 0; phraseIndex < 96; phraseIndex += 1) {
      const form = derivePhraseState(seed, phraseIndex);
      if (!form.allowEchoAscent) continue;
      const activeBars = Array.from({ length: 8 }, (_, barInPhrase) =>
        buildBarPlan({ seed, bar: phraseIndex * 8 + barInPhrase }),
      ).filter((plan) => plan.echoAscent?.active);
      const first = activeBars[0].echoAscent;
      assert.notEqual(first.contourId, priorContour);
      priorContour = first.contourId;
      events.push({
        variant: first.variant,
        contourId: first.contourId,
        sourceLane: first.sourceLane,
        delaySteps: first.delaySteps,
        feedback: first.feedback,
        signature: activeBars
          .map((plan) =>
            plan.echoAscent.hits
              .map((hit, step) => (hit ? `${hit.voice}:${step}` : "-"))
              .join("|"),
          )
          .join("/"),
      });
    }
  }
  assert.ok(events.length >= 20);
  assert.ok(new Set(events.map((event) => event.contourId)).size >= 7);
  assert.ok(new Set(events.map((event) => event.sourceLane)).size >= 4);
  assert.ok(new Set(events.map((event) => event.signature)).size >= events.length * 0.9);
  assert.ok(
    new Set(events.map((event) => `${event.delaySteps}:${event.feedback.toFixed(3)}`))
      .size >= 8,
  );
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
        assert.ok(plan.activeSynthEngines.length >= 0);
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

test("ensemble scenes are deterministic, phrase-stable, and causally handed off", () => {
  const reached = new Set();
  for (let seed = 0; seed < 64; seed += 1) {
    const sceneByMaterial = new Map();
    let previousPlan = null;
    for (let phraseIndex = 0; phraseIndex < 96; phraseIndex += 1) {
      const phraseStart = phraseIndex * 8;
      const firstPlan = buildBarPlan({
        seed,
        bar: phraseStart,
        vibeId: "hypnotic",
        tonality: "minor",
        profile: profileForVibe("hypnotic"),
      });
      const lastPlan = buildBarPlan({
        seed,
        bar: phraseStart + 7,
        vibeId: "hypnotic",
        tonality: "minor",
        profile: profileForVibe("hypnotic"),
      });
      const first = selectEnsembleScene(
        seed,
        firstPlan.movement,
        firstPlan.section,
        phraseIndex,
      );
      const second = selectEnsembleScene(
        seed,
        firstPlan.movement,
        firstPlan.section,
        phraseIndex,
      );
      assert.deepEqual(first, second);
      assert.equal(firstPlan.ensembleScene.id, first.id);
      assert.equal(lastPlan.ensembleScene.id, first.id);
      assert.ok(first.label.length <= 14);
      reached.add(first.id);

      const sceneMaterialId = firstPlan.form.sceneMaterialId;
      if (sceneByMaterial.has(sceneMaterialId)) {
        assert.equal(first.id, sceneByMaterial.get(sceneMaterialId));
      } else {
        sceneByMaterial.set(sceneMaterialId, first.id);
      }
      if (previousPlan) {
        if (firstPlan.form.sceneOperation === "handoff") {
          assert.ok(
            ["mutate", "replace", "recall"].includes(
              firstPlan.form.motifOperation,
            ),
          );
          assert.ok(firstPlan.synthHandoff);
          assert.equal(
            firstPlan.synthHandoff.operation,
            firstPlan.form.motifOperation,
          );
          assert.notEqual(
            firstPlan.form.sceneMaterialId,
            previousPlan.form.sceneMaterialId,
          );
        } else {
          assert.equal(
            firstPlan.form.sceneMaterialId,
            previousPlan.form.sceneMaterialId,
          );
          assert.equal(first.id, previousPlan.ensembleScene.id);
        }
      }
      if (first.recalled) {
        assert.ok(first.sourceSectionIndex < firstPlan.section.index);
      }
      for (const bar of [phraseStart, phraseStart + 7]) {
        const plan = buildBarPlan({
          seed,
          bar,
          vibeId: "hypnotic",
          tonality: "minor",
          profile: profileForVibe("hypnotic"),
        });
        assert.equal(plan.ensembleScene.id, first.id);
      }
      previousPlan = firstPlan;
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
  const materialState = buildBarPlan({
    seed,
    bar: phraseIndex * 8,
    vibeId: "peak",
    tonality: "minor",
    profile,
  }).materialState;
  const nextMaterialState = buildBarPlan({
    seed,
    bar: (phraseIndex + 1) * 8,
    vibeId: "peak",
    tonality: "minor",
    profile,
  }).materialState;

  const reachedEngines = new Set();
  for (const scene of ENSEMBLE_SCENES) {
    const input = {
      seed,
      phraseIndex,
      movement,
      section,
      profile,
      roles: scene.roles,
      materialState,
    };
    const first = buildEnsemblePhrase(input);
    buildEnsemblePhrase({
      ...input,
      phraseIndex: phraseIndex + 1,
      materialState: nextMaterialState,
    });
    const second = buildEnsemblePhrase(input);
    assert.deepEqual(first, second);

    const leadEngine = ["fm", "modal", "string"].find(
      (engine) => scene.roles[engine].priority === 3,
    );
    assert.ok(first[leadEngine].some((bar) => bar.some(Boolean)));
    for (const engine of ["fm", "modal", "string"]) {
      if (first[engine].some((bar) => bar.some(Boolean))) {
        reachedEngines.add(engine);
      }
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
          assert.equal(
            materialState.phrase.patterns.kick[bar * 16 + step],
            false,
          );
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
      assert.ok(starts <= 4);
    }
  }
  assert.deepEqual([...reachedEngines].sort(), ["fm", "modal", "string"]);
});

test("resonator spatial gestures are occasional, bounded, and never back to back", () => {
  const seed = 0x5d051e19;
  const profile = profileForVibe("hypnotic");
  const effectPhrases = [];
  const effects = new Set();

  for (let phrase = 0; phrase < 40; phrase += 1) {
    const treated = [];
    for (let barOffset = 0; barOffset < 8; barOffset += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phrase * 8 + barOffset,
        vibeId: "hypnotic",
        tonality: "minor",
        profile,
      });
      for (const engine of ["fm", "modal", "string"]) {
        for (const note of plan.synth[engine].filter(Boolean)) {
          if (!note.effect) continue;
          assert.equal(engine, "modal");
          assert.ok(
            ["resonator-halo", "resonator-echo"].includes(note.effect),
          );
          assert.ok(note.delaySend >= 0 && note.delaySend <= 0.42);
          assert.ok(note.reverbSend >= 0 && note.reverbSend <= 0.55);
          if (note.effect === "resonator-halo") {
            assert.ok(note.reverbSend >= 0.4);
          } else {
            assert.ok(note.delaySend >= 0.25);
          }
          effects.add(note.effect);
          treated.push(note);
        }
      }
    }
    assert.ok(treated.length <= 1);
    if (treated.length === 1) effectPhrases.push(phrase);
  }

  assert.ok(effectPhrases.length >= 4 && effectPhrases.length <= 16);
  assert.ok(!effectPhrases.includes(0));
  for (let index = 1; index < effectPhrases.length; index += 1) {
    assert.ok(effectPhrases[index] - effectPhrases[index - 1] > 1);
  }
  assert.deepEqual([...effects].sort(), ["resonator-echo", "resonator-halo"]);
});

test("ensemble roles obey the same causal one-engine handoff as timbre", () => {
  let runtime = null;
  let holdCount = 0;
  let eventCount = 0;
  const authorizedEngines = new Set();

  for (let phraseIndex = 0; phraseIndex < 384; phraseIndex += 1) {
    const candidatePlan = buildBarPlan({
      seed: 0xdecafbad,
      bar: phraseIndex * 8,
      vibeId: "detroit",
      tonality: "minor",
      profile: profileForVibe("detroit"),
    });
    const handoff = synthHandoffForForm(
      0xdecafbad,
      candidatePlan.form,
    );
    assert.deepEqual(candidatePlan.synthHandoff, handoff);
    const previous = runtime;
    runtime = stageEnsembleRoles(
      runtime,
      candidatePlan.ensembleTargetRoles,
      handoff,
    );
    if (!previous) continue;

    const changed = ["fm", "modal", "string"].filter(
      (engine) => runtime[engine] !== previous[engine],
    );
    if (!handoff) {
      holdCount += 1;
      assert.equal(runtime, previous);
      continue;
    }
    eventCount += 1;
    authorizedEngines.add(handoff.engine);
    assert.deepEqual(
      changed,
      candidatePlan.ensembleTargetRoles[handoff.engine] ===
        previous[handoff.engine]
        ? []
        : [handoff.engine],
    );
    for (const engine of ["fm", "modal", "string"]) {
      if (engine !== handoff.engine) {
        assert.equal(runtime[engine], previous[engine]);
      }
    }
  }
  assert.ok(holdCount > eventCount);
  assert.ok(eventCount > 0);
  assert.deepEqual([...authorizedEngines].sort(), ["fm", "modal", "string"]);
});

test("runtime-style causal scene changes become stable one-engine hybrids", () => {
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
      candidate.synthHandoff,
    );
    assert.deepEqual(
      ["fm", "string", "modal"].map(
        (engine) => runtime[engine].register,
      ),
      ["low", "mid", "high"],
    );

    if (previous) {
      const mutationEngine = candidate.synthHandoff?.engine ?? null;
      const changed = ["fm", "modal", "string"].filter(
        (engine) => runtime[engine] !== previous[engine],
      );
      assert.deepEqual(
        changed,
        !mutationEngine ||
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
        plan.activeSynthEngines.some(
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
          assert.equal(Boolean(plan.kick[step]), false);
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
        assert.ok(starts <= plan.councilVerdict.maxAdvancedStarts);
      }
    }
  }
});

test("the four-lens council enforces one idea, earned dialogue, and rare fills", () => {
  assert.deepEqual(
    ARTISTIC_COUNCIL.map((member) => member.attribution),
    ["Carl Cox", "Sven Väth", "Richie Hawtin", "Derrick May"],
  );
  const reachedChairs = new Set();
  const reachedEngines = new Set();
  for (const seed of [0, 1, 2, 3, 0x51eed, 0xa11ce]) {
    for (let bar = 0; bar < 768; bar += 1) {
      const plan = buildBarPlan({
        seed,
        bar,
        vibeId: "detroit",
        tonality: "minor",
        profile: profileForVibe("detroit"),
      });
      const verdict = plan.councilVerdict;
      reachedChairs.add(verdict.chair);
      plan.activeSynthEngines.forEach((engine) => reachedEngines.add(engine));
      assert.deepEqual(
        verdict,
        conveneCouncil({
          seed,
          movement: plan.movement,
          section: plan.section,
          phraseIndex: plan.phraseIndex,
          roles: plan.ensembleScene.roles,
          profile: plan.profile,
        }),
      );
      assert.ok(plan.activeSynthEngines.length <= 2);
      const phenotypeDialogue =
        ["call-response", "counterline"].includes(
          plan.trackDNA.foregroundRole,
        ) &&
        plan.form.density > 0.42 &&
        plan.form.space < 0.78;
      const vibeDialogue =
        ["detroit", "peak"].includes(plan.profile.id) &&
        plan.form.density > 0.48;
      if (
        !plan.form.earnedDialogue &&
        !phenotypeDialogue &&
        !vibeDialogue
      ) {
        assert.ok(plan.activeSynthEngines.length <= 1);
      }
      for (const engine of ["fm", "modal", "string"]) {
        if (!plan.activeSynthEngines.includes(engine)) {
          assert.equal(plan.synth[engine].some(Boolean), false);
        }
      }
      const optionalLayers = [
        plan.shaker.some(Boolean),
        plan.rim.some(Boolean),
        plan.ride.some(Boolean),
        plan.metallic.some(Boolean),
        plan.chord.some(Boolean),
        Boolean(plan.pad),
        Boolean(plan.texture),
      ].filter(Boolean).length;
      assert.ok(optionalLayers <= verdict.optionalLayerBudget);
      if (plan.tom.some(Boolean)) {
        assert.equal(plan.phraseEnd, true);
        assert.equal(verdict.allowFill, true);
      }
      if (
        plan.form.kickPolicy === "anchor" &&
        !plan.lowEnd.dropoutActive
      ) {
        assert.ok(plan.kick[0] > 0);
        assert.equal(plan.material.laneClocks.kick.loopLength, 16);
      } else if (
        plan.form.kickPolicy === "withdraw" ||
        plan.lowEnd.dropoutActive
      ) {
        for (const step of [0, 4, 8, 12]) assert.equal(plan.kick[step], 0);
      }
    }
  }
  assert.deepEqual([...reachedChairs].sort(), [
    "floor-authority",
    "long-arc",
    "machine-soul",
    "radical-reduction",
  ]);
  assert.deepEqual([...reachedEngines].sort(), ["fm", "modal", "string"]);
});

test("equal-priority foreground follows causal lineage-chair residency, not labels", () => {
  const equalRoles = Object.freeze(
    Object.fromEntries(
      ["fm", "modal", "string"].map((engine) => [
        engine,
        Object.freeze({ engine, priority: 2 }),
      ]),
    ),
  );
  let crossedReadoutBoundary = false;
  for (const seed of [0, 7, 94, 0xa11ce]) {
    const foregroundByCausalResidency = new Map();
    let previous = null;
    for (let phraseIndex = 0; phraseIndex < 192; phraseIndex += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phraseIndex * 8,
        vibeId: "detroit",
        tonality: "minor",
        profile: profileForVibe("detroit"),
      });
      const verdict = conveneCouncil({
        seed,
        movement: plan.movement,
        section: plan.section,
        phraseIndex,
        roles: equalRoles,
      });
      const key = `${plan.form.motifLineageId}:${plan.form.chair}`;
      const foreground = verdict.activeSynthEngines[0] ?? null;
      if (foreground) {
        if (foregroundByCausalResidency.has(key)) {
          assert.equal(foreground, foregroundByCausalResidency.get(key));
        } else {
          foregroundByCausalResidency.set(key, foreground);
        }
      }
      if (
        previous &&
        previous.label !== plan.form.label &&
        previous.key === key &&
        previous.foreground &&
        foreground
      ) {
        crossedReadoutBoundary = true;
        assert.equal(foreground, previous.foreground);
      }
      previous = {
        label: plan.form.label,
        key,
        foreground,
      };
    }
  }
  assert.equal(crossedReadoutBoundary, true);
});

test("taste can change timbre selection but cannot change the arrangement", () => {
  const seed = 0xdecafbad;
  const profile = profileForVibe("acid");
  const reference = buildBarPlan({
    seed,
    bar: 0,
    vibeId: "acid",
    tonality: "minor",
    profile,
  });
  let taste = createTasteProfile();
  for (let index = 0; index < 12; index += 1) {
    taste = applyTasteDecision(taste, reference.synthPalette.fm, "like");
  }

  const arrangementKeys = [
    "movement",
    "section",
    "sectionProgress",
    "sectionStart",
    "sectionEnd",
    "kick",
    "kickTimbre",
    "clap",
    "hat",
    "openHat",
    "shaker",
    "rim",
    "ride",
    "metallic",
    "tom",
    "bass",
    "bassVoice",
    "lowEnd",
    "chord",
    "pad",
    "synth",
    "synthHandoff",
    "activeSynthEngines",
    "ensembleScene",
    "councilVerdict",
    "texture",
    "riser",
    "downlifter",
    "filterOpen",
  ];
  let paletteChanged = false;
  for (let bar = 0; bar < 384; bar += 8) {
    const common = {
      seed,
      bar,
      vibeId: "acid",
      tonality: "minor",
      profile,
      instrumentProfile: profile,
    };
    const plain = buildBarPlan(common);
    const tasted = buildBarPlan({ ...common, tasteProfile: taste });
    for (const key of arrangementKeys) {
      assert.deepEqual(tasted[key], plain[key], `${key} changed at bar ${bar}`);
    }
    paletteChanged ||= ["fm", "modal", "string"].some(
      (engine) => tasted.synthPalette[engine].id !== plain.synthPalette[engine].id,
    );
  }
  assert.equal(paletteChanged, true);
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

test("long phrase scans remain diverse without outlawing deliberate recall", () => {
  for (const vibe of VIBES) {
    const recent = [];
    let repeats = 0;
    let phrases = 0;
    for (let bar = 0; bar < 4096; bar += 8) {
      const plan = buildBarPlan({
        seed: 0x51eed,
        bar,
        vibeId: vibe.id,
        tonality: "minor",
        profile: profileForVibe(vibe.id),
      });
      const signature = planPatternSignature(plan);
      if (recent.includes(signature)) repeats += 1;
      phrases += 1;
      recent.push(signature);
      if (recent.length > 64) recent.shift();
    }
    assert.ok(
      repeats / phrases < 0.08,
      `${vibe.id} repeated ${repeats} of ${phrases} phrases`,
    );
  }
});
