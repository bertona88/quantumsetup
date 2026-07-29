# AGENTS.md

## Product authority

QuantumSetup is now primarily a **generative music project**: an endless,
audio-first techno set at https://quantumsetup.ai/.

The user-supplied `infinite-hypnotic-techno.html` is the canonical musical starting
point. Its source SHA-256 is
`03014fca7b13962ca166090df82c8045e2ea9758c9dfa78e5c72ca575d57ed57`.
The exact source is preserved at `reference/infinite-hypnotic-techno.html`; do not
modify that reference copy.
Preserve its good audio-clock, synthesis, routing, and cleanup ideas while improving
long-form musical intelligence.

The quantum identity is a contour around the music:

- welcome: spectral/probability language, real physics references used playfully,
  analyser-driven visual form;
- prohibited by default: presenting the audio as quantum computation, quantum
  randomness, physical sonification, or a scientific simulator.

Music owns the product hierarchy. Do not let scientific UI, model controls, or
Setup Universe doctrine displace the listening experience.

## Current implementation

- `app/techno-model.js` owns deterministic musical planning.
- `app/audio-engine.js` owns the Web Audio graph, hardware-clock scheduling, voices,
  effects, and cleanup.
- `app/main.js` owns the single audio-first UI and reactive contour.
- `MUSICAL_SYSTEM.md` is the musical grammar and research basis.
- `VISION.md`, `INTERFACE_CONTRACT.md`, `CLAIMS_AND_VALIDATION.md`, and
  `ACCEPTANCE_TESTS.md` define the current product boundary.

There must be one primary page, not LAB/TRIP modes or multiple product tabs.
Controls stay high-level: transport, musical trajectory, techno vibe, and harmonic
color. Arrangement fades, effect sends, filter sweeps, pattern density, and detailed
synthesis remain the generator's responsibility.

## Musical quality directive

- Preserve a strong four-on-the-floor anchor while varying secondary rhythm,
  articulation, timbre, and harmony.
- Make changes legible at musical boundaries: bar, 8-bar phrase, 8–32-bar section,
  and 192-bar movement.
- A user direction is an intent, not a preset switch. Morph it over 64–128 bars.
- Do not regenerate every layer together.
- Use deterministic seeds and coordinate-addressed randomness.
- Prefer curated rhythmic vocabulary and bounded transformations over free random
  masks.
- Keep dramatic silence, risers, fills, and breakdowns on long cooldowns.
- Treat multi-day recurrence, motif recall, and professional-set listening tests as
  open quality frontiers until evidence exists.

## Runtime and claim boundary

Audio is synthesized locally and starts only from a user gesture. Temporary sources
must have finite stop times and cleanup. Feedback, gain, MIDI, filter, voice-count,
and scheduler values must remain bounded and finite.

Do not promise uninterrupted 24/7 playback through browser eviction, background
throttling, operating-system sleep, audio-device changes, or mobile suspension. The
design can be endless while the active browser audio context survives.

Do not claim that deterministic tests, a successful deployment, or an attractive
visual establishes professional-DJ musical quality. Those are separate completion
boundaries.

## Prototype boundary

`prototype/` is the immutable reference snapshot associated with production release
`20260726T002235Z-478235af2650`. Do not modify it. The previous probability-field
application is preserved in Git history and does not constrain the current music
architecture.

## Working agreement

- Read this file and `MUSICAL_SYSTEM.md` before substantial changes.
- Keep changes scoped; preserve unrelated user work.
- Run deterministic tests and browser/audio smoke tests before release.
- Verify the named public deployment rather than inferring it from local success.
- Do not push, deploy, publish, message collaborators, or alter external services
  without explicit user authority.
