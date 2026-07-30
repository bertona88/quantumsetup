import assert from "node:assert/strict";
import test from "node:test";

import { buildBarPlan, profileForVibe } from "./techno-model.js";
import {
  FM_ALGORITHMS,
  SYNTH_BASE_ARCHITECTURES,
  SYNTH_ENGINE_IDS,
  SYNTH_REACHABILITY_TARGET,
  createSynthPalette,
  stageSynthPalette,
  synthGenomeSignature,
  synthMutationEngineForPhrase,
  synthStructuralSignature,
  validateSynthGenome,
} from "./synth-genomes.js";

const VIBE_IDS = ["hypnotic", "dub", "detroit", "acid", "peak"];

test("the three advanced engines expose 208 bounded base architectures", () => {
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

test("genomes are deterministic, phrase-stable, and stagger one engine at a time", () => {
  const input = {
    seed: 0xdecafbad,
    bar: 64,
    vibeId: "acid",
    profile: profileForVibe("acid"),
  };
  assert.deepEqual(createSynthPalette(input), createSynthPalette(input));
  const fixture = createSynthPalette(input);
  assert.equal(fixture.fm.id, "fm-C128108A");
  assert.equal(fixture.fm.algorithm, "split-cascade");
  assert.equal(fixture.fm.modulationIndex, 5.59124);
  assert.equal(fixture.modal.material, "tube");
  assert.equal(fixture.string.termination, "damped");

  let previous = createSynthPalette({
    seed: 0xa11ce,
    bar: 0,
    vibeId: "hypnotic",
    profile: profileForVibe("hypnotic"),
  });
  for (let phrase = 1; phrase < 192; phrase += 1) {
    const start = createSynthPalette({
      seed: 0xa11ce,
      bar: phrase * 8,
      vibeId: "hypnotic",
      profile: profileForVibe("hypnotic"),
    });
    const end = createSynthPalette({
      seed: 0xa11ce,
      bar: phrase * 8 + 7,
      vibeId: "hypnotic",
      profile: profileForVibe("hypnotic"),
    });
    assert.deepEqual(start, end);
    const changed = SYNTH_ENGINE_IDS.filter(
      (engine) => previous[engine].id !== start[engine].id,
    );
    assert.equal(changed.length, 1, `phrase ${phrase} changed ${changed.join(", ")}`);
    previous = start;
  }
});

test("runtime palettes stage seed and Vibe changes one engine per phrase", () => {
  let runtime = createSynthPalette({
    seed: 0x1111,
    bar: 0,
    vibeId: "hypnotic",
    profile: profileForVibe("hypnotic"),
  });
  for (let phrase = 1; phrase <= 3; phrase += 1) {
    const candidate = createSynthPalette({
      seed: 0x2222,
      bar: phrase * 8,
      vibeId: "acid",
      profile: profileForVibe("acid"),
    });
    const staged = stageSynthPalette(runtime, candidate, phrase);
    assert.ok(staged);
    const changed = SYNTH_ENGINE_IDS.filter(
      (engine) => staged[engine].id !== runtime[engine].id,
    );
    assert.deepEqual(changed, [synthMutationEngineForPhrase(phrase)]);
    runtime = staged;
    if (phrase === 3) {
      assert.deepEqual(
        SYNTH_ENGINE_IDS.map((engine) => runtime[engine].id),
        SYNTH_ENGINE_IDS.map((engine) => candidate[engine].id),
      );
    }
  }
});

test("the deterministic planner reaches the full structural space and over 10x active genomes", () => {
  const structures = new Set();
  const activeStructures = new Set();
  const activeGenomeIds = new Set();
  const activeGenomeSignatures = new Set();
  const activeEngines = new Set();
  const genomeSignatures = new Map();

  for (const seed of [0x51eed, 0xa11ce]) {
    for (const vibeId of VIBE_IDS) {
      const profile = profileForVibe(vibeId);
      for (let bar = 0; bar < 4096; bar += 8) {
        const palette = createSynthPalette({
          seed,
          bar,
          vibeId,
          profile,
        });
        for (const engine of SYNTH_ENGINE_IDS) {
          const genome = palette[engine];
          structures.add(synthStructuralSignature(genome));
          const signature = synthGenomeSignature(genome);
          const prior = genomeSignatures.get(genome.id);
          if (prior) assert.equal(prior, signature);
          else genomeSignatures.set(genome.id, signature);
        }

        const plan = buildBarPlan({
          seed,
          bar,
          vibeId,
          tonality: "minor",
          profile,
        });
        for (const engine of plan.activeSynthEngines) {
          const genome = plan.synthPalette[engine];
          assert.ok(plan.synth[engine].some(Boolean));
          activeEngines.add(engine);
          activeGenomeIds.add(genome.id);
          activeGenomeSignatures.add(synthGenomeSignature(genome));
          activeStructures.add(synthStructuralSignature(genome));
        }
      }
    }
  }

  assert.equal(structures.size, SYNTH_BASE_ARCHITECTURES);
  assert.deepEqual([...activeEngines].sort(), [...SYNTH_ENGINE_IDS].sort());
  assert.ok(activeGenomeIds.size > SYNTH_REACHABILITY_TARGET);
  assert.ok(activeGenomeSignatures.size > SYNTH_REACHABILITY_TARGET);
  assert.equal(activeStructures.size, SYNTH_BASE_ARCHITECTURES);
});
