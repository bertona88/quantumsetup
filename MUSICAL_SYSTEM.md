# Infinite Techno Musical System

Status: implemented generative-set grammar  
Generator version: `1.2.0`
Primary product: music  
Quantum role: visual and poetic contour only

## Thesis

The generator is one continuously evolving groove machine, not a playlist of
randomly generated songs. Stable rhythmic anchors create trust; small phrase changes
create attention; larger section and movement arcs create memory, tension, release,
and return.

The design target is the continuity of a strong techno DJ set: track boundaries
should become difficult to locate, important changes should land on phrase
boundaries, and dramatic gestures should be rare enough to remain meaningful.

## Historical and practical basis

The implemented grammar follows several recurring findings:

- techno develops strongly through rhythm, meter, layer interaction, texture, and
  timbre, not only harmonic progression;
- patterns commonly combine into groups of 4, 8, and 16 bars;
- practical techno arrangements use 16–32-bar sections and often double them for
  extended tracks;
- DJs align major EQ, layer, and effect changes to 8- or 16-bar phrases so a mix can
  feel like one evolving machine;
- kick removal, filter motion, reverb/delay tails, and density changes provide
  continuous tension and release;
- unequal secondary loops can produce long composite variation while the downbeat
  remains stable.

Sources:

- Mark J. Butler, [Turning the Beat Around](https://mtosmt.org/issues/mto.01.7.6/mto.01.7.6.butler.html)
- Ableton, [Play with song structures](https://learningmusic.ableton.com/song-structure/song-structure.html)
- Ableton, [Asynchronous or polyrhythmic loops](https://makingmusic.ableton.com/asynchronous-or-polyrhythmic-loops)
- Native Instruments, [How to make techno](https://blog.native-instruments.com/how-to-make-techno/)
- Native Instruments, [DJ transitions](https://blog.native-instruments.com/dj-transitions/)
- Native Instruments, [Harmonic mixing rules](https://blog.native-instruments.com/harmonic-mixing-rules-and-how-to-break-them/)
- Pioneer DJ, [Mixing techniques behind major genres](https://blog.pioneerdj.com/djtips/we-uncover-the-mixing-techniques-behind-every-major-genre/)
- Rebecca Leydon Smith, [Continuous Processes in Contemporary EDM](https://mtosmt.org/issues/mto.21.27.2/mto.21.27.2.smith.html)

These sources motivate the structure; they do not prove that one fixed arrangement
formula defines techno.

## Time hierarchy

| Level | Implemented span | Responsibility |
| --- | ---: | --- |
| Step | 1/16 note | hits, velocity, accents, swing |
| Bar | 4 beats / 16 steps | articulation, ghost notes, fills |
| Phrase | 8 bars | recognizable groove identity and bounded mutation |
| Section | 8–32 bars | layer entry/exit, bridge, pressure, return |
| Movement | 192 bars | one long energy arc and tonal identity |
| Stream | unbounded movements | continuous set with no fixed ending |

At 128 BPM, 8 bars are about 15 seconds, 32 bars about one minute, and a 192-bar
movement about six minutes.

Four deterministic movement templates combine:

`IGNITION`, `ASCENT`, `DRIVE`, `LOCK`, `DRIFT`, `BRIDGE`, `VOID`, `PEAK`,
`RETURN`, `RELEASE`, and `TRANSITION`.

Every movement totals exactly 192 bars. Every section duration is divisible by eight.
The templates vary the order and duration without abandoning recognizable club
phrasing.

## Variation rules

- Bar: velocity changes, one ghost hit, articulation, or a short fill.
- Phrase: bass motif rotation, density adjustment, top-loop change, or a different
  chord placement.
- Section: instrument entry/exit, filter range, space, rumble, or a transition
  gesture.
- Movement: root, modal family, motif, chord progression, and timbre genome.
- Advanced synthesis: one of Matrix, Resonator, or String mutates at each phrase
  boundary; the other two retain their genomes and ensemble roles. The selected
  engine adopts its target scene role in the same handoff. Vibe, New Trajectory, and
  section candidates therefore form deterministic hybrids instead of replacing the
  whole advanced palette or orchestration together.

The four-on-the-floor anchor remains dominant in groove sections. Odd-group
relationships are reserved for shaker, tops, metallic percussion, and modulation.
No phrase regenerates every lane at once.

## Advanced synthesis bank

Three original Web Audio DSP engines extend the existing drum, bass, harmony, and
atmosphere voices:

| Engine | Method | Discrete structure |
| --- | --- | ---: |
| Matrix | four-operator FM with finite envelopes | 8 algorithms × 4 ratio families × 3 envelope families = 96 |
| Resonator | additive modal bank with bounded excitation and coupling | 4 exciters × 8 materials × 2 structures = 64 |
| String | fractional-delay waveguide with damping and body filtering | 4 exciters × 4 bodies × 3 terminations = 48 |

The total is 208 discrete base architectures before continuous parameters such as
FM index, oscillator level, brightness, stiffness, damping, strike or pick position,
decay, spread, and drive. A fixed two-seed, five-Vibe deterministic scan selects all
208 structures into note-bearing lanes and reaches more than 170 active parameter
genomes.

### Ensemble conversation grammar

The synthesis bank is integrated through six curated scenes:

| Scene | Coordinated parts | Arrangement purpose |
| --- | --- | --- |
| Motor Weave | String motor, Matrix counter, Resonator mark | locked and ascending groove |
| Acid Relay | Matrix call, String reply, Resonator pickup | elastic call and response |
| Resonant Orbit | Resonator signal, String reply, Matrix pickup | spacious bridge and transition dialogue |
| Dub Afterimage | String call, Matrix echo, Resonator tail | negative-space afterimages |
| Peak Interlock | Matrix motor, String weave, Resonator crown | dense but interleaved peak pressure |
| Negative Space | String tone, Resonator tail, Matrix pickup | void, release, and sparse ignition |

A scene is a section-level target, not a preset switch. Its three parts specify
curated eight-bar masks, modal degree behavior, non-overlapping registers, note
length, velocity bias, priority, and bounded delay/reverb sends. The masks never add
advanced attacks to the four quarter-note kick anchors. At materialization time,
same-step advanced collisions are resolved deterministically; low-register parts
yield to bass onsets, Matrix/String parts yield around chord attacks, and Resonator
parts yield around metallic or ride attacks. Scene vocabulary provides the alternate
cells, so collision resolution does not invent a fresh random rhythm.

Only the engine selected by the established three-phrase mutation sequence may
adopt its target scene role at a phrase boundary. This couples timbral and
orchestration change into one audible handoff while the other two parts carry
continuity. Short sections may intentionally remain hybrid. Within an uninterrupted
trajectory, RETURN sections target the most recent LOCK, DRIVE, or ASCENT scene,
making recall structural rather than an accidental repeat.

Advanced starts are bounded to two per bar in VOID/RELEASE, six in ordinary
sections, and eight in PEAK. At most one advanced attack is placed on a sixteenth
step. These structural limits are verified mechanically; whether a scene grooves,
balances, or develops convincingly still requires listening evidence.

Every parameter uses a named hash coordinate. Adding a future parameter therefore
does not consume a shared random stream and rewrite unrelated timbres. Topology and
genome changes occur only at eight-bar boundaries, with exactly one of the three
runtime engines changing per phrase. Explicit high-level Vibe and trajectory
requests feed new candidates into the same staged sequence. Note-level variation is
limited to pitch, velocity, duration, and tiny seeded excitation differences.
During a Vibe morph, dynamics and global effects may continue moving bar by bar,
while bass identity, synthesis genomes, scene roles, and the curated phrase
skeleton are sampled at phrase entry.

The engines are informed by standard FM, modal-resonator, and digital-waveguide
techniques. They are not copies of, preset-compatible with, or claimed equivalent to
commercial instruments. The modal and string voices are creative synthesis models,
not calibrated simulations of physical objects.

The current implementation is deterministic and coordinate-addressed by seed, bar,
phrase, section, and step. It has long-form structure and bounded variation, but it
does not yet implement a scored candidate generator or a multi-day recurrence
ledger. Those remain the next major quality frontier for true long-horizon recall.

## Vibe vocabularies

Vibes are vectors, not sample banks:

- **Hypnotic** — patient cores, rolling rumble, restrained harmony, polyrhythmic tops.
- **Dub** — sparse groove, deep chords, large filtered delay and reverb.
- **Detroit** — warmer harmony, human swing, syncopated bass, machine funk.
- **Acid** — resonant bass articulation, slides, brighter percussion.
- **Peak** — higher density, rides, stronger drive, decisive returns.

Numeric traits interpolate continuously. Discrete musical vocabulary changes only on
bar or phrase boundaries.

## User-directed transitions

A button creates intent, never an immediate preset swap.

1. The request waits for the next 8-bar boundary.
2. Space, drive, density, swing, rumble, and timbre interpolate with smoothstep.
3. Tempo moves no faster than 0.12 BPM per bar.
4. The destination becomes dominant only after the blend crosses its midpoint.
5. The morph settles over 64, 96, or 128 bars based on profile distance.

Major ↔ Minor changes last 96 bars. The middle third uses a neutral suspended
pitch field without a defining third, then introduces the new tonal color. Neutral
transitions take 64 bars.

## FX as arrangement

Effects are scheduled as musical events:

- delay and reverb sends belong to voice and vibe vocabularies;
- section filters move slowly;
- risers span the final eight bars before selected transitions;
- downlifters mark sparse section entrances;
- long pads and texture washes occupy bridge/void space;
- master gain remains stable; energy comes primarily from orchestration.

Feedback is bounded below 0.72 for the main delay and below 0.58 for rumble.

## Claims and limitations

Allowed:

- deterministic, procedural, locally synthesized techno;
- three deterministic advanced synthesis engines with 208 base architectures;
- phrase-, section-, and movement-aware arrangement;
- gradual, phrase-quantized high-level direction changes;
- analyser-driven quantum-inspired visual contour.

Not claimed:

- machine-learned imitation of named artists;
- guaranteed subjective equivalence to a professional DJ;
- continuous playback through sleep, browser suspension, or device eviction;
- quantum computation, quantum randomness, or physical sonification;
- a complete solution to multi-day musical recurrence.
