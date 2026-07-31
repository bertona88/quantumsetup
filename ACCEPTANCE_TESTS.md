# Acceptance Tests

Current gate: deployed Infinite Techno `2.1.0` performance-control release;
public acceptance remains open

Passing one gate does not imply another. Deterministic structure, rendered audio,
listening quality, active-browser behavior, long-run reliability, deployment, and
public acceptance are separate boundaries. No `1.5.0` result is automatically
carried forward across the material-planner rewrite.

## Gate 0 — Provenance and scope

- [x] `prototype/` remains immutable.
- [x] the supplied generator identity is recorded by SHA-256.
- [x] music owns the product hierarchy and the quantum contour remains artistic.
- [x] commit, push, and deployment were explicitly authorized on 2026-07-31;
  public acceptance remains a separate post-deployment decision.

## Gate 1 — Persistent generative material

- [x] canonical immutable Bjorklund `euclidean(hits, steps, rotation)` passes known
  patterns, hit count, evenness, rotation, and invalid-input tests.
- [x] every structural rhythmic lane has a frozen clock summary containing loop
  length, hit count, rotation, absolute phase origin, residence age, and mutation
  history.
- [x] absolute phase continues across bars, eight-bar phrases, derived sections, and
  192-bar observation boundaries.
- [x] Track DNA biases near-16, triplet-related, prime, odd, and patient clock
  dialects without containing onset sequences.
- [x] clock identities remain resident for two to eight phrases.
- [x] ordinary phrases mutate at most one structural lane; earned climax, release,
  or recall phrases mutate at most two.
- [x] kick normally uses `E(4,16)`; excursions use only 12, 15, 17, 18, or 20 steps,
  last one to four phrases, follow at least four anchored phrases, and force
  re-anchoring.
- [x] at least 75% of phrases retain the anchored four-floor kick across the fixed
  long scan.
- [x] bass uses a persistent 12–32-step clock plus resident modal motif lineage,
  rather than a fixed two-bar cell.
- [x] the six named ensemble scenes contain semantic roles, register constraints,
  priority, and effect space but no onset masks.

## Gate 2 — Gesture grammar and candidate selection

- [x] the ordered gesture states are `repeat`, `subtract`, `add`, `displace`, `call`,
  `answer`, `rest`, and `recall`, and every checked-in transition row normalizes.
- [x] all gesture states are reachable across the fixed seed scan.
- [x] every call receives a deterministic upward, downward, rhythmic, or registral
  answer within the same or following phrase.
- [x] rests are bounded and ordinary motif transformations alter no more than 25% of
  resident onsets or degrees.
- [x] all emitted bass, harmony, and advanced-synth pitches remain modal and
  register-bounded.
- [x] each phrase boundary constructs exactly twelve complete symbolic candidates
  from seed, Track DNA, form snapshot, phrase-entry profile, tonality, and previous
  material state.
- [x] density, voice, pitch, collision, excursion, silence, and DSP-safety rejection
  rules are deterministic and bounded.
- [x] normalized candidate weights are 22% groove continuity, 18% macro/profile fit,
  16% kick/bass separation, 14% motif conversation, 12% novelty, 10% orchestration,
  and 8% polymetric phase interest.
- [x] only candidates scoring at least `0.55` and within `0.20` of the best enter
  seeded softmax selection.
- [x] sampling temperature remains between `0.35` and `0.85`; the same seed and
  intent history replay the same selected sequence while multiple eligible
  candidates are selected across seeds.
- [x] exact phrase repetition is attributable to `repeat` or `recall`, not planner
  collapse.
- [x] pure material creation, advancement, and trace functions are deterministic,
  order-independent, bounded, and frozen.

## Gate 3 — Macro state, intent, and runtime materialization

- [x] recurrent form remains the macro-intent provider and contains no fixed
  movement, energy, chair, or material-onset schedule.
- [x] derived labels and section RLE remain diagnostic and cannot reset material
  clocks, motif memory, or call obligations.
- [x] only an accepted New Trajectory resets material memory; a rejected trajectory
  request, observation boundary, ordinary gesture, Vibe request, and Tonality
  request do not.
- [x] Vibe and Tonality requests affect only phrases selected at future eight-bar
  boundaries.
- [x] the full selected eight-bar phrase is frozen once before playback; all eight
  bars materialize without rerunning candidate generation or gesture decisions.
- [x] Matrix, Resonator, String, bass voice, and semantic scene roles remain
  phrase-stable; any synthesis-genome handoff stays separately causal and
  one-engine-bounded.
- [x] taste feedback remains isolated to an already-authorized timbre handoff and
  cannot rank musical-material candidates.
- [x] the hardware scheduler retains audio-clock lookahead, missed-step recovery,
  finite source cleanup, bounded voices, and separate kick, bass, rumble, and music
  buses.
- [x] all 130 deterministic, DSP, worklet, lifecycle, transition, trajectory,
  performance-control, taste, and syntax tests pass together on the current local
  `2.1.0` source state.

## Gate 4 — Deterministic population evidence

- [x] at least 128 seeds pass a 384-bar scan covering kick-anchor share, excursion
  duration/cooldown, persistent non-16 polymeter, no global lane reset, gesture
  reachability, answer obligations, and attributable repetition.
- [x] within the first 48 bars, every fixed-manifest cross-seed pair separates in
  rhythm and phrase grammar plus at least one additional musical domain.
- [x] every such pair reaches composite symbolic distance of at least `0.20`.
- [x] metadata-only relabelling still contributes zero symbolic musical distance.
- [x] settled Vibe endpoints change future phrases without rewriting an already
  frozen phrase.

Current local evidence: `npm --prefix app run check` passes all 130 tests. The
13-trajectory first-48-bar manifest passes all 78 pairs; the minimum observed
composite distance is `0.252146`, with rhythm and phrase-grammar separation plus at
least one of orchestration, timbre, or harmony for every pair.

## Gate 5 — Render and listening evidence

- [ ] eight fixed 96-bar trajectories plus stems are rendered in a foreground
  browser harness from the final tested bytes.
- [ ] render hashes, peak, RMS, DC, clipping, silence, discontinuity, kick/bass
  overlap, and nearest-neighbour distances are recorded.
- [ ] loudness-matched 90-second excerpts of the eight closest trajectory pairs
  receive blinded comparison.
- [ ] at least six of eight closest pairs are judged clearly different records.
- [ ] groove quality is recorded separately from distinctness.
- [ ] multi-hour Vibe/Tonality listening and multi-day recurrence review remain open
  until separately recorded.

## Gate 6 — Interface, browser, and soak

- [x] `window.QuantumTechno` is versioned `2.1.0`, preserves `getSnapshot()`,
  `requestVibe()`, and `requestTonality()`, and adds bounded mix, direction, and
  bass-character methods.
- [x] snapshots add a deeply frozen material section with gesture, motif lineage,
  lane-clock summaries, selected-candidate score, candidate count, temperature, and
  kick-excursion status.
- [x] the performance console exposes bounded three-band EQ, next-beat Kick and
  Bassline cuts, nine phrase-direction controls, and five bassline characters while
  keeping onset masks and individual synthesis parameters private.
- [x] beat-quantized kick cut suppresses kick synthesis, ducking, new rumble
  excitation, and its visual pulse; bass cut suppresses bass synthesis and pulse.
- [x] performance gain stages remain independent of sidechain-bus restoration, and
  the Low/Mid/High filters receive finite bounded dB values.
- [x] direction targets enter on the next eight-bar phrase, glide for eight bars,
  preserve an already-frozen phrase, and keep Bassline Character discrete until the
  glide completes.
- [x] a final-candidate Codex in-app-browser performance smoke at `1280×720`
  started Web Audio from the transport gesture, exercised smoothed Low EQ,
  next-beat Bassline and Kick cuts in both directions, queued Energy and Rolling
  bass-character targets, and verified durable-control reload plus nonpersistent
  cuts with no console warnings or errors; `390×844` and `320×568` both had zero
  horizontal overflow and a visible phrase target.
- [ ] foreground Start/Stop, every performance control, Vibe, Tonality, New
  Trajectory, transition, preview, restart, responsive, reduced-motion, and
  clean-console browser smoke passes on the final `2.1.0` bytes.
- [ ] a 30–60-minute named-device foreground soak is attached.
- [ ] suspend/resume and audio-device-change behavior is recorded without expanding
  the runtime claim.
- [ ] screen-reader smoke is documented.

## Gate 7 — Claim and release boundary

- [x] documentation states that deterministic tests do not establish audible
  distinctness, groove quality, professional-DJ quality, or long-run reliability.
- [x] documentation keeps the quantum contour explicitly artistic and disclaims
  named-artist participation, endorsement, literal opinions, and imitation.
- [ ] a final local `2.1.0` candidate report links every deterministic, render,
  listening, browser, and soak artifact.
- [x] the prior `2.0.0` commit, push, GitHub Pages run `30627589662`, public byte
  comparison, and browser smoke remain historical release evidence.
- [x] the authorized `2.1.0` commit and push completed as `b16c5dc`.
- [x] the exact tested `2.1.0` source deployed successfully through GitHub Pages
  run `30631366177` and deployment `5691599940` on 2026-07-31.
- [x] all 18 published `2.1.0` files byte-match local `b16c5dc` release bytes. A
  fresh public browser started audio, moved Low EQ, landed a Bassline cut, queued
  Energy and Rolling bass-character direction, and stopped cleanly without browser
  warnings or errors.
- [ ] public acceptance is explicitly recorded.

## Historical release evidence

The results below remain evidence for their named versions only. They do not
establish deterministic acceptance, render quality, listening quality, browser
behavior, soak reliability, deployment, or public acceptance for `2.0.0`.

The complete prior gate record is retained below. Its checked items describe the
named `1.5.0` source and release only; superseded two-bar cells and onset masks are
historical facts, not `2.0.0` authorities.

### Historical `1.5.0` Gate 0 — Provenance and scope

- [x] `prototype/` is unchanged.
- [x] supplied generator identity is recorded by SHA-256.
- [x] implementation preserves its audio clock, synthesized voice, routing, and
  cleanup concepts.
- [x] previous silent visual app is removed from the production bundle but preserved
  in Git history.
- [x] repository documents state that music owns the product hierarchy.

### Historical `1.5.0` Gate 1 — Deterministic musical planner

- [x] 4/4 bars contain 16 sixteenth-note steps.
- [x] normal phrases are eight bars.
- [x] derived section readouts are at least eight bars and divisible by eight.
- [x] each observation/RLE/cache window totals exactly 192 bars without resetting
  recurrent form or changing a held musical identity.
- [x] the planner source contains no fixed movement template, section energy table,
  or section-to-chair map.
- [x] phrase state is deterministic, frozen, bounded, and safe to query in random
  order.
- [x] section readouts are a lossless run-length encoding of phrase labels, and
  residencies longer than 32 bars are reachable; labels and RLE boundaries have no
  musical authority.
- [x] scanned 192-bar windows include both climax and no-climax outcomes, with
  varied onset positions.
- [x] complete climaxes respect the two-to-eight-phrase limit; steady-state scans
  keep Peak occupancy bounded and make 6–8-phrase climaxes a material share rather
  than a single outlier.
- [x] kick withdrawal is reachable, remains below its rarity bound, lasts at most
  two phrases, and respects its cooldown.
- [x] same seed, bar, profile, and tonality produce deep-equal plans.
- [x] every drum-lane value is finite and nonnegative.
- [x] bass MIDI notes stay in the accepted range.
- [x] bass, chord, and pad notes belong to the active modal field.
- [x] Minor, Major, and Neutral produce distinct pitch material.
- [x] tests scan every Vibe/Tonality combination across more than 2,000 bars.
- [x] exact phrase-pattern repeats inside a rolling 64-phrase window remain below
  the bounded scan threshold across 4,096 bars for every Vibe, without outlawing
  deliberate recall.
- [x] Matrix, Resonator, and String genomes are deterministic and stable while
  motif state holds.
- [x] motif mutate, replace, and recall events each authorize exactly one runtime
  advanced-engine handoff at a stable phrase boundary; hold authorizes none, and
  staging changes no engine beyond the one authorized.
- [x] authorized-engine selection is event-stable, reaches all three engines, and
  does not use phrase modulo, elapsed time, or round-robin.
- [x] bar-wise Vibe interpolation cannot switch the advanced-engine selection or
  bass voice inside an eight-bar phrase.
- [x] bass voice identity follows its own resident material ID and does not rotate
  on a 32-bar decision span or reset with motif replacement.
- [x] motif replacement changes motif/bass-cell material while tonal identity,
  progression vocabulary and position, scene target, and bass voice remain held.
- [x] harmony turns occupy every tested calendar residue, have variable causal
  gaps, respect cooldown, and do not follow the former two-phrase lineage-age clock.
- [x] held form-label residency and its public progress readout continue across a
  192-bar observation boundary without a synthetic section-start event.
- [x] every non-rest bass note carries the active lineage ID, avoids a simultaneous
  kick onset, and stays within bounded velocity and duration.
- [x] anchor kick policy retains four quarter-note anchors, thin policy retains one
  to three, and withdrawal retains none.
- [x] physical kick-timbre fields and low-end duck depths stay finite and bounded.
- [x] independent kick-family morphs require earned release or floor recommit,
  respect a 24-phrase cooldown, retain the prior family at morph start, and reach
  the new bounded physical family by the end of the phrase.
- [x] a fixed synthetic two-seed, five-Vibe motif-event scan constructs all 208
  base architectures, selects at least 200 through the causally authorized
  handoff-candidate path, and reaches more than 170 candidate parameter genomes.
- [x] Track DNA is deterministic, flat, frozen, and reaches every curated value in
  all 11 macro-phenotype fields with a balanced 8,192-seed scan.
- [x] bounded trajectory-candidate selection is deterministic, order-independent,
  rejects cosmetic-only candidates, and requires weighted DNA distance of at least
  `0.55`, five changed fields, and three changed core fields when it returns a
  candidate.
- [x] all 78 pairs in a fixed 13-seed manifest of 192-bar trajectory windows reach
  composite distance of at least `0.12` and separate in at least four of six
  downstream musical domains.
- [x] all ten settled Vibe pairs for one fixed seed pass the same 192-bar
  downstream-window gate.
- [x] changing only seed, Vibe, and tonality metadata while retaining identical
  downstream summaries produces zero trajectory distance.
- [x] all six curated ensemble scenes are deterministic, reachable, and stable for
  causal recurrent-state and lineage residency, independent of display-label RLE.
- [x] motif recall restores archived motif/bass material; scene material remains
  independent and changes only through its later causal one-engine handoff.
- [x] orchestration roles and synthesis genomes stage through the same causal
  one-engine handoff authorized by motif mutate, replace, or recall.
- [x] scored phrase masks are pure and order-independent; all three scene roles
  remain available as vocabulary before council admission and arrangement thinning.
- [x] all four council chairs and their generic directives are deterministic and
  reachable through competing recurrent-state lens scores.
- [x] ordinary council phrases admit exactly one advanced engine, intentional
  rests may admit zero, and only developed climax or recalled-lineage phrases admit
  two; no bar admits all three.
- [x] optional-layer budgets, spectral vetoes, and state-earned fill permissions
  are deterministic.
- [x] advanced attacks avoid kick anchors and unscored same-step collisions; low
  roles yield to bass, harmonic voices yield around chords, and modal voices yield
  around metallic/ride attacks.
- [x] advanced starts stay within council budgets of zero for rests, one for sparse
  statements, two for ordinary statements, and four for earned dialogue.
- [x] taste-informed and unpersonalized plans are arrangement-deep-equal; only the
  event-authorized advanced-synth genome may differ.
- [x] trained taste keeps the same candidate ranking for the same lineage and
  mutation state without depending on elapsed phrases.
- [x] a stopped taste update preserves the resident palette and waits for the next
  authorized one-engine handoff after restart.

### Historical `1.5.0` Gate 2 — Direction transitions

- [x] Vibe choices are Hypnotic, Dub, Detroit, Acid, and Peak.
- [x] tonal choices are Minor, Neutral, and Major.
- [x] requests do not alter already scheduled audio.
- [x] running requests begin at an eight-bar boundary.
- [x] Vibe transition length belongs to 64, 96, or 128 bars.
- [x] profile interpolation is monotonic and bounded.
- [x] retargeting begins from the current interpolated profile rather than snapping
  back to the old source profile.
- [x] tempo target changes are capped at 0.12 BPM per bar.
- [x] Major ↔ Minor passes through Neutral instead of pitch-ramping a third.
- [x] New Trajectory evaluates a bounded 16-candidate macro-phenotype pool, enters
  at a 16-bar seed-change boundary, and regenerates noise/reverb plus seed-bound
  synthesis and ensemble identity without creating a periodic mutation clock.
- [x] a candidate pool with no DNA-eligible result leaves the current trajectory
  unchanged instead of entering an unqualified fallback seed.

### Historical `1.5.0` Gate 3 — Audio graph and scheduler

- [x] audio starts only from a user gesture.
- [x] one engine owns one `AudioContext`.
- [x] scheduler uses an audio-clock lookahead and recovers missed steps.
- [x] output has separate kick, bass, rumble, and music buses, independent
  kick-to-bass and kick-to-music ducking, filtered delay, generated convolution
  reverb, soft clip, compressor, analyser, and master fade.
- [x] temporary voices have finite stop times.
- [x] native temporary voices are capped at 72 and worklet voices at 24, preserving
  a combined ceiling of 96.
- [x] advanced DSP fuzz and render tests produce finite, bounded, non-silent output
  at 44.1, 48, and 96 kHz.
- [x] one representative of every 208 base architectures renders finite, bounded,
  non-silent output at 48 kHz.
- [x] worklet tests enforce the 256-event queue, 24-voice pool, priority stealing
  with a short discontinuity guard, and clean all-notes-off.
- [x] recovered advanced-note scheduling preserves a small positive worklet message
  lead instead of posting a note into the past after a main-thread stall.
- [x] a running trajectory boundary sends advanced all-notes-off, clears resident
  synthesis, ensemble, instrument-profile, and genome-definition state, then
  reconstructs those identities from the new seed.
- [x] delay and rumble feedback remain below documented caps.
- [x] per-note bass distortion curves are cached rather than allocated repeatedly.
- [x] kick distortion curves are cached and phrase-level rumble send, cutoff, and
  feedback remain bounded.
- [x] preview, stop-fade, interrupted-context, restart, and preview-replacement
  releases are serialized; a replacement context is not constructed before the
  prior context closes.
- [ ] `OfflineAudioContext` peak/RMS/DC/discontinuity report is attached.
- [ ] loudness-matched full-mix and stem renders pass spectral, rhythmic, tonal,
  dynamic-form, and duplicate/nearest-neighbour comparisons across the fixed
  trajectory manifest.
- [ ] 30–60-minute named-device foreground soak is attached.

### Historical `1.5.0` Gate 4 — Sound palette

- [x] synthetic kick, clap, hat, open hat, shaker, ride, rim, tom, and metallic
  percussion exist.
- [x] five percussion kits emit numeric hat and clap envelope, burst-topology, and
  effect-send controls which the audio voices consume within bounded clamps.
- [x] acid, sub, and pulse bass families exist.
- [x] a deterministic two-bar bass lineage can hold, mutate, be replaced while
  archiving its predecessor, and later be recalled.
- [x] kick body, pitch start/drop, decay, click, drive, and rumble parameters evolve
  within bounded physical fields.
- [x] chord stabs, pads, noise texture, risers, and downlifters exist.
- [x] four-operator FM, modal-resonator, and fractional-delay string engines exist.
- [x] the three engines expose 208 discrete renderer-backed base architectures.
- [x] synthesis topology and parameter genomes change only at motif-authorized
  stable phrase boundaries.
- [x] six curated ensemble scenes coordinate Matrix, Resonator, and String through
  scored motors, calls, replies, weaves, marks, tails, and pickups.
- [x] scene-role and timbre changes share one staged causal handoff, with no
  round-robin or fixed-period synth mutation.
- [x] the council preserves all three engines in the bank while limiting the active
  cast to the smallest authorized foreground statement.
- [x] eight-bar risers and four-bar downlifters are arrangement events.
- [ ] multi-hour listening review rates each Vibe/Tonality combination.
- [ ] blinded same/different or ABX review passes for the automatically selected
  closest trajectory pairs after loudness matching.
- [ ] bounded recurrence ledger prevents excessive multi-day phrase similarity.

### Historical `1.5.0` Gate 5 — Single audio-first interface

- [x] there is one page and no LAB/TRIP navigation.
- [x] Start/Stop is the primary action.
- [x] detailed synthesis, fades, filters, effects, and tempo are not exposed.
- [x] current state and requested destination are distinguishable.
- [x] one inline Signal Deck specimen can be heard, passed, kept, or swiped only
  while transport is stopped.
- [x] Pass/Keep decisions update bounded local state with session fallback and
  advance a deterministic, recent-history-aware deck.
- [x] bounded monotonic revisions let newer session fallback state beat a readable
  but stale local record; legacy schema-v1 records remain loadable.
- [x] every fifth deck decision uses preference-independent exploration within its
  deterministic candidate pool.
- [x] a deterministic 2.75-second preview is finite, normalized, faded, replaceable,
  and fully cleaned up.
- [x] starting the set closes any preview and disables all Signal Deck actions;
  stopping restores them.
- [x] current generated instrumentation appears as a passive readout with no new
  synthesis controls or tab stops.
- [x] the readout is a phrase-scoped union, so sustained phrase voices do not vanish
  merely because their trigger occurred in an earlier bar.
- [x] the same passive rail reports the planner-owned ensemble scene and counts
  musical parts rather than claiming simultaneous DSP voices.
- [x] selected direction uses `aria-pressed`.
- [x] engine and intent updates use live regions.
- [x] Signal Deck decisions have button, swipe, and Left/Right Arrow paths plus a
  concise live-region confirmation.
- [x] desktop, 390×844, and 320×568 layouts receive visual review.
- [x] missing Canvas 2D leaves audio available.
- [x] keyboard taste-decision smoke is documented.
- [ ] screen-reader smoke is documented.

### Historical `1.5.0` Gate 6 — Claim boundary

- [x] page states that the quantum contour is an artistic metaphor.
- [x] no UI claims quantum computation, randomness, physical simulation, or
  sonification.
- [x] no UI promises survival through sleep or browser suspension.
- [x] no code or documentation claims proven professional-DJ equivalence.
- [x] council documentation disclaims named-artist participation, endorsement,
  literal opinions, and imitation; artist names do not appear in the public controls.

### Historical `1.5.0` Gate 7 — Candidate and release

- [x] the complete `1.5.0` deterministic planner, trajectory-DNA, downstream
  diversity, runtime-boundary, DSP, worklet, and syntax check result is recorded.
- [x] `1.5.0` local foreground browser Start/Stop and four-seed state-divergence
  smoke is attached.
- [ ] `1.5.0` rendered or sequential audible comparison smoke is attached.
- [ ] `1.5.0` long listening review is attached.
- [x] `1.5.0` production workflow succeeds and public assets match the tested
  candidate.

Local `1.5.0` deterministic evidence: all 99 planner, emergent-form distribution,
Track-DNA selection and rejection, 192-bar downstream diversity, causal handoff,
low-end, council, lifecycle, taste/deck/preview, DSP, worklet, and runtime
trajectory-boundary tests passed together with syntax checks. This is deterministic
and renderer-unit evidence. Local accelerated browser probes for adjacent seeds
`01`–`04` all started and stopped without browser warnings or errors and exposed
different tempos, ensemble casts, bass families, tonal fields, and form states at
bars 6–17. Browser state divergence is not a full-mix comparison, listening result,
deployment, or public acceptance.

Production `1.5.0` evidence: commit
[`0950e4e`](https://github.com/bertona88/quantumsetup/commit/0950e4e66a3b2e80f47bc1833fc242623b7c5fdb)
deployed successfully in GitHub Pages run
[`30578274990`](https://github.com/bertona88/quantumsetup/actions/runs/30578274990)
and deployment `5681618042` on 2026-07-30. Raw-path SHA-256 comparisons matched the
committed bytes for `index.html`, `styles.css`, `main.js`, `audio-engine.js`,
`techno-model.js`, `emergent-form.js`, `generative-utils.js`,
`trajectory-identity.js`, `track-dna.js`, `synth-genomes.js`, `synth-dsp.js`,
`synth-worklet.js`, `taste-model.js`, `instrument-preview.js`, `signal-deck.js`,
and `robots.txt` at `https://quantumsetup.ai/`. A fresh public foreground smoke
retained fixed seed `01`, started the audio engine, advanced to bar 6, exposed the
planned ensemble, and stopped cleanly with empty warning/error logs. This is
deployment and interaction evidence, not rendered comparison or long listening.

- [x] the complete `1.4.0` deterministic model, emergent-form, low-end, council,
  lifecycle, taste/deck/preview, DSP, and syntax check result is recorded.
- [x] `1.4.0` local foreground browser Start/Stop, preview, taste interaction,
  emergent-form readback, low-end playback, responsive layout, and console smoke
  pass.
- [ ] `1.4.0` long listening review is attached.
- [x] `1.4.0` production workflow succeeds.
- [x] all `1.4.0` public application assets match the tested candidate
  byte-for-byte.
- [x] public `1.4.0` emergent-form, low-end, advanced-synth, council, and Signal Deck
  smoke passes.

Prior local `1.3.0` evidence remains valid only for that candidate: all 55
deterministic model, council grammar, lifecycle, taste/deck/preview, DSP, and syntax
checks passed, along with the foreground interaction smoke described below. It does
not establish acceptance of `1.4.0`.

Previous `1.0.0` release evidence: GitHub Pages run
[`30490978122`](https://github.com/bertona88/quantumsetup/actions/runs/30490978122)
completed successfully on 2026-07-29. Cache-busted SHA-256 checks matched
`index.html`, `styles.css`, `main.js`, `audio-engine.js`, `techno-model.js`, and
`robots.txt` at `https://quantumsetup.ai/`.

Previous local `1.1.0` browser evidence: foreground smoke at 1280×720 plus responsive checks
at 390×844 and 320×568; the worklet reported three started/active voices with zero
late or dropped events, no console warnings/errors, and no horizontal overflow.

Local `1.2.0` browser evidence: foreground run at 1280×720 with responsive checks at
390×844 and 320×568. The worklet loaded, reported 133 started events and two active
voices at final readback with zero queued, late, or dropped events. Negative Space
and Acid Relay appeared as planner-owned ensemble scenes; Vibe, tonality, and New
Trajectory intents queued; Stop returned the rail to `UNFORMED · 00 PARTS`. All
three widths had zero horizontal overflow and the console had no warnings/errors.

Local `1.3.0` browser evidence: stopped-transport Matrix preview entered its audible
state; Keep advanced the specimen and its visible local decision count survived
reload and legacy-state migration. Left/Right keyboard behavior and a physical
right-swipe advanced the same deck. Preview → Start reported the preview stopped
before the foreground set ran, disabled all deck actions, and reached bar 5 with the
generic `REMOVE UNTIL IT MATTERS · DECLARE` directive and one String foreground
voice. By bar 12 the worklet reported three started advanced notes with zero late or
dropped events. Stop released the set context before Hear created a new preview and
restored every deck control. At 390×844 and 320×568 there was no horizontal
overflow; taste actions remained 50 px high. Browser console warning and error logs
were empty. This is interaction evidence, not a long listening result or
public-release result.

Local `1.4.0` evidence: all 82 deterministic model, emergent-form distribution,
causal handoff, low-end, council, lifecycle, taste/deck/preview, DSP, worklet, and
syntax checks passed. Foreground browser smoke at 1280×720 exercised preview,
replacement preview, Keep, reload persistence, keyboard Pass, physical Keep swipe,
preview → Start, Stop → preview, restart, and clean Stop. The running rail reported
four-floor kick, acid bass, an active ensemble, and advanced worklet starts; the
final patched run and live resizes reported zero late or dropped worklet events.
The 390×844 and 320×568 layouts had zero horizontal overflow, and browser console
warning/error logs were empty. This is deterministic and interaction evidence, not
a long listening result or public-release result.

Production `1.4.0` evidence: commit
[`624a431`](https://github.com/bertona88/quantumsetup/commit/624a4319b94a2fff8bf03b3fbd45ad4466e2b767)
deployed successfully in GitHub Pages run
[`30563730157`](https://github.com/bertona88/quantumsetup/actions/runs/30563730157)
on 2026-07-30. Cache-busted SHA-256 comparisons matched the tested candidate
byte-for-byte for `index.html`, `styles.css`, `main.js`, `audio-engine.js`,
`techno-model.js`, `emergent-form.js`, `generative-utils.js`, `synth-genomes.js`,
`synth-dsp.js`, `synth-worklet.js`, `taste-model.js`, `instrument-preview.js`,
`signal-deck.js`, and `robots.txt` at `https://quantumsetup.ai/`. Public foreground
smoke exercised Start, the generated kick/bass/ensemble readout, Peak trajectory
queueing, Stop, Signal Deck Hear, preview → Start handoff, scheduler settlement,
and clean final Stop. This is deployment and interaction evidence, not a long
listening result.
