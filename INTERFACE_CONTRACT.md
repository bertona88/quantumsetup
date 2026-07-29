# Interface Contract

Implemented browser API: `window.QuantumSetup/0.2.0`  
Scope: M0 visual instrument and provisional Setup Universe boundaries

## Architectural rule

The field model owns the seeded qualitative state. Lab and Trip render that
same state. The browser integration seam publishes frozen summary snapshots and
events for observers such as a future sonification engine.

```text
UI controls -> qualitative field state -> Canvas 2D Lab / Trip
                                      \-> local snapshot/event port
```

M0 generates no audio, accepts no control messages through the integration
port, and exposes no network API.

## Implemented user controls

The M0 window contains:

- Lab and Trip mode buttons (`L` and `T`);
- Ghost Tunnel, Resonance, Deep Barrier, and Plasma presets (`1`–`4`);
- Energy slider: 0.08–1.20, step 0.01;
- Barrier-height slider: 0.10–1.20, step 0.01;
- Coherence slider: 0.05–1.00, step 0.01;
- Exposure slider: 0.55–2.00, step 0.01;
- Run/Pause (`Space`);
- Measure (`M`);
- New State (`N`);
- direct qualitative localization by double-clicking the canvas.

The initial seed may be supplied with the URL query parameter `?seed=...`.
New State generates a fresh seed, stores it in that query parameter, preserves
the four visible slider values, regenerates seed-derived geometry, clears the
active preset button, and reports `preset: "custom"`.

Barrier view width and centre, packet geometry, carrier, phases, and decorative
transverse variation are supplied by the preset/seed; they are not direct M0
controls. M0 has no single-step, reset, editable seed field, replay
copy/load, layer toggles, browser-fullscreen command, or flash-reduction
control. Reduced-motion behavior follows the operating-system media
preference.

Coherence is a heuristic visual-field parameter, not a physical decoherence
model. Exposure is artistic: it changes rendered brightness but not the
normalized cell masses.

## Global object

After module startup, the application installs:

```js
window.QuantumSetup = Object.freeze({
  version: "0.2.0",
  port,                 // EventTarget
  getSnapshot,          // () => snapshot
  subscribe,            // (type, listener) => unsubscribe()
});
```

`subscribe` listeners receive a `CustomEvent`; its payload is in
`event.detail`. The returned function removes that listener. This API is an
observer seam only. It does not expose setters or transport commands.

## Snapshot shape

`getSnapshot()` and most events use this exact M0 summary shape:

```json
{
  "version": 1,
  "seed": "QS-2026-07-29-A",
  "seedLabel": "8_HEX_DIGITS",
  "time": 4.25,
  "running": true,
  "mode": "lab",
  "preset": "ghost",
  "controls": {
    "energy": 0.48,
    "barrierHeight": 0.82,
    "barrierWidth": 0.13,
    "coherence": 0.92,
    "exposure": 1.35
  },
  "transmission": 0.1
}
```

`time` is the nonphysical animation clock. `preset` may be `custom`. The
top-level snapshot and `controls` object are frozen. The snapshot intentionally
does not expose field arrays, a wavefunction, \(R\), a Hamiltonian, units,
uncertainty, or a validated observable.

## Events

Events are dispatched on `window.QuantumSetup.port` and mirrored on `window`
as `quantumsetup:<type>`.

| Type | When published | `detail` addition |
| --- | --- | --- |
| `ready` | Initial setup completes | Summary snapshot |
| `frame` | While rendered, throttled to at most 10 Hz | `field: {norm, entropy, maximum}` |
| `controls` | A visible slider changes | Summary snapshot |
| `state` | A preset loads or New State runs | Summary snapshot |
| `measure` | Measure or canvas double-click localizes | `measurement` |
| `mode` | Lab/Trip changes | Summary snapshot |
| `transport` | Run/Pause changes | Summary snapshot |

For the Measure button, `measurement` contains `position`, the selected
longitudinal marginal `probability`, `nonce`, and `time`. For direct
double-click localization it contains `position`, `nonce`, and `time`; no
sampled probability is supplied.

The `frame.field.norm` value is the sum of discrete per-cell display masses.
`entropy` is normalized discrete Shannon entropy. `maximum` is the largest cell
mass. These are visual-instrument summaries, not physical observables.

## Sonification seam

A future audio engine can subscribe without reaching into renderer internals:

```js
const unsubscribe = window.QuantumSetup.subscribe("frame", ({ detail }) => {
  // Artistic mapping: detail.transmission, detail.field.entropy,
  // detail.controls, detail.time.
});

window.QuantumSetup.subscribe("measure", ({ detail }) => {
  // Trigger an accent from detail.measurement.
});
```

M0 creates no oscillator, sample player, `AudioContext`, or audio node. The
visible labels `VISUAL ONLY · AUDIO NEXT` and `NO AUDIO IN THIS BUILD` state
that boundary directly. The local event seam is ready for a later consumer, but
audio is not. Subscribers must interpolate the 10 Hz frame summaries on their
own clock. Mapping a summary to rhythm, pitch, timbre, or space is artistic and
must not be presented as measurement.

## Reproducibility boundary

The model is deterministic for the same seed, controls, explicit sample time,
grid dimensions, and measurement nonce. The browser animation clock depends on
frame scheduling, and the event API has no run ID, sequence number, action log,
or replay loader. Consumers must not claim event-trace replayability from M0.

## Setup Universe boundary

The implemented event API is local and application-specific. It is **not** a
Setup Universe port and does not establish interoperability.

Any future cross-setup port requires a separately reviewed, versioned envelope
that identifies:

- schema and semantic version;
- source setup/instance and source-of-truth owner;
- sequence, clock, and timebase;
- units or an explicit dimensionless convention;
- coordinate frame;
- uncertainty and validity status;
- model version and provenance;
- payload semantics, authority, and error behavior.

Only a concrete composed experiment may justify `quantum.source`,
`quantum.control`, `quantum.measurement`, or `quantum.observation`. Other Setup
Universe repositories retain ownership of their private state. In particular,
OpticalSetup changes remain inside Luca Genchi's review boundary.

## Failure and compatibility behavior

The model API throws `TypeError` for non-finite numeric values and clamps finite
programmatic inputs to its documented ranges. UI range controls prevent those
invalid values in ordinary use. If Canvas 2D is unavailable, the canvas is
hidden, a readable status is announced, and startup throws.

`window.QuantumSetup.version` versions the global API; snapshot `version`
versions the summary shape. A breaking field, event, or semantic change
requires a version increment and updated consumer fixtures.
