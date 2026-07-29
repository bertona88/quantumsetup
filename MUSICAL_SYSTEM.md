# Infinite Techno Musical System

Status: implemented generative-set grammar  
Generator version: `1.0.0`  
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

The four-on-the-floor anchor remains dominant in groove sections. Odd-group
relationships are reserved for shaker, tops, metallic percussion, and modulation.
No phrase regenerates every lane at once.

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
- phrase-, section-, and movement-aware arrangement;
- gradual, phrase-quantized high-level direction changes;
- analyser-driven quantum-inspired visual contour.

Not claimed:

- machine-learned imitation of named artists;
- guaranteed subjective equivalence to a professional DJ;
- continuous playback through sleep, browser suspension, or device eviction;
- quantum computation, quantum randomness, or physical sonification;
- a complete solution to multi-day musical recurrence.
