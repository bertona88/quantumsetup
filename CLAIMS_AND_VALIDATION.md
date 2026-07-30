# Claims and Validation

Status: claim register for Infinite Techno `1.2.0`

## Allowed claims

The application may claim that it:

- synthesizes audio locally with the Web Audio API and uses no samples;
- has no fixed musical ending while its active audio context survives;
- uses deterministic seed-based composition;
- plans 16-step bars, 8-bar phrases, 8–32-bar sections, and 192-bar movements;
- offers five interpolated techno vibe profiles;
- supports Minor, Neutral, and Major pitch families;
- queues user direction at musical boundaries;
- morphs Vibe over 64–128 bars and Major/Minor over 96 bars;
- caps temporary voices at 96 and gives them finite stop times;
- uses three advanced synthesis engines with 208 discrete base architectures;
- mutates deterministic, bounded synthesis genomes one engine per eight-bar phrase,
  including staged Vibe and New Trajectory palette changes;
- coordinates Matrix, Resonator, and String through six deterministic ensemble
  scenes with curated phrase masks, register roles, effect sends, and one-engine
  role handoffs;
- keeps advanced attacks off quarter-note kick anchors, resolves same-step advanced
  collisions, and bounds their starts by arrangement-section type;
- recalls an earlier ensemble target in RETURN sections within one uninterrupted
  trajectory;
- drives its quantum-inspired contour from audio analysis and scheduled musical
  events.

## Nonclaims

The application does not claim:

- uninterrupted playback through browser or operating-system suspension;
- that deterministic generation cannot repeat over multi-day listening;
- subjective equivalence to a named artist, professional producer, or top DJ;
- machine learning, training on a music catalog, or artist imitation;
- quantum computation, quantum randomness, scientific sonification, or simulation;
- calibrated mastering, universal loudness, or safe output level for every device;
- equivalence to, compatibility with, or emulation accuracy for Ableton instruments;
- calibrated physical simulation of a particular string, membrane, bar, or body;
- current cross-setup interoperability.

## Validation matrix

| Evidence | Validates | Does not validate |
| --- | --- | --- |
| model tests | deterministic plans, legal structure, bounded lanes and pitch families | subjective groove quality |
| ensemble grammar tests | scene reachability and recall, staged roles, register/collision rules, and per-section onset budgets | whether the resulting conversations sound musically compelling |
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

- render representative movements with `OfflineAudioContext` and measure peak, RMS,
  DC, clipping, silence, and transition discontinuities;
- run 30–60-minute foreground browser soaks on desktop and mobile;
- test suspend/resume and audio-device changes;
- conduct multi-hour listening review across all Vibe/Tonality combinations;
- add a bounded long-horizon recurrence ledger and validate intentional recall.
