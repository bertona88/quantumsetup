import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FORM_RULES,
  derivePhraseState,
  traceEmergentForm,
} from "./emergent-form.js";
import {
  advanceMaterialState,
  createMaterialState,
} from "./material-planner.js";
import {
  MOVEMENT_BARS,
  blendProfiles,
  buildBarPlan,
  createMovement,
  formAtBar,
  profileForVibe,
} from "./techno-model.js";
import { createTrackDNA } from "./track-dna.js";

const PHRASE_BARS = 8;
const STEPS_PER_BAR = 16;
const PHRASES_PER_WINDOW = MOVEMENT_BARS / PHRASE_BARS;

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
}

function materialInput(seed, phraseIndex, vibeId = "hypnotic") {
  return {
    seed,
    phraseIndex,
    trackDNA: createTrackDNA(seed),
    form: derivePhraseState(seed, phraseIndex),
    profile: profileForVibe(vibeId),
    tonality: "minor",
  };
}

function nextMaterialState(
  previous,
  seed,
  phraseIndex,
  vibeId = "hypnotic",
  profile = profileForVibe(vibeId),
) {
  const input = {
    ...materialInput(seed, phraseIndex, vibeId),
    profile,
  };
  return previous
    ? advanceMaterialState(previous, input)
    : createMaterialState(input);
}

function buildPhrasePlans({
  seed,
  phraseIndex,
  materialState,
  vibeId = "hypnotic",
  profiles = null,
}) {
  return Array.from({ length: PHRASE_BARS }, (_, barInPhrase) => {
    const profile = profiles?.[barInPhrase] || profileForVibe(vibeId);
    return buildBarPlan({
      seed,
      bar: phraseIndex * PHRASE_BARS + barInPhrase,
      vibeId,
      tonality: "minor",
      profile,
      materialState,
    });
  });
}

test("the macro planner contains no fixed movement, energy, or chair schedule", () => {
  const source = readFileSync(
    new URL("./techno-model.js", import.meta.url),
    "utf8",
  );
  for (const legacy of [
    "MOVEMENT_TEMPLATES",
    "SECTION_ENERGY",
    "COUNCIL_CHAIR_BY_SECTION",
    "GROOVE_VOCABULARIES",
    "alternatingPattern",
    "sparsePattern",
  ]) {
    assert.equal(source.includes(legacy), false, `${legacy} returned`);
  }
  assert.doesNotMatch(
    source,
    /Math\.floor\(form\.lineageAge\s*\/\s*2\)/,
    "a fixed two-phrase harmony clock returned",
  );
});

test("form tracing validates coordinates and extends deterministically in bounded chunks", () => {
  for (const [start, count] of [
    [-1, 1],
    [0.5, 1],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [0, -1],
    [0, 4097],
  ]) {
    assert.throws(
      () => traceEmergentForm("invalid-form-coordinate", start, count),
      RangeError,
    );
  }
  assert.deepEqual(traceEmergentForm("empty-form-trace", 0, 0), []);
  assert.throws(
    () => derivePhraseState("cold-replay-guard", 65536),
    /requires replaying/,
  );

  const seed = "bounded-sequential-form-extension";
  const first = traceEmergentForm(seed, 0, 4096);
  const second = traceEmergentForm(seed, 4096, 4096);
  assert.equal(first.at(-1).phraseIndex, 4095);
  assert.equal(second.at(-1).phraseIndex, 8191);
  assert.deepEqual(
    derivePhraseState(seed, second.at(-1).phraseIndex),
    second.at(-1),
  );
});

test("phrase state is deterministic, frozen, random-access safe, and bounded", () => {
  const coordinates = [
    [0, 0],
    [7, 23],
    [0x51eed, 511],
    [0xdecafbad, 2047],
  ];
  const reverse = [...coordinates].reverse().map(([seed, phrase]) =>
    derivePhraseState(seed, phrase),
  );

  coordinates.forEach(([seed, phrase], index) => {
    const direct = derivePhraseState(seed, phrase);
    assert.deepEqual(direct, traceEmergentForm(seed, phrase, 1)[0]);
    assert.deepEqual(direct, reverse[reverse.length - 1 - index]);
    assert.equal(Object.isFrozen(direct), true);
    for (const key of [
      "energyFrom",
      "energyTo",
      "energy",
      "tension",
      "density",
      "space",
      "brightness",
      "floorTrust",
      "fatigue",
      "contrastDebt",
      "payoffDebt",
      "noveltyDebt",
      "motifSalience",
      "climaxAppetite",
      "climaxReadiness",
      "climaxPermission",
      "anticipation",
      "tonalPivotReadiness",
      "harmonyTurnReadiness",
    ]) {
      assert.ok(
        Number.isFinite(direct[key]) &&
          direct[key] >= 0 &&
          direct[key] <= 1,
        `${key} escaped its bound at ${seed}:${phrase}`,
      );
    }
    for (const key of [
      "tonalMaterialId",
      "harmonyMaterialId",
      "sceneMaterialId",
      "bassVoiceMaterialId",
    ]) {
      assert.ok(
        Number.isInteger(direct[key]) &&
          direct[key] >= 0 &&
          direct[key] <= 0xffffffff,
        `${key} escaped uint32 at ${seed}:${phrase}`,
      );
    }
    assert.ok(["hold", "pivot"].includes(direct.tonalOperation));
    assert.ok(["hold", "turn"].includes(direct.harmonyOperation));
    assert.ok(["hold", "handoff"].includes(direct.sceneOperation));
  });
});

test("the recurrent form earns variable arcs, cooldowns, and independent material intents", () => {
  const eventCounts = {
    climax: 0,
    climaxOnset: 0,
    fill: 0,
    riser: 0,
    echoAscent: 0,
    dialogue: 0,
    kickFamily: 0,
    withdrawal: 0,
    lowEndDropout: 0,
    mutation: 0,
    replacement: 0,
    recall: 0,
    harmonyTurn: 0,
  };
  const chairs = new Set();
  const labels = new Set();
  const harmonyResidues = new Set();
  const harmonyGaps = new Set();
  const echoAscentVariants = new Set();
  const values = {
    energy: [],
    tension: [],
    floorTrust: [],
    motifSalience: [],
  };
  let windowsWithClimax = 0;
  let windowsWithoutClimax = 0;
  let longestCompleteClimax = 0;

  for (let seed = 0; seed < 32; seed += 1) {
    const trace = traceEmergentForm(seed, 0, 256);
    if (trace.slice(0, PHRASES_PER_WINDOW).some((state) => state.climax)) {
      windowsWithClimax += 1;
    } else {
      windowsWithoutClimax += 1;
    }

    const lastAt = {
      fill: -Infinity,
      riser: -Infinity,
      echoAscent: -Infinity,
      dialogue: -Infinity,
      kickFamily: -Infinity,
      mutation: -Infinity,
      recall: -Infinity,
      withdrawal: -Infinity,
      thinning: -Infinity,
      lowEndDropout: -Infinity,
      climaxOnset: -Infinity,
      harmonyTurn: null,
    };
    let climaxRun = 0;
    let withdrawalRun = 0;
    let thinningRun = 0;
    let previous = null;

    for (const state of trace) {
      chairs.add(state.chair);
      labels.add(state.label);
      for (const key of Object.keys(values)) values[key].push(state[key]);
      eventCounts.climax += Number(state.climax);
      eventCounts.climaxOnset += Number(state.climaxOnset);

      const permissions = {
        fill: state.allowFill,
        riser: state.allowRiser,
        echoAscent: state.allowEchoAscent,
        dialogue: state.earnedDialogue,
        kickFamily: state.kickFamilyMorph,
      };
      const cooldowns = {
        fill: FORM_RULES.fill.cooldownPhrases,
        riser: FORM_RULES.riser.cooldownPhrases,
        echoAscent: FORM_RULES.echoAscent.cooldownPhrases,
        dialogue: FORM_RULES.dialogue.cooldownPhrases,
        kickFamily: FORM_RULES.kickFamily.cooldownPhrases,
      };
      for (const [event, active] of Object.entries(permissions)) {
        if (!active) continue;
        assert.ok(
          state.phraseIndex - lastAt[event] >= cooldowns[event],
          `${event} repeated before its cooldown`,
        );
        lastAt[event] = state.phraseIndex;
        eventCounts[event] += 1;
      }
      if (state.allowEchoAscent) {
        echoAscentVariants.add(state.echoAscentVariant);
        assert.equal(state.allowRiser, false);
        assert.ok(state.echoAscentReadiness >= 0.39);
      } else {
        assert.equal(state.echoAscentVariant, null);
      }

      if (state.climaxOnset) {
        assert.ok(
          state.phraseIndex - lastAt.climaxOnset >=
            FORM_RULES.climax.cooldownPhrases +
              FORM_RULES.climax.minimumPhrases,
        );
        lastAt.climaxOnset = state.phraseIndex;
        if (previous) {
          assert.ok(previous.tension >= FORM_RULES.climax.minTension);
          assert.ok(previous.floorTrust >= FORM_RULES.climax.minFloorTrust);
          assert.ok(previous.payoffDebt >= FORM_RULES.climax.minPayoffDebt);
          assert.equal(previous.climaxCooldown, 0);
        }
      }
      if (state.climax) {
        climaxRun += 1;
      } else if (climaxRun > 0) {
        assert.ok(climaxRun >= FORM_RULES.climax.minimumPhrases);
        assert.ok(climaxRun <= FORM_RULES.climax.maximumPhrases);
        longestCompleteClimax = Math.max(
          longestCompleteClimax,
          climaxRun,
        );
        climaxRun = 0;
      }

      if (state.kickPolicy === "withdraw") {
        eventCounts.withdrawal += 1;
        withdrawalRun += 1;
        assert.ok(
          withdrawalRun <= FORM_RULES.kickWithdrawal.maximumPhrases,
        );
        if (withdrawalRun === 1) {
          assert.ok(
            state.phraseIndex - lastAt.withdrawal >=
              FORM_RULES.kickWithdrawal.cooldownPhrases,
          );
          lastAt.withdrawal = state.phraseIndex;
        }
      } else {
        withdrawalRun = 0;
      }

      if (state.kickPolicy === "thin") {
        thinningRun += 1;
        assert.ok(
          thinningRun <= FORM_RULES.kickThinning.maximumPhrases,
        );
        if (thinningRun === 1) {
          assert.ok(
            state.phraseIndex - lastAt.thinning >=
              FORM_RULES.kickThinning.cooldownPhrases,
          );
          lastAt.thinning = state.phraseIndex;
        }
      } else {
        thinningRun = 0;
      }

      if (state.lowEndDropout) {
        assert.ok(
          state.phraseIndex - lastAt.lowEndDropout >=
            FORM_RULES.lowEndDropout.cooldownPhrases,
        );
        lastAt.lowEndDropout = state.phraseIndex;
        eventCounts.lowEndDropout += 1;
        assert.ok(
          [
            FORM_RULES.lowEndDropout.minimumBars,
            FORM_RULES.lowEndDropout.maximumBars,
          ].includes(state.lowEndDropoutBars),
        );
        assert.equal(
          state.lowEndDropoutStartBar + state.lowEndDropoutBars,
          8,
        );
        assert.notEqual(state.kickPolicy, "withdraw");
      } else {
        assert.equal(state.lowEndDropoutBars, 0);
        assert.equal(state.lowEndDropoutStartBar, null);
      }

      if (state.motifOperation === "mutate") {
        assert.ok(
          state.phraseIndex - lastAt.mutation >=
            FORM_RULES.motif.mutationCooldownPhrases,
        );
        lastAt.mutation = state.phraseIndex;
        eventCounts.mutation += 1;
      } else if (state.motifOperation === "replace") {
        eventCounts.replacement += 1;
      } else if (state.motifOperation === "recall") {
        assert.ok(
          state.phraseIndex - lastAt.recall >=
            FORM_RULES.motif.recallCooldownPhrases,
        );
        lastAt.recall = state.phraseIndex;
        eventCounts.recall += 1;
      }

      if (state.harmonyOperation === "turn") {
        eventCounts.harmonyTurn += 1;
        harmonyResidues.add(state.phraseIndex % 16);
        if (lastAt.harmonyTurn !== null) {
          const gap = state.phraseIndex - lastAt.harmonyTurn;
          harmonyGaps.add(gap);
          assert.ok(gap >= FORM_RULES.harmony.cooldownPhrases);
        }
        lastAt.harmonyTurn = state.phraseIndex;
      }

      if (previous) {
        const harmonyChanged =
          state.harmonyPosition !== previous.harmonyPosition;
        assert.equal(
          harmonyChanged,
          state.harmonyOperation === "turn",
        );
        if (["hold", "mutate"].includes(state.motifOperation)) {
          assert.equal(state.motifLineageId, previous.motifLineageId);
        } else if (state.motifOperation === "replace") {
          assert.notEqual(state.motifLineageId, previous.motifLineageId);
          assert.equal(state.archivedLineageId, previous.motifLineageId);
        } else if (state.motifOperation === "recall") {
          assert.equal(state.motifLineageId, previous.archivedLineageId);
          assert.equal(state.archivedLineageId, previous.motifLineageId);
        }
        if (state.kickFamilyMorph) {
          assert.equal(state.priorKickFamilyId, previous.kickFamilyId);
          assert.notEqual(state.kickFamilyId, previous.kickFamilyId);
        } else {
          assert.equal(state.kickFamilyId, previous.kickFamilyId);
        }
      }
      previous = state;
    }
  }

  assert.ok(windowsWithClimax > 0);
  assert.ok(windowsWithoutClimax > 0);
  assert.ok(longestCompleteClimax >= 6);
  assert.deepEqual([...chairs].sort(), [
    "floor-authority",
    "long-arc",
    "machine-soul",
    "radical-reduction",
  ]);
  assert.ok(labels.size >= 10);
  assert.deepEqual([...echoAscentVariants].sort(), [
    "late-throw",
    "restrained",
    "widening",
  ]);
  assert.equal(harmonyResidues.size, 16);
  assert.ok(harmonyGaps.size > 12);
  for (const [event, count] of Object.entries(eventCounts)) {
    assert.ok(count > 0, `${event} never occurred`);
  }
  assert.ok(
    eventCounts.lowEndDropout >= 256,
    `joint low-end dropout remained too rare: ${eventCounts.lowEndDropout}/8192 phrases`,
  );
  assert.ok(mean(values.energy) >= 0.35 && mean(values.energy) <= 0.85);
  assert.ok(mean(values.tension) >= 0.35 && mean(values.tension) <= 0.9);
  assert.ok(mean(values.floorTrust) >= 0.45 && mean(values.floorTrust) <= 0.9);
  assert.ok(mean(values.motifSalience) >= 0.35);
});

test("movement sections remain a lossless readout of emergent labels", () => {
  let foundLongResidency = false;
  for (let seed = 0; seed < 24; seed += 1) {
    const movement = createMovement(seed, 3, "minor");
    assert.equal(Object.isFrozen(movement), true);
    assert.equal(Object.isFrozen(movement.formPhrases), true);
    assert.equal(movement.formPhrases.length, PHRASES_PER_WINDOW);
    assert.equal(movement.sections[0].startBar, 0);
    assert.equal(movement.sections.at(-1).endBar, MOVEMENT_BARS);
    for (const section of movement.sections) {
      foundLongResidency ||= section.duration > 32;
      for (let bar = section.startBar; bar < section.endBar; bar += 8) {
        const globalBar = movement.startBar + bar;
        assert.equal(formAtBar(movement, globalBar).label, section.kind);
      }
    }
  }
  assert.equal(foundLongResidency, true);
});

test("bar plans consume one frozen sequential material phrase instead of form-owned masks", () => {
  const rhythmFingerprints = new Set();
  const policyCounts = { anchor: 0, thin: 0, withdraw: 0 };
  let bassNotes = 0;
  let kickMorphsRendered = 0;

  for (const seed of [7, 94, 0x51eed, 0xa11ce]) {
    let materialState = null;
    let priorPlan = null;
    for (let phraseIndex = 0; phraseIndex < 48; phraseIndex += 1) {
      materialState = nextMaterialState(
        materialState,
        seed,
        phraseIndex,
      );
      const plans = buildPhrasePlans({
        seed,
        phraseIndex,
        materialState,
      });
      const bassCellSignatures = new Set();

      for (const plan of plans) {
        assert.equal(plan.materialState, materialState);
        assert.equal(plan.material.motifLineageId, materialState.motif.lineageId);
        assert.equal(
          plan.lowEnd.materialMotifLineageId,
          materialState.motif.lineageId,
        );
        assert.equal(plan.lowEnd.bassClockId, materialState.clocks.bass.id);
        assert.equal(
          plan.lowEnd.bassClockLength,
          materialState.clocks.bass.loopLength,
        );
        bassCellSignatures.add(plan.lowEnd.bassCellSignature);

        const phraseOffset = plan.barInPhrase * STEPS_PER_BAR;
        const sourceKick =
          materialState.phrase.patterns.kick.slice(
            phraseOffset,
            phraseOffset + STEPS_PER_BAR,
          );
        const sourceBass =
          materialState.phrase.patterns.bass.slice(
            phraseOffset,
            phraseOffset + STEPS_PER_BAR,
          );
        const sourceVacatedBass =
          materialState.phrase.patterns.bassVacatedByAnchor.slice(
            phraseOffset,
            phraseOffset + STEPS_PER_BAR,
          );
        const sourceBassDegrees =
          materialState.phrase.degrees.bass.slice(
            phraseOffset,
            phraseOffset + STEPS_PER_BAR,
          );
        const sourceVacatedBassDegrees =
          materialState.phrase.degrees.bassVacatedByAnchor.slice(
            phraseOffset,
            phraseOffset + STEPS_PER_BAR,
          );
        for (let step = 0; step < STEPS_PER_BAR; step += 1) {
          if (plan.kick[step]) assert.equal(sourceKick[step], true);
          const note = plan.bass[step];
          if (!note) continue;
          bassNotes += 1;
          assert.equal(
            Boolean(sourceBass[step] || sourceVacatedBass[step]),
            true,
          );
          assert.equal(
            note.degree,
            sourceBass[step]
              ? sourceBassDegrees[step]
              : sourceVacatedBassDegrees[step],
          );
          if (materialState.phrase.bassKickRelation === "counter") {
            assert.equal(Boolean(plan.kick[step]), false);
          } else {
            assert.ok(
              ["hybrid", "layered"].includes(
                materialState.phrase.bassKickRelation,
              ),
            );
          }
          assert.equal(note.lineageId, materialState.motif.lineageId);
          assert.ok(note.velocity >= 0.42 && note.velocity <= 0.9);
        }

        const kickCount = plan.kick.filter(Boolean).length;
        policyCounts[plan.form.kickPolicy] += 1;
        if (plan.lowEnd.dropoutActive || plan.form.kickPolicy === "withdraw") {
          assert.equal(kickCount, 0);
        } else if (plan.form.kickPolicy === "thin") {
          assert.ok(kickCount >= 1 && kickCount <= 3);
        } else {
          assert.equal(kickCount, sourceKick.filter(Boolean).length);
        }
        for (const value of Object.values(plan.kickTimbre)) {
          assert.ok(Number.isFinite(value) && value >= 0);
        }
        assert.ok(plan.lowEnd.musicDuckDepth >= 0.32);
        assert.ok(plan.lowEnd.bassDuckDepth >= 0.5);
        rhythmFingerprints.add(
          [
            plan.kick.map(Boolean).join(""),
            plan.bass.map(Boolean).join(""),
            plan.lowEnd.bassClockId,
          ].join("/"),
        );
      }
      assert.equal(
        bassCellSignatures.size,
        1,
        "a frozen phrase changed its generated bass clock vocabulary",
      );

      const first = plans[0];
      const last = plans.at(-1);
      if (first.form.kickFamilyMorph) {
        kickMorphsRendered += 1;
        assert.equal(first.lowEnd.kickFamilyMorphProgress, 0);
        assert.equal(last.lowEnd.kickFamilyMorphProgress, 1);
        assert.notEqual(
          first.kickTimbre.pitchDropSeconds,
          last.kickTimbre.pitchDropSeconds,
        );
      }
      priorPlan = last;
    }
    assert.ok(priorPlan);
  }

  assert.ok(policyCounts.anchor > 0);
  assert.ok(policyCounts.thin > 0);
  assert.ok(policyCounts.withdraw > 0);
  assert.ok(bassNotes > 100);
  assert.ok(rhythmFingerprints.size > 100);
  assert.ok(kickMorphsRendered > 0);
});

test("thin kick phrases make a brief valley and restore pressure within the phrase", () => {
  let thinPhrases = 0;

  for (let seed = 0; seed < 64; seed += 1) {
    let materialState = null;
    for (let phraseIndex = 0; phraseIndex < 48; phraseIndex += 1) {
      materialState = nextMaterialState(materialState, seed, phraseIndex);
      const plans = buildPhrasePlans({
        seed,
        phraseIndex,
        materialState,
      });
      if (plans[0].form.kickPolicy !== "thin") continue;
      thinPhrases += 1;

      const kickCounts = plans.map((plan) =>
        plan.lowEnd.dropoutActive ? 0 : plan.kick.filter(Boolean).length
      );
      let oneKickRun = 0;
      let longestOneKickRun = 0;
      for (const count of kickCounts) {
        oneKickRun = count === 1 ? oneKickRun + 1 : 0;
        longestOneKickRun = Math.max(longestOneKickRun, oneKickRun);
      }
      assert.ok(
        longestOneKickRun <= 2,
        `seed ${seed} phrase ${phraseIndex} held one kick for ${longestOneKickRun} bars`,
      );
      if (!plans[7].lowEnd.dropoutActive) {
        assert.ok(kickCounts[7] >= 3);
      }
    }
  }

  assert.ok(thinPhrases > 0);
});

test("macro motif events do not regenerate unrelated sequential material clocks", () => {
  let replacements = 0;
  let replacementsWithHeldClocks = 0;

  for (const seed of [7, 94, 0x51eed, 0xa11ce]) {
    let materialState = null;
    let previousMaterial = null;
    let previousPlan = null;
    for (let phraseIndex = 0; phraseIndex < 128; phraseIndex += 1) {
      materialState = nextMaterialState(
        materialState,
        seed,
        phraseIndex,
      );
      const plan = buildBarPlan({
        seed,
        bar: phraseIndex * PHRASE_BARS,
        vibeId: "hypnotic",
        tonality: "minor",
        profile: profileForVibe("hypnotic"),
        materialState,
      });

      if (previousPlan && plan.form.motifOperation === "replace") {
        replacements += 1;
        assert.notEqual(
          plan.form.motifLineageId,
          previousPlan.form.motifLineageId,
        );
        assert.equal(plan.form.tonalOperation, "hold");
        assert.equal(plan.form.harmonyOperation, "hold");
        assert.equal(plan.form.sceneOperation, "handoff");
        assert.equal(plan.synthHandoff?.operation, "replace");
        assert.equal(
          plan.form.tonalMaterialId,
          previousPlan.form.tonalMaterialId,
        );
        assert.equal(
          plan.form.harmonyMaterialId,
          previousPlan.form.harmonyMaterialId,
        );
        assert.equal(
          plan.form.bassVoiceMaterialId,
          previousPlan.form.bassVoiceMaterialId,
        );
        assert.equal(plan.movement.root, previousPlan.movement.root);
        assert.deepEqual(
          plan.movement.progression,
          previousPlan.movement.progression,
        );

        const changedClocks = Object.keys(materialState.clocks).filter(
          (lane) =>
            materialState.clocks[lane].id !==
            previousMaterial.clocks[lane].id,
        );
        assert.ok(materialState.mutatedLanes.length <= 2);
        assert.deepEqual(
          changedClocks.sort(),
          [
            ...materialState.mutatedLanes,
            ...materialState.renewedLanes,
          ].sort(),
        );
        assert.ok(
          materialState.renewedLanes.length <= 1 &&
            materialState.renewedLanes.every((lane) => lane === "kick"),
        );
        replacementsWithHeldClocks += Number(
          changedClocks.length < Object.keys(materialState.clocks).length,
        );
      }
      assert.equal(
        plan.lowEnd.materialMotifLineageId,
        materialState.motif.lineageId,
      );
      previousMaterial = materialState;
      previousPlan = plan;
    }
  }

  assert.ok(replacements > 10);
  assert.equal(replacementsWithHeldClocks, replacements);
});

test("observation boundaries preserve sequential material memory and display residency", () => {
  let heldDisplayBoundaries = 0;
  let checkedBoundaries = 0;

  for (const seed of [7, 94, 0x51eed, 0xa11ce]) {
    let materialState = null;
    let previousMaterial = null;
    for (let phraseIndex = 0; phraseIndex < 72; phraseIndex += 1) {
      materialState = nextMaterialState(
        materialState,
        seed,
        phraseIndex,
      );
      if (
        phraseIndex > 0 &&
        phraseIndex % PHRASES_PER_WINDOW === 0
      ) {
        checkedBoundaries += 1;
        assert.ok(materialState.phraseMemory.recentFingerprints.length > 1);
        assert.equal(
          materialState.startStep,
          phraseIndex * PHRASE_BARS * STEPS_PER_BAR,
        );
        const changedClocks = Object.keys(materialState.clocks).filter(
          (lane) =>
            materialState.clocks[lane].id !==
            previousMaterial.clocks[lane].id,
        );
        assert.ok(changedClocks.length <= 2);
        for (const lane of Object.keys(materialState.clocks)) {
          if (changedClocks.includes(lane)) continue;
          assert.equal(
            materialState.clocks[lane].phaseOrigin,
            previousMaterial.clocks[lane].phaseOrigin,
          );
        }

        const prior = buildBarPlan({
          seed,
          bar: phraseIndex * PHRASE_BARS - 1,
          vibeId: "hypnotic",
          tonality: "minor",
          profile: profileForVibe("hypnotic"),
          materialState: previousMaterial,
        });
        const current = buildBarPlan({
          seed,
          bar: phraseIndex * PHRASE_BARS,
          vibeId: "hypnotic",
          tonality: "minor",
          profile: profileForVibe("hypnotic"),
          materialState,
        });
        if (prior.form.formEpochId === current.form.formEpochId) {
          heldDisplayBoundaries += 1;
          assert.equal(current.sectionStart, false);
          assert.equal(prior.sectionEnd, false);
          assert.equal(
            current.form.labelResidency,
            prior.form.labelResidency + 1,
          );
        }
      }
      previousMaterial = materialState;
    }
  }

  assert.equal(checkedBoundaries, 8);
  assert.ok(heldDisplayBoundaries > 0);
});

test("Vibe interpolation cannot rewrite a phrase that has already been frozen", () => {
  const seed = 0x51eed;
  let materialState = null;
  for (let phraseIndex = 0; phraseIndex <= 4; phraseIndex += 1) {
    materialState = nextMaterialState(
      materialState,
      seed,
      phraseIndex,
      "dub",
    );
  }
  const before = JSON.stringify(materialState);
  const profiles = Array.from({ length: PHRASE_BARS }, (_, index) =>
    blendProfiles("dub", "peak", index / (PHRASE_BARS - 1)),
  );
  const plans = buildPhrasePlans({
    seed,
    phraseIndex: 4,
    materialState,
    vibeId: "dub",
    profiles,
  });
  assert.equal(JSON.stringify(materialState), before);
  assert.equal(
    new Set(plans.map((plan) => plan.lowEnd.bassClockId)).size,
    1,
  );
  assert.equal(
    new Set(plans.map((plan) => plan.lowEnd.bassCellSignature)).size,
    1,
  );
  assert.ok(plans.every((plan) => plan.materialState === materialState));

  const nextForm = derivePhraseState(seed, 5);
  const dubBranch = advanceMaterialState(materialState, {
    seed,
    phraseIndex: 5,
    form: nextForm,
    profile: profileForVibe("dub"),
    tonality: "minor",
  });
  const peakBranch = advanceMaterialState(materialState, {
    seed,
    phraseIndex: 5,
    form: nextForm,
    profile: profileForVibe("peak"),
    tonality: "minor",
  });
  assert.notEqual(
    dubBranch.phrase.fingerprint,
    peakBranch.phrase.fingerprint,
  );
  assert.equal(JSON.stringify(materialState), before);
});

test("bass voice follows its resident form material, not a bar clock", () => {
  const profile = profileForVibe("detroit");
  const reached = new Set();

  for (let seed = 0; seed < 12; seed += 1) {
    const voiceByMaterial = new Map();
    let materialState = null;
    for (let phraseIndex = 0; phraseIndex < 64; phraseIndex += 1) {
      materialState = nextMaterialState(
        materialState,
        seed,
        phraseIndex,
        "detroit",
      );
      const plan = buildBarPlan({
        seed,
        bar: phraseIndex * PHRASE_BARS,
        vibeId: "detroit",
        tonality: "minor",
        profile,
        materialState,
      });
      reached.add(plan.bassVoice);
      const materialId = plan.form.bassVoiceMaterialId;
      if (voiceByMaterial.has(materialId)) {
        assert.equal(plan.bassVoice, voiceByMaterial.get(materialId));
      } else {
        voiceByMaterial.set(materialId, plan.bassVoice);
      }
    }
  }

  assert.deepEqual([...reached].sort(), ["acid", "pulse", "sub"]);
});
