# QuantumSetup Vision

Status: audio-first product direction
Current slice: Infinite Techno generative set

## Purpose

QuantumSetup creates an endlessly evolving techno journey in the browser. It should
feel like one continuous set: patient enough to hypnotize, structured enough to
orient a dancer, varied enough to survive long listening, and simple enough that the
listener directs mood rather than mixing parameters.

The user chooses:

- start or stop;
- a techno destination: Hypnotic, Dub, Detroit, Acid, or Peak;
- harmonic gravity: Minor, Neutral, or Major;
- new musical DNA.

The generator owns fades, filters, effect sends, arrangement, density, bridge length,
tempo drift, fills, and voice selection.

## Product principles

1. **Music first.** Sound generation and long-form musical structure own the page.
2. **One continuous machine.** The stream is organized as nested bars, phrases,
   sections, and movements rather than unrelated random songs.
3. **Intent, not presets.** Direction changes wait for a phrase boundary and morph
   over 64–128 bars.
4. **Stable anchors, bounded novelty.** The floor keeps its pulse while tops,
   articulation, timbre, harmony, and section role evolve.
5. **Local synthesis.** No samples, account, backend, or network audio dependency.
6. **Quantum contour.** Quantum language and the analyser-driven visual provide
   mysticism and identity without asserting quantum computation or physical
   simulation.
7. **Honest infinity.** The composition has no fixed ending, but browser sleep or
   suspension can interrupt playback.

## Current architecture

The deterministic planner produces 8-bar phrases, 8–32-bar sections, and 192-bar
movements. A hardware-clock lookahead scheduler renders synthesized drums, bass,
percussion, chords, pads, textures, and transition effects through a bounded Web
Audio graph.

The current release proves the audio-first architecture and broad sound palette. It
does not yet prove multi-day nonrepetition or professional-DJ subjective quality.

## Next quality frontier

- bounded motif archive and deliberate long-horizon reprises;
- candidate generation scored for continuity, novelty, and profile fit;
- chapter-scale energy memory across multiple movements;
- offline render analysis for peak, RMS, DC, and transition continuity;
- named-device soak tests and long listening panels;
- an AudioWorklet clock experiment for stronger foreground-tab resilience.
