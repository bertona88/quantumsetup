# Interface Contract

Browser API contract: `window.QuantumTechno/2.2.1`
Scope: one audio-first generative techno instrument
Release boundary: deployed production interface from `b16c5dc`; local and public
focused performance smoke recorded; full browser, soak, listening, render, and
public-acceptance gates remain open

## One-surface rule

The application has one primary page and no LAB/TRIP or other mode tabs.

The interface exposes only high-level musical direction:

- Start/Stop;
- New Trajectory;
- Vibe: Hypnotic, Dub, Detroit, Acid, Peak;
- Harmonic Gravity: Minor, Neutral, Major;
- Live Mix: Low, Mid, and High EQ plus next-beat Kick and Bassline cuts;
- Direction: Energy, Density, Brightness, Space, Swing, Acid, Bass Presence,
  Change Rate, Breakdown Depth, and Bassline Character;
- Signal Deck: Hear, Pass, or Keep one generated timbre while transport is stopped.

Tempo, note masks, effect sends, fades, bridges, fills, detailed arrangement, and
individual synthesis parameters remain generator-owned. Signal Deck feedback is an
indirect timbre preference, not an instrument selector or mixer.

Echo Ascent is likewise generator-owned. It may appear only after an emergent
phrase-state authorization and consists of a coordinated bright-percussion density
contour plus bounded stereo motion. It introduces no new mode, button, effect-send
control, or scheduled section type.

The opening viewport is an immersive visual field. Its only visible interaction is
the icon-only transport gesture required to start browser audio; readouts and music
controls begin below the fold and appear through ordinary scrolling. Once audio is
running, the opening transport glyph withdraws and the visual owns that viewport.

The visual is one continuously evolving spectrum landscape, not a slideshow of
scenes or a stack of visualizer presets. A native WebGL2 renderer resamples the live
FFT on a logarithmic frequency axis and streams successive profiles through a
linearly filtered height texture. One dense mesh becomes a continuous moving
mountain under height-derived smooth normals, terrain self-shadow, a white mineral
material, and music-steered rainbow illumination. Kick and bass control relief and
light impact while wider spectral change moves color, roughness, and the flyover.
The silent field remains a calm deterministic landscape until analyser data arrives.
A Canvas2D terrain is the fallback when WebGL2 is unavailable. The renderer is a
read-only response to audio and forecast color genes; it cannot rewrite the musical
plan.

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
- Vibe and Harmonic Gravity influence only material phrases selected at future
  eight-bar boundaries. The profile sampled at a boundary is settled for that
  phrase, and the current eight-bar phrase remains frozen once selected;
- New Trajectory evaluates a bounded pool of sixteen deterministic Track-DNA
  candidates and enters an eligible macro-distinct seed at the next 16-bar
  seed-change boundary; if no candidate qualifies, the request is rejected and the
  current trajectory continues. That boundary is not a synth-mutation schedule;
- UI selection identifies the destination while `NOW` continues to identify the
  currently dominant state.

Live Mix EQ uses bounded Web Audio filter gains and responds with short smoothing.
Kick and Bassline cuts latch at the next unscheduled beat; a kick cut suppresses the
kick voice, kick-triggered ducking, new rumble excitation, and its visual pulse.
Cuts are deliberately not persisted across page loads.

Direction values wait for the next eight-bar phrase and glide for eight bars.
Continuous controls shade the profile and future material selection without
rewriting the already-frozen phrase. Bassline Character remains discrete and enters
only when the glide completes. Normalized EQ and direction targets may persist in
local storage; missing, corrupt, or blocked storage falls back to neutral controls
without blocking audio.

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
Scene identity is planned by the music model as a semantic role vocabulary; scene
names do not contain or select onset masks, and the interface does not invent names
from runtime activity. The displayed form label is a run-length readout of recurrent
phrase state, not a scheduled section or promise of what comes next. Neither the
label nor its run-length section has musical authority. The displayed root and
modal field follow resident tonal material and Harmonic Gravity, not a material
gesture or the 192-bar observation index. Public label-residency progress continues
across that observation boundary. Council chairing emerges from competing
state-dependent lens scores. It normally exposes one advanced voice, may expose none
for intentional rest, and admits a second only when the current phenotype and
recurrent phrase state justify dialogue. It never exposes all three together.

Persistent Euclidean secondary-lane clocks, polymetric phase, material gestures, candidate
selection, curated kick-phrase state, bass lineage, independent kick-family timbre,
physical kick parameters, duck depths, and rumble settings remain generator-owned.
Cooldown-earned Echo Ascent variant, high-percussion articulations, and stereo
cross-feedback parameters also remain generator-owned and appear in the passive
phrase instrumentation union when active.
The performance layer can trim rendered buses or bias future phrases, but never
edits a frozen onset mask. The kick clock is always bar-aligned four-on-the-floor;
its anchor, turnaround-pickup, breathing, and rolling-pressure phrase families are
generator-owned and never exposed as note-mask controls. Track DNA keeps kick
rumble `off`, `short`, or `deep` for the trajectory rather than toggling it per hit.
Breathing opens generator-owned bass space; pickup and rolling collisions relocate
the bass to a safe adjacent step. Secondary kick articulations use shallower,
faster bass ducking, while Sub/Rolling/Acid/Syncopated remain density and character
intents rather than fixed onset masks.

## Signal Deck

The deck presents one deterministic generated specimen at a time. The listener may
Hear it, Pass it, Keep it, drag left/right, or use Left/Right Arrow while the card is
focused. A decision advances to the next specimen and updates a bounded preference
profile in local storage when available, with session fallback.

Taste feedback influences only future advanced-synth genome ranking after the
planner has independently authorized one engine handoff at a stable phrase
boundary. It is not an input to the twelve-candidate musical-material selection and
cannot cause a handoff by itself. It cannot change the musical seed, current
playback, rhythm, arrangement, harmony, energy, material gesture, lane clocks, or
scene selection. The interface makes no account, cloud-sync, machine-learning, or
artist-imitation claim.

## Share Moment

The footer keeps the trajectory ID visually abbreviated and provides one `Share
Moment` action. It copies a versioned replay URL containing the full trajectory
identity, captured bar and step, generator version, initial direction, subsequent
Vibe/Harmonic Gravity/phrase-direction/taste/trajectory events, current live-mix
state, and the current ephemeral Signal Deck state. Opening a compatible link
reconstructs the deterministic planner and timbre history, then remains stopped at
the captured coordinate until the listener explicitly starts audio.

The replay capsule is URL-visible data, not a private or cloud-synced record. A
generator-version mismatch falls back to the full trajectory ID without claiming an
exact moment replay. Matching planner state does not promise sample-identical output
across browsers, audio devices, sample rates, or later generator versions.

## Global object

After startup:

```js
window.QuantumTechno = Object.freeze({
  version: "2.2.1",
  getSnapshot,
  requestVibe,
  requestTonality,
  setMixControl,
  setDirectionControl,
  setBassCharacter,
  getShareUrl,
});
```

`getSnapshot()` returns version, seed, transport state, bar, step, BPM, current vibe,
tonality, derived form label, 192-bar observation-window index, active transition
summary, current ensemble scene, current instrumentation, council verdict, bounded
taste summary, advanced-synth availability/voice statistics, active/target
performance state, and a frozen `material` summary. The material summary contains
the current gesture, motif
lineage, bounded lane-clock summaries, selected-candidate score, candidate count,
sampling temperature, and curated kick-phrase status. It is diagnostic telemetry, not a
control surface. The object is a local application API, not a versioned Setup
Universe interface.

The observation-window index, form label, section readout, candidate score, and
lane-clock summaries are diagnostics. They describe or cache planner output and
never schedule musical state or reset material phase.

The ensemble scene and instrumentation roster are read-only. They introduce no
individual synthesis controls and are not announced as a repeating live region.

## Accessibility and failure behavior

- every button has a visible label and keyboard focus state;
- the Signal Deck card supports Left/Right Arrow equivalents for swipe decisions;
- selected directions use `aria-pressed`;
- every range has a visible label, output, keyboard focus state, and timing text;
- cut buttons expose active and pending state in text as well as color;
- engine state and queued intent use live regions;
- Signal Deck decisions use a concise live-region confirmation;
- audio failure produces readable status;
- missing Canvas 2D does not disable audio;
- reduced-motion preference removes decorative motion where practical.

## Lifecycle limitation

The page stops on `pagehide`. A suspended or interrupted audio context results in a
restart state. The interface does not claim that a browser page survives computer
sleep, device audio changes, process eviction, or background suspension.
