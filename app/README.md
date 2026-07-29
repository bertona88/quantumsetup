# QuantumSetup visual instrument

**A qualitative probability-field visual instrument.**

This folder contains a dependency-free browser prototype for QuantumSetup: a full-screen,
deterministic probability-field instrument designed to become the visual half of a procedural
techno engine.

## Run it

Serve the folder locally so the browser can load its ES modules:

```bash
npm start
```

Then open `http://localhost:4173`.

Run the deterministic field-model checks with:

```bash
npm test
```

## Controls

- **Energy** changes the incident field energy.
- **Barrier** changes the dimensionless rectangular barrier height.
- **Coherence** moves between stable interference and diffuse noise.
- **Exposure** changes visual intensity without changing the normalized field.
- **Measure** samples the longitudinal `u` marginal and briefly localizes the field.
- **New state** creates a new seed while preserving the current control values.
- **LAB / TRIP** switches between inspectable and immersive presentations.

Keyboard: `Space` runs or pauses, `M` measures, `N` creates a new state, `1`–`4` selects a
preset, and `L` / `T` changes mode. Double-click the field for a direct positional
measurement. All core controls are available as large touch targets.

## Model boundary

`field-model.js` is a deterministic, normalized, dimensionless analytic approximation inspired by
rectangular-barrier transmission, reflection, decay, and interference. It is intentionally
qualitative. It is **not** a Schrödinger-equation solver and is not suitable for scientific
prediction.

Normalization is discrete: the values returned in `density` are probability mass assigned to each
display cell, and their finite-grid sum is one. They are not samples of a continuous physical
probability density. The `u` marginal is the only coordinate used for measurement; the transverse
`v` coordinate is decorative structure for the display, not a modeled second spatial dimension.

## Audio integration port

No audio is created in this pass. The visual layer exposes a stable event-oriented seam for the
sound engine:

```js
const unsubscribe = window.QuantumSetup.subscribe("frame", ({ detail }) => {
  // Map detail.transmission, detail.field.entropy, detail.controls, etc. to sound.
});

window.QuantumSetup.subscribe("measure", ({ detail }) => {
  // Trigger a collapse accent or regenerate a motif.
});

const snapshot = window.QuantumSetup.getSnapshot();
```

Events are available on `window.QuantumSetup.port` as `ready`, `frame`, `controls`, `state`,
`measure`, `mode`, and `transport`. Mirrored DOM events use the
`quantumsetup:<event>` naming scheme. `frame` is intentionally throttled to 10 Hz so a future audio
engine can interpolate parameters on its own clock.
