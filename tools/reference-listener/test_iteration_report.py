import json
import tempfile
import unittest
from pathlib import Path

from iteration_report import build_report


class IterationReportTests(unittest.TestCase):
    def test_build_report_matches_captures_and_keeps_claim_boundary(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            before = root / "before"
            after = root / "after"
            components = root / "components"
            for directory in (before, after, components):
                directory.mkdir()

            metrics = {
                key: 1.0
                for key in (
                    "tempo_bpm", "onsets_per_beat", "kick_quarter_dominance",
                    "hat_offbeat_dominance", "bar_repeat_similarity",
                    "eight_bar_recurrence", "harmonic_change", "timbral_change",
                    "section_changes_per_32_bars", "phrase_energy_arc",
                    "spectral_centroid_hz", "spectral_rolloff_hz", "crest_db",
                    "stereo_side_mid_ratio", "integrated_lufs", "band_sub",
                    "band_bass", "band_body", "band_presence", "band_air",
                )
            }
            (before / "capture.analysis.json").write_text(json.dumps({"metrics": metrics}))
            after_metrics = dict(metrics, hat_offbeat_dominance=2.0)
            (after / "capture.analysis.json").write_text(json.dumps({"metrics": after_metrics}))
            component_metrics = {key: 1.0 for key in (
                "integrated_lufs", "onsets_per_beat", "spectral_centroid_hz",
                "bar_repeat_similarity", "harmonic_change", "timbral_change",
                "band_sub", "band_bass", "band_body", "band_presence", "band_air",
            )}
            (components / "capture-secondary-percussion.analysis.json").write_text(
                json.dumps({"metrics": component_metrics})
            )
            corpus = root / "corpus.json"
            corpus.write_text(json.dumps({
                "analyzer_version": "test",
                "groups": {"reference": {"metrics": metrics}},
            }))

            def write_comparison(path, distance):
                path.write_text(json.dumps({"comparisons": [{
                    "candidate": "capture.wav", "normalized_distance": distance,
                    "nearest_reference": "reference",
                }]}))

            before_comparison = root / "before-comparison.json"
            after_comparison = root / "after-comparison.json"
            write_comparison(before_comparison, 2.0)
            write_comparison(after_comparison, 1.0)

            def write_embeddings(path, cosine):
                path.write_text(json.dumps({"comparisons": [{
                    "candidate": "capture.wav",
                    "mert": [{"reference": "reference--p20.wav", "cosine": cosine}],
                    "clap": [{"reference": "reference--p20.wav", "cosine": cosine}],
                }]}))

            before_embeddings = root / "before-embeddings.json"
            after_embeddings = root / "after-embeddings.json"
            write_embeddings(before_embeddings, 0.4)
            write_embeddings(after_embeddings, 0.6)

            report = build_report(
                corpus, before, after, before_comparison, after_comparison,
                before_embeddings, after_embeddings, components, root / "report.json",
            )
            self.assertEqual(report["matched_capture_count"], 1)
            self.assertEqual(report["structural_distance"]["delta"], -1.0)
            self.assertEqual(
                report["direct_metric_means"]["hat_offbeat_dominance"]["delta"], 1.0
            )
            self.assertEqual(report["embedding_similarity"]["clap"]["reference"]["delta"], 0.2)
            self.assertIn("quality", report["evidence_boundaries"])


if __name__ == "__main__":
    unittest.main()
