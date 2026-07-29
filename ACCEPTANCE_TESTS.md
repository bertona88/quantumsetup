# Acceptance Tests

Status: Draft  
Current gate: M0 qualitative visual instrument

Acceptance results must name the commit, model/API versions, platform,
browser/runtime versions, seed fixtures, and date. The legacy `prototype/`
tests do not satisfy these gates.

## Gate 0 — Repository and provenance

- [ ] `prototype/` is byte-for-byte unchanged from the repository baseline.
- [ ] New implementation code lives outside `prototype/`.
- [ ] The five required contract documents exist and agree on M0 status.
- [ ] No build, test, or development command deploys, changes DNS, or replaces
      the live prototype.
- [ ] The app runs without another Setup Universe repository.

## Gate 1 — Implemented field model

- [ ] `MODEL_VERSION` is `0.2.0-qualitative`; the persistent brand subline reads
      `QUALITATIVE · VISUAL ONLY`.
- [ ] The footer reads `QUALITATIVE VISUAL PROTOTYPE / NOT A SCHRÖDINGER SOLVER
      · NO AUDIO IN THIS BUILD`.
- [ ] Documentation identifies normalized longitudinal \(u\in[0,1]\) and
      identifies the transverse renderer coordinate as decorative, not a second
      quantum dimension.
- [ ] Transmission tests cover \(E<V_0\), \(E=V_0\), \(E>V_0\), and
      \(V_0=0\), including the exact mapping \(a=7.5w\).
- [ ] Across accepted inputs, transmission is finite and lies in \([0,1]\).
- [ ] Every value in the property named `density` is a finite nonnegative
      per-cell mass and
      \(\left|\sum_i p_i-1\right|<10^{-9}\), with no cell-area factor.
- [ ] The visual scale reads `CELL MASS pᵢ` and its accessible name describes a
      discrete display-cell mass scale; it does not label the values as
      \(|\psi|^2\) or continuous probability density.
- [ ] Metric labels are exactly `ANALYTIC T`, `CELL MASS SUM`, and
      `DISPLAY ENTROPY`, matching their M0 semantics.
- [ ] Each longitudinal marginal equals the sum of cell masses in its column;
      `norm` equals the per-cell mass sum and entropy lies in \([0,1]\).
- [ ] Same seed, controls, explicit time, and grid dimensions produce identical
      field arrays in the test runtime.
- [ ] Non-finite numeric API input throws instead of producing a NaN field.
- [ ] Extreme finite coefficient, seeded-geometry, time, and grid inputs clamp
      to documented bounds and still produce finite output.
- [ ] Measure is deterministic for the same state, time, and nonce; collapse
      state records its normalized position, time, and nonce.

The per-cell sum is a forced display normalization. Passing this gate does not
validate a continuous normalization integral, a wavefunction, unitary
evolution, or probability conservation.

## Gate 2 — Seeded generation

- [ ] `qs-seed-v1` has known-answer fixtures for UTF-8 FNV-1a hashing and
      Mulberry32 output.
- [ ] Different fixture seeds produce distinct fields.
- [ ] Particle descriptors repeat for the same seed and remain within their
      documented bounds.
- [ ] Model and scene decisions do not call `Math.random()`.
- [ ] New State uses a fresh seed, updates `?seed=...`, preserves the four
      visible slider values, resets animation time, and regenerates
      seed-derived geometry while changing the reported preset to `custom`.
- [ ] A fixed URL seed can recreate seeded geometry, subject to the selected
      preset/control values.

M0 has no action log, ordered event sequence, copy/load replay, or claim of
live event-trace reproducibility.

## Gate 3 — Window and controls

- [ ] Lab/Trip buttons and `L`/`T` switch presentation without replacing the
      underlying field state.
- [ ] Keys `1`–`4` and the four buttons select Ghost Tunnel, Resonance, Deep
      Barrier, and Plasma.
- [ ] Energy, Barrier, Coherence, and Exposure sliders expose the ranges and
      steps documented in `INTERFACE_CONTRACT.md`.
- [ ] Space and Run/Pause stop and resume animation-clock accumulation.
- [ ] Measure/`M` samples the longitudinal marginal and applies the qualitative
      localizing display envelope.
- [ ] Double-click localizes at the pointer's clamped normalized \(u\)
      coordinate.
- [ ] New State/`N` performs the seeded-generation behavior in Gate 2.
- [ ] Exposure changes rendered brightness without changing sampled cell
      masses for otherwise identical inputs.
- [ ] Reduced-motion rendering follows `prefers-reduced-motion`.
- [ ] Missing Canvas 2D produces a readable failure instead of a blank
      instrument.

M0 acceptance does not require controls the implementation does not provide:
single-step, reset, editable seed, direct packet/barrier geometry editing,
layer toggles, fullscreen, or flash reduction.

## Gate 4 — Snapshot and event seam

- [ ] `window.QuantumSetup.version` is `0.2.0`; `port` is an `EventTarget`;
      `getSnapshot` and `subscribe` exist; the returned unsubscribe removes its
      listener.
- [ ] `getSnapshot()` contains exactly the documented M0 summary semantics:
      snapshot version, seed/label, animation time, running, mode, preset,
      controls, and transmission.
- [ ] The controls summary contains energy, barrier height, seed/preset-derived
      barrier width, coherence, and exposure.
- [ ] `ready`, `controls`, `state`, `measure`, `mode`, and `transport` publish
      at their documented transitions.
- [ ] `frame` is throttled to at most 10 Hz and adds only `field.norm`,
      `field.entropy`, and `field.maximum` to the summary.
- [ ] Every port event is mirrored as `quantumsetup:<type>` on `window`.
- [ ] Measure-button events include position, selected marginal probability,
      nonce, and time; double-click measure events may omit probability.
- [ ] The port provides observations only; the app accepts no control messages
      through it.
- [ ] No M0 event or snapshot is represented as a versioned Setup Universe
      interface.

## Gate 5 — Claims, audio boundary, and accessibility

- [ ] `QUALITATIVE · VISUAL ONLY` and `QUALITATIVE VISUAL PROTOTYPE / NOT A
      SCHRÖDINGER SOLVER · NO AUDIO IN THIS BUILD` remain present in the
      document in both Lab and Trip presentations.
- [ ] The engine status reads `VISUAL ONLY · AUDIO NEXT`.
- [ ] Documentation explains that `CELL MASS SUM`, `DISPLAY ENTROPY`, and
      `MEASURE` are M0 display/interaction terms with the limits in
      `CLAIMS_AND_VALIDATION.md`; the measurement readout uses normalized
      \(u\).
- [ ] M0 creates no `AudioContext`, oscillator, sample player, or audio node;
      the event seam is the only sonification deliverable.
- [ ] No interface, metadata, or documentation asserts a prohibited M0 claim.
- [ ] Every interactive control has an accessible name, visible focus state,
      keyboard operation where documented, and a touch-capable target.
- [ ] Readouts and status do not rely on hue alone; the live announcer reports
      major actions.
- [ ] Automated accessibility checks report no critical violations, followed
      by a documented keyboard and screen-reader smoke test.

## Gate 6 — Reliability and resource bounds

- [ ] Model tests pass with `npm test`.
- [ ] Supported Chromium and Firefox versions pass the documented browser smoke
      test.
- [ ] Resize, repeated Run/Pause, presets, measurement, and New State do not
      duplicate animation loops or listeners.
- [ ] Page hide cancels animation; non-persisted unload detaches resize/motion
      listeners, while a persisted BFCache restore restarts one render loop.
- [ ] Grid dimensions clamp to 512×288 or less and particle count clamps to
      1200 or less.
- [ ] A 30-minute named-machine soak test shows no monotonic unbounded growth
      in live field buffers, particles, animation callbacks, or subscribers
      created by the app.
- [ ] A measured performance report records frame-time percentiles and memory
      behavior on one desktop and one constrained/mobile profile, with tested
      settings rather than a universal frame-rate claim.

## Gate 7 — M0 release boundary

- [ ] Model, seeded-generation, visual, event, accessibility, and soak reports
      are attached to the candidate commit.
- [ ] Known limitations and unsupported browsers are visible.
- [ ] Review accepts M0 only as a qualitative, silent visual instrument with a
      sonification-ready event seam.
- [ ] Deployment and replacement of the live site receive separate explicit
      authorization.

## Future Gate — M1 accepted scientific slice

M1 is not complete until all of the following pass:

- [ ] The Hamiltonian, grid truncation, boundary treatment, initial normalized
      state, and solver algorithm are inspectable in the product.
- [ ] Grid and timestep refinement demonstrate convergence for committed
      reference experiments with documented norms and tolerances.
- [ ] Closed-system evolution maintains norm within the reviewed error budget;
      absorbing boundaries report lost probability separately.
- [ ] Reflected + transmitted + in-domain + absorbed probability accounts for
      the initial norm within the reviewed tolerance.
- [ ] Results approach analytic rectangular-barrier coefficients in the
      documented narrow-band/long-time validity regime.
- [ ] Measurement sampling passes distribution tests and the post-measurement
      state follows its documented operator/update rule.
- [ ] Extreme and adversarial cases fail safely or remain within stated solver
      stability limits.
- [ ] The claim register and UI label are reviewed before any `solver`,
      `simulation`, or physical-prediction wording is broadened.

Only M1 may satisfy the repository's first accepted wavepacket-and-barrier
scientific slice.
