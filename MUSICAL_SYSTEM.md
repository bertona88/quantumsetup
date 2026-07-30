# Infinite Techno Musical System

Status: implemented generative-set grammar  
Generator version: `1.4.0`
Primary product: music  
Quantum role: visual and poetic contour only

## Thesis

The generator is one continuously evolving groove machine, not a playlist of
randomly generated songs. Stable rhythmic anchors create trust; small phrase changes
create attention; recurrent musical state creates memory, tension, release, and
return without prescribing a set list.

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
| Section readout | 8 bars or longer | diagnostic run-length view of the current emergent label |
| Observation/cache window | 192 bars | bounded trace, readout materialization, and cache/index checkpoint |
| Stream | unbounded phrases | continuous set with no fixed ending |

At 128 BPM, 8 bars are about 15 seconds, 32 bars about one minute, and a 192-bar
observation window about six minutes.

## Emergent form

There is no movement template, section energy table, or section-to-chair map. At
each eight-bar phrase, a deterministic recurrent state carries:

- energy, tension, density, space, and brightness;
- floor trust and fatigue;
- contrast, payoff, and novelty debt;
- motif salience and lineage memory;
- climax appetite, readiness, age, and cooldown;
- kick policy and withdrawal cooldown;
- independent kick-family identity, morph readiness, and cooldown;
- current council chair and its residency.

The four council lenses produce competing scores from that state. The winning lens
applies one bounded set of deltas; the resulting sound state becomes the input to
the next phrase. Named hash coordinates provide deterministic variation and
tie-breaking without selecting a predefined sequence.

Climax is therefore conditional, not assigned to a bar. Tension, floor trust,
payoff debt, a seed-specific appetite, and cooldown must converge before entry.
Once entered, the same state decides whether to hold or release it, with a safety
bound of two to eight phrases—16 to 64 bars. Some 192-bar observation windows have
no climax at all.

`IGNITION`, `ASCENT`, `DRIVE`, `LOCK`, `DRIFT`, `BRIDGE`, `VOID`, `MOTIF`,
`PEAK`, `RETURN`, `RELEASE`, and `TRANSITION` are derived display labels. Consecutive
phrases with the same label are run-length encoded as sections for readout and
compatibility. Those readout sections can exceed 32 bars; their boundaries do not
schedule energy, chairs, fills, transitions, tonal material, or synthesis changes.
The 192-bar boundary only bounds tracing, run-length encoding, and cache/index
work. It neither changes tonal identity nor resets the recurrent form stream.
The public residency meter follows the recurrent label epoch across that boundary
instead of restarting with the cache window.

## Variation rules

- Bar: velocity changes, one ghost hit, articulation, or a short fill.
- Phrase: one recurrent-state decision, bounded layer change, bass-lineage
  transformation, or timbral development.
- Section readout: no authority of its own; it groups adjacent phrases with the
  same derived label.
- Observation/cache window: no musical authority; it packages 192 bars for
  inspection, section-RLE materialization, and bounded caching.
- Material domains: motif/bass-cell lineage, tonal identity, harmony position,
  ensemble scene, and bass voice have separate resident IDs. A motif replacement
  cannot regenerate them together.
- Harmony: progression position changes only on a state-earned harmonic turn with
  cooldown, not from lineage age or an elapsed-bar clock.
- Advanced synthesis: `mutate`, `replace`, or `recall` is the sole running-state
  authorization for one Matrix, Resonator, or String handoff at a stable phrase
  boundary. `hold` authorizes none. The other two engines retain their resident
  genomes and ensemble roles; there is no 16-bar synth clock or round-robin.

The kick policy normally protects all four quarter-note anchors. Low-energy or
negative-space state may thin them to one to three; rare earned withdrawal can
remove them for at most two phrases and then enters a long cooldown. Odd-group
relationships remain reserved for bass, shaker, tops, metallic percussion, and
modulation. No phrase regenerates every lane at once.

## Low-end organism

The kick and bass are planned as a relationship rather than independent lanes.

- A deterministic two-bar bass cell is scored from three- and five-pulse motion,
  offbeat weight, syncopation, current density, and open space around kick attacks.
- A persistent lineage ID carries the cell across phrases. Novelty debt and motif
  salience may mutate it, replace it while archiving the predecessor, or recall an
  archived lineage.
- Pitch degrees remain inside the active modal field; accent, velocity, length,
  octave, and slides are bounded and coordinate-addressed.
- Bass voice identity has its own resident material ID. It does not rotate on a
  32-bar clock or reset when a motif lineage is replaced.
- The planner emits a dedicated low-end contract containing lineage operation,
  kick policy, bass density and voice, rumble send, and separate duck depths.

Kick identity is stable but not frozen. An independent family lineage may change
only after a state-earned release or floor recommit and then enters a 24-phrase
cooldown. Its bounded body frequency, pitch start and drop time, decay, click,
drive, rumble send, cutoff, and feedback interpolate over the event phrase; climax
age adds bounded pressure without selecting a scripted sequence. The audio graph
routes kick, bass, rumble, and the remaining music through separate buses before
the shared master chain. Kick hits duck bass and music independently, so the sub
relationship does not depend on one global music-bus envelope.

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

### Council-edited conversation grammar

The synthesis bank is integrated through six curated scenes:

| Scene | Coordinated parts | Arrangement purpose |
| --- | --- | --- |
| Motor Weave | String motor, Matrix counter, Resonator mark | locked and ascending groove |
| Acid Relay | Matrix call, String reply, Resonator pickup | elastic call and response |
| Resonant Orbit | Resonator signal, String reply, Matrix pickup | spacious bridge and transition dialogue |
| Dub Afterimage | String call, Matrix echo, Resonator tail | negative-space afterimages |
| Peak Interlock | Matrix motor, String weave, Resonator crown | dense but interleaved peak pressure |
| Negative Space | String tone, Resonator tail, Matrix pickup | void, release, and sparse ignition |

A scene is a phrase vocabulary that remains resident through its own material ID
and changes only through a later causal one-engine handoff, not because a motif
replacement, display label, or run-length section commands it. It is not an
instruction to play all three parts.
Its roles specify curated eight-bar masks, modal degree behavior, non-overlapping
registers, note length, velocity bias, priority, and bounded delay/reverb sends.
The masks never add advanced attacks to the four quarter-note kick anchors. At
materialization time, same-step advanced collisions are resolved deterministically;
low-register parts yield to bass onsets, harmonic parts yield around chord attacks,
and Resonator parts yield around metallic or ride attacks. Scene vocabulary provides
the alternate cells, so collision resolution does not invent a fresh random rhythm.

The artistic council then edits that vocabulary. The chair emerges phrase by
phrase from the four competing lens scores, with short residency protected and
overlong residency penalized. It chooses zero, one, or—only for a developed climax
or an earned lineage recall—two advanced engines. It also caps optional layers,
removes spectral competitors, and grants fills only when the recurrent form state
earns them. The result is not a vote or an average: one foreground idea wins and
the remaining instruments wait. See
[ARTISTIC_COUNCIL.md](./ARTISTIC_COUNCIL.md).

Ordinary council phrases use one advanced engine and at most two advanced starts per
bar. Sparse phrases use at most one. Intentional rests use none. A developed
climax or recalled lineage may use two engines and at most four starts per bar.
Three advanced engines never play together. At most one advanced attack is placed
on a sixteenth step. These structural limits are verified mechanically; whether a
scene grooves, balances, or develops convincingly still requires listening evidence.

Every parameter uses a named hash coordinate. Adding a future parameter therefore
does not consume a shared random stream and rewrite unrelated timbres. Topology and
genome changes occur only when a motif `mutate`, `replace`, or `recall` event
authorizes one engine at a stable phrase boundary. The authorized engine is chosen
deterministically from the event coordinates, not phrase modulo or elapsed time.
A `hold` event changes no engine. Initial construction seeds all three engines;
after that, high-level Vibe and trajectory state may supply candidates but cannot
authorize an extra handoff. Note-level variation is limited to pitch, velocity,
duration, and tiny seeded excitation differences. During a Vibe morph, dynamics
and global effects may continue moving bar by bar, while bass lineage, synthesis
genomes, scene roles, and the curated phrase vocabulary are sampled at phrase
entry.

The Signal Deck presents deterministic stopped-transport previews. Explicit
Pass/Keep decisions update a bounded local preference profile. At a future causal
motif handoff, that profile ranks up to eight deterministic candidates for the one
engine the event already authorized. A hold cannot consume taste or change a
genome. Taste cannot alter rhythm, arrangement, harmony, energy, timing, scene
choice, lineage operation, or the musical seed. With no taste signal, candidate
zero preserves the unpersonalized deterministic result. This is explicit local
preference learning, not catalog training or artist imitation.

The engines are informed by standard FM, modal-resonator, and digital-waveguide
techniques. They are not copies of, preset-compatible with, or claimed equivalent to
commercial instruments. The modal and string voices are creative synthesis models,
not calibrated simulations of physical objects.

The current implementation is deterministic and coordinate-addressed by seed, bar,
phrase, lineage, and step. It has recurrent form state, bounded climax and kick
withdrawal, lineage recall, and a small scored timbre-candidate pool. It does not
yet establish persuasive long-form musical quality, multi-day runtime performance,
or a complete long-horizon recurrence ledger. Those remain separate quality
frontiers.

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

Effects respond to musical state:

- delay and reverb sends belong to voice and vibe vocabularies;
- filter motion follows bounded brightness, energy, and space;
- risers require high anticipation and rising tension, so they can become false
  builds rather than announcements of a scheduled Peak;
- downlifters mark an emergent release;
- long pads and texture washes respond to space, release, and motif salience;
- master gain remains stable; energy comes primarily from orchestration.

Feedback is bounded below 0.72 for the main delay and below 0.58 for rumble.

## Claims and limitations

Allowed:

- deterministic, procedural, locally synthesized techno;
- three deterministic advanced synthesis engines with 208 base architectures;
- a local explicit-feedback profile that influences bounded timbre candidates only;
- deterministic recurrent phrase-state arrangement with derived section readouts;
- rule-earned, bounded climax, kick-policy, and bass-lineage behavior;
- lineage-authored tonal material and one-engine causal synthesis handoffs;
- separate kick, bass, rumble, and music buses with bounded low-end routing;
- gradual, phrase-quantized high-level direction changes;
- analyser-driven quantum-inspired visual contour.

Not claimed:

- machine-learned imitation of named artists;
- participation, approval, endorsement, or literal opinions from the named artistic
  council references;
- guaranteed subjective equivalence to a professional DJ;
- continuous playback through sleep, browser suspension, or device eviction;
- quantum computation, quantum randomness, or physical sonification;
- a complete solution to multi-day musical recurrence.
