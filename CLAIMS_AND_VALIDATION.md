# Claims and Validation

Status: claim register for local Infinite Techno `2.2.0` kick-phrase candidate;
deployed `2.1.0` performance-control evidence remains historical

The named `2.1.0` deployment is verified at `b16c5dc`, Pages run `30631366177`, and
deployment `5691599940`. All 18 published files byte-match and a focused public
performance smoke passes; listening, render, full browser, soak, and public
acceptance remain separate boundaries.

## Allowed claims

The application may claim that it:

- synthesizes audio locally with the Web Audio API and uses no samples;
- has no fixed musical ending while its active audio context survives;
- uses deterministic seed-based composition;
- samples a 128-bit trajectory ID from the browser cryptographic random source on
  each clean page load and derives the initial Vibe and harmonic field from it;
- deterministically assigns each trajectory an 11-field categorical macro
  phenotype covering groove, drums, low end, harmony, foreground synthesis, mix
  contour, and form tendency;
- evaluates 16 fresh candidates for `New Trajectory` and selects the most
  macro-distinct eligible candidate when that bounded pool contains one;
- rejects a `New Trajectory` request and preserves the current seed when the
  bounded pool contains no threshold-eligible candidate;
- has \(2^{128}\), or about \(3.4 \times 10^{38}\), possible trajectory IDs, so two
  independent uniform ID draws match with probability \(1 / 2^{128}\), or about
  \(2.9 \times 10^{-39}\);
- advances bounded recurrent musical state at eight-bar phrase boundaries;
- uses immutable Bjorklund Euclidean patterns read through persistent lane clocks;
- carries each lane's loop length, hit count, rotation, absolute phase origin,
  residence age, and bounded mutation history across bars, phrases, derived labels,
  and 192-bar observation boundaries;
- uses Track DNA as a weighted clock and material-holding dialect rather than an
  onset mask;
- keeps the kick clock on four-floor `E(4,16)` and varies it only through curated,
  bar-aligned anchor, turnaround-pickup, breathing, and rolling-pressure phrases;
- selects track-level `off`, `short`, or `deep` kick rumble, with zero send and
  feedback when rumble is off;
- relocates bass collisions caused by quiet pickup and rolling kick articulations
  to adjacent safe steps while retaining foundation-kick authority;
- applies shallower 55–75 ms ducking to secondary kicks and 105 ms recovery to
  foundation kicks, with bass-only level/definition and dense-bass rumble protection;
- treats bass character as a density bias: Sub remains restrained while Rolling
  and Acid can occasionally reach seven or eight onsets per 20-step clock;
- keeps lane identities resident for two to eight phrases and limits structural
  mutation to one lane ordinarily or two during earned climax, release, or recall;
- carries phrase memory containing a resident motif, previous gesture, unresolved
  call, recent fingerprints, and archived motifs;
- uses the authored gesture vocabulary `repeat`, `subtract`, `add`, `displace`,
  `call`, `answer`, `rest`, and `recall`, with a checked-in transition matrix adjusted
  by bounded macro state;
- fulfils a call in the same or following phrase, limits ordinary motif edits to 25%
  of onsets or degrees, and keeps emitted notes modal, register-bounded, and
  lineage-traceable;
- generates twelve complete symbolic candidates at each eight-bar boundary, rejects
  density, voice, pitch, collision, kick anchoring or articulation, silence, and DSP-safety violations,
  and scores eligible candidates with normalized musical measures;
- keeps candidates scoring at least `0.55` and within `0.20` of the best, then uses
  deterministic seeded softmax sampling at temperature `0.35`–`0.85` rather than
  always taking the maximum;
- freezes the selected full eight-bar phrase before its first bar and lets the audio
  scheduler materialize it without recomputing musical decisions;
- exposes pure material-state creation, advancement, and trace functions so the same
  seed and intent history replay the same phrase sequence;
- derives section readouts by run-length encoding adjacent phrase labels, with no
  fixed maximum section duration or musical authority;
- uses 192-bar observation/RLE/cache windows without treating their boundaries as
  tonal changes or scripted energy arcs;
- contains no movement-template, section-energy-table, or section-to-chair
  authority;
- admits a climax only after bounded appetite, tension, floor-trust, payoff-debt,
  readiness, and cooldown rules converge; a climax is bounded to 16–64 bars and
  some observation windows contain none;
- derives bounded floor intent and rare withdrawal permission from phrase state
  without allowing form labels to reset the material kick clock;
- changes an independent kick-family identity only after earned release or floor
  recommit, with a 24-phrase cooldown and one-phrase bounded parameter morph;
- generates bass from a persistent 12–32-step clock plus resident modal motif
  lineage, kick-onset separation, and independently resident voice identity;
- separates motif, lane-clock, tonal, harmonic-position, semantic-scene,
  synthesis-genome, and bass-voice material so one gesture cannot reset them
  together;
- changes harmony position through state-earned, cooled-down turns rather than
  lineage age, elapsed bars, or the 192-bar observation clock;
- authorizes an occasional phrase-frozen Echo Ascent only after rising tension,
  anticipation, density, readiness, a deterministic permission coordinate, and an
  eight-phrase cooldown converge;
- realizes that authorization as one of three weighted bright-percussion contours
  through a separate high-passed stereo cross-feedback path capped at `0.55`, while
  excluding a simultaneous riser and competing high-register advanced parts;
- emits bounded physical kick-timbre and low-end routing contracts;
- routes kick, bass, rumble, and remaining music through separate buses before the
  shared master chain;
- offers five interpolated techno vibe profiles;
- supports Minor, Neutral, and Major pitch families;
- queues user direction at musical boundaries;
- morphs Vibe over 64–128 bars and Major/Minor over 96 bars;
- caps temporary voices at 96 and gives them finite stop times;
- uses three advanced synthesis engines with 208 discrete base architectures;
- keeps any advanced-synthesis genome handoff separately causal and bounded to one
  authorized engine at a stable phrase boundary; a material gesture cannot create an
  extra timbre handoff;
- chooses the authorized engine from causal event coordinates rather than elapsed
  time, phrase modulo, or round-robin;
- coordinates Matrix, Resonator, and String through six deterministic ensemble
  vocabularies containing semantic roles, register constraints, priorities, and
  effect sends but no onset masks;
- selects one deterministic council chair per phrase from competing lens scores,
  with bounded residency;
- chooses zero or one advanced voice normally, with a maximum of two for a
  developed climax or earned lineage recall;
- keeps advanced attacks off quarter-note kick anchors, resolves same-step advanced
  collisions, and bounds their starts to zero, one, two, or four per bar according
  to the council verdict;
- recalls archived motif material while clocks, semantic scene roles, and synthesis
  genomes remain independently resident unless separately authorized to change;
- learns a bounded local preference profile from explicit Pass/Keep decisions and
  uses it only to rank candidates for the engine already authorized by a causal
  timbre handoff, never to rank the twelve musical-material candidates;
- preserves `window.QuantumTechno.getSnapshot()`, `requestVibe()`, and
  `requestTonality()` while adding a frozen material snapshot with gesture, motif
  lineage, lane-clock summaries, candidate diagnostics, temperature, and
  kick-phrase status;
- drives one persistent causal field from a read-only event tape derived from the
  already-frozen phrase: future pressure, audio-clock crossing, and long visual
  residue are three phases of the same event; the visual does not rewrite the score.

## Nonclaims

The application does not claim:

- uninterrupted playback through browser or operating-system suspension;
- that deterministic generation cannot repeat over multi-day listening;
- that different trajectory IDs can never produce similar or colliding musical
  passages, or that \(1 / 2^{128}\) is the measured probability of two rendered
  one-minute audio segments being identical;
- that every one of the \(2^{128}\) trajectory IDs has been proven perceptually
  distinct, or that planner-level structural distance by itself proves audible
  difference;
- that a different Track DNA label proves different audio, that the historical
  `1.5.0` fixed 13-seed manifest establishes separation for arbitrary IDs, or that
  every random 16-candidate draw is guaranteed to contain a threshold-eligible
  candidate;
- that twelve symbolic phrase candidates guarantee a good groove, a perceptually
  distinct record, or a listener-preferred choice;
- that `2.1.0` has passed its fixed 96-bar renders, blinded listening comparison,
  complete browser-acceptance gate, 30–60-minute soak, or public-acceptance gate;
- subjective equivalence to a named artist, professional producer, or top DJ;
- machine learning, training on a music catalog, or artist imitation;
- participation, endorsement, approval, or literal opinions from the named artistic
  council references;
- cloud taste sync, identity inference, or personalization beyond explicit local
  instrument feedback;
- quantum computation, quantum randomness, scientific sonification, or simulation;
- calibrated mastering, universal loudness, or safe output level for every device;
- calibrated acoustic or physical-drum meaning for the kick-timbre fields;
- equivalence to, compatibility with, or emulation accuracy for Ableton instruments;
- calibrated physical simulation of a particular string, membrane, bar, or body;
- current cross-setup interoperability.

## Validation matrix

| Evidence | Validates | Does not validate |
| --- | --- | --- |
| Euclidean-clock tests | hit counts, evenness, rotation, invalid-input rejection, immutability, and absolute phase continuity | audible groove or long-run musical interest |
| material-state tests | deterministic and order-independent creation/advancement/trace, bounded residency and mutation, no observation-window reset, and replay from the same intent history | subjective phrase quality |
| gesture-grammar tests | normalized transition rows, state reachability, bounded rests, timely answers, 25% mutation cap, legal pitch, and attributable repeat/recall | whether calls and answers feel expressive |
| candidate-selection tests | twelve-candidate construction, rejection bounds, normalized scoring, threshold and near-best filtering, deterministic softmax, and cross-seed choice diversity | that the selected candidate is musically best |
| model tests | frozen phrase materialization, legal structure, bounded lanes and pitch families | subjective groove quality |
| emergent-form distribution tests | bounded recurrent state, removal of fixed schedules, varied/absent and materially long climax windows, operative gates, causal gesture cooldowns, honest recall labels, non-causal derived sections, and safe replay bounds | whether the resulting long arc feels earned to a listener |
| Echo Ascent planner and graph tests | all three phrase-frozen variants, rising density/send contours, eight-phrase cooldown, no simultaneous riser, high-register foreground exclusion, finite bright voices, bounded cross-feedback topology, and forecast visibility | whether frequency, timbre, stereo translation, and payoff feel right in long listening |
| 128-seed, 384-bar material scan | kick clock remains bar-aligned in every phrase, all four curated kick families are reached with safe spacing and phrase-boundary transitions, secondary lanes retain persistent non-16 polymeter, no global lane reset, and exact repetition remains attributable | club-system translation or perceived low-end authority |
| low-end planner tests | independent kick-family cooldown and phrase morph, track-level off/short/deep rumble, secondary-kick bass survival, character-dependent bass density, articulation-aware duck bounds, bounded physical fields, persistent clock/lineage continuity, and routing-contract bounds | club-system translation or perceived low-end authority |
| same-seed real-engine captures | unnormalized browser-engine bass-solo and full-mix WAVs for rolling/off-rumble and acid/deep-rumble trajectories; bass RMS remains within 8.84–10.03 dB of the corresponding full mix | subjective audibility on the user's system, club translation, or parity with illustrative reference renders |
| performance-control tests | bounded normalization, dB EQ routing, separate gain stages, next-beat cut state, phantom-duck prevention, phrase-safe direction transitions, and frozen active/target telemetry | good control settings, listening quality, or club-system translation |
| causal handoff tests | hold isolation, mutate/replace/recall authorization, non-round-robin engine reachability, stable event selection, and one-engine staging | whether the timbral change feels musically earned |
| council and ensemble tests | semantic scene-role reachability without onset masks, causal one-engine handoff, decisive cast limits, layer editing, collision rules, rare fills, and onset budgets | whether the resulting arrangement sounds musically compelling |
| Track DNA and runtime-selection tests | deterministic flat phenotype, curated-domain reachability and balance, weighted distance, bounded candidate-selection rules, and rejection of an unqualified pool without changing seed | downstream realization, audible contrast, or eligibility in every random candidate draw |
| first-48-bar trajectory distance tests | every fixed-manifest pair separates in rhythm and phrase grammar plus another musical domain with composite symbolic distance at least `0.20` | rendered-audio separation, masking, spectral balance, arbitrary-seed coverage, or listener discrimination |
| taste-model and deck tests | bounded explicit-feedback updates, deterministic specimens, persistence fallback, exploration cadence, and arrangement isolation | whether the learned preference matches a listener's broader taste |
| preview renderer tests | deterministic, finite, normalized specimen PCM and cleanup | perceived quality on every output device |
| causal-world tests | deterministic spacetime event identity, nonzero future pressure, exact crossing dominance, decaying memory, idempotent forecast ingestion, and persistent post-impact scars | that the metaphor is physics or that the visual is artistically successful |
| pure DSP tests | finite deterministic samples, hard voice endings, and renderer coverage for all 208 base forms | perceived sound quality |
| worklet processor tests | queue and voice ceilings, bounded stealing, clean all-notes-off | long-run browser or device stability |
| syntax checks | loadable JavaScript modules | browser audio behavior |
| runtime phrase-materialization tests | one planner advance per phrase, deeply frozen eight-bar plans and material snapshots, future-boundary intent isolation, skipped-phrase replay, Stop preservation, and accepted-seed reset | browser audio behavior or subjective quality |
| final-candidate local `2.1.0` performance browser smoke | user-gesture Start, smoothed Low EQ, reversible next-beat Bassline and Kick cuts, queued Energy and Rolling bass-character targets, durable-control reload, nonpersistent cuts, warning/error-free console, and zero horizontal overflow at 1280, 390, and 320 pixels | full browser matrix, reduced-motion or screen-reader behavior, listening quality, soak reliability, deployment, or public behavior |
| implementation-stage `2.0.0` browser smoke | user-gesture Start, populated running ensemble, future-boundary Vibe and Tonality requests, clean Stop, and a warning/error-free console on the then-current candidate | exact final-source browser behavior, material API inspection, New Trajectory, preview/restart, reduced-motion, long-duration reliability, or listening quality |
| responsive visual review | zero horizontal overflow at `1280×720`, `390×844`, and `320×568` on the tested browser | screen-reader quality or every browser/device |
| `2.1.0` deployment hash comparison | all 18 published files match `b16c5dc` local bytes through cache-busted SHA-256 comparison | future cache or service availability, subjective audio quality, full browser coverage, or public acceptance |
| long listening panel | perceived variation, flow, and musical quality | mathematical nonrepetition |
| named-device soak | bounded runtime behavior on that device | 24/7 operation everywhere |

## Open validation

Before stronger claims:

- render eight fixed 96-bar trajectories plus stems in a foreground browser harness
  and retain PCM plus hashes;
- measure peak, RMS, DC, clipping, silence, transition discontinuities, kick/bass
  overlap, and nearest-neighbour distances for those exact renders;
- conduct blinded 90-second review of the eight closest trajectory pairs; require at
  least six pairs to read as clearly different records while scoring groove quality
  separately from distinctness;
- complete the remaining browser matrix for New Trajectory, preview/restart,
  reduced motion, page-level material API inspection, and screen-reader behavior;
- run a 30–60-minute foreground browser soak on named desktop and mobile devices;
- test suspend/resume and audio-device changes;
- conduct multi-hour listening review across all Vibe/Tonality combinations;
- measure kick, bass, and rumble translation on named playback systems;
- add a bounded multi-day recurrence ledger and validate long-horizon recall;
- profile recurrent random access and scheduler behavior over multi-day phrase
  indices;
- keep deployment monitoring and public acceptance separate from the completed
  `2.1.0` release verification.

## Historical evidence boundary

The deployed `2.0.0` release recorded deterministic material checks, foreground
browser interaction, and byte-matched deployment evidence. That remains valid
history for `2.0.0` only; the separate evidence above establishes the bounded
deployment and focused-browser claims for `2.1.0`, not listening quality, the full
browser matrix, soak behavior, or public acceptance.
