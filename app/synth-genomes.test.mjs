import assert from "node:assert/strict";
import test from "node:test";

import {
  FM_ALGORITHMS,
  SYNTH_BASE_ARCHITECTURES,
  SYNTH_ENGINE_IDS,
  SYNTH_REACHABILITY_TARGET,
  createSynthCandidates,
  createSynthPalette,
  selectSynthCandidate,
  stageSynthPalette,
  synthGenomeSignature,
  synthHandoffForForm,
  synthStructuralSignature,
  validateSynthGenome,
} from "./synth-genomes.js";
import {
  applyTasteDecision,
  createTasteProfile,
  tasteScoreForGenome,
} from "./taste-model.js";
import { traceEmergentForm } from "./emergent-form.js";

const VIBE_IDS = ["hypnotic", "dub", "detroit", "acid", "peak"];
const PROFILES = Object.freeze({
  hypnotic: Object.freeze({
    density: 0.68,
    drive: 0.62,
    space: 0.42,
    swing: 0.18,
    acid: 0.34,
    chords: 0.28,
    texture: 0.58,
    metallic: 0.42,
    rumble: 0.68,
    warmth: 0.48,
    syncopation: 0.64,
  }),
  dub: Object.freeze({
    density: 0.48,
    drive: 0.48,
    space: 0.9,
    swing: 0.26,
    acid: 0.12,
    chords: 0.82,
    texture: 0.82,
    metallic: 0.2,
    rumble: 0.76,
    warmth: 0.82,
    syncopation: 0.46,
  }),
  detroit: Object.freeze({
    density: 0.62,
    drive: 0.58,
    space: 0.52,
    swing: 0.42,
    acid: 0.24,
    chords: 0.7,
    texture: 0.54,
    metallic: 0.34,
    rumble: 0.42,
    warmth: 0.86,
    syncopation: 0.8,
  }),
  acid: Object.freeze({
    density: 0.72,
    drive: 0.78,
    space: 0.38,
    swing: 0.2,
    acid: 0.96,
    chords: 0.18,
    texture: 0.38,
    metallic: 0.46,
    rumble: 0.5,
    warmth: 0.38,
    syncopation: 0.78,
  }),
  peak: Object.freeze({
    density: 0.82,
    drive: 0.9,
    space: 0.3,
    swing: 0.12,
    acid: 0.38,
    chords: 0.16,
    texture: 0.36,
    metallic: 0.72,
    rumble: 0.84,
    warmth: 0.24,
    syncopation: 0.62,
  }),
});

function form({
  operation = "hold",
  lineageId = 0xabc123,
  mutationCount = 0,
  phraseIndex = 0,
} = {}) {
  return Object.freeze({
    motifOperation: operation,
    motifLineageId: lineageId,
    motifMutationCount: mutationCount,
    phraseIndex,
  });
}

function engineIds(palette) {
  return SYNTH_ENGINE_IDS.map((engine) => palette[engine].id);
}

test("the three advanced engines retain all 208 bounded base architectures", () => {
  assert.deepEqual(SYNTH_ENGINE_IDS, ["fm", "modal", "string"]);
  assert.equal(FM_ALGORITHMS.length, 8);
  assert.equal(
    SYNTH_BASE_ARCHITECTURES,
    8 * 4 * 3 + 4 * 8 * 2 + 4 * 4 * 3,
  );
  for (let seed = 0; seed < 24; seed += 1) {
    for (let bar = 0; bar < 768; bar += 8) {
      const palette = createSynthPalette({ seed, bar });
      for (const engine of SYNTH_ENGINE_IDS) {
        assert.ok(
          validateSynthGenome(palette[engine]),
          `${engine} genome failed at seed ${seed}, bar ${bar}`,
        );
      }
    }
  }
});

test("hold forms never authorize a handoff and lineage state stays stable", () => {
  const seed = 0xdecafbad;
  const firstForm = form({
    lineageId: 0x515151,
    mutationCount: 1,
    phraseIndex: 8,
  });
  assert.equal(synthHandoffForForm(seed, firstForm), null);

  const input = {
    seed,
    bar: 64,
    vibeId: "acid",
    profile: PROFILES.acid,
    form: firstForm,
  };
  assert.deepEqual(createSynthPalette(input), createSynthPalette(input));
  const first = createSynthPalette(input);
  assert.ok(
    SYNTH_ENGINE_IDS.every((engine) => validateSynthGenome(first[engine])),
  );

  for (let phraseIndex = 9; phraseIndex < 128; phraseIndex += 1) {
    const heldForm = form({
      lineageId: firstForm.motifLineageId,
      mutationCount: firstForm.motifMutationCount,
      phraseIndex,
    });
    assert.equal(synthHandoffForForm(seed, heldForm), null);
    const held = createSynthPalette({
      ...input,
      bar: phraseIndex * 8,
      form: heldForm,
    });
    assert.deepEqual(engineIds(held), engineIds(first));
  }
});

test("standalone palette construction has no hidden bar clock", () => {
  const origin = createSynthPalette({
    seed: 0xdecafbad,
    bar: 0,
    vibeId: "acid",
    profile: PROFILES.acid,
  });
  const distant = createSynthPalette({
    seed: 0xdecafbad,
    bar: 8 * 12345,
    vibeId: "acid",
    profile: PROFILES.acid,
  });
  assert.deepEqual(engineIds(distant), engineIds(origin));
});

test("causal motif events authorize one stable handoff without time rotation", () => {
  for (const operation of ["mutate", "replace", "recall"]) {
    const eventForm = form({
      operation,
      lineageId: 0x551100 + operation.length,
      mutationCount: operation === "mutate" ? 2 : 0,
      phraseIndex: 37,
    });
    const first = synthHandoffForForm(0xa11ce, eventForm);
    const second = synthHandoffForForm(0xa11ce, eventForm);
    assert.deepEqual(first, second);
    assert.ok(Object.isFrozen(first));
    assert.ok(first.id.startsWith("synth-handoff-"));
    assert.ok(SYNTH_ENGINE_IDS.includes(first.engine));
    assert.equal(first.operation, operation);
    assert.equal(first.lineageId, eventForm.motifLineageId);
    assert.equal(first.mutationCount, eventForm.motifMutationCount);
    assert.equal(first.phraseIndex, eventForm.phraseIndex);

    const enginesAcrossTime = new Set();
    for (let phraseIndex = 0; phraseIndex < 96; phraseIndex += 1) {
      enginesAcrossTime.add(
        synthHandoffForForm(
          0xa11ce,
          form({
            operation,
            lineageId: eventForm.motifLineageId,
            mutationCount: eventForm.motifMutationCount,
            phraseIndex,
          }),
        ).engine,
      );
    }
    assert.deepEqual([...enginesAcrossTime], [first.engine]);
  }

  const reached = new Set();
  for (let seed = 0; seed < 64; seed += 1) {
    for (let lineageId = 0; lineageId < 64; lineageId += 1) {
      reached.add(
        synthHandoffForForm(
          seed,
          form({
            operation: "mutate",
            lineageId,
            mutationCount: 1,
            phraseIndex: 23,
          }),
        ).engine,
      );
    }
  }
  assert.deepEqual([...reached].sort(), [...SYNTH_ENGINE_IDS].sort());
});

test("real form handoffs are event-complete and have no calendar residue", () => {
  const engines = new Set();
  const residues = new Set();
  const gaps = new Set();
  let events = 0;
  let holds = 0;

  for (let seed = 0; seed < 32; seed += 1) {
    let previousEvent = null;
    for (const state of traceEmergentForm(seed, 0, 1024)) {
      const handoff = synthHandoffForForm(seed, state);
      if (state.motifOperation === "hold") {
        holds += 1;
        assert.equal(handoff, null);
        continue;
      }
      events += 1;
      assert.ok(handoff);
      assert.equal(handoff.operation, state.motifOperation);
      assert.equal(handoff.lineageId, state.motifLineageId);
      engines.add(handoff.engine);
      residues.add(state.phraseIndex % 16);
      if (previousEvent !== null) {
        gaps.add(state.phraseIndex - previousEvent);
      }
      previousEvent = state.phraseIndex;
    }
  }

  assert.ok(holds > events);
  assert.ok(events > 1000);
  assert.deepEqual([...engines].sort(), [...SYNTH_ENGINE_IDS].sort());
  assert.equal(residues.size, 16);
  assert.ok(gaps.size > 20);
});

test("runtime staging changes only the causally authorized engine", () => {
  const initial = createSynthPalette({
    seed: 0x1111,
    vibeId: "hypnotic",
    profile: PROFILES.hypnotic,
    form: form(),
  });
  assert.equal(stageSynthPalette(null, initial, null), initial);

  const heldCandidate = createSynthPalette({
    seed: 0x2222,
    vibeId: "acid",
    profile: PROFILES.acid,
    form: form({ lineageId: 0x2222, phraseIndex: 4 }),
  });
  assert.equal(stageSynthPalette(initial, heldCandidate, null), initial);

  let runtime = initial;
  for (const [index, operation] of [
    "mutate",
    "replace",
    "recall",
  ].entries()) {
    const eventForm = form({
      operation,
      lineageId: 0x330000 + index,
      mutationCount: operation === "mutate" ? 1 : 0,
      phraseIndex: 10 + index,
    });
    const handoff = synthHandoffForForm(0x2222, eventForm);
    const candidate = createSynthPalette({
      seed: 0x2222,
      vibeId: "acid",
      profile: PROFILES.acid,
      form: eventForm,
    });
    const staged = stageSynthPalette(runtime, candidate, handoff);
    const changed = SYNTH_ENGINE_IDS.filter(
      (engine) => staged[engine].id !== runtime[engine].id,
    );
    assert.deepEqual(changed, [handoff.engine]);
    for (const engine of SYNTH_ENGINE_IDS) {
      assert.equal(
        staged[engine],
        engine === handoff.engine ? candidate[engine] : runtime[engine],
      );
    }
    runtime = staged;
  }
});

test("taste ranks only the engine authorized by a causal handoff", () => {
  const seed = 0xdecafbad;
  const eventForm = form({
    operation: "mutate",
    lineageId: 0x909090,
    mutationCount: 1,
    phraseIndex: 41,
  });
  const handoff = synthHandoffForForm(seed, eventForm);
  const common = {
    seed,
    vibeId: "acid",
    profile: PROFILES.acid,
  };
  const plain = createSynthPalette({ ...common, form: eventForm });
  const candidates = createSynthCandidates({
    seed,
    engine: handoff.engine,
    epoch: plain[handoff.engine].epoch,
    vibeId: "acid",
    profile: PROFILES.acid,
    candidateCount: 8,
  });
  let taste = createTasteProfile();
  for (let index = 0; index < 16; index += 1) {
    taste = applyTasteDecision(taste, candidates.at(-1), "like");
  }

  const holdForm = form({
    lineageId: eventForm.motifLineageId,
    mutationCount: eventForm.motifMutationCount,
    phraseIndex: eventForm.phraseIndex,
  });
  const heldPlain = createSynthPalette({ ...common, form: holdForm });
  const heldTasted = createSynthPalette({
    ...common,
    form: holdForm,
    tasteProfile: taste,
  });
  assert.deepEqual(engineIds(heldTasted), engineIds(heldPlain));

  const tasted = createSynthPalette({
    ...common,
    form: eventForm,
    tasteProfile: taste,
  });
  for (const engine of SYNTH_ENGINE_IDS) {
    if (engine === handoff.engine) {
      assert.ok(
        candidates.some((candidate) => candidate.id === tasted[engine].id),
      );
      assert.ok(
        tasteScoreForGenome(taste, tasted[engine]) >=
          tasteScoreForGenome(taste, candidates[0]),
      );
    } else {
      assert.equal(tasted[engine].id, plain[engine].id);
    }
  }
});

test("causal palettes retain architecture and active-genome reachability", () => {
  const structures = new Set();
  const activeStructures = new Set();
  const activeGenomeIds = new Set();
  const activeGenomeSignatures = new Set();
  const activeEngines = new Set();
  const genomeSignatures = new Map();
  const operations = ["mutate", "replace", "recall"];

  for (const seed of [0x51eed, 0xa11ce]) {
    for (const vibeId of VIBE_IDS) {
      const profile = PROFILES[vibeId];
      for (let eventIndex = 0; eventIndex < 512; eventIndex += 1) {
        const operation = operations[eventIndex % operations.length];
        const eventForm = form({
          operation,
          lineageId: seed * 4096 + eventIndex,
          mutationCount: operation === "mutate" ? 1 + (eventIndex % 2) : 0,
          phraseIndex: eventIndex,
        });
        const handoff = synthHandoffForForm(seed, eventForm);
        const palette = createSynthPalette({
          seed,
          bar: eventIndex * 8,
          vibeId,
          profile,
          form: eventForm,
        });
        for (const engine of SYNTH_ENGINE_IDS) {
          const genome = palette[engine];
          assert.ok(validateSynthGenome(genome));
          structures.add(synthStructuralSignature(genome));
          const signature = synthGenomeSignature(genome);
          const prior = genomeSignatures.get(genome.id);
          if (prior) assert.equal(prior, signature);
          else genomeSignatures.set(genome.id, signature);
        }

        const activeGenome = palette[handoff.engine];
        activeEngines.add(handoff.engine);
        activeGenomeIds.add(activeGenome.id);
        activeGenomeSignatures.add(synthGenomeSignature(activeGenome));
        activeStructures.add(synthStructuralSignature(activeGenome));
      }
    }
  }

  assert.equal(structures.size, SYNTH_BASE_ARCHITECTURES);
  assert.deepEqual([...activeEngines].sort(), [...SYNTH_ENGINE_IDS].sort());
  assert.ok(activeGenomeIds.size > SYNTH_REACHABILITY_TARGET);
  assert.ok(activeGenomeSignatures.size > SYNTH_REACHABILITY_TARGET);
  assert.ok(activeStructures.size >= 200);
});

test("taste still ranks a stable candidate pool without rewriting its members", () => {
  const input = {
    seed: 0xdecafbad,
    engine: "fm",
    epoch: 7,
    vibeId: "acid",
    profile: PROFILES.acid,
    candidateCount: 8,
  };
  const candidates = createSynthCandidates(input);
  assert.deepEqual(candidates, createSynthCandidates(input));
  assert.equal(candidates.length, 8);

  let taste = createTasteProfile();
  for (let index = 0; index < 12; index += 1) {
    taste = applyTasteDecision(taste, candidates.at(-1), "like");
  }
  const selected = selectSynthCandidate({
    candidates,
    tasteProfile: taste,
    selectionSeed: 42,
  });
  assert.ok(candidates.includes(selected));
  assert.ok(
    tasteScoreForGenome(taste, selected) >=
      tasteScoreForGenome(taste, candidates[0]),
  );
  assert.deepEqual(candidates, createSynthCandidates(input));
});
