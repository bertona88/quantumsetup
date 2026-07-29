# Claims and Validation

Status: Draft claim register for M0

## Claim policy

A feature name, visual metaphor, or smooth animation is not validation. Each
public claim must identify its model, validity domain, uncertainty, evidence,
and nonclaims. Interface copy must use the weakest accurate claim.

## Claims allowed for M0

M0 may claim that it:

- is a **quantum-inspired deterministic probability-field visual
  instrument**;
- uses a normalized longitudinal view coordinate \(u\in[0,1]\);
- uses a decorative transverse renderer coordinate to make a rich visual
  field, while modeling no second quantum spatial dimension;
- uses a standard analytic stationary 1D rectangular-barrier transmission
  magnitude with dimensionless \(\hbar=m=1\) and the documented artistic width
  map \(a=7.5w\);
- combines that coefficient with heuristic packet, interference, decay,
  coherence-like, phase-colour, and localization effects;
- rescales positive grid scores into discrete per-cell display masses that sum
  to one for each sampled frame;
- produces the same field for the same seed, controls, explicit time, and grid
  size in the tested JavaScript runtime;
- exposes a local snapshot/event port suitable for future artistic
  sonification.

These claims apply only to the documented M0 parameter ranges and contract.

## Implemented labels and their meaning

The persistent brand subline is `QUALITATIVE · VISUAL ONLY`. Engine status adds
`VISUAL ONLY · AUDIO NEXT`, and the footer states:

> QUALITATIVE VISUAL PROTOTYPE / NOT A SCHRÖDINGER SOLVER · NO AUDIO IN THIS
> BUILD

The numeric metrics are deliberately named `ANALYTIC T`, `CELL MASS SUM`, and
`DISPLAY ENTROPY`. The scale reads `CELL MASS pᵢ`, and its accessible name
identifies a discrete display-cell mass scale. `CELL MASS SUM` is the sum of
forced-normalized grid-cell masses. These labels do not claim that the cells
sample a continuous normalized wavefunction.

The button label `MEASURE` means qualitative sampling/localization under M0,
and its positional readout uses normalized \(u\). The audio labels state that
M0 does not generate audio. The local event seam exists only for a later
sonification consumer.

## Nonclaims

M0 does not claim:

- a numerical solution of the time-dependent Schrödinger equation;
- a one- or two-dimensional wavefunction reconstructed by the renderer;
- exact moving-wavepacket scattering, boundary matching, or probability
  conservation;
- that a per-cell sum of one is a continuous normalization integral;
- a validated projective measurement or open-system/decoherence model;
- quantum randomness, quantum computation, entanglement, many-body dynamics,
  spin, or relativistic behavior;
- calibrated length, time, energy, particle identity, material, or apparatus;
- hardware fidelity, experimental prediction, or agreement with laboratory
  data;
- that visual particles are literal particles or trajectories;
- that brightness, hue, ribbons, transverse texture, motion, or future sound is
  an observable;
- current sound synthesis or audio playback;
- action-log replayability or pixel identity across browsers;
- interoperability with another Setup Universe workbench.

No marketing, metadata, documentation, or accessibility label may contradict
these nonclaims.

## M0 validation matrix

| Evidence | What it validates | What it does not validate |
| --- | --- | --- |
| Transmission unit tests | Correct implementation of \(T\), threshold limit, and \(a=7.5w\) | Time-dependent scattering |
| Field invariant tests | Finite output, bounded \(T\), cell masses summing to one, bounded entropy | Continuous normalization or unitary evolution |
| Seed fixtures | Stable state, fields, measurements, and particles for explicit inputs | Live event replay or cross-browser pixels |
| Visual/browser smoke tests | Canvas 2D startup, controls, views, and event publication | Numerical physics accuracy or audio |
| Soak/performance tests | Bounded resources on a named test machine | Universal device performance |
| Review of this contract | Model and claim wording match implementation | Experimental calibration |

Fixtures record runtime version, exported model/API version, seed, controls,
explicit time, grid dimensions, nonce where relevant, and tolerance.

## Implemented parameter and edge coverage

The model test suite covers:

- known FNV-1a/Mulberry32 seed outputs;
- same-seed field equality and different-seed distinction;
- finite nonnegative cell masses and \(\sum_i p_i=1\);
- sub-threshold width behavior;
- below-, at-, and above-threshold transmission, plus no barrier;
- rejection of non-finite input;
- finite output after extreme finite inputs are clamped to the model domain;
- deterministic measurement/localization;
- seeded-geometry preservation across control updates;
- exposure changing no sampled cell masses;
- deterministic bounded particle descriptors.

Additional browser acceptance covers the four slider ranges, four presets,
Lab/Trip, Run/Pause, Measure, New State, double-click localization, event
payloads, and Canvas 2D failure.

## Gate for changing the solver claim

The model may be called a Schrödinger solver only after M1 documents and
validates:

- Hilbert-space/grid truncation and convergence;
- the Hamiltonian, signs, units, and boundary conditions;
- time integrator, order, step-size/stability restrictions, and accumulated
  error;
- norm behavior before any absorber and explicit lost-probability accounting
  with an absorber;
- reflection, transmission, and in-domain residual accounting;
- comparison against analytic stationary limits and converged reference cases;
- measurement operators and post-measurement state updates;
- every open-system or noise assumption.

Changing the label requires a reviewed claim-register update, not only a code
change.

## Separate completion boundaries

1. **Model validation** evaluates equations, invariants, convergence, and
   claim scope.
2. **Browser acceptance** evaluates interaction, accessibility, rendering, and
   resource behavior.
3. **Audio integration acceptance** begins only when an audio engine exists.
4. **Deployment verification** evaluates a named deployed artifact and date.
5. **Public acceptance** requires explicit authorization to replace the live
   prototype.

Passing one boundary does not imply another. M0 can pass browser acceptance
while remaining scientifically qualitative and silent.
