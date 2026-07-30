# Acceptance Tests

Current gate: Infinite Techno `1.2.0` ensemble-conversation candidate

Passing one gate does not imply another. Deterministic structure, audible browser
output, long-run reliability, musical quality, deployment, and public acceptance are
separate boundaries.

## Gate 0 — Provenance and scope

- [x] `prototype/` is unchanged.
- [x] supplied generator identity is recorded by SHA-256.
- [x] implementation preserves its audio clock, synthesized voice, routing, and
  cleanup concepts.
- [x] previous silent visual app is removed from the production bundle but preserved
  in Git history.
- [x] repository documents state that music owns the product hierarchy.

## Gate 1 — Deterministic musical planner

- [x] 4/4 bars contain 16 sixteenth-note steps.
- [x] normal phrases are eight bars.
- [x] all movement sections are at least eight bars and divisible by eight.
- [x] each movement totals exactly 192 bars.
- [x] same seed, bar, profile, and tonality produce deep-equal plans.
- [x] every drum-lane value is finite and nonnegative.
- [x] bass MIDI notes stay in the accepted range.
- [x] bass, chord, and pad notes belong to the active modal field.
- [x] Minor, Major, and Neutral produce distinct pitch material.
- [x] tests scan every Vibe/Tonality combination across more than 2,000 bars.
- [x] the committed fixture seed has no exact phrase-pattern repeat inside a rolling
  64-phrase window across 4,096 bars for every Vibe.
- [x] Matrix, Resonator, and String genomes are deterministic and stable inside an
  eight-bar phrase.
- [x] exactly one runtime advanced engine changes genome at each phrase boundary;
  Vibe and New Trajectory candidates are staged through the same sequence.
- [x] bar-wise Vibe interpolation cannot switch the advanced-engine selection or
  bass voice inside an eight-bar phrase.
- [x] a fixed two-seed, five-Vibe scan selects all 208 base architectures into
  note-bearing lanes and reaches more than 170 active parameter genomes.
- [x] all six curated ensemble scenes are deterministic, reachable, and stable for
  a seed's target section.
- [x] RETURN recalls the target scene of the latest eligible LOCK, DRIVE, or ASCENT
  section.
- [x] orchestration roles stage through the same one-engine-per-phrase sequence as
  synthesis genomes.
- [x] scored phrase masks are pure and order-independent; all three parts are
  note-bearing before arrangement-aware thinning.
- [x] advanced attacks avoid kick anchors and unscored same-step collisions; low
  roles yield to bass, harmonic voices yield around chords, and modal voices yield
  around metallic/ride attacks.
- [x] advanced starts stay within two-per-bar VOID/RELEASE, six-per-bar ordinary,
  and eight-per-bar PEAK budgets.

## Gate 2 — Direction transitions

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
- [x] New Trajectory enters at a 16-bar boundary and regenerates noise/reverb identity.

## Gate 3 — Audio graph and scheduler

- [x] audio starts only from a user gesture.
- [x] one engine owns one `AudioContext`.
- [x] scheduler uses an audio-clock lookahead and recovers missed steps.
- [x] output has kick/music buses, sidechain ducking, filtered delay, generated
  convolution reverb, rumble, soft clip, compressor, analyser, and master fade.
- [x] temporary voices have finite stop times.
- [x] native temporary voices are capped at 72 and worklet voices at 24, preserving
  a combined ceiling of 96.
- [x] advanced DSP fuzz and render tests produce finite, bounded, non-silent output
  at 44.1, 48, and 96 kHz.
- [x] one representative of every 208 base architectures renders finite, bounded,
  non-silent output at 48 kHz.
- [x] worklet tests enforce the 256-event queue, 24-voice pool, priority stealing
  with a short discontinuity guard, and clean all-notes-off.
- [x] delay and rumble feedback remain below documented caps.
- [x] per-note bass distortion curves are cached rather than allocated repeatedly.
- [ ] `OfflineAudioContext` peak/RMS/DC/discontinuity report is attached.
- [ ] 30–60-minute named-device foreground soak is attached.

## Gate 4 — Sound palette

- [x] synthetic kick, clap, hat, open hat, shaker, ride, rim, tom, and metallic
  percussion exist.
- [x] acid, sub, and pulse bass families exist.
- [x] chord stabs, pads, noise texture, risers, and downlifters exist.
- [x] four-operator FM, modal-resonator, and fractional-delay string engines exist.
- [x] the three engines expose 208 discrete renderer-backed base architectures.
- [x] synthesis topology and parameter genomes change only at musical boundaries.
- [x] six curated ensemble scenes coordinate Matrix, Resonator, and String through
  scored motors, calls, replies, weaves, marks, tails, and pickups.
- [x] scene-role and timbre changes share one staged phrase handoff.
- [x] eight-bar risers and four-bar downlifters are arrangement events.
- [ ] multi-hour listening review rates each Vibe/Tonality combination.
- [ ] bounded recurrence ledger prevents excessive multi-day phrase similarity.

## Gate 5 — Single audio-first interface

- [x] there is one page and no LAB/TRIP navigation.
- [x] Start/Stop is the primary action.
- [x] detailed synthesis, fades, filters, effects, and tempo are not exposed.
- [x] current state and requested destination are distinguishable.
- [x] current generated instrumentation appears as a passive readout with no new
  synthesis controls or tab stops.
- [x] the readout is a phrase-scoped union, so sustained phrase voices do not vanish
  merely because their trigger occurred in an earlier bar.
- [x] the same passive rail reports the planner-owned ensemble scene and counts
  musical parts rather than claiming simultaneous DSP voices.
- [x] selected direction uses `aria-pressed`.
- [x] engine and intent updates use live regions.
- [x] desktop and 390×844 mobile layouts receive visual review.
- [x] missing Canvas 2D leaves audio available.
- [ ] keyboard and screen-reader smoke is documented.

## Gate 6 — Claim boundary

- [x] page states that the quantum contour is an artistic metaphor.
- [x] no UI claims quantum computation, randomness, physical simulation, or
  sonification.
- [x] no UI promises survival through sleep or browser suspension.
- [x] no code or documentation claims proven professional-DJ equivalence.

## Gate 7 — Candidate and release

- [x] `1.2.0` deterministic model, ensemble grammar, DSP, and syntax checks pass.
- [x] `1.2.0` foreground browser Start, worklet load, nonzero advanced-synth voice
  count, ensemble-scene readback, zero late/dropped events, live analyser contour,
  Vibe intent, tonal intent, New Trajectory, Stop, and console smoke pass.
- [ ] `1.2.0` production workflow succeeds.
- [ ] all nine `1.2.0` public application assets match the tested candidate
  byte-for-byte.
- [ ] public `1.2.0` advanced-synth and control smoke passes.

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
