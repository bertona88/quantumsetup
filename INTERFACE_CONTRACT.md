# Interface Contract

Implemented browser API: `window.QuantumTechno/1.4.0`
Scope: one audio-first generative techno instrument

## One-surface rule

The application has one primary page and no LAB/TRIP or other mode tabs.

The interface exposes only high-level musical direction:

- Start/Stop;
- New Trajectory;
- Vibe: Hypnotic, Dub, Detroit, Acid, Peak;
- Harmonic Gravity: Minor, Neutral, Major;
- Signal Deck: Hear, Pass, or Keep one generated timbre while transport is stopped.

Tempo, density, effects, filters, fades, bridges, arrangement, and individual
instrument parameters are intentionally not user controls. Signal Deck feedback is
an indirect timbre preference, not an instrument selector or mixer.

## Transport

Start creates and resumes the set's one `AudioContext` from the user gesture. Stop
fades the master, clears scheduling timers, closes the context, and disposes
temporary voices.

Hear creates a short, deterministic preview only while the main transport is
stopped. The auditioner owns a separate lazy context, replaces any prior preview,
and closes it on transport start, page hide, or lifecycle cleanup. Preview and the
running set never own active contexts concurrently.

Space activates Start/Stop when focus is not in an interactive element. `N` queues a
New Trajectory.

## Musical intent

While stopped, Vibe and Harmonic Gravity apply immediately to the next start.

While running:

- a Vibe request begins at the next 8-bar boundary;
- its profile morph lasts 64, 96, or 128 bars;
- a Major ↔ Minor request lasts 96 bars and passes through Neutral;
- Neutral transitions last 64 bars;
- New Trajectory enters at the next 16-bar seed-change boundary; that boundary is
  not a synth-mutation schedule;
- UI selection identifies the destination while `NOW` continues to identify the
  currently dominant state.

## Readouts

The page reports:

- current dominant vibe;
- current derived form label;
- root and modal field;
- tempo;
- bar;
- seed;
- queued or active trajectory progress;
- current deterministic ensemble scene and phrase-scoped cast;
- current phrase instrumentation, shown as a passive roster updated only at
  eight-bar boundaries;
- one generic directive from the phrase's emergent council chair and phrase phase;
- local/session taste-decision count.

The ensemble rail reads as `ENSEMBLE | [phrase cast] | [SCENE] · [NN] PARTS`.
`PARTS` counts the eight-bar instrumentation union, not simultaneous DSP voices.
Scene identity is planned by the music model; the interface does not invent names
from runtime activity. The displayed form label is a run-length readout of recurrent
phrase state, not a scheduled section or promise of what comes next. Neither the
label nor its run-length section has musical authority. The displayed root and
modal field follow resident tonal material and Harmonic Gravity, not motif
replacement or the 192-bar observation index. Public label-residency progress
continues across that observation boundary. Council chairing emerges from
competing state-dependent lens scores. It
normally exposes one advanced voice, may expose none for intentional rest, and
admits a second only for a developed climax or recalled lineage. It never exposes
all three together.

Kick policy, independent kick-family lineage and phrase morph, bass lineage,
physical kick parameters, bus gains, duck depths, and rumble settings remain
generator-owned. Kick-family changes require earned release or floor recommit and
a 24-phrase cooldown. They are not new controls.

## Signal Deck

The deck presents one deterministic generated specimen at a time. The listener may
Hear it, Pass it, Keep it, drag left/right, or use Left/Right Arrow while the card is
focused. A decision advances to the next specimen and updates a bounded preference
profile in local storage when available, with session fallback.

Taste feedback influences only future advanced-synth genome ranking when a motif
`mutate`, `replace`, or `recall` event has already authorized one engine handoff at
a stable phrase boundary. A `hold` authorizes none, so taste cannot cause a change
by itself. It cannot change the musical seed, current playback, rhythm,
arrangement, harmony, energy, lineage event, or scene selection. The interface
makes no account, cloud-sync, machine-learning, or artist-imitation claim.

## Global object

After startup:

```js
window.QuantumTechno = Object.freeze({
  version: "1.4.0",
  getSnapshot,
  requestVibe,
  requestTonality,
});
```

`getSnapshot()` returns version, seed, transport state, bar, step, BPM, current vibe,
tonality, derived form label, 192-bar observation-window index, active transition
summary, current ensemble scene,
current instrumentation, council verdict, bounded taste summary, and advanced-synth
availability/voice statistics. The object is a local application API, not a
versioned Setup Universe interface.

The observation-window index, form label, and section readout are diagnostics. They
describe or cache planner output and never schedule musical state.

The ensemble scene and instrumentation roster are read-only. They introduce no
individual instrument, synthesis, mixer, or parameter controls and are not announced
as a repeating live region.

## Accessibility and failure behavior

- every button has a visible label and keyboard focus state;
- the Signal Deck card supports Left/Right Arrow equivalents for swipe decisions;
- selected directions use `aria-pressed`;
- engine state and queued intent use live regions;
- Signal Deck decisions use a concise live-region confirmation;
- audio failure produces readable status;
- missing Canvas 2D does not disable audio;
- reduced-motion preference removes decorative motion where practical.

## Lifecycle limitation

The page stops on `pagehide`. A suspended or interrupted audio context results in a
restart state. The interface does not claim that a browser page survives computer
sleep, device audio changes, process eviction, or background suspension.
