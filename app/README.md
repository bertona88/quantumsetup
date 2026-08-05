# Infinite Techno

QuantumSetup is now an audio-first generative music project: one continuously evolving
techno set synthesized locally with the Web Audio API. The quantum layer is visual
language and atmosphere. It does not generate the score and is not presented as a
physics simulation.

## Run and validate

```sh
npm start
npm test
npm run check
```

Open `http://localhost:4173/`. Audio starts only after a user gesture.

Each clean page load samples a 128-bit trajectory ID and deterministically derives
its initial Vibe, harmonic field, form, rhythm, material lineages, and synthesis
coordinates. A URL containing `?seed=<32 hex digits>` intentionally replays that
starting identity. There are \(2^{128}\), about \(3.4 \times 10^{38}\), possible
IDs; two independent uniform ID draws match with probability \(1 / 2^{128}\), about
\(2.9 \times 10^{-39}\). This is a trajectory-ID collision statement, not a claim
that different IDs can never produce similar passages or that rendered audio is
quantum-random.

## High-level controls

- **Start / Stop** owns the one browser `AudioContext`.
- **Vibe** sets a long-term destination: Hypnotic, Dub, Detroit, Acid, or Peak.
- **Harmonic gravity** sets Minor, Neutral, or Major.
- **Live Mix** supplies smoothed Low/Mid/High EQ and next-beat Kick/Bassline cuts.
- **Direction** supplies nine bounded phrase-safe macro biases plus an Auto, Sub,
  Rolling, Acid, or Syncopated bassline character.
- **New trajectory** evaluates sixteen deterministic Track-DNA candidates, previews
  their emitted rhythmic/melodic topology, and queues only one that clears both the
  macro and recent-start structural-distance gates at a 16-bar seed-change boundary.
  If none qualifies, the current trajectory continues. This is not a synth-mutation
  clock.
- **Share moment** copies a versioned replay URL with the full trajectory ID,
  bar/step coordinate, intent history, performance state, and local Signal Deck
  state. A compatible link reconstructs that deterministic history and waits for a
  fresh user gesture before continuing audio. The visible trajectory label remains
  abbreviated; the full ID stays in the URL.
- **Signal Deck** previews one stopped-transport timbre and records an explicit
  local Pass/Keep preference by button, keyboard, or swipe.

Vibe changes begin at a safe 8-bar phrase boundary and morph over 64, 96, or 128
bars according to profile distance. Major/minor changes use a neutral suspended
field between the two tonal families rather than replacing the scale immediately.
Direction changes begin at the next phrase and glide for eight bars. EQ responds
immediately; cuts enter at the next beat and do not rewrite planned notes.

## Musical architecture

`track-dna.js` derives a frozen twelve-domain macro phenotype from the 128-bit
trajectory identity: groove, kick architecture, track-level kick rumble, percussion kit, bass behavior and
voice bias, harmonic behavior, foreground engine and role, spectral/spatial
profile, and form phenotype. These fields must change across several core domains
before a requested New Trajectory can enter.

`techno-model.js` is the deterministic composition layer. It plans:

- 16 sixteenth-note steps per 4/4 bar;
- 8-bar phrases with bounded bar-level ornaments;
- recurrent phrase state whose adjacent labels are grouped into section readouts
  that may exceed 32 bars;
- 192-bar observation/RLE/cache windows, roughly six minutes near 128 BPM, with no
  musical authority or scripted energy arc;
- slow profile interpolation and a maximum tempo change of 0.12 BPM per bar.

`emergent-form.js` owns the causal long-form state. Four competing council lenses
read energy, tension, density, space, floor trust, fatigue, motif salience,
contrast/payoff/novelty debt, and gesture cooldowns. The winning lens applies
bounded phrase deltas. There is no movement template, fixed section energy curve,
or section-to-chair lookup. Climax entry requires accumulated threshold state and
a seed-specific appetite; it can remain absent or sustain for a bounded 16–64 bars.
The same state may occasionally authorize an Echo Ascent after rising tension and
anticipation converge, then enforces an eight-phrase cooldown.

`material-planner.js` owns phrase-sequential rhythmic and motif material. Persistent
clocks follow the absolute sixteenth-note stream, while kick, clap, hats,
percussion, bass, and the three foreground engines use different onset grammars.
Kick and backbeat clap provide the fixed trustworthy bed. The open hat uses a
multi-phrase resident vocabulary of full offbeats, paired offbeats, alternating
bars, sparse tails, or closed-only space instead of watermarking almost every bar.
Each eight-bar boundary evaluates twelve core-distinct candidates through bounded
rejection, weighted scoring, structural near-duplicate pruning, and seeded softmax
selection. The chosen phrase is frozen before the scheduler consumes its bars.
Observation windows and derived form labels do not reset its clocks or memory; only
an accepted New Trajectory does.

Open `http://localhost:4173/audio-diversity.html` for the autonomous rendered-audio
audit. It renders the real core Web Audio engine as full mixes and bass solos,
extracts FFT-band onset, recurrence, spectral, and dynamics features, then rejects
cross-seed pairs below the checked-in structural-distance threshold. Advanced
AudioWorklet voices are intentionally outside this bounded core audit.

`audio-engine.js` owns the audio clock and synthesis. Its voices include synthesized
kick, clap, closed/open hat, ride, shaker, rim, tom, metallic FM percussion,
acid/pulse/sub bass, chord stabs, pads, noise textures, risers, and downlifters.
An AudioWorklet bank adds Matrix four-operator FM, Resonator modal synthesis, and
String fractional-delay physical modelling. Their 208 discrete base architectures
combine with bounded, deterministic parameter genomes. Initial construction seeds
all three engines. During playback, motif `mutate`, `replace`, or `recall` alone
authorizes one deterministic engine handoff at a stable phrase boundary; `hold`
authorizes none. Engine choice is scored from the causal event rather than phrase
modulo, elapsed time, or a round-robin. Vibe may supply candidate shading but
cannot authorize an extra handoff. A New Trajectory is a separate full-identity
boundary: it clears resident seed-bound palettes, roles, profiles, and genomes so
the prior track cannot leak into the new one.

Six curated ensemble scenes coordinate those engines as calls, replies, motors,
weaves, marks, tails, and pickups. They retain semantic roles, separated registers,
priorities, and effect space but contain no onset masks; the selected material
phrase supplies all synth attacks. The highest-scoring council lens chairs the
phrase and edits the scene down to one foreground advanced engine in ordinary
phrases, zero for intentional rests, or two for developed dialogue.
Arrangement-aware placement resolves synth-on-synth collisions, protects low-end
space around the bass and kick floor, and thins modal events around metallic
percussion.

Kick behavior combines curated phrase material with form intent. Its clock always
remains the bar-aligned `E(4,16)` foundation; persistent eight-bar anchor,
turnaround-pickup, breathing, and rolling-pressure families vary phrasing without
drifting against the bar. Form may still thin or briefly withdraw the selected
kick. Pickup and rolling hits use quieter, shorter articulations. The planner also
emits bounded kick body, pitch-drop, decay, click, and drive parameters. Track DNA
selects `off`, `short`, or `deep` rumble for the whole trajectory, so rumble can be
genuinely absent rather than probabilistically applied to every hit. A separate kick-family lineage may morph only
after an earned release or floor recommit, has a 24-phrase cooldown, and
interpolates those physical fields across its event phrase. Bass follows a
persistent 12–32-step Euclidean clock and resident modal motif lineage rather than
a fixed two-bar cell; its onsets yield to foundation kicks, while collisions with
quiet pickup or rolling articulations relocate to an adjacent safe step. Sub intent
stays restrained; Rolling and Acid can occasionally reach reference-like density
without becoming fixed masks. Secondary kick hits duck less and recover faster,
foundation ducking releases within one sixteenth, and bass-only gain/definition plus
bounded deep-rumble protection improve audibility without boosting global Low EQ.
Bass voice identity,
material motif and clocks, tonal state, harmony position, and semantic scene remain
separate domains. A motif operation cannot reset them together, and a 192-bar
observation boundary cannot restart form or material residency.
Pulse bass adds five equally likely resident timbres: raw square, filtered,
wobble-growl, neuro-reese, and an all-layer hybrid. Their complete bounded DSP
parameters are frozen in the bar plan and remain generator-owned rather than
becoming note-level randomness or extra interface controls.

`taste-model.js`, `signal-deck.js`, and `instrument-preview.js` implement the local
explicit-feedback loop. Pass/Keep decisions rank up to eight deterministic genomes
only when a motif event has already authorized that engine to change. A hold event
consumes no taste decision and preserves the palette. The preference path is
isolated from the arrangement planner.

The graph separates kick, bass, rumble, and remaining music before the shared
master chain. Bass and music receive independent kick ducking; rumble has bounded
send, cutoff, and feedback. Separate performance gains preserve cuts and bass
presence without being overwritten by duck recovery. A bounded Low/Mid/High EQ
chain precedes soft clipping and compression. Filtered delay, generated convolution
reverb, voice filters, and effect sends remain generator-owned. Echo Ascent adds a
separate high-passed left/right cross-feedback path and a phrase-frozen bright rim,
metallic, shaker, and ride contour; it does not raise ordinary shared-delay sends or
touch kick and bass routing.
Native temporary voices are capped at 72 and the advanced bank at 24, preserving a
combined ceiling of 96. Every voice has a finite hard end.

`main.js` owns the single audio-first interface. `spectrum-mountain.js` resamples
fast-transient and detailed-frequency analysers into one log-frequency height
profile, advances those profiles through a continuous history texture, and
displaces one dense WebGL2 terrain mesh. The shader derives smooth surface normals,
ray-marches terrain self-shadow, and projects a phrase-resident vocabulary of eleven
structured-light families through ten palettes onto a white mineral material. Kick
and bass shape relief and light intensity; hat, chord, synth, spectral centroid,
flux, and five broad frequency bands steer roughness, color, camera drift, and
illumination. `quantum-visual.js` owns that renderer, adaptive bounded quality, and
its Canvas2D fallback. The visual reads the music and never drives or rewrites it.

See [`../MUSICAL_SYSTEM.md`](../MUSICAL_SYSTEM.md) for the arrangement grammar,
transition design, and research sources.

## Canonical source

This implementation preserves the musical strengths of the user-supplied
`infinite-hypnotic-techno.html`:

- SHA-256:
  `03014fca7b13962ca166090df82c8045e2ea9758c9dfa78e5c72ca575d57ed57`
- retained concepts: deterministic seed, Web Audio lookahead scheduling, bounded
  voice cleanup, sidechain buses, synthetic percussion and acid bass, generated
  delay/reverb, analyser-driven visuals;
- replaced limitation: its rigid 32-bar arrangement loop is now a recurrent
  phrase-state system with non-causal derived readouts and bounded observation
  caches.

An exact byte-for-byte copy is preserved at
`reference/infinite-hypnotic-techno.html`; its hash matches the untouched supplied
file. Git history preserves the previous visual-only application.

## Runtime boundary

The generator can run indefinitely while the page stays active and the browser keeps
its `AudioContext` alive. No web page can guarantee uninterrupted 24/7 sound through
computer sleep, browser eviction, background throttling, device audio changes, or
operating-system suspension. Returning to a suspended page produces a clear restart
state instead of pretending continuity.
