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
- new musical DNA;
- which isolated generated timbres to Pass or Keep while the set is stopped.

The generator owns fades, filters, effect sends, arrangement, density, bridge length,
tempo drift, fills, voice admission, and the timing of any taste-informed timbre
choice.

## Product principles

1. **Music first.** Sound generation and long-form musical structure own the page.
2. **One continuous machine.** The stream carries recurrent phrase state rather
   than choosing songs or traversing an arrangement template.
3. **Intent, not presets.** Direction changes wait for a phrase boundary and morph
   over 64–128 bars.
4. **Stable anchors, bounded novelty.** The floor keeps its pulse while tops,
   articulation, timbre, harmony, and emergent form role evolve.
5. **Local synthesis.** No samples, account, backend, or network audio dependency.
6. **Quantum contour.** Quantum language and the analyser-driven visual provide
   mysticism and identity without asserting quantum computation or physical
   simulation.
7. **Honest infinity.** The composition has no fixed ending, but browser sleep or
   suspension can interrupt playback.
8. **Learn narrowly.** Explicit feedback may personalize timbre; it must not silently
   infer or rewrite the listener's arrangement.

## Current architecture

The `1.4.0` candidate advances deterministic state every eight bars. Energy,
tension, floor trust, fatigue, motif salience, causal debts, and cooldowns decide
what can happen next. Adjacent phrases with the same derived label are grouped into
section readouts, which may exceed 32 bars. Those labels and run-length sections
only describe what emerged. A 192-bar boundary packages observation, RLE, and cache
work; it cannot change tonal identity or schedule an arc. Motif, tonal, harmonic,
scene, and bass-voice domains remain independently resident across the boundary
instead of sharing one reset trigger.

Climax, kick withdrawal, council chairing, and bass development emerge from those
rules. A climax can be absent or sustain for a bounded 16–64 bars. The kick can
anchor, thin, or rarely withdraw. Its independent physical family can morph across
one phrase after an earned release or floor recommit, followed by a 24-phrase
cooldown. A generated two-bar bass lineage can mutate, be replaced, and return from
archive; bass-voice identity follows its own resident material domain. Motif mutate,
replace, or recall alone may authorize one advanced-engine handoff at a stable phrase
boundary. Hold authorizes none, and taste may only rank the candidates of the engine
already authorized. There is no periodic or round-robin synth mutation. A
hardware-clock lookahead scheduler renders the result through separate kick, bass,
rumble, and music buses plus the bounded shared master graph.

Deterministic candidate tests can establish state bounds, causality, reachability,
and routing contracts. They do not prove multi-day performance, deployed-browser
behavior, or professional-DJ subjective quality.

## Next quality frontier

- multi-day motif archive and deliberate long-horizon reprises;
- rendered candidate scoring for continuity, novelty, low-end balance, and profile
  fit;
- chapter-scale listening evidence across multiple observation windows and motif
  lineages;
- offline render analysis for peak, RMS, DC, and transition continuity;
- named-device soak tests and long listening panels;
- an AudioWorklet clock experiment for stronger foreground-tab resilience.
