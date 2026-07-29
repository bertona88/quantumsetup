# Acceptance Tests

Current gate: Infinite Techno `1.0.0` audio-first release

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
- [x] temporary voice registry is capped at 96.
- [x] delay and rumble feedback remain below documented caps.
- [x] per-note bass distortion curves are cached rather than allocated repeatedly.
- [ ] `OfflineAudioContext` peak/RMS/DC/discontinuity report is attached.
- [ ] 30–60-minute named-device foreground soak is attached.

## Gate 4 — Sound palette

- [x] synthetic kick, clap, hat, open hat, shaker, ride, rim, tom, and metallic
  percussion exist.
- [x] acid, sub, and pulse bass families exist.
- [x] chord stabs, pads, noise texture, risers, and downlifters exist.
- [x] eight-bar risers and four-bar downlifters are arrangement events.
- [ ] multi-hour listening review rates each Vibe/Tonality combination.
- [ ] bounded recurrence ledger prevents excessive multi-day phrase similarity.

## Gate 5 — Single audio-first interface

- [x] there is one page and no LAB/TRIP navigation.
- [x] Start/Stop is the primary action.
- [x] detailed synthesis, fades, filters, effects, and tempo are not exposed.
- [x] current state and requested destination are distinguishable.
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

## Gate 7 — Release

- [x] deterministic model and syntax checks pass.
- [x] foreground browser Start, live analyser contour, Vibe intent, tonal intent,
  transition progress, Stop, and console smoke pass.
- [ ] production workflow succeeds for the candidate commit.
- [ ] public assets match the tested candidate.
- [ ] public Start, selector, and Stop smoke pass.
