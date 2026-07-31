# QuantumSetup / Infinite Techno

**An audio-first, endlessly evolving procedural techno set.**

- Live: https://quantumsetup.ai/ (prior `1.5.0` production release; the local
  `2.0.0` candidate is not deployed)
- Audio: synthesized locally with the Web Audio API; no samples or network calls
- Interaction: one music surface with Vibe, Harmonic Gravity, and a local timbre
  preference deck
- Visual: an analyser-driven quantum-inspired contour, explicitly artistic

## Product direction

QuantumSetup is a music project. Its primary job is to sustain a convincing,
continuously evolving techno journey. Quantum language contributes atmosphere,
names, and the spectral contour; it does not imply quantum computation or a
scientific simulation.

The generator preserves the strong audio core of the supplied
`infinite-hypnotic-techno.html` and expands its former 32-bar cycle into:

- 8-bar phrases;
- recurrent phrase state with run-length-encoded section readouts;
- 192-bar observation/cache windows rather than scripted movements;
- five interpolated techno vocabularies;
- Major, Minor, and Neutral tonal families;
- 64–128-bar phrase-safe transitions.

Historical version `1.1.0` introduced a bounded 24-voice advanced synthesis bank:

- **Matrix** — four-operator FM with eight acyclic routing algorithms;
- **Resonator** — mallet/noise excitation across curated modal bodies;
- **String** — fractional-delay plucked-string physical modelling.

Together they expose 208 discrete base architectures before bounded continuous
parameters. Parameter genomes are deterministic and coordinate-addressed.

Historical version `1.2.0` turned that bank into a scored ensemble rather than three
independent random lanes. Six curated scenes—Motor Weave, Acid Relay, Resonant Orbit,
Dub Afterimage, Peak Interlock, and Negative Space—coordinated rhythm, register,
motif response, priority, and effect space. The `2.0.0` planner retains those names
and role relationships but removes their authored onset masks.

The historical `1.3.0` candidate gave that palette an editor. A deterministic artistic
council chooses one foreground engine for ordinary phrases, permits a second only
for earned Peak/Return dialogue, removes competing optional layers, and keeps fills
rare. Matrix, Resonator, and String remain available; they no longer all demand
attention at once. The named council is an acknowledged design metaphor, not artist
participation, endorsement, or imitation.

The same historical candidate added an inline Signal Deck. While transport is stopped, the
listener can preview one generated timbre and Pass or Keep it by button, keyboard,
or swipe. Those explicit decisions stay local; the final causal architecture uses
them only to rank candidates for an engine already authorized by a motif event.
They never rewrite rhythm, arrangement, harmony, energy, or the musical seed.

The historical `1.4.0` candidate replaced the arrangement spreadsheet with a recurrent
phrase engine. There is no movement template, section energy table, or
section-to-chair map. Energy, tension, floor trust, fatigue, contrast/payoff/novelty
debt, motif salience, and cooldowns evolve from the preceding phrase. Section names
are non-causal derived readouts and may persist beyond 32 bars; a 192-bar window
only bounds observation, run-length encoding, and caches; the visible label
residency does not reset there. Motif, tonal, harmonic-position, scene, and bass
voice material are separately resident, so motif replacement cannot regenerate
them together. Climax must be earned from the accumulated state, may last 16–64
bars, and may not occur in a given window.

There was likewise no 16-bar or round-robin synth mutation schedule. Motif
`mutate`, `replace`, or `recall` alone authorizes one deterministic Matrix,
Resonator, or String handoff at a stable phrase boundary; `hold` authorizes none.
Taste may rank candidates only for that engine. Bass voice and tonal material have
independent residency, while harmony turns occur only when recurrent state earns
one; none rotate on elapsed-bar clocks.

The same historical candidate made the low end stateful. Kick policy could anchor, thin, or
rarely withdraw on a cooldown. Its physical family can also morph after an earned
release or floor recommit, never more often than every 24 phrases, with the body,
drop, decay, click, drive, and rumble fields interpolated across the event phrase.
That release used a generated two-bar bass lineage that could mutate, be replaced,
and later be recalled; `2.0.0` supersedes the fixed two-bar span with a persistent
polymetric bass clock.
Kick, bass, rumble, and the remaining music have separate buses and independent
ducking relationships. This is a local candidate boundary: deterministic checks do
not establish long-listening quality, multi-day performance, or public deployment.

The deployed `1.5.0` release added a frozen, seed-derived Track DNA across eleven
macro domains: groove, kick, percussion, bass behavior and voice, harmony,
foreground engine and role, spectrum, space, and form phenotype. New Trajectory
tests sixteen deterministic candidates and enters only one that crosses the
recorded DNA-distance and changed-domain thresholds; otherwise the current
trajectory continues. Vibe remains a slow intent morph, but now changes downstream
rhythmic, harmonic, bass, foreground, and mix decisions instead of merely relabeling
one shared arrangement.

Historical `1.5.0` deterministic evidence separated all recorded seed and Vibe
pairs in its fixed 192-bar planner gate across at least four of six downstream
musical domains. That evidence belongs to `1.5.0`; it does not validate the rewritten
`2.0.0` material planner or prove audible uniqueness, mix quality, or professional
listening acceptance.

The local `2.0.0` candidate replaces fixed percussion candidate sets, fixed
scene-onset masks, and fixed-span bass authority with a phrase-sequential generative
material system:

- every rhythmic lane owns a persistent Euclidean clock whose phase follows the
  absolute sixteenth-note stream across bars, phrases, and 192-bar observation
  boundaries;
- Track DNA biases clock domains and holding behavior without prescribing onset
  sequences;
- phrase memory carries a resident motif, recent fingerprints, archived motifs, and
  any unresolved call;
- the authored gesture grammar uses `repeat`, `subtract`, `add`, `displace`, `call`,
  `answer`, `rest`, and `recall`;
- each eight-bar boundary generates twelve complete symbolic phrase candidates,
  rejects unsafe candidates, scores eligible candidates across seven musical
  measures, and selects through deterministic seeded softmax sampling;
- the chosen eight-bar phrase is frozen once and then materialized by the existing
  Web Audio scheduler without recomputing musical decisions;
- material memory resets only when an accepted New Trajectory enters.

The `2.0.0` browser API contract keeps the existing high-level methods and adds
frozen material telemetry to `getSnapshot()`: current gesture, motif lineage,
lane-clock summaries, candidate score/count, sampling temperature, and
kick-excursion status. It adds no low-level controls.

`2.0.0` remains a local candidate. The 118-test deterministic suite passes. A narrow
foreground Start/Stop, intent, console, and responsive browser smoke was recorded
during implementation, before the final planner-invariant hardening; it is not a
byte-matched final-browser result. Eight fixed 96-bar mix and stem renders, blinded
closest-pair listening, the final browser matrix, a 30–60-minute soak, deployment,
and public acceptance are separate gates and remain open.

Read [MUSICAL_SYSTEM.md](./MUSICAL_SYSTEM.md) for the composition grammar and
research basis, and [ARTISTIC_COUNCIL.md](./ARTISTIC_COUNCIL.md) for the editorial
constitution.

## Run

```sh
npm --prefix app start
npm --prefix app run check
```

Then open http://localhost:4173/. Audio requires a user gesture.

## Repository boundaries

- `app/` is the current audio-first implementation.
- `reference/infinite-hypnotic-techno.html` is the byte-identical canonical source
  supplied by the user.
- `prototype/` is an immutable reference snapshot of the earlier shared Setup
  Universe prototype.
- The previous qualitative probability-field app remains available through Git
  history; it no longer defines the product.
- No uninterrupted playback is promised through computer sleep, browser eviction,
  background suspension, or audio-device changes.

## Setup Universe

QuantumSetup remains independently deployed and can later expose a versioned music
state or transport interface. No cross-setup interoperability is claimed today.

## License

No open-source license has been selected yet.
