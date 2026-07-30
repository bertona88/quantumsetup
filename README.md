# QuantumSetup / Infinite Techno

**An audio-first, endlessly evolving procedural techno set.**

- Live: https://quantumsetup.ai/
- Audio: synthesized locally with the Web Audio API; no samples or network calls
- Interaction: one music surface with Vibe and Harmonic Gravity direction
- Visual: an analyser-driven quantum-inspired contour, explicitly artistic

## Product direction

QuantumSetup is a music project. Its primary job is to sustain a convincing,
continuously evolving techno journey. Quantum language contributes atmosphere,
names, and the spectral contour; it does not imply quantum computation or a
scientific simulation.

The generator preserves the strong audio core of the supplied
`infinite-hypnotic-techno.html` and expands its former 32-bar cycle into:

- 8-bar phrases;
- 8–32-bar arrangement sections;
- 192-bar movements;
- five interpolated techno vocabularies;
- Major, Minor, and Neutral tonal families;
- 64–128-bar phrase-safe transitions.

Version `1.1.0` adds a bounded 24-voice advanced synthesis bank:

- **Matrix** — four-operator FM with eight acyclic routing algorithms;
- **Resonator** — mallet/noise excitation across curated modal bodies;
- **String** — fractional-delay plucked-string physical modelling.

Together they expose 208 discrete base architectures before bounded continuous
parameters. Parameter genomes are deterministic and coordinate-addressed. One
advanced engine mutates at each eight-bar phrase boundary. Vibe and New Trajectory
palettes are staged through the same sequence instead of replacing all three synths
together.

Read [MUSICAL_SYSTEM.md](./MUSICAL_SYSTEM.md) for the composition grammar and
research basis.

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
