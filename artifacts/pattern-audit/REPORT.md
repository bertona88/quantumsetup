# Non-anchor pattern audit

- Date: 2026-08-06
- Generator: QuantumSetup 2.4.0 working tree
- Scope: 96 deterministic trajectories × 192 bars = 18,432 planned bars

Kick, clap/snare, closed hat, and open hat were excluded. This report measures
symbolic recurrence and rendered signal levels. It is not a human listening
judgment.

## Main findings

- The most important attractor is the phrase-decision balance: `repeat` (32.77%),
  `rest` (24.00%), and `answer` (17.88%) total 74.65%. `add`, `subtract`, and
  `displace` together total only 10.24%. This can make long-form development feel
  conservative even when individual note coordinates differ.
- Every active chord bar in the sample contains exactly one chord event (2,061 of
  2,061 active chord bars). The timing and voicing vary, but the single-stab
  topology is a hard attractor.
- Bass is active in 92.48% of bars. No exact bass cell dominates across
  trajectories—the largest exact active signature is only 0.73%—but the voice
  balance favours Sub (53.15%) over Pulse (25.28%) and Acid (21.57%).
- String is 54.37% of active foreground-engine selections, versus FM at 30.50%
  and Modal at 15.13%. This is a strong timbral-family bias, though not one exact
  note pattern.
- The original restrained Echo Ascent reused literal rim, metallic, and shaker
  step arrays plus fixed delay, feedback, wet, and send values. Its selection prior
  was 70%, making that hardcoded identity unusually prominent.
- Texture is distributed across all eight phrase positions (7.55–9.20% presence
  per position); the earlier phrase-position-0 boundary lock is absent in this
  final 2.4.0 candidate.

## Rendered-level evidence

All files are real-engine, 24 kHz, stereo, 16-bit PCM captures with the normal
master level and bounded tail. They are not hand-composed or clip-normalized.

| Stem | Mean level (dBFS) | Peak level (dBFS) |
| --- | ---: | ---: |
| Bass recurrent sub cell | -39.8 dB | -12.1 dB |
| Foreground String | -47.5 dB | -21.7 dB |
| Harmony single stabs | -54.0 dB | -16.8 dB |
| Restrained echo transition | -49.9 dB | -17.2 dB |
| All non-anchors, same phrase | -35.8 dB | -13.3 dB |
| Secondary percussion | -54.5 dB | -23.2 dB |

The level gap remains a plausible masking explanation: foreground, harmony, and
secondary percussion can vary symbolically while contributing less than the
combined non-anchor mix. This is a signal-level inference, pending listening in
the full mix.

## Echo Ascent modification after listening feedback

The fixed restrained hit arrays have been removed. Restrained, widening, and late
throw now control only macro span and intensity. Every authorized occurrence:

- rotates across eight contour identities without immediately repeating one;
- reads current resident percussion, FM, Modal, String, or vacated-bass material;
- freezes a deterministic mirror, shift, drift, delay, feedback, wet, send,
  voice-allocation, and stereo shape;
- maintains the existing eight-phrase cooldown and bounded transition graph.

The restrained selection prior is now 52%, widening 33%, and late throw 15%. In a
32-seed, 96-phrase scan, the 145 authorized events comprised 75 restrained, 46
widening, and 24 late throws. All 145 had distinct complete hit signatures and all
eight contour identities appeared. This is deterministic structural evidence, not
a claim that every pair will sound perceptually different.

## Reproduction

Run the symbolic audit:

```sh
npm --prefix app run audit:patterns
```

Run the local sample renderer/capture page:

```sh
npm --prefix app run capture:patterns
```

Then open `http://127.0.0.1:4174/pattern-audit-samples.html`, render the stems,
and use either the individual WAV downloads or the local capture button.
