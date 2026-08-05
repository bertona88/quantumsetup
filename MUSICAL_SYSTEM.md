# Infinite Techno Musical System

Status: `2.2.1` acid-bass release candidate; deterministic and browser/audio
validation remain separate from listening, soak, deployment, and
public-acceptance gates
Generator version: `2.2.1` (`2.2.0` material-state schema)
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

For reproducible validation, a **trajectory window** is one trajectory ID rendered
or planned across 192 consecutive bars. It is a bounded comparison unit, not a
musical reset or a claim that the continuous set contains literal song boundaries.
Cross-trajectory diversity tests compare complete windows rather than treating a
different seed, material ID, or internal state label as musical difference by
itself.

## Trajectory-scale musical identity

Each trajectory ID deterministically creates one frozen **Track DNA** macro
phenotype. This is not a song template or a substitute for the recurrent form
system. It establishes broad musical priors which the phrase and bar planners must
realize downstream:

| Musical domain | Track DNA fields |
| --- | --- |
| Groove and drums | groove family, percussion kit |
| Low end | kick architecture, kick-rumble mode, bass behaviour, bass-voice bias |
| Harmony | harmony behaviour |
| Foreground synthesis | preferred engine and musical role |
| Mix contour | spectral and spatial profiles |
| Long-form tendency | form phenotype |

All 12 fields use curated categorical vocabularies. They bias persistent clock
domains, material holding time, kick parameters, hat and clap envelopes,
clap-burst topology, percussion effect sends, bass and voice residence, harmonic
activity, note-bearing synthesis roles and genomes, audio-engine profile controls,
and recurrent-form tendencies. Track DNA never supplies an onset mask. Field names,
seed, scene label, material IDs, and fingerprints do not count as musical difference
in a structural-distance gate.

`New Trajectory` samples 16 browser-random candidates and, when the pool contains
an eligible candidate, selects the most distant one by a weighted DNA comparison.
Eligibility requires distance of at least `0.55`, at least five changed fields, and
at least three changed core fields among groove, kick, bass, harmony, and form. If a
16-candidate draw contains no eligible result, the request is rejected and the
current trajectory continues; an unqualified fallback seed never enters. At the
16-bar trajectory boundary, the engine clears the resident advanced voices and
reconstructs seed-bound synthesis and ensemble identity.

Vibe remains an independent user direction layered onto this trajectory identity.
It affects realized rhythm, low end, harmony, synthesis, audio profile, and form;
it is not merely a visible preset label. Historical `1.5.0` planner evidence compared
every pair of the five settled Vibe endpoints on one trajectory; that result does not
validate the rewritten material planner. In-flight Vibe requests still morph over
64–128 bars rather than replacing Track DNA.

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

## Phrase-sequential generative material

The `2.2.0` material planner is a second recurrent layer downstream of emergent
form. At every eight-bar boundary it accepts the trajectory seed, Track DNA, current
form snapshot, Vibe profile settled for that phrase boundary, tonality, and previous
material state. It plans and freezes the complete eight-bar symbolic phrase once.
The audio scheduler materializes those eight bars without recomputing musical
decisions.

Each rhythmic lane carries a persistent clock with:

- loop length and Euclidean hit count;
- rotation and absolute phase origin;
- residence age;
- bounded mutation history.

`euclidean(hits, steps, rotation)` uses canonical Bjorklund distribution and returns
immutable output. Clock phase follows the absolute sixteenth-note position and never
restarts at a bar, phrase, derived section, or 192-bar observation boundary. Clock
identities normally remain resident for two to eight phrases. An ordinary phrase may
mutate at most one structural lane; an earned climax, release, or recall may mutate
at most two. Velocity, articulation, and a permitted one-shot fill do not count as
structural clock mutations.

The bounded loop domains are:

| Lane | Loop domain |
| --- | --- |
| Kick | bar-aligned `E(4,16)` foundation plus curated eight-bar anchor, turnaround-pickup, breathing, or rolling-pressure phrasing |
| Clap | 12, 15, 16, 18, 20, or 24 steps with two or three hits |
| Hats and secondary percussion | 5–29 steps, biased by Track DNA groove family |
| Bass | 12, 15, 16, 18, 20, 24, 28, or 32 steps |
| Advanced-synth gestures | 7, 9, 11, 13, 15, 17, 19, 23, 29, or 31 steps |

Straight Track DNA prefers near-16 clocks; triplet families prefer 6/9/12/18
relationships; broken families prefer prime lengths; swung families prefer odd
lengths; patient phenotypes hold material longer. These are weighted dialects, not
fixed patterns.

The phrase memory contains a resident motif, previous gesture, unresolved call,
recent phrase fingerprints, and archived motifs. Its ordered gesture states are
`repeat`, `subtract`, `add`, `displace`, `call`, `answer`, `rest`, and `recall`.
Their checked-in baseline transition matrix is:

| From \ To | Repeat | Subtract | Add | Displace | Call | Answer | Rest | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Repeat | .24 | .14 | .12 | .14 | .14 | .06 | .10 | .06 |
| Subtract | .22 | .08 | .14 | .16 | .16 | .08 | .10 | .06 |
| Add | .18 | .18 | .08 | .16 | .16 | .10 | .08 | .06 |
| Displace | .20 | .14 | .12 | .10 | .18 | .10 | .10 | .06 |
| Call | .05 | .05 | .05 | .05 | .05 | .60 | .10 | .05 |
| Answer | .24 | .14 | .14 | .14 | .12 | .06 | .10 | .06 |
| Rest | .32 | .08 | .12 | .10 | .18 | .08 | .06 | .06 |
| Recall | .34 | .14 | .10 | .12 | .12 | .06 | .06 | .06 |

Before normalization, novelty debt boosts `add`, `displace`, and `call`; fatigue
boosts `subtract` and `rest`; motif salience boosts `repeat`, `answer`, and `recall`;
release boosts `rest` and `recall`; climax boosts `add`, `displace`, and `answer`.
A call creates an answer obligation that must be fulfilled within the same or next
phrase. Answer direction is deterministically upward, downward, rhythmic, or
registral. Ordinary transformations edit no more than 25% of resident motif onsets
or degrees. Emitted notes remain modal, register-bounded, and lineage-traceable.

For every boundary, the planner constructs twelve complete candidates. It rejects
violations of density, voice, pitch, collision, kick anchoring or articulation, silence, or DSP
safety bounds. Eligible candidates receive normalized scores:

| Measure | Weight |
| --- | ---: |
| Groove continuity | 22% |
| Macro-state and profile fit | 18% |
| Kick/bass separation | 16% |
| Motif and call/response continuity | 14% |
| Novelty against recent phrases | 12% |
| Orchestration and spectral budget | 10% |
| Polymetric phase interest | 8% |

Only candidates scoring at least `0.55` and within `0.20` of the best remain in the
selection pool. A named seed coordinate samples a softmax over that pool instead of
always taking the maximum. Temperature stays between `0.35` and `0.85` according to
novelty debt and trajectory phenotype. Candidate construction and selection are
coordinate-addressed and replayable: the same seed plus the same intent history
produces the same material trace.

The kick clock always remains the four-floor `E(4,16)` foundation. Phrase-level
variation is selected from four curated eight-bar families: anchor,
turnaround-pickup, breathing, and rolling-pressure. Every family retains each bar's
downbeat, has no onset spacing below two sixteenth notes, and remains resident for
one to three phrases. Pickup and rolling articulations are quieter and shorter than
foundation hits. Polymetric clocks remain available to secondary lanes, never to
the kick. This curated material phrasing is distinct from rare form-level thinning
or intentional withdrawal.

## Emergent form

There is no movement template, section energy table, or section-to-chair map. At
each eight-bar phrase, a deterministic recurrent state carries:

- energy, tension, density, space, and brightness;
- floor trust and fatigue;
- contrast, payoff, and novelty debt;
- motif salience and lineage memory;
- climax appetite, readiness, age, and cooldown;
- echo-ascent readiness, phrase variant, and cooldown;
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
- Phrase: one recurrent-state decision plus one selected, frozen material candidate.
- Section readout: no authority of its own; it groups adjacent phrases with the
  same derived label.
- Observation/cache window: no musical authority; it packages 192 bars for
  inspection, section-RLE materialization, and bounded caching.
- Material domains: motif lineage, lane clocks, tonal identity, harmony position,
  ensemble role vocabulary, synthesis genomes, and bass voice remain separately
  resident. A motif gesture cannot regenerate them together.
- Harmony: progression position changes only on a state-earned harmonic turn with
  cooldown, not from lineage age or an elapsed-bar clock.
- Advanced synthesis: a separate causal lineage authorization may hand off one
  Matrix, Resonator, or String genome at a stable phrase boundary. Material gestures
  do not automatically change timbre. The other two engines retain their resident
  genomes and roles; there is no 16-bar synth clock or round-robin.
- Acid bass uses square, triangle, or sawtooth identities selected from the
  trajectory's stable filter color. Resonance remains at or below `Q 8`, including
  accents. A climax phrase may authorize one deterministic acid note with a bounded
  `1.4–3.2` second decay; ordinary acid notes retain their short step-derived decay.

No phrase regenerates every lane at once. Persistent clocks continue through display
labels and observation windows; only an accepted New Trajectory resets material
memory. Runtime Vibe or Tonality requests affect future phrase selections only.

## Low-end organism

The kick and bass are planned as a relationship rather than independent lanes.

- The bass onset clock uses a resident 12–32-step Euclidean/polymetric identity
  rather than a fixed two-bar cell.
- A persistent motif lineage supplies modal degrees and bounded transformations
  while the bass clock supplies onset phase.
- Pitch degrees remain inside the active modal field; accent, velocity, length,
  octave, and slides are bounded and coordinate-addressed.
- Bass voice identity has its own resident material ID. It does not rotate on a
  32-bar clock or reset when a motif gesture changes.
- Candidate validation scores kick/bass separation and rejects unsafe overlap before
  the phrase is frozen.
- The recurrent form can earn a joint low-end dropout after floor trust has been
  established. It removes both kick and bass for the final two or four bars of an
  eight-bar phrase, uses an eight-phrase cooldown, and leaves the upper arrangement
  alive for a clear return. The renderer fades the kick, bass, and rumble path to
  exact zero during those bars without changing listener-owned cut controls.
- Breathing kick phrases expose two additional quarter-note positions in each
  sparse bar.
  When a quiet pickup or rolling kick collides with planned bass, the bass onset is
  moved to a safe step inside the same bar. Foundation collisions create real
  breathing space, but their source event and degree remain in frozen provenance so
  form-level kick thinning or withdrawal can restore the note when that exact kick
  is not ultimately emitted.
- Bass-character intent biases clock density without supplying a note mask. Sub
  remains restrained, while Rolling and Acid can occasionally reach seven or eight
  onsets in a 20-step clock. Syncopated intent and Track DNA avoid exact quarter-grid
  clocks that could be annihilated by the foundation; intentional rests and
  recurrent density still apply.
- The planner emits a dedicated low-end contract containing motif lineage, clock
  summary, kick-phrase state, bass density and voice, track-level rumble mode, and separate
  duck depths.

Kick identity is stable but not frozen. An independent family lineage may change
only after a state-earned release or floor recommit and then enters a 24-phrase
cooldown. Its bounded body frequency, pitch start and drop time, decay, click,
drive, and any enabled rumble send, cutoff, and feedback interpolate over the event phrase; climax
age adds bounded pressure without selecting a scripted sequence. The audio graph
routes kick, bass, rumble, and the remaining music through separate buses before
the shared master chain. Kick hits duck bass and music independently, so the sub
relationship does not depend on one global music-bus envelope.
Track DNA independently selects `off`, `short`, or `deep` kick rumble for the whole
trajectory. `off` sets both rumble send and feedback to zero; the other identities
remain bounded and do not toggle probabilistically from hit to hit. Dense Rolling,
Acid, and Syncopated bass material lowers the rumble cutoff, send, and feedback to
protect bass definition. Bass onsets also duck only the rumble bus with a bounded
60–110 ms recovery, returning to its declared level. Foundation kicks retain the
normal bass duck; pickup and
rolling articulations duck substantially less and recover in 55–75 ms. Foundation
bass ducking recovers in 105 ms so a note one sixteenth later is not held under the
prior 190 ms envelope. Bass voices carry stronger local gain and harmonic definition,
and Bass Presence reaches +4.5 dB without changing the global Low EQ.

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
decay, spread, and drive. Historical `1.5.0` inventory evidence used a fixed
synthetic two-seed, five-Vibe motif-event scan that constructed all 208 structures,
selected at least 200 through the causally authorized handoff-candidate path, and
reached more than 170 candidate parameter genomes. It does not establish that every
architecture becomes note-bearing or audible inside a real trajectory window, and
it does not validate the current `2.2.0` material planner.

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

A scene is a semantic role vocabulary, not an onset sequence. It can remain resident
through its own material ID and changes only through a later causal one-engine
handoff, not because a material gesture, display label, or run-length section
commands it. It is not an instruction to play all three parts. Its roles specify
motor, call, answer, counterline, punctuation, or tail purpose; modal degree
behavior; non-overlapping registers; note length; velocity bias; priority; and
bounded delay/reverb sends. Persistent synth clocks and the selected phrase gesture
decide onsets.

Candidate validation prevents same-step advanced collisions, protects current kick
attacks, makes low-register parts yield to bass onsets, makes harmonic parts yield
around chord attacks, and makes Resonator parts yield around metallic or ride
attacks. Collision handling uses candidate-local clock alternatives; scene metadata
contains no fallback mask.

The artistic council then edits that vocabulary. The chair emerges phrase by
phrase from the four competing lens scores, with short residency protected and
overlong residency penalized. It chooses zero, one, or—only for a developed climax
or an earned lineage recall—two advanced engines. It also caps optional layers,
removes spectral competitors, and grants fills only when the recurrent form state
earns them. The result is not a vote or an average: one foreground idea wins and
the remaining instruments wait. See
[ARTISTIC_COUNCIL.md](./ARTISTIC_COUNCIL.md).

An earned **Echo Ascent** is a phrase-frozen transition foreground, not a global
delay preset. Rising tension, anticipation, density, readiness, a named seed
coordinate, and an eight-phrase cooldown authorize one of three weighted variants:
restrained dotted-eighth ascent, widening eighth-note ascent, or a rare late
dotted-eighth throw. The selected variant adds a bounded four-bar or two-bar contour
of bright rim, metallic, shaker, and late ride articulations. The council limits
other optional layers to one and removes competing high-register advanced parts for
that phrase. Persistent percussion clocks are not mutated by the transition part.

Ordinary council phrases use one advanced engine and at most two advanced starts per
bar. Sparse phrases use at most one. Intentional rests use none. A developed
climax or recalled lineage may use two engines and at most four starts per bar.
Three advanced engines never play together. At most one advanced attack is placed
on a sixteenth step. These structural limits are verified mechanically; whether a
scene grooves, balances, or develops convincingly still requires listening evidence.

Every parameter uses a named hash coordinate. Adding a future parameter therefore
does not consume a shared random stream and rewrite unrelated timbres. Topology and
genome changes occur only when a separate causal lineage event authorizes one engine
at a stable phrase boundary. The authorized engine is chosen deterministically from
event coordinates, not phrase modulo or elapsed time. Material gestures do not
authorize extra handoffs. Initial construction seeds all three engines; after that,
high-level Vibe and trajectory state may shade candidates but cannot create an extra
timbre handoff. During a Vibe morph, dynamics and global effects may continue moving
bar by bar, while synthesis genomes, semantic scene roles, and the complete symbolic
phrase are frozen at phrase entry.

The Signal Deck presents deterministic stopped-transport previews. Explicit
Pass/Keep decisions update a bounded local preference profile. At a future causal
timbre handoff, that profile ranks up to eight deterministic candidates for the one
engine the event already authorized. Taste cannot consume or rank the twelve musical
material candidates and cannot alter rhythm, arrangement, harmony, energy, timing,
scene choice, material gesture, lane clocks, or the musical seed. With no taste
signal, candidate zero preserves the unpersonalized deterministic timbre result.
This is explicit local preference learning, not catalog training or artist
imitation.

The engines are informed by standard FM, modal-resonator, and digital-waveguide
techniques. They are not copies of, preset-compatible with, or claimed equivalent to
commercial instruments. The modal and string voices are creative synthesis models,
not calibrated simulations of physical objects.

The current release samples a 128-bit trajectory ID on each clean page load
and is deterministic and coordinate-addressed by that ID, absolute step, phrase,
lineage, candidate, and lane. The initial Vibe and harmonic field are also derived
from the ID, so a fresh session does not always enter through the same musical
posture. A seed-bearing URL plus the same intent history is an intentional replay
path. It has recurrent form state, persistent material state, bounded climax and
kick behavior, phrase memory, symbolic candidate selection, and a separate scored
timbre-candidate pool.

The deterministic and focused-browser evidence does not establish persuasive
long-form musical quality, audible trajectory separation, long-duration
foreground-browser reliability, or multi-day performance. All 161 deterministic
tests pass. Focused local and public performance smokes cover Start/Stop, EQ,
quantized cuts, direction targeting, bass character, persistence, responsive
widths, and console cleanliness. The exact 18-file Pages bundle byte-matches
`b16c5dc`. Eight fixed 96-bar renders and stems, blinded listening, the full browser
matrix, a 30–60-minute soak, and public acceptance remain separate gates.

## Vibe vocabularies

Vibes are vectors, not sample banks:

- **Hypnotic** — patient cores, rolling rumble, restrained harmony, polyrhythmic tops.
- **Dub** — sparse groove, deep chords, large filtered delay and reverb.
- **Detroit** — warmer harmony, human swing, syncopated bass, machine funk.
- **Acid** — resonant bass articulation, slides, brighter percussion.
- **Peak** — higher density, rides, stronger drive, decisive returns.

Numeric traits interpolate continuously. Material selection samples the profile only
at a future phrase boundary; an already frozen phrase is never regenerated by an
in-flight Vibe morph.

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

The Performance console has two explicit timing planes:

- Low, Mid, and High EQ move immediately through smoothed, bounded filter gains.
- Kick and Bassline cuts latch on the next unscheduled beat. Kick cut also suppresses
  kick-triggered ducking and new rumble excitation.
- Energy, Density, Brightness, Space, Swing, Acid, Bass Presence, Change Rate, and
  Breakdown Depth wait for the next eight-bar phrase, then glide for eight bars.
- Bassline Character is phrase-stable and becomes Auto, Sub, Rolling, Acid, or
  Syncopated only when that glide completes.

These controls shade rendering and future candidate inputs. They do not mutate the
symbolic phrase that has already been selected and frozen.

## FX as arrangement

Effects respond to musical state:

- delay and reverb sends belong to voice and vibe vocabularies;
- filter motion follows bounded brightness, energy, and space;
- risers require high anticipation and rising tension, so they can become false
  builds rather than announcements of a scheduled Peak;
- earned Echo Ascents coordinate a temporary bright-percussion density rise with a
  dedicated high-passed stereo cross-feedback delay; they are mutually exclusive
  with risers and do not change kick, bass, or the ordinary shared-delay vocabulary;
- downlifters mark an emergent release;
- long pads and texture washes respond to space, release, and motif salience;
  pads are withheld for the opening eight-bar phrase, then use seed-addressed
  entry bars, voicings, envelopes, oscillator blends, filter arcs, and bounded
  8–22 Hz amplitude modulation instead of one recurring startup gesture;
- master gain remains stable; energy comes primarily from orchestration.

The performance EQ is a listener-owned contour after the generator buses. It does
not replace generator-owned voice filters, sends, or arrangement motion.

Feedback is bounded below 0.72 for the main delay, at or below 0.55 for Echo
Ascent cross-feedback, and below 0.58 for rumble.

## Claims and limitations

Allowed:

- deterministic, procedural, locally synthesized techno;
- a 128-bit trajectory-ID space with a \(1 / 2^{128}\) chance that two independent
  uniform ID draws match;
- three deterministic advanced synthesis engines with 208 base architectures;
- a local explicit-feedback profile that influences bounded timbre candidates only;
- deterministic recurrent phrase-state arrangement with derived section readouts;
- persistent Euclidean/polymetric lane clocks with absolute phase;
- authored probabilistic material gestures and deterministic seeded candidate
  sampling;
- rule-earned, bounded climax, curated kick-phrase, and motif-lineage behavior;
- lineage-authored tonal material and one-engine causal synthesis handoffs;
- separate kick, bass, rumble, and music buses with bounded low-end routing;
- deterministic, cooldown-earned Echo Ascent transitions with finite bright
  percussion voices and bounded stereo cross-feedback;
- gradual, phrase-quantized high-level direction changes;
- analyser-driven quantum-inspired visual contour.

Not claimed:

- machine-learned imitation of named artists;
- participation, approval, endorsement, or literal opinions from the named artistic
  council references;
- guaranteed subjective equivalence to a professional DJ;
- proven audible separation or groove quality from symbolic tests alone;
- completion of the fixed renders, blinded listening, foreground browser, soak,
  deployment, or public-acceptance gates for `2.1.0`;
- continuous playback through sleep, browser suspension, or device eviction;
- quantum computation, quantum randomness, or physical sonification;
- a complete solution to multi-day musical recurrence.
