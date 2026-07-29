# QuantumSetup Vision

Status: Draft for the greenfield rebuild  
Initial product slice: qualitative probabilistic visual instrument

## Purpose

QuantumSetup is an interactive experiment builder for exploring quantum states,
operators, Hamiltonians, evolution, and measurements. It should make abstract
state visible and manipulable without hiding the model boundary.

The M0 instrument has two complementary presentations:

- **Lab** exposes presets, controls, seed identity, and display diagnostics.
- **Trip** turns the same running state into an immersive generative visual
  experience.

M0 generates no audio. It exposes a local browser event port so a later
sonification engine can consume selected state and field summaries. Sound will
remain an artistic mapping and will not define or alter scientific state.

The guiding phrase is **probability you can see, inspect, and eventually hear**.

## Product principles

1. **One state, many views.** Lab and Trip render the same application state;
   future audio consumes the documented event port rather than private renderer
   state.
2. **Honest labels.** Qualitative, analytic, reduced-order, heuristic, and
   numerically solved behavior are named as such in the interface.
3. **Inspectable experiments.** A user can inspect the state definition,
   potential, dimensionless convention, seed, timebase, and active assumptions.
4. **Seeded reproducibility.** A seed, controls, sample time, and grid size
   reproduce the same generated field and measurement sample. M0 does not yet
   provide a complete action-replay system.
5. **Direct manipulation.** Current Energy, Barrier, Coherence, and Exposure
   changes have immediate, legible effects; later model controls must retain
   that directness.
6. **Bounded spectacle.** M0 bounds field/particle allocations, offers Exposure,
   and follows the operating-system reduced-motion preference. Explicit flash
   controls remain future work.
7. **Composable ownership.** QuantumSetup owns quantum state evolution. Other
   Setup Universe workbenches retain ownership of their classical models.

## Milestones

### M0 — Quantum-inspired visual field

The first implementation is a dimensionless, one-dimensional visual slice based
on an analytic rectangular-barrier coefficient and a heuristic display field.
It provides:

- a normalized view coordinate \(u\in[0,1]\), with a decorative transverse
  renderer coordinate that must not be interpreted as a second quantum
  dimension;
- Gaussian-like packet, interference, barrier, and transmitted/reflected visual
  motifs;
- deterministic seed-derived geometry and repeatable field sampling for fixed
  seed, controls, time, and grid;
- four presets; Energy, Barrier, Coherence, and Exposure controls; run/pause,
  qualitative measure/localize, and New State actions;
- Lab and Trip views with display masses, phase colour, ribbons, particles,
  and restrained post-processing;
- a read-only `window.QuantumSetup` snapshot/event seam for future
  sonification, with no audio generation in M0;
- visible model status: **qualitative analytic approximation — not a
  Schrödinger time-evolution solver**.

M0 is accepted as an interaction and rendering slice only. Its discrete
per-cell display masses are rescaled to sum to one on every sample; that
operation is not evidence of continuous normalization, unitary evolution, or
probability conservation. Its measure/localize gesture is not an accepted
measurement model.

### M1 — First accepted scientific slice

Build one wavepacket-and-barrier experiment with:

- an inspectable Hamiltonian and boundary conditions;
- a documented numerical time-evolution method;
- normalized state evolution and convergence/error evidence;
- position measurement controls with explicit post-measurement rules;
- reflected, transmitted, and residual probability accounting.

M1 replaces the M0 approximation only after the scientific gates in
`CLAIMS_AND_VALIDATION.md` and `ACCEPTANCE_TESTS.md` pass.

### Later milestones

- an audio engine driven by the existing snapshot/event seam, followed by a
  versioned sonification feature contract;
- reviewed noise and open-system models;
- additional potentials, operators, and measurement experiments;
- narrow, use-case-driven Setup Universe ports.

Entanglement, multi-particle dynamics, hardware fidelity, and laboratory
calibration are not implied by this roadmap.

## Boundaries

- `prototype/` remains immutable reference-only prior art associated with
  release `20260726T002235Z-478235af2650`.
- The rebuild does not inherit the prototype architecture, API, numerical
  method, UI, or styling by default.
- No deployment, DNS change, or replacement of the live prototype is part of
  M0 acceptance.
- Each workbench remains independently understandable, testable, and
  deployable.

## M0 success

M0 succeeds when a person can select a barrier scene, understand what each
available control changes, revisit seeded geometry, subscribe to the
sonification-ready event seam, and distinguish the visualization from a
validated physical prediction. Spectacle, clarity, reproducibility, and
scientific honesty are all required.
