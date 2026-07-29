# Infinite Techno

QuantumSetup is now an audio-first generative music project: one continuously evolving
techno set synthesized locally with the Web Audio API. The quantum layer is visual
language and atmosphere. It does not generate the score and is not presented as a
physics simulation.

## Run and validate

```sh
npm start
npm test
npm run check
```

Open `http://localhost:4173/`. Audio starts only after a user gesture.

## High-level controls

- **Start / Stop** owns the one browser `AudioContext`.
- **Vibe** sets a long-term destination: Hypnotic, Dub, Detroit, Acid, or Peak.
- **Harmonic gravity** sets Minor, Neutral, or Major.
- **New trajectory** queues new deterministic musical DNA at a 16-bar boundary.

Vibe changes begin at a safe 8-bar phrase boundary and morph over 64, 96, or 128
bars according to profile distance. Major/minor changes use a neutral suspended
field between the two tonal families rather than replacing the scale immediately.

## Musical architecture

`techno-model.js` is the deterministic composition layer. It plans:

- 16 sixteenth-note steps per 4/4 bar;
- 8-bar phrases with bounded bar-level ornaments;
- 8–32-bar sections such as Ignition, Lock, Bridge, Void, Peak, Return, and
  Transition;
- 192-bar movements, roughly six minutes near 128 BPM;
- slow profile interpolation and a maximum tempo change of 0.12 BPM per bar.

`audio-engine.js` owns the audio clock and synthesis. Its voices include synthesized
kick, clap, closed/open hat, ride, shaker, rim, tom, metallic FM percussion,
acid/pulse/sub bass, chord stabs, pads, noise textures, risers, and downlifters.
The shared graph provides sidechain ducking, filtered delay, generated convolution
reverb, synthetic kick rumble, soft clipping, compression, and spectrum analysis.
Temporary voices have finite stop times and are capped at 96.

`main.js` owns the single audio-first interface and the analyser-driven contour. The
canvas follows audio-clock events; it never drives the music.

See [`../MUSICAL_SYSTEM.md`](../MUSICAL_SYSTEM.md) for the arrangement grammar,
transition design, and research sources.

## Canonical source

This implementation preserves the musical strengths of the user-supplied
`infinite-hypnotic-techno.html`:

- SHA-256:
  `03014fca7b13962ca166090df82c8045e2ea9758c9dfa78e5c72ca575d57ed57`
- retained concepts: deterministic seed, Web Audio lookahead scheduling, bounded
  voice cleanup, sidechain buses, synthetic percussion and acid bass, generated
  delay/reverb, analyser-driven visuals;
- replaced limitation: its rigid 32-bar arrangement loop is now a long-form
  phrase/section/movement system.

An exact byte-for-byte copy is preserved at
`reference/infinite-hypnotic-techno.html`; its hash matches the untouched supplied
file. Git history preserves the previous visual-only application.

## Runtime boundary

The generator can run indefinitely while the page stays active and the browser keeps
its `AudioContext` alive. No web page can guarantee uninterrupted 24/7 sound through
computer sleep, browser eviction, background throttling, device audio changes, or
operating-system suspension. Returning to a suspended page produces a clear restart
state instead of pretending continuity.
