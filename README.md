# QuantumSetup

> **Preliminary Setup Universe wrapper.** The current demo is temporary; the full simulator is expected to be redesigned and rebuilt substantially from scratch.

- **Live prototype:** https://quantumsetup.ai/
- **Prototype release verified:** 2026-07-26 (`20260726T002235Z-478235af2650`); check the URL for current availability
- **Field:** Quantum systems
- **Status:** Greenfield planning wrapper with a preserved prototype snapshot

## Vision

The intended QuantumSetup product is a quantum experiment builder with explicit states, operators, Hamiltonians, measurements, noise models, numerical solvers, and instrument boundaries.

QuantumSetup is part of the **Setup Universe**: independently deployed scientific and systems workbenches intended to become interoperable. Over time, setups should be able to orchestrate or interface with one another through explicit, versioned, unit-aware ports without transferring ownership or copying private implementation state.

**First accepted end-to-end slice:** Build one wavepacket-and-barrier experiment with an inspectable Hamiltonian, normalized state evolution, measurement controls, and probability-accounting tests.

**Model boundary:** QuantumSetup owns explicitly quantum state evolution; OpticalSetup and PicSetup own their classical instrument/network models; MolecularSetup owns classical molecular/material response unless a reviewed quantum interface is defined.

**Claim gate:** Hilbert-space truncation, Hamiltonian, boundary conditions, solver error, and open-system assumptions must be explicit; no hardware-fidelity or experimental-calibration claim is allowed by default.

## Important starting point

Read [AGENTS.md](./AGENTS.md) before planning or implementing work.

The present browser demo should not constrain the next architecture. Before substantial implementation, this repository expects `VISION.md`, `QUANTUM_MODEL_CONTRACT.md`, `INTERFACE_CONTRACT.md`, `CLAIMS_AND_VALIDATION.md`, and `ACCEPTANCE_TESTS.md`.

## Prototype model boundary

The following describes only the current reference prototype, not the intended simulator.

**Exact current scope:** The canvas solves a dimensionless one-dimensional time-dependent Schrödinger equation using Fourier split-step propagation.

**Known limits:**

- The model is one-dimensional, non-relativistic, and uses a periodic numerical grid with soft absorbing edges.
- Position measurement is an idealized projective sample followed by a narrow Gaussian reset.
- Displayed energies use reduced units; they are not calibrated to a laboratory particle.

## Current prototype snapshot

`prototype/` preserves the exact shared browser-prototype source associated with production release `20260726T002235Z-478235af2650`. Its recorded deployed-source SHA-256 is `478235af26508aa70aa2af5f0196c9868b92ded1bed88106a9aa1a1cd86f8ba5`.

The snapshot contains all current Setup Universe demos because that release uses one shared, host-routed runtime. It is immutable, reference-only prior art: do not build the new architecture inside it. Moving, archiving, or removing it requires explicit user authorization after an accepted successor and preserved provenance.

To run the snapshot locally:

```sh
npm run prototype:test
npm run prototype:check
npm run prototype:serve
```

Then open http://127.0.0.1:4173/?setup=quantum.

These commands validate only the legacy prototype. This wrapper intentionally has no future-product test suite until the greenfield implementation begins.

## Setup Universe

[PicSetup](https://github.com/bertona88/picsetup) · [ElectricalSetup](https://github.com/bertona88/electricalsetup) · [BiologicalSetup](https://github.com/bertona88/biologicalsetup) · [GravitySetup](https://github.com/bertona88/gravitysetup) · [TwoPhotonLithography](https://github.com/bertona88/twophotonlithography) · [EgoSetup](https://github.com/bertona88/egosetup) · [NoeticSetup](https://github.com/bertona88/noeticsetup) · [ComputationSetup](https://github.com/bertona88/computationsetup) · [LogisticSetup](https://github.com/bertona88/logisticsetup) · [MolecularSetup](https://github.com/bertona88/molecularsetup)

OpticalSetup remains in [LucaGenchi/optics-sketch](https://github.com/LucaGenchi/optics-sketch).

## License

No open-source license has been selected yet.
