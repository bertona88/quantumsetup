# Quantum Model Contract

Implementation model version: `0.2.0-qualitative`  
Applies to: M0 qualitative visual field  
Scientific status: not an accepted Schrödinger solver

## Model boundary

M0 constructs deterministic scalar display scores and a separate decorative
phase channel for a one-dimensional, Gaussian-like packet motif incident on a
rectangular barrier. The field uses an analytic stationary-barrier
transmission coefficient plus heuristic envelopes and interference terms to
produce plausible incident, reflected, inside-barrier, and transmitted regions.

It does **not** propagate the time-dependent Schrödinger equation, enforce exact
matching for a moving packet, or establish physical prediction accuracy.

## Coordinates and dimensionless convention

The longitudinal model/view coordinate is normalized:

\[
u=(c+1/2)/N_u,\qquad u\in(0,1),
\]

where \(c\) is a grid column. Controls and positional measurements use the
closed normalized view interval \(u\in[0,1]\).

The renderer also samples
\(v=(r+1/2)/N_v\times2-1\), with \(v\in(-1,1)\). This transverse coordinate
only shapes texture, phase colour, and visual falloff. It is **not** a second
spatial coordinate of a two-dimensional wavefunction, Hamiltonian, or quantum
system. Measurement first sums cell masses over renderer rows and then samples
the resulting longitudinal marginal.

The transmission helper assumes the dimensionless stationary 1D rectangular
barrier convention \(\hbar=1\), \(m=1\), and
\(H=-\frac12\partial_u^2+V\). Energy \(E\), barrier height \(V_0\), and the
coefficient width \(a\) are dimensionless. This assumption applies to the
coefficient formula only; the complete animated display field is not a
solution of that Hamiltonian.

No mapping to metres, seconds, electronvolts, a particle species, or laboratory
apparatus is supplied in M0. This contract and the app documentation identify
the convention as dimensionless. The compact local
`window.QuantumSetup` snapshot does not carry unit metadata and therefore must
not be treated as a scientific or cross-setup payload.

The barrier occupies a normalized view width \(w\), centred at \(u_b\):

\[
V(u) =
\begin{cases}
V_0, & |u-u_b| \le w/2 \\
0, & \text{otherwise}
\end{cases}
\]

The analytic coefficient does not use \(w\) directly. The implementation maps
the view width to the coefficient width with the explicit artistic scale

\[
a=7.5w.
\]

The factor 7.5 is chosen for an expressive visual range. It is not a calibrated
coordinate conversion.

## Implemented state and controls

`createFieldState(seed, overrides)` produces the M0 state. The visible sliders
are:

- Energy: \(E\in[0.08,1.20]\);
- Barrier: \(V_0\in[0.10,1.20]\);
- Coherence: \(C\in[0.05,1]\);
- Exposure: \(X\in[0.55,2]\).

Presets or the seed supply barrier view width \(w\), barrier centre, packet
centre/width, carrier, decorative transverse frequency, drift, phases, and
skew. The underlying model accepts wider clamped ranges for programmatic state
creation. Coherence is a heuristic blend between structured interference and a
diffuse floor, not a physical decoherence parameter. Exposure affects rendering
only and does not change cell masses.

## Analytic coefficient approximation

Set \(a=7.5w\). For \(0<E<V_0\), define
\(\kappa=\sqrt{2(V_0-E)}\) and

\[
T = \left[1+\frac{V_0^2\sinh^2(\kappa a)}
{4E(V_0-E)}\right]^{-1}.
\]

For \(E>V_0\), define \(q=\sqrt{2(E-V_0)}\) and

\[
T = \left[1+\frac{V_0^2\sin^2(q a)}
{4E(E-V_0)}\right]^{-1}.
\]

At \(E=V_0\), the implementation uses the continuous limit

\[
T=\left(1+\frac{V_0a^2}{2}\right)^{-1}.
\]

The no-barrier or zero-width case uses \(T=1\). For finite implementation
safety, direct coefficient-helper inputs \(E\), \(V_0\), and \(w\) are clamped
to at most \(10^6\), \(E\) is floored at \(10^{-9}\), the argument passed to
`sinh` is capped at 12, and the result is clamped to \([0,1]\). The browser
state uses the much narrower ranges above. These are implementation choices,
not new physics.

M0 uses \(\sqrt{T}\) and \(\sqrt{\max(0,1-T)}\) as display amplitude weights.
It exports \(T\), not a separately validated reflection observable. Reflection
phase, moving-envelope handoff, and the inside-barrier field are deterministic
visual approximations; they are not asserted to be the exact time-dependent
scattering solution.

## Display field and derived values

At each requested animation time the model samples a rectangular renderer grid.
For each cell \(i\), it computes a positive raw display score \(s_i\) and a
separate phase value. It then emits

\[
p_i=\frac{s_i}{\sum_j s_j},\qquad \sum_i p_i=1.
\]

The JavaScript property is named `density` for rendering compatibility, but its
values are **discrete per-cell display masses** \(p_i\), not samples of a
continuous density. No \(\Delta u\), \(\Delta v\), or cell-area factor appears
in the normalization. The model derives:

- cell masses in `density`;
- a decorative `phase` channel;
- the longitudinal marginal
  \(p^{(u)}_c=\sum_r p_{r,c}\);
- approximate transmission \(T\);
- normalized discrete Shannon entropy
  \(-\sum_i p_i\log p_i/\log(N_uN_v)\);
- `norm`, defined as \(\sum_i p_i\), and display maxima.

This forced per-sample rescaling keeps rendering bounded. `norm = 1` is
therefore an implementation invariant, not evidence of a normalized
wavefunction, a continuous integral, unitary evolution, or probability
conservation.

## Time and randomness

- `time` is a continuous animation parameter accumulated from browser frame
  elapsed time, with each elapsed increment capped at 0.05. It has no physical
  unit. Direct model calls clamp it to \(0\le t\le10^{12}\), and periodic
  phases are reduced before trigonometric evaluation so extreme finite input
  remains finite.
- Pause stops accumulation; resuming continues from the current value.
- Seed algorithm `qs-seed-v1` is UTF-8 seed text hashed with 32-bit FNV-1a,
  followed by Mulberry32 for generated values.
- Seeded geometry, particle descriptors, and sampled measurement values use that
  deterministic generator. New State obtains a fresh seed from browser crypto
  when available, with clock-derived fallback.

Identical seed, state controls, explicit time, and grid dimensions produce
identical field arrays in the tested JavaScript runtime. Measurement also
requires the same nonce. M0 has no action log or replay format, and live frame
timing is not replay-deterministic. Pixel-identical output across
GPU/browser combinations is not claimed.

## Visual reset/collapse gesture

The Measure action samples a longitudinal column from
\(p^{(u)}\), adds seeded within-cell jitter, and applies a temporary localizing
display envelope. Its PRNG key includes seed, nonce, and animation time rounded
to four decimal places. A canvas double-click instead selects the requested
normalized \(u\) position directly.

The UI calls this `MEASURE`, but M0 defines it only as a qualitative
measure/localize gesture. It is not an accepted projective measurement or
physical post-measurement state. M1 must define the measurement operator,
sampling distribution, localization width, renormalization, and energy
consequences before the scientific claim can change.

## Invariants and failure states

Every sampled field must satisfy:

- all masses and phases are finite;
- \(0\le T\le1\);
- \(p_i\ge0\) and \(|\sum_i p_i-1|<10^{-9}\);
- each longitudinal marginal equals the sum of its row masses;
- entropy lies in \([0,1]\);
- array lengths match the clamped grid dimensions
  \(2\le N_u\le512\), \(2\le N_v\le288\).

Public model functions throw `TypeError` for non-finite numeric input and clamp
finite numeric inputs to documented implementation ranges. Seed-derived
carrier, transverse frequency, drift, phase, and skew overrides are likewise
bounded or angle-wrapped before sampling. The browser controls themselves
constrain values with range inputs. The implementation must not silently
substitute a different physical model.

## M1 replacement requirements

An accepted solver must explicitly version its Hilbert-space truncation,
Hamiltonian, discretization, boundary treatment, time integrator, stability
limits, norm error, convergence tests, and open-system assumptions. Until those
requirements pass, M0 output remains `qualitative`.
