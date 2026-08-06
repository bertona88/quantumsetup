# QuantumSetup reference listener

This is a development-only machine-listening harness for turning real audio into
reproducible musical evidence. It does not claim to hear subjectively. It aligns
measurements to an inferred beat/bar grid so Codex can reason about groove, low-end,
repetition, timbral motion, harmonic motion, phrase arcs, and section changes before
changing the generator.

Raw reference audio is never a runtime dependency and is ignored under
`artifacts/reference-listener/audio/`. Derived stems and model caches are ignored
too.

## Core workflow

Create a local manifest from `reference_sets.example.json`, then run:

```bash
python reference_listener.py sample reference_sets.local.json \
  --out-dir ../../artifacts/reference-listener/audio/references

python reference_listener.py analyze \
  ../../artifacts/reference-listener/audio/references/*.wav \
  --out-dir ../../artifacts/reference-listener/analysis/references

python reference_listener.py corpus \
  ../../artifacts/reference-listener/analysis/references \
  --output ../../artifacts/reference-listener/reference-corpus.json
```

Analyze real QuantumSetup renders into a second directory, then compare them:

```bash
python reference_listener.py compare \
  ../../artifacts/reference-listener/reference-corpus.json \
  ../../artifacts/reference-listener/analysis/quantumsetup \
  --output ../../artifacts/reference-listener/comparison.json
```

Create the eight checked-fixture full-mix renders and twelve same-seed component
renders through the actual offline browser engine with:

```bash
node quantum-capture-server.mjs
```

Open `http://127.0.0.1:4175/tools/reference-listener/quantum-capture.html` and use
**Render and save all**. The WAVs and capture manifest remain under the ignored
`artifacts/reference-listener/audio/quantumsetup-after/` directory. Add
`?only=full` or `?only=components` to run a bounded capture subset; repeated batches
merge into one capture manifest. The server records the exact SHA-256 and byte size
of every stored WAV. Treat that hash as artifact identity, not a promise that Web
Audio is bit-identical across rerenders: in validation, one repeated 3,702,858-sample
capture differed at exactly one sample by one 16-bit least-significant bit.

The sampler defaults to three 72-second excerpts at 20%, 50%, and 80% of each
recording. Every excerpt record includes its exact start, source/sample hashes, and
sample rate. Compressed source recordings are converted to 24 kHz stereo PCM WAV so
decoder timing is frozen before analysis.

## Evidence produced

- tempo, beat stability, and an inferred four-beat bar phase;
- 16-step low-energy, high-energy, and onset-strength groove profiles;
- sub, bass, low-mid, body, presence, and air energy shares;
- LUFS, crest factor, stereo width/correlation, and spectral shape;
- percussive energy, onset density, bar repetition, and eight-bar recurrence;
- harmonic/timbral change, phrase energy arcs, and section-change hypotheses;
- bounded style scores and a normalized candidate/reference feature distance.

## Heavy VM stages

Create the VM environment from both dependency files. The CPU PyTorch index keeps
the install off the Mac and avoids pulling CUDA wheels:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-core.txt
.venv/bin/python -m pip install -r requirements-ml.txt
```

Create estimated drums, bass, and remaining-material stems with deterministic
Demucs inference (`shifts=0`, one CPU job):

```bash
.venv/bin/python reference_ml.py separate \
  ../../artifacts/reference-listener/audio/references/*.wav \
  --out-dir ../../artifacts/reference-listener/stems/references

.venv/bin/python reference_listener.py analyze \
  ../../artifacts/reference-listener/stems/references/*/*.wav \
  --out-dir ../../artifacts/reference-listener/analysis/reference-stems
```

Create compact MERT-95M and CLAP evidence. MERT is pooled across the upper four
contextual layers and five-second chunks; CLAP is pooled across ten-second chunks.
Frame tensors are never serialized. CLAP text scores use the checked-in abstract
prompt bank, not artist names:

```bash
.venv/bin/python reference_ml.py embed \
  ../../artifacts/reference-listener/audio/references/*.wav \
  --out-dir ../../artifacts/reference-listener/embeddings/references \
  --cache-dir ../../artifacts/reference-listener/ml-cache

.venv/bin/python reference_ml.py compare \
  --references ../../artifacts/reference-listener/embeddings/references \
  --candidates ../../artifacts/reference-listener/embeddings/quantumsetup \
  --out ../../artifacts/reference-listener/embedding-comparison.json

.venv/bin/python reference_report.py \
  --corpus ../../artifacts/reference-listener/reference-corpus.json \
  --embeddings ../../artifacts/reference-listener/embeddings/references \
  --stem-analysis ../../artifacts/reference-listener/analysis/reference-stems \
  --samples ../../artifacts/reference-listener/audio/references/samples.json \
  --out ../../artifacts/reference-listener/reference-report.json
```

`m-a-p/MERT-v1-95M` uses CC-BY-NC-4.0 weights; this development listener is
therefore non-commercial. `laion/clap-htsat-unfused` uses Apache-2.0. Embeddings are
model inference with chunk-disagreement diagnostics, not semantic ground truth.

Build a matched same-seed before/after report from the compact artifacts with
`iteration_report.py`. It combines direct feature movement, reference-scaled
distance, MERT/CLAP similarity, and exact engine component-bus evidence while
keeping human acceptance explicitly unresolved.

```bash
.venv/bin/python iteration_report.py \
  --corpus ../../artifacts/reference-listener/reference-corpus-final.json \
  --baseline-analysis ../../artifacts/reference-listener/analysis/quantumsetup-before-final \
  --candidate-analysis ../../artifacts/reference-listener/analysis/quantumsetup-after3-full \
  --baseline-comparison ../../artifacts/reference-listener/comparison-before-final.json \
  --candidate-comparison ../../artifacts/reference-listener/comparison-after3.json \
  --baseline-embeddings ../../artifacts/reference-listener/embedding-comparison-before.json \
  --candidate-embeddings ../../artifacts/reference-listener/embedding-comparison-after3.json \
  --component-analysis ../../artifacts/reference-listener/analysis/quantumsetup-after3-components \
  --out ../../artifacts/reference-listener/iteration-report.json
```

The style scores are interpretable heuristics, not learned taste. Their purpose is to
make a proposed generator change falsifiable. A lower candidate/reference distance
means closer on the selected evidence dimensions; it does not mean better, original,
or accepted by a listener.

## Runtime location

Install the scientific and ML dependencies on `devbox-home`, following the
repository `AGENTS.md`. Stem separation and embeddings belong on the VM; do not
install PyTorch or model weights on the Mac.
