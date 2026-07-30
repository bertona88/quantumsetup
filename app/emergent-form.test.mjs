import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FORM_RULES,
  derivePhraseState,
  traceEmergentForm,
} from "./emergent-form.js";
import {
  MOVEMENT_BARS,
  blendProfiles,
  buildBarPlan,
  createMovement,
  formAtBar,
  profileForVibe,
} from "./techno-model.js";

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
}

function correlation(left, right) {
  const leftMean = mean(left);
  const rightMean = mean(right);
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  return covariance /
    Math.sqrt(Math.max(Number.EPSILON, leftVariance * rightVariance));
}

test("the planner contains no fixed movement, energy, or chair schedule", () => {
  const source = readFileSync(
    new URL("./techno-model.js", import.meta.url),
    "utf8",
  );
  for (const legacy of [
    "MOVEMENT_TEMPLATES",
    "SECTION_ENERGY",
    "COUNCIL_CHAIR_BY_SECTION",
  ]) {
    assert.equal(source.includes(legacy), false, `${legacy} returned`);
  }
  assert.doesNotMatch(
    source,
    /Math\.floor\(form\.lineageAge\s*\/\s*2\)/,
    "a fixed two-phrase harmony clock returned",
  );
});

test("trace validation rejects unsafe cold replay while cached extension stays endless", () => {
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

  const seed = "sequential-form-extension";
  let final = null;
  for (let start = 0; start <= 65536; start += 4096) {
    const trace = traceEmergentForm(seed, start, 4096);
    final = trace.at(-1);
  }
  assert.equal(final.phraseIndex, 69631);
  assert.deepEqual(
    derivePhraseState(seed, final.phraseIndex),
    final,
  );
});

test("steady-state form stays homeostatic and produces materially long climaxes", () => {
  const appetites = [];
  const peakRates = [];
  const completeDurations = [];
  const onsetGaps = [];
  const values = {
    energy: [],
    tension: [],
    floorTrust: [],
    motifSalience: [],
  };
  let peakPhrases = 0;
  let peakDialoguePhrases = 0;
  let dialoguePhrases = 0;
  let totalPhrases = 0;
  let trustPasses = 0;
  let returnLabels = 0;

  for (let seed = 0; seed < 64; seed += 1) {
    const trace = traceEmergentForm(seed, 512, 2048);
    const seedPeakPhrases = trace.filter((state) => state.climax).length;
    appetites.push(trace[0].climaxAppetite);
    peakRates.push(seedPeakPhrases / trace.length);
    assert.ok(seedPeakPhrases > 0, `seed ${seed} never reached Peak`);

    let run = 0;
    let previousOnset = null;
    for (const state of trace) {
      totalPhrases += 1;
      peakPhrases += Number(state.climax);
      peakDialoguePhrases += Number(state.climax && state.earnedDialogue);
      dialoguePhrases += Number(state.earnedDialogue);
      trustPasses += Number(
        state.floorTrust >= FORM_RULES.climax.minFloorTrust,
      );
      for (const key of Object.keys(values)) values[key].push(state[key]);
      assert.ok(state.climaxPermission >= 0 && state.climaxPermission <= 1);
      if (state.label === "RETURN") {
        returnLabels += 1;
        assert.equal(state.motifOperation, "recall");
      }
      if (state.climaxOnset) {
        if (previousOnset !== null) {
          onsetGaps.push(state.phraseIndex - previousOnset);
        }
        previousOnset = state.phraseIndex;
      }
      if (state.climax) {
        run += 1;
      } else if (run > 0) {
        completeDurations.push(run);
        run = 0;
      }
    }
  }

  const peakRate = peakPhrases / totalPhrases;
  const longShare =
    completeDurations.filter((duration) => duration >= 6).length /
    completeDurations.length;
  const trustPassRate = trustPasses / totalPhrases;
  const peakDialogueRate = peakDialoguePhrases / peakPhrases;
  const totalDialogueRate = dialoguePhrases / totalPhrases;
  const sortedGaps = [...onsetGaps].sort((left, right) => left - right);
  assert.ok(peakRate >= 0.07 && peakRate <= 0.14, `Peak rate ${peakRate}`);
  assert.ok(
    longShare >= 0.08 && longShare <= 0.2,
    `long-climax share ${longShare}`,
  );
  assert.ok(
    sortedGaps[Math.floor(sortedGaps.length / 2)] >= 24,
    "Peak onset gap became calendar-like",
  );
  assert.ok(Math.abs(correlation(appetites, peakRates)) < 0.35);
  assert.ok(trustPassRate >= 0.2 && trustPassRate <= 0.85);
  assert.ok(
    peakDialogueRate >= 0.04 && peakDialogueRate <= 0.15,
    `Peak dialogue rate ${peakDialogueRate}`,
  );
  assert.ok(totalDialogueRate < 0.02);
  assert.ok(mean(values.energy) >= 0.4 && mean(values.energy) <= 0.8);
  assert.ok(mean(values.tension) >= 0.4 && mean(values.tension) <= 0.85);
  assert.ok(mean(values.floorTrust) >= 0.5 && mean(values.floorTrust) <= 0.85);
  assert.ok(mean(values.motifSalience) >= 0.4 && mean(values.motifSalience) <= 0.85);
  assert.ok(returnLabels > 0);
});

test("rare gesture permissions and kick-family changes obey causal cooldowns", () => {
  const eventCounts = {
    fill: 0,
    riser: 0,
    dialogue: 0,
    kickFamily: 0,
  };
  const pitchDrops = new Set();
  const bodies = [];
  const decays = [];
  let totalPhrases = 0;
  let independentKickMorphs = 0;
  let renderedMorphs = 0;

  for (let seed = 0; seed < 64; seed += 1) {
    const trace = traceEmergentForm(seed, 0, 1024);
    const lastAt = {
      fill: -Infinity,
      riser: -Infinity,
      dialogue: -Infinity,
      kickFamily: -Infinity,
    };
    let lastMutation = -Infinity;
    let previous = null;
    for (const state of trace) {
      totalPhrases += 1;
      const events = {
        fill: state.allowFill,
        riser: state.allowRiser,
        dialogue: state.earnedDialogue,
        kickFamily: state.kickFamilyMorph,
      };
      const cooldowns = {
        fill: FORM_RULES.fill.cooldownPhrases,
        riser: FORM_RULES.riser.cooldownPhrases,
        dialogue: FORM_RULES.dialogue.cooldownPhrases,
        kickFamily: FORM_RULES.kickFamily.cooldownPhrases,
      };
      for (const [event, active] of Object.entries(events)) {
        if (!active) continue;
        assert.ok(
          state.phraseIndex - lastAt[event] >= cooldowns[event],
          `${event} repeated before its cooldown`,
        );
        lastAt[event] = state.phraseIndex;
        eventCounts[event] += 1;
      }
      if (state.motifOperation === "mutate") {
        assert.ok(
          state.phraseIndex - lastMutation >=
            FORM_RULES.motif.mutationCooldownPhrases,
        );
        lastMutation = state.phraseIndex;
      }

      if (state.kickFamilyMorph) {
        assert.ok(previous);
        assert.equal(state.priorKickFamilyId, previous.kickFamilyId);
        assert.notEqual(state.kickFamilyId, state.priorKickFamilyId);
        independentKickMorphs += Number(state.motifOperation === "hold");
        if (renderedMorphs < 64) {
          const first = buildBarPlan({
            seed,
            bar: state.phraseIndex * 8,
            vibeId: "hypnotic",
            tonality: "minor",
            profile: profileForVibe("hypnotic"),
          });
          const last = buildBarPlan({
            seed,
            bar: state.phraseIndex * 8 + 7,
            vibeId: "hypnotic",
            tonality: "minor",
            profile: profileForVibe("hypnotic"),
          });
          assert.equal(first.lowEnd.kickFamilyMorphProgress, 0);
          assert.equal(last.lowEnd.kickFamilyMorphProgress, 1);
          assert.notEqual(
            first.kickTimbre.pitchDropSeconds,
            last.kickTimbre.pitchDropSeconds,
          );
          for (const plan of [first, last]) {
            pitchDrops.add(plan.kickTimbre.pitchDropSeconds);
            bodies.push(plan.kickTimbre.bodyHz);
            decays.push(plan.kickTimbre.decaySeconds);
          }
          renderedMorphs += 1;
        }
      } else if (previous) {
        assert.equal(state.kickFamilyId, previous.kickFamilyId);
      }
      if (state.phraseIndex % 16 === 0) {
        const plan = buildBarPlan({
          seed,
          bar: state.phraseIndex * 8 + 7,
          vibeId: "hypnotic",
          tonality: "minor",
          profile: profileForVibe("hypnotic"),
        });
        assert.equal(plan.lowEnd.kickFamilyId, state.kickFamilyId);
        pitchDrops.add(plan.kickTimbre.pitchDropSeconds);
        bodies.push(plan.kickTimbre.bodyHz);
        decays.push(plan.kickTimbre.decaySeconds);
      }
      previous = state;
    }
  }

  const kickMorphRate = eventCounts.kickFamily / totalPhrases;
  assert.ok(eventCounts.fill > 0 && eventCounts.riser > 0);
  assert.ok(eventCounts.dialogue > 0 && eventCounts.kickFamily > 0);
  assert.ok(eventCounts.fill / totalPhrases < 0.06);
  assert.ok(eventCounts.dialogue / totalPhrases < 0.02);
  assert.ok(kickMorphRate >= 0.005 && kickMorphRate <= 0.025);
  assert.ok(independentKickMorphs > 0);
  assert.ok(renderedMorphs > 0);
  assert.ok(pitchDrops.size > 100);
  assert.ok(Math.max(...bodies) - Math.min(...bodies) > 6);
  assert.ok(Math.max(...decays) - Math.min(...decays) > 0.2);
});

test("phrase state is deterministic, random-access safe, frozen, and bounded", () => {
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
    const traced = traceEmergentForm(seed, phrase, 1)[0];
    assert.deepEqual(direct, traced);
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
    assert.ok(
      Number.isInteger(direct.harmonyPosition) &&
        direct.harmonyPosition >= 0 &&
        direct.harmonyPosition < 4,
    );
    assert.ok(["hold", "pivot"].includes(direct.tonalOperation));
    assert.ok(["hold", "turn"].includes(direct.harmonyOperation));
    assert.ok(["hold", "handoff"].includes(direct.sceneOperation));
  });
});

test("climaxes are earned variable events, including long and absent windows", () => {
  let windowsWithoutClimax = 0;
  let windowsWithClimax = 0;
  let longestCompleteClimax = 0;
  const onsetPositions = new Set();
  const chairs = new Set();
  const labels = new Set();

  for (let seed = 0; seed < 256; seed += 1) {
    const trace = traceEmergentForm(seed, 0, 72);
    if (trace.slice(0, 24).some((state) => state.climax)) {
      windowsWithClimax += 1;
    } else {
      windowsWithoutClimax += 1;
    }
    trace
      .slice(0, 24)
      .filter((state) => state.climaxOnset)
      .forEach((state) => onsetPositions.add(state.phraseIndex));
    trace.forEach((state, index) => {
      chairs.add(state.chair);
      labels.add(state.label);
      if (!state.climaxOnset) return;
      assert.ok(state.climaxReadiness >= 0.62);
      assert.ok(state.climaxPermission >= 0.58);
      if (index > 0) {
        const prior = trace[index - 1];
        assert.ok(prior.tension >= FORM_RULES.climax.minTension);
        assert.ok(prior.floorTrust >= FORM_RULES.climax.minFloorTrust);
        assert.ok(prior.payoffDebt >= FORM_RULES.climax.minPayoffDebt);
        assert.equal(prior.climaxCooldown, 0);
      }
    });

    const onsets = trace
      .filter((state) => state.climaxOnset)
      .map((state) => state.phraseIndex);
    for (let index = 1; index < onsets.length; index += 1) {
      assert.ok(
        onsets[index] - onsets[index - 1] >=
          FORM_RULES.climax.cooldownPhrases +
            FORM_RULES.climax.minimumPhrases,
      );
    }

    let runStart = -1;
    trace.forEach((state, index) => {
      if (state.climax && runStart < 0) runStart = index;
      if (!state.climax && runStart >= 0) {
        const duration = index - runStart;
        if (runStart > 0) {
          assert.ok(duration >= FORM_RULES.climax.minimumPhrases);
          assert.ok(duration <= FORM_RULES.climax.maximumPhrases);
          longestCompleteClimax = Math.max(longestCompleteClimax, duration);
        }
        runStart = -1;
      }
    });
  }

  assert.ok(windowsWithoutClimax > 0);
  assert.ok(windowsWithClimax > 0);
  assert.ok(onsetPositions.size >= 16);
  assert.ok(longestCompleteClimax >= 6);
  assert.deepEqual([...chairs].sort(), [
    "floor-authority",
    "long-arc",
    "machine-soul",
    "radical-reduction",
  ]);
  assert.ok(labels.size >= 10);
});

test("kick withdrawal is rare, bounded, and cooled down", () => {
  let withdrawalPhrases = 0;
  let totalPhrases = 0;
  for (let seed = 0; seed < 256; seed += 1) {
    const trace = traceEmergentForm(seed, 0, 96);
    let run = 0;
    let previousOnset = -Infinity;
    trace.forEach((state, index) => {
      totalPhrases += 1;
      if (state.kickPolicy === "withdraw") {
        withdrawalPhrases += 1;
        run += 1;
        assert.ok(
          run <= FORM_RULES.kickWithdrawal.maximumPhrases,
          `withdrawal lasted ${run} phrases`,
        );
        if (run === 1) {
          assert.ok(
            index - previousOnset >=
              FORM_RULES.kickWithdrawal.cooldownPhrases,
          );
          previousOnset = index;
        }
      } else {
        run = 0;
      }
    });
  }
  const rate = withdrawalPhrases / totalPhrases;
  assert.ok(rate > 0);
  assert.ok(rate < 0.08, `withdrawal rate ${rate}`);
});

test("motif lineages hold, mutate, replace, and recall without identity drift", () => {
  const reached = new Set();
  for (let seed = 0; seed < 256; seed += 1) {
    const trace = traceEmergentForm(seed, 0, 192);
    let previousRecall = -Infinity;
    trace.forEach((state, index) => {
      reached.add(state.motifOperation);
      assert.ok(
        state.motifMutationCount <=
          FORM_RULES.motif.maximumMutationCount,
      );
      if (state.motifOperation === "recall") {
        assert.ok(
          index - previousRecall >= FORM_RULES.motif.recallCooldownPhrases,
        );
        previousRecall = index;
      }
      if (index === 0) return;
      const prior = trace[index - 1];
      if (["hold", "mutate"].includes(state.motifOperation)) {
        assert.equal(state.motifLineageId, prior.motifLineageId);
      } else if (state.motifOperation === "replace") {
        assert.notEqual(state.motifLineageId, prior.motifLineageId);
        assert.equal(state.archivedLineageId, prior.motifLineageId);
      } else if (state.motifOperation === "recall") {
        assert.equal(state.motifLineageId, prior.archivedLineageId);
        assert.equal(state.archivedLineageId, prior.motifLineageId);
      }
    });
  }
  assert.deepEqual([...reached].sort(), [
    "hold",
    "mutate",
    "recall",
    "replace",
  ]);
});

test("motif replacement changes motif material without resetting every musical domain", () => {
  let replacements = 0;
  let changedMotifs = 0;
  let changedBassCells = 0;
  for (let seed = 0; seed < 64; seed += 1) {
    let previous = null;
    for (let phrase = 0; phrase < 384; phrase += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phrase * 8,
        vibeId: "hypnotic",
        tonality: "minor",
        profile: profileForVibe("hypnotic"),
      });
      if (previous && plan.form.motifOperation === "replace") {
        replacements += 1;
        assert.notEqual(
          plan.form.motifLineageId,
          previous.form.motifLineageId,
        );
        assert.equal(plan.form.tonalOperation, "hold");
        assert.equal(plan.form.harmonyOperation, "hold");
        assert.equal(plan.form.sceneOperation, "handoff");
        assert.equal(plan.synthHandoff?.operation, "replace");
        assert.equal(
          plan.form.tonalMaterialId,
          previous.form.tonalMaterialId,
        );
        assert.equal(
          plan.form.harmonyMaterialId,
          previous.form.harmonyMaterialId,
        );
        assert.equal(
          plan.form.harmonyPosition,
          previous.form.harmonyPosition,
        );
        assert.notEqual(
          plan.form.sceneMaterialId,
          previous.form.sceneMaterialId,
        );
        assert.equal(
          plan.form.bassVoiceMaterialId,
          previous.form.bassVoiceMaterialId,
        );
        assert.equal(plan.movement.root, previous.movement.root);
        assert.equal(plan.movement.mode.id, previous.movement.mode.id);
        assert.deepEqual(
          plan.movement.progression,
          previous.movement.progression,
        );
        assert.equal(plan.harmonyDegree, previous.harmonyDegree);
        assert.equal(plan.bassVoice, previous.bassVoice);
        changedMotifs += Number(
          JSON.stringify(plan.movement.motif) !==
            JSON.stringify(previous.movement.motif),
        );
        changedBassCells += Number(
          plan.lowEnd.bassCellSignature !==
            previous.lowEnd.bassCellSignature,
        );
      }
      previous = plan;
    }
  }
  assert.ok(replacements > 500);
  assert.ok(changedMotifs / replacements > 0.9);
  assert.ok(changedBassCells / replacements > 0.95);
});

test("harmony turns are causal irregular events rather than a two-phrase clock", () => {
  const gaps = new Set();
  const residues = new Set();
  let turns = 0;
  let heldClockCrossings = 0;
  for (let seed = 0; seed < 64; seed += 1) {
    let previous = null;
    let priorTurn = null;
    for (let phrase = 0; phrase < 512; phrase += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phrase * 8,
        vibeId: "detroit",
        tonality: "minor",
        profile: profileForVibe("detroit"),
      });
      if (plan.form.harmonyOperation === "turn") {
        turns += 1;
        residues.add(plan.form.phraseIndex % 16);
        if (priorTurn !== null) {
          const gap = plan.form.phraseIndex - priorTurn;
          gaps.add(gap);
          assert.ok(gap >= FORM_RULES.harmony.cooldownPhrases);
        }
        priorTurn = plan.form.phraseIndex;
      }
      if (previous) {
        const changed =
          plan.harmonyPosition !== previous.harmonyPosition;
        assert.equal(
          changed,
          plan.form.harmonyOperation === "turn",
        );
        if (
          plan.form.motifOperation === "hold" &&
          plan.form.tonalOperation === "hold" &&
          plan.form.harmonyOperation === "hold" &&
          Math.floor(plan.form.lineageAge / 2) !==
            Math.floor(previous.form.lineageAge / 2)
        ) {
          heldClockCrossings += 1;
          assert.equal(plan.harmonyDegree, previous.harmonyDegree);
        }
      }
      previous = plan;
    }
  }
  assert.ok(turns > 1000);
  assert.equal(residues.size, 16);
  assert.ok(gaps.size > 12);
  assert.ok(heldClockCrossings > 1000);
});

test("movement sections are a lossless readout of emergent phrase labels", () => {
  let foundLongResidency = false;
  for (let seed = 0; seed < 128; seed += 1) {
    const movement = createMovement(seed, 3, "minor");
    assert.equal(Object.isFrozen(movement), true);
    assert.equal(Object.isFrozen(movement.formPhrases), true);
    assert.equal(movement.formPhrases.length, MOVEMENT_BARS / 8);
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

test("observation-window boundaries cannot reset held material or display residency", () => {
  let heldBoundaries = 0;
  for (const seed of [7, 94, 0x51eed, 0xa11ce]) {
    const identityByDomain = {
      tonal: new Map(),
      motif: new Map(),
      harmony: new Map(),
      scene: new Map(),
      bassVoice: new Map(),
    };
    for (let phrase = 0; phrase < 384; phrase += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phrase * 8,
        vibeId: "hypnotic",
        tonality: "minor",
        profile: profileForVibe("hypnotic"),
      });
      const domains = [
        [
          identityByDomain.tonal,
          plan.form.tonalMaterialId,
          [plan.movement.root, plan.movement.mode.id],
        ],
        [
          identityByDomain.motif,
          plan.form.motifLineageId,
          plan.movement.motif,
        ],
        [
          identityByDomain.harmony,
          plan.form.harmonyMaterialId,
          plan.movement.progression,
        ],
        [
          identityByDomain.scene,
          plan.form.sceneMaterialId,
          plan.ensembleScene.id,
        ],
        [
          identityByDomain.bassVoice,
          plan.form.bassVoiceMaterialId,
          plan.bassVoice,
        ],
      ];
      for (const [registry, materialId, identity] of domains) {
        if (registry.has(materialId)) {
          assert.deepEqual(identity, registry.get(materialId));
        } else {
          registry.set(materialId, identity);
        }
      }

      if (phrase > 0 && phrase % (MOVEMENT_BARS / 8) === 0) {
        const prior = buildBarPlan({
          seed,
          bar: phrase * 8 - 1,
          vibeId: "hypnotic",
          tonality: "minor",
          profile: profileForVibe("hypnotic"),
        });
        if (prior.form.formEpochId === plan.form.formEpochId) {
          heldBoundaries += 1;
          assert.equal(plan.sectionStart, false);
          assert.equal(prior.sectionEnd, false);
          assert.ok(plan.sectionProgress >= prior.sectionProgress);
          assert.equal(
            plan.form.labelResidency,
            prior.form.labelResidency + 1,
          );
        }
      }
    }
  }
  assert.ok(heldBoundaries > 20);
});

test("kick and bass behavior follows form state instead of section labels", () => {
  const profile = profileForVibe("hypnotic");
  const kickTimbres = new Set();
  const bassPatterns = new Set();
  let anchorBars = 0;
  let thinBars = 0;
  let withdrawnBars = 0;
  let intentionalRestBars = 0;
  let bassBars = 0;
  let eligibleBassBars = 0;

  for (const seed of [0x51eed, 0xa11ce, 94, 707]) {
    for (let bar = 0; bar < 1536; bar += 1) {
      const plan = buildBarPlan({
        seed,
        bar,
        vibeId: "hypnotic",
        tonality: "minor",
        profile,
      });
      const quarterKicks = [0, 4, 8, 12].filter(
        (step) => plan.kick[step] > 0,
      ).length;
      if (plan.form.kickPolicy === "anchor") {
        anchorBars += 1;
        assert.equal(quarterKicks, 4);
      } else if (plan.form.kickPolicy === "thin") {
        thinBars += 1;
        assert.ok(quarterKicks >= 1 && quarterKicks <= 3);
      } else {
        withdrawnBars += 1;
        assert.equal(quarterKicks, 0);
      }
      if (plan.form.intentionalRest) {
        intentionalRestBars += 1;
        assert.equal(plan.bass.some(Boolean), false);
      } else {
        eligibleBassBars += 1;
        bassBars += Number(plan.bass.some(Boolean));
      }
      for (let step = 0; step < 16; step += 1) {
        const note = plan.bass[step];
        if (!note) continue;
        assert.equal(Boolean(plan.kick[step]), false);
        assert.equal(note.lineageId, plan.form.motifLineageId);
        assert.ok(note.velocity >= 0.42 && note.velocity <= 0.9);
      }
      for (const value of Object.values(plan.kickTimbre)) {
        assert.ok(Number.isFinite(value) && value >= 0);
      }
      assert.ok(plan.lowEnd.musicDuckDepth >= 0.32);
      assert.ok(plan.lowEnd.bassDuckDepth >= 0.5);
      assert.equal(plan.lowEnd.decision, plan.form.motifOperation);
      assert.equal(Object.isFrozen(plan.lowEnd.bassCell), true);
      assert.ok(plan.lowEnd.bassCell.every((event) => Object.isFrozen(event)));
      assert.equal(
        plan.lowEnd.bassCellSignature,
        plan.lowEnd.bassCell
          .map((event) => `${event.step}:${event.degree}`)
          .join("|"),
      );
      assert.ok(
        plan.lowEnd.bassCell.every(
          (event) =>
            Number.isInteger(event.step) &&
            event.step >= 0 &&
            event.step < 32 &&
            Number.isInteger(event.degree),
        ),
      );
      kickTimbres.add(JSON.stringify(plan.kickTimbre));
      bassPatterns.add(
        plan.bass.map((note) => (note ? `${note.degree}:${note.length}` : "-")).join(","),
      );
    }
  }

  assert.ok(anchorBars > 0);
  assert.ok(thinBars > 0);
  assert.ok(withdrawnBars > 0);
  assert.ok(intentionalRestBars > 0);
  assert.ok(bassBars / eligibleBassBars > 0.9);
  assert.ok(kickTimbres.size > 100);
  assert.ok(bassPatterns.size > 100);
});

test("a canonical two-bar bass cell stays resident throughout its phrase", () => {
  const profile = profileForVibe("acid");
  for (const seed of [7, 94, 0x51eed]) {
    for (let phrase = 0; phrase < 48; phrase += 1) {
      const signatures = new Set();
      const startBar = phrase * 8;
      for (let bar = startBar; bar < startBar + 8; bar += 1) {
        const plan = buildBarPlan({
          seed,
          bar,
          vibeId: "acid",
          tonality: "minor",
          profile,
        });
        signatures.add(plan.lowEnd.bassCellSignature);
      }
      assert.equal(signatures.size, 1);
    }
  }
});

test("bass-cell mutation is an edit while hold and recall preserve identity", () => {
  let mutations = 0;
  let recalls = 0;
  for (let seed = 0; seed < 128; seed += 1) {
    const baseByLineage = new Map();
    let prior = null;
    for (let phrase = 0; phrase < 384; phrase += 1) {
      const plan = buildBarPlan({
        seed,
        bar: phrase * 8,
        vibeId: "acid",
        tonality: "minor",
        profile: profileForVibe("acid"),
      });
      if (
        plan.form.motifMutationCount === 0 &&
        !baseByLineage.has(plan.form.motifLineageId)
      ) {
        baseByLineage.set(
          plan.form.motifLineageId,
          plan.lowEnd.bassCellSignature,
        );
      }
      if (
        prior &&
        prior.form.motifLineageId === plan.form.motifLineageId
      ) {
        if (plan.form.motifOperation === "mutate") {
          mutations += 1;
          const before = new Set(
            prior.lowEnd.bassCell.map(
              (event) => `${event.step}:${event.degree}`,
            ),
          );
          const after = new Set(
            plan.lowEnd.bassCell.map(
              (event) => `${event.step}:${event.degree}`,
            ),
          );
          const intersection = [...before].filter((event) =>
            after.has(event),
          ).length;
          const edits = before.size - intersection;
          const jaccard =
            intersection /
            new Set([...before, ...after]).size;
          assert.ok(edits >= 1 && edits <= 1);
          assert.ok(jaccard >= 0.65);
        } else if (
          plan.form.motifOperation === "hold" &&
          plan.form.motifMutationCount ===
            prior.form.motifMutationCount
        ) {
          assert.equal(
            plan.lowEnd.bassCellSignature,
            prior.lowEnd.bassCellSignature,
          );
        }
      }
      if (plan.form.motifOperation === "recall") {
        recalls += 1;
        assert.equal(
          plan.lowEnd.bassCellSignature,
          baseByLineage.get(plan.form.motifLineageId),
        );
      }
      prior = plan;
    }
  }
  assert.ok(mutations > 50);
  assert.ok(recalls > 10);
});

test("live Vibe morphing cannot rewrite the resident canonical bass cell", () => {
  for (let phrase = 4; phrase < 36; phrase += 1) {
    const signatures = new Set();
    const startBar = phrase * 8;
    for (let offset = 0; offset < 8; offset += 1) {
      const profile = blendProfiles("dub", "peak", offset / 7);
      signatures.add(
        buildBarPlan({
          seed: 0x51eed,
          bar: startBar + offset,
          vibeId: "dub",
          tonality: "minor",
          profile,
        }).lowEnd.bassCellSignature,
      );
    }
    assert.equal(signatures.size, 1);
  }
});

test("bass voice identity follows its resident material rather than a bar clock", () => {
  const profile = profileForVibe("detroit");
  const reached = new Set();
  for (const seed of [7, 94, 0x51eed]) {
    const voiceByMaterial = new Map();
    for (let bar = 0; bar < 3072; bar += 8) {
      const plan = buildBarPlan({
        seed,
        bar,
        vibeId: "detroit",
        tonality: "minor",
        profile,
      });
      reached.add(plan.bassVoice);
      if (voiceByMaterial.has(plan.form.bassVoiceMaterialId)) {
        assert.equal(
          plan.bassVoice,
          voiceByMaterial.get(plan.form.bassVoiceMaterialId),
        );
      } else {
        voiceByMaterial.set(
          plan.form.bassVoiceMaterialId,
          plan.bassVoice,
        );
      }
    }
  }
  assert.deepEqual([...reached].sort(), ["acid", "pulse", "sub"]);
});
