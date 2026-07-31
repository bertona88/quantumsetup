# QuantumSetup Vision

Status: audio-first product direction
Current slice: Infinite Techno generative set

## Purpose

QuantumSetup creates an endlessly evolving techno journey in the browser. It should
feel like one continuous set: patient enough to hypnotize, structured enough to
orient a dancer, varied enough to survive long listening, and simple enough that the
listener can both direct the long arc and make a few legible DJ-style mix gestures.

The user chooses:

- start or stop;
- a techno destination: Hypnotic, Dub, Detroit, Acid, or Peak;
- harmonic gravity: Minor, Neutral, or Major;
- new musical DNA;
- live three-band EQ and beat-quantized kick/bass cuts;
- bounded Energy, Density, Brightness, Space, Swing, Acid, Bass Presence, Change
  Rate, Breakdown Depth, and Bassline Character directions;
- which isolated generated timbres to Pass or Keep while the set is stopped.

The generator still owns note masks, fades, effect sends, bridge length, tempo
drift, fills, voice admission, and the timing of any taste-informed timbre choice.
Performance EQ responds immediately; channel cuts land on the next beat; musical
direction enters on the next eight-bar phrase and glides for eight bars.

## Product principles

1. **Music first.** Sound generation and long-form musical structure own the page.
2. **One continuous machine.** The stream carries recurrent phrase state rather
   than choosing songs or traversing an arrangement template.
3. **Honest timing.** Vibe changes morph over 64–128 bars, performance direction
   uses an eight-bar glide, and the interface distinguishes both from live EQ and
   next-beat cuts.
4. **Stable anchors, bounded novelty.** The floor keeps its pulse while tops,
   articulation, timbre, harmony, and emergent form role evolve.
5. **Local synthesis.** No samples, account, backend, or network audio dependency.
6. **Quantum contour.** Quantum language and the analyser-driven visual provide
   mysticism and identity without asserting quantum computation or physical
   simulation.
7. **Honest infinity.** The composition has no fixed ending, but browser sleep or
   suspension can interrupt playback.
8. **Learn narrowly.** Explicit feedback may personalize timbre; it must not silently
   infer or rewrite the listener's arrangement.

## Current architecture

The deployed `2.1.0` performance-control release retains the `2.0.0` material planner's
two cooperating recurrent layers. Emergent form
continues to advance energy, tension, floor trust, fatigue, motif salience, causal
debts, climax state, and cooldowns every eight bars. A separate phrase-sequential
material planner carries persistent lane clocks, resident motif memory, unresolved
calls, recent fingerprints, and archived motifs. The form layer supplies intent and
budgets; it does not select onset masks.

At each eight-bar boundary the material planner generates twelve complete symbolic
phrase candidates from the seed, Track DNA, form snapshot, Vibe profile settled for
that phrase boundary, tonality, and previous material state. It rejects unsafe or
musically ineligible candidates, scores the survivors for continuity, macro fit,
low-end separation, motif conversation, novelty, orchestration, and polymetric
phase, then uses seeded softmax sampling among the eligible near-best set. The
selected phrase is frozen before its first bar. The audio-clock scheduler only
materializes that phrase; it does not reconsider notes bar by bar.

Rhythmic identity comes from immutable Euclidean patterns read through persistent
polymetric clocks. Clock phase follows the absolute sixteenth-note stream and does
not restart at bars, phrases, derived sections, or 192-bar observation boundaries.
Ordinary phrases mutate at most one structural lane, while earned climax, release,
or recall may mutate two. The kick normally remains `E(4,16)`; earned excursions are
finite, cooled down, followed by forced re-anchoring, and bounded so the four-floor
anchor dominates a long scan. Bass and synth gestures use their own persistent loop
domains rather than a fixed two-bar bass cell or authored scene onset masks.

Phrase development follows the authored gesture states `repeat`, `subtract`, `add`,
`displace`, `call`, `answer`, `rest`, and `recall`. Macro state adjusts their
transition probabilities without replacing the resident motif. Calls create a
bounded answer obligation, ordinary mutations change at most one quarter of motif
onsets or degrees, and all pitch remains modal, register-bounded, and
lineage-traceable.

Adjacent phrases with the same derived label are still grouped into section
readouts, which may exceed 32 bars. Those labels and run-length sections only
describe what emerged. A 192-bar boundary packages observation, RLE, and cache work;
it cannot schedule an arc or reset material clocks. Material memory resets only when
an accepted New Trajectory enters. The hardware-clock lookahead scheduler and
separate kick, bass, rumble, and music buses remain the rendering authority.

Each trajectory also owns an eleven-domain Track DNA that establishes its groove,
kick and percussion architecture, bass behavior and voice bias, harmonic behavior,
foreground engine and role, spectral/spatial profile, and form phenotype. A New
Trajectory request evaluates sixteen deterministic candidates and enters only an
eligible macro-distinct one at the musical boundary; if none qualifies, the current
trajectory continues. A Vibe request still morphs over 64–128 bars and does not
replace that DNA, but it now has structural consequences within its bounds.

Deterministic candidate tests can establish state bounds, causality, reachability,
replay, and symbolic separation. They do not prove arbitrary pairwise audible
uniqueness, groove quality, multi-day performance, deployed-browser behavior, or
professional-DJ subjective quality. `2.1.0` is deployed from `b16c5dc`; all 18
published assets byte-match and the focused public performance smoke passes. Its
130-test deterministic suite also passes; render, listening, the full browser
matrix, a 30–60-minute soak, and public-acceptance gates remain separate.

## Next quality frontier

- eight fixed 96-bar full-mix and stem renders with hashes, peak, RMS, DC, clipping,
  silence, discontinuity, low-end overlap, and nearest-neighbour reports;
- blinded 90-second comparison of the closest trajectory pairs, scoring groove
  quality separately from distinctness;
- chapter-scale and multi-day listening evidence across observation windows and
  material lineages;
- 30–60-minute named-device foreground browser soaks and suspend/device-change
  probes;
- an AudioWorklet clock experiment for stronger foreground-tab resilience.
