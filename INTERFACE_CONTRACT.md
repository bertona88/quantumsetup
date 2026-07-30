# Interface Contract

Implemented browser API: `window.QuantumTechno/1.2.0`
Scope: one audio-first generative techno instrument

## One-surface rule

The application has one primary page and no LAB/TRIP or other mode tabs.

The interface exposes only high-level musical direction:

- Start/Stop;
- New Trajectory;
- Vibe: Hypnotic, Dub, Detroit, Acid, Peak;
- Harmonic Gravity: Minor, Neutral, Major.

Tempo, density, effects, filters, fades, bridges, arrangement, and individual
instruments are intentionally not user controls.

## Transport

Start creates and resumes one `AudioContext` from the user gesture. Stop fades the
master, clears scheduling timers, closes the context, and disposes temporary voices.

Space activates Start/Stop when focus is not in an interactive element. `N` queues a
New Trajectory.

## Musical intent

While stopped, Vibe and Harmonic Gravity apply immediately to the next start.

While running:

- a Vibe request begins at the next 8-bar boundary;
- its profile morph lasts 64, 96, or 128 bars;
- a Major ↔ Minor request lasts 96 bars and passes through Neutral;
- Neutral transitions last 64 bars;
- New Trajectory enters at the next 16-bar boundary;
- UI selection identifies the destination while `NOW` continues to identify the
  currently dominant state.

## Readouts

The page reports:

- current dominant vibe;
- arrangement section;
- root and modal field;
- tempo;
- bar;
- seed;
- queued or active trajectory progress;
- current deterministic ensemble scene and phrase-scoped cast;
- current phrase instrumentation, shown as a passive roster updated only at
  eight-bar boundaries.

The ensemble rail reads as `ENSEMBLE | [phrase cast] | [SCENE] · [NN] PARTS`.
`PARTS` counts the eight-bar instrumentation union, not simultaneous DSP voices.
Scene identity is planned by the music model; the interface does not invent names
from runtime activity. A target scene may be a deliberate hybrid while its three
roles arrive one engine per phrase.

## Global object

After startup:

```js
window.QuantumTechno = Object.freeze({
  version: "1.2.0",
  getSnapshot,
  requestVibe,
  requestTonality,
});
```

`getSnapshot()` returns version, seed, transport state, bar, step, BPM, current vibe,
tonality, section, movement, active transition summary, current ensemble scene,
current instrumentation, and advanced-synth availability/voice statistics. The
object is a local application API, not a versioned Setup Universe interface.

The ensemble scene and instrumentation roster are read-only. They introduce no
individual instrument, synthesis, mixer, or parameter controls and are not announced
as a repeating live region.

## Accessibility and failure behavior

- every button has a visible label and keyboard focus state;
- selected directions use `aria-pressed`;
- engine state and queued intent use live regions;
- audio failure produces readable status;
- missing Canvas 2D does not disable audio;
- reduced-motion preference removes decorative motion where practical.

## Lifecycle limitation

The page stops on `pagehide`. A suspended or interrupted audio context results in a
restart state. The interface does not claim that a browser page survives computer
sleep, device audio changes, process eviction, or background suspension.
