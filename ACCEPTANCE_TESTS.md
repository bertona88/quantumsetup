# Acceptance Tests

Current gate: Infinite Techno `1.4.0` emergent-form and low-end candidate

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
- [x] a fixed two-seed, five-Vibe scan selects all 208 base architectures into
  note-bearing lanes and reaches more than 170 active parameter genomes.
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
- [x] New Trajectory enters at a 16-bar seed-change boundary and regenerates
  noise/reverb identity without creating a periodic synth-mutation clock.

## Gate 3 — Audio graph and scheduler

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
- [x] delay and rumble feedback remain below documented caps.
- [x] per-note bass distortion curves are cached rather than allocated repeatedly.
- [x] kick distortion curves are cached and phrase-level rumble send, cutoff, and
  feedback remain bounded.
- [x] preview, stop-fade, interrupted-context, restart, and preview-replacement
  releases are serialized; a replacement context is not constructed before the
  prior context closes.
- [ ] `OfflineAudioContext` peak/RMS/DC/discontinuity report is attached.
- [ ] 30–60-minute named-device foreground soak is attached.

## Gate 4 — Sound palette

- [x] synthetic kick, clap, hat, open hat, shaker, ride, rim, tom, and metallic
  percussion exist.
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
- [ ] bounded recurrence ledger prevents excessive multi-day phrase similarity.

## Gate 5 — Single audio-first interface

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

## Gate 6 — Claim boundary

- [x] page states that the quantum contour is an artistic metaphor.
- [x] no UI claims quantum computation, randomness, physical simulation, or
  sonification.
- [x] no UI promises survival through sleep or browser suspension.
- [x] no code or documentation claims proven professional-DJ equivalence.
- [x] council documentation disclaims named-artist participation, endorsement,
  literal opinions, and imitation; artist names do not appear in the public controls.

## Gate 7 — Candidate and release

- [x] the complete `1.4.0` deterministic model, emergent-form, low-end, council,
  lifecycle, taste/deck/preview, DSP, and syntax check result is recorded.
- [x] `1.4.0` local foreground browser Start/Stop, preview, taste interaction,
  emergent-form readback, low-end playback, responsive layout, and console smoke
  pass.
- [ ] `1.4.0` long listening review is attached.
- [ ] `1.4.0` production workflow succeeds.
- [ ] all `1.4.0` public application assets match the tested candidate
  byte-for-byte.
- [ ] public `1.4.0` emergent-form, low-end, advanced-synth, council, and Signal Deck
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
