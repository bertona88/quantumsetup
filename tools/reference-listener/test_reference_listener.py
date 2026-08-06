import json
import math
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from reference_listener import (
    FEATURE_VECTOR_KEYS,
    TARGET_SAMPLE_RATE,
    align_step_profiles,
    analyze_audio,
    build_corpus,
    compare_candidate,
    normalize_tempo,
    step_profile,
)


class ReferenceListenerTests(unittest.TestCase):
    def test_tempo_normalization_stays_in_techno_range(self):
        self.assertEqual(normalize_tempo(64.0), 128.0)
        self.assertEqual(normalize_tempo(256.0), 128.0)
        self.assertEqual(normalize_tempo(132.0), 132.0)

    def test_step_profile_preserves_quarter_pulse(self):
        envelope = np.zeros(160)
        envelope[[0, 40, 80, 120]] = 1.0
        profile = step_profile(envelope, [slice(0, 160)])
        quarter = np.mean([profile[index] for index in (0, 4, 8, 12)])
        remainder = np.mean([profile[index] for index in range(16) if index not in (0, 4, 8, 12)])
        self.assertGreater(quarter, remainder)

    def test_step_alignment_rotates_late_pulse_onto_quarters(self):
        low = [0.1] * 16
        for index in (3, 7, 11, 15):
            low[index] = 3.0
        high = list(range(16))
        onset = list(reversed(range(16)))
        aligned_low, aligned_high, aligned_onset, phase = align_step_profiles(low, high, onset)
        self.assertEqual(phase, 3)
        self.assertEqual([aligned_low[index] for index in (0, 4, 8, 12)], [3.0] * 4)
        self.assertEqual(aligned_high[0], 3.0)
        self.assertEqual(aligned_onset[0], 12.0)

    def test_analyzer_emits_finite_evidence_for_click_track(self):
        duration = 24.0
        samples = int(duration * TARGET_SAMPLE_RATE)
        audio = np.zeros((samples, 2), dtype=np.float32)
        interval = int(TARGET_SAMPLE_RATE * 60.0 / 128.0)
        length = int(TARGET_SAMPLE_RATE * 0.08)
        t = np.arange(length) / TARGET_SAMPLE_RATE
        click = np.sin(2 * np.pi * 58.0 * t) * np.exp(-t * 35.0) * 0.7
        for start in range(0, samples - length, interval):
            audio[start : start + length, 0] += click
            audio[start : start + length, 1] += click
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test--click.wav"
            sf.write(path, audio, TARGET_SAMPLE_RATE)
            document = analyze_audio(path).document
        self.assertGreater(document["musical_grid"]["bar_count"], 4)
        self.assertTrue(100.0 <= document["metrics"]["tempo_bpm"] <= 160.0)
        for value in document["feature_vector"].values():
            self.assertTrue(math.isfinite(value))

    def test_candidate_distance_uses_reference_fitted_scaling(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            references = root / "references"
            candidates = root / "candidates"
            references.mkdir()
            candidates.mkdir()
            for index in range(6):
                vector = {
                    key: float(key_index + index * 0.2)
                    for key_index, key in enumerate(FEATURE_VECTOR_KEYS)
                }
                document = {
                    "path": f"reference-{index}.wav",
                    "group": f"group-{index // 2}",
                    "metrics": vector,
                    "style_scores": {"test": index / 10},
                    "feature_vector": vector,
                }
                (references / f"reference-{index}.analysis.json").write_text(
                    json.dumps(document)
                )
            corpus_path = root / "corpus.json"
            corpus = build_corpus(references, corpus_path)
            self.assertEqual(corpus["reference_scaler"]["fit_sample_count"], 6)

            vector = {
                key: float(key_index + 0.5)
                for key_index, key in enumerate(FEATURE_VECTOR_KEYS)
            }
            (candidates / "candidate.analysis.json").write_text(
                json.dumps(
                    {
                        "path": "candidate.wav",
                        "group": "candidate",
                        "metrics": vector,
                        "style_scores": {"test": 0.5},
                        "feature_vector": vector,
                    }
                )
            )
            comparison = compare_candidate(
                corpus_path,
                candidates,
                root / "comparison.json",
            )
            self.assertEqual(comparison["scaler"], "reference-corpus excerpts only")
            self.assertTrue(
                math.isfinite(comparison["comparisons"][0]["normalized_distance"])
            )


if __name__ == "__main__":
    unittest.main()
