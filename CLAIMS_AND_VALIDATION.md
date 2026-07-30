# Claims and Validation

Status: claim register for local Infinite Techno `1.5.0` diversity candidate

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
- derives section readouts by run-length encoding adjacent phrase labels, with no
  fixed maximum section duration or musical authority;
- uses 192-bar observation/RLE/cache windows without treating their boundaries as
  tonal changes or scripted energy arcs;
- contains no movement-template, section-energy-table, or section-to-chair
  authority;
- admits a climax only after bounded appetite, tension, floor-trust, payoff-debt,
  readiness, and cooldown rules converge; a climax is bounded to 16–64 bars and
  some observation windows contain none;
- derives anchor, thin, and rare bounded-withdrawal kick policies from phrase state;
- changes an independent kick-family identity only after earned release or floor
  recommit, with a 24-phrase cooldown and one-phrase bounded parameter morph;
- generates two-bar bass cells with deterministic lineage mutation, replacement,
  archival recall, kick-onset avoidance, and independently resident voice identity;
- separates motif, tonal, harmonic-position, scene, and bass-voice material so one
  motif replacement cannot reset them together;
- changes harmony position through state-earned, cooled-down turns rather than
  lineage age, elapsed bars, or the 192-bar observation clock;
- emits bounded physical kick-timbre and low-end routing contracts;
- routes kick, bass, rumble, and remaining music through separate buses before the
  shared master chain;
- offers five interpolated techno vibe profiles;
- supports Minor, Neutral, and Major pitch families;
- queues user direction at musical boundaries;
- morphs Vibe over 64–128 bars and Major/Minor over 96 bars;
- caps temporary voices at 96 and gives them finite stop times;
- uses three advanced synthesis engines with 208 discrete base architectures;
- lets each motif mutate, replace, or recall event authorize exactly one
  deterministic, bounded synthesis-genome handoff at a stable phrase boundary,
  while hold authorizes none;
- chooses the authorized engine from causal event coordinates rather than elapsed
  time, phrase modulo, or round-robin;
- coordinates Matrix, Resonator, and String through six deterministic ensemble
  vocabularies with curated phrase masks, register roles, and effect sends;
- selects one deterministic council chair per phrase from competing lens scores,
  with bounded residency;
- chooses zero or one advanced voice normally, with a maximum of two for a
  developed climax or earned lineage recall;
- keeps advanced attacks off quarter-note kick anchors, resolves same-step advanced
  collisions, and bounds their starts to zero, one, two, or four per bar according
  to the council verdict;
- recalls archived motif/bass material while ensemble-scene material remains
  independently resident until a later causal handoff;
- learns a bounded local preference profile from explicit Pass/Keep decisions and
  uses it only to rank candidates for the engine already authorized by a causal
  motif handoff;
- drives its quantum-inspired contour from audio analysis and scheduled musical
  events;
- separates all 78 pairs in the fixed 13-seed planner manifest, and all ten settled
  Vibe pairs for one fixed seed, across 192-bar downstream musical summaries under
  the recorded structural-distance thresholds.

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
- that a different Track DNA label proves different audio, that the fixed
  13-seed manifest establishes separation for arbitrary IDs, or that every random
  16-candidate draw is guaranteed to contain a threshold-eligible candidate;
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
| model tests | deterministic plans, legal structure, bounded lanes and pitch families | subjective groove quality |
| emergent-form distribution tests | bounded recurrent state, removal of fixed schedules, varied/absent and materially long climax windows, operative gates, causal gesture cooldowns, honest recall labels, non-causal derived sections, and safe replay bounds | whether the resulting long arc feels earned to a listener |
| low-end planner tests | kick-policy conformance, independent kick-family cooldown and phrase morph, bounded physical kick fields, two-bar bass lineage continuity, independently resident voice identity, kick/bass onset separation, and routing-contract bounds | club-system translation or perceived low-end authority |
| causal handoff tests | hold isolation, mutate/replace/recall authorization, non-round-robin engine reachability, stable event selection, and one-engine staging | whether the timbral change feels musically earned |
| council and ensemble tests | scene reachability and causal one-engine handoff, decisive cast limits, layer editing, collision rules, rare fills, and onset budgets | whether the resulting arrangement sounds musically compelling |
| Track DNA and runtime-selection tests | deterministic flat phenotype, curated-domain reachability and balance, weighted distance, bounded candidate-selection rules, and rejection of an unqualified pool without changing seed | downstream realization, audible contrast, or eligibility in every random candidate draw |
| 192-bar trajectory-window distance tests | fixed-manifest cross-seed and cross-Vibe separation in realized rhythm, bass, harmony, note-bearing advanced voices and renderer controls, audio-profile/timbre controls, and form; metadata-only relabelling has zero distance | rendered-audio separation, masking, spectral balance, arbitrary-seed coverage, or listener discrimination |
| taste-model and deck tests | bounded explicit-feedback updates, deterministic specimens, persistence fallback, exploration cadence, and arrangement isolation | whether the learned preference matches a listener's broader taste |
| preview renderer tests | deterministic, finite, normalized specimen PCM and cleanup | perceived quality on every output device |
| pure DSP tests | finite deterministic samples, hard voice endings, and renderer coverage for all 208 base forms | perceived sound quality |
| worklet processor tests | queue and voice ceilings, bounded stealing, clean all-notes-off | long-run browser or device stability |
| syntax checks | loadable JavaScript modules | browser audio behavior |
| active browser smoke | user-gesture start, audible analyser activity, controls, transitions, clean stop | long-duration reliability |
| responsive visual review | one-surface hierarchy and mobile layout | screen-reader quality |
| deployment hash comparison | named public files match tested local files | future cache or service availability |
| long listening panel | perceived variation, flow, and musical quality | mathematical nonrepetition |
| named-device soak | bounded runtime behavior on that device | 24/7 operation everywhere |

## Open validation

Before stronger claims:

- render representative observation windows with `OfflineAudioContext` and measure
  peak, RMS, DC, clipping, silence, and transition discontinuities;
- render a fixed, versioned trajectory manifest as full mixes and stems, loudness
  match comparison copies, report every pair's multi-domain distance and nearest
  neighbour, and retain PCM plus metric hashes;
- conduct blinded same/different or ABX review of the automatically selected closest
  trajectory pairs; keep musical quality scoring separate from distinctness;
- run 30–60-minute foreground browser soaks on desktop and mobile;
- test suspend/resume and audio-device changes;
- conduct multi-hour listening review across all Vibe/Tonality combinations;
- measure kick, bass, and rumble translation on named playback systems;
- add a bounded multi-day recurrence ledger and validate long-horizon recall;
- profile recurrent random access and scheduler behavior over multi-day phrase
  indices.
