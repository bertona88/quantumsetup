# QuantumSetup / Infinite Techno

**An audio-first, endlessly evolving procedural techno set.**

- Live: https://quantumsetup.ai/
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

Version `1.1.0` introduced a bounded 24-voice advanced synthesis bank:

- **Matrix** — four-operator FM with eight acyclic routing algorithms;
- **Resonator** — mallet/noise excitation across curated modal bodies;
- **String** — fractional-delay plucked-string physical modelling.

Together they expose 208 discrete base architectures before bounded continuous
parameters. Parameter genomes are deterministic and coordinate-addressed.

Version `1.2.0` turns that bank into a scored ensemble rather than three independent
random lanes. Six curated scenes—Motor Weave, Acid Relay, Resonant Orbit, Dub
Afterimage, Peak Interlock, and Negative Space—coordinate rhythm, register, motif
response, priority, and effect space. Within one trajectory, scene targets are stable
while their scene material remains resident; a display label or run-length section
never schedules them. Scene material changes through a later causal one-engine
handoff rather than being bundled into motif replacement.

The local `1.3.0` candidate gives that palette an editor. A deterministic artistic
council chooses one foreground engine for ordinary phrases, permits a second only
for earned Peak/Return dialogue, removes competing optional layers, and keeps fills
rare. Matrix, Resonator, and String remain available; they no longer all demand
attention at once. The named council is an acknowledged design metaphor, not artist
participation, endorsement, or imitation.

The same candidate adds an inline Signal Deck. While transport is stopped, the
listener can preview one generated timbre and Pass or Keep it by button, keyboard,
or swipe. Those explicit decisions stay local; the final causal architecture uses
them only to rank candidates for an engine already authorized by a motif event.
They never rewrite rhythm, arrangement, harmony, energy, or the musical seed.

The local `1.4.0` candidate replaces the arrangement spreadsheet with a recurrent
phrase engine. There is no movement template, section energy table, or
section-to-chair map. Energy, tension, floor trust, fatigue, contrast/payoff/novelty
debt, motif salience, and cooldowns evolve from the preceding phrase. Section names
are non-causal derived readouts and may persist beyond 32 bars; a 192-bar window
only bounds observation, run-length encoding, and caches; the visible label
residency does not reset there. Motif, tonal, harmonic-position, scene, and bass
voice material are separately resident, so motif replacement cannot regenerate
them together. Climax must be earned from the accumulated state, may last 16–64
bars, and may not occur in a given window.

There is likewise no 16-bar or round-robin synth mutation schedule. Motif
`mutate`, `replace`, or `recall` alone authorizes one deterministic Matrix,
Resonator, or String handoff at a stable phrase boundary; `hold` authorizes none.
Taste may rank candidates only for that engine. Bass voice and tonal material have
independent residency, while harmony turns occur only when recurrent state earns
one; none rotate on elapsed-bar clocks.

The same candidate makes the low end stateful. Kick policy can anchor, thin, or
rarely withdraw on a cooldown. Its physical family can also morph after an earned
release or floor recommit, never more often than every 24 phrases, with the body,
drop, decay, click, drive, and rumble fields interpolated across the event phrase.
A generated two-bar bass lineage can mutate, be replaced, and later be recalled.
Kick, bass, rumble, and the remaining music have separate buses and independent
ducking relationships. This is a local candidate boundary: deterministic checks do
not establish long-listening quality, multi-day performance, or public deployment.

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
