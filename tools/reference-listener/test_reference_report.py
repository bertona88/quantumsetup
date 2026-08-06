import unittest

import numpy as np

from reference_report import mean_metrics, normalize


class ReferenceReportTests(unittest.TestCase):
    def test_normalize_handles_scale_and_silence(self):
        np.testing.assert_allclose(normalize([3, 4]), [0.6, 0.8])
        np.testing.assert_array_equal(normalize([0, 0]), [0, 0])

    def test_mean_metrics_uses_only_complete_metric_columns(self):
        documents = [
            {"metrics": {"tempo_bpm": 120, "tempo_stability": 0.8}},
            {"metrics": {"tempo_bpm": 124, "tempo_stability": 0.6}},
        ]
        result = mean_metrics(documents)
        self.assertEqual(result["tempo_bpm"], 122)
        self.assertEqual(result["tempo_stability"], 0.7)
        self.assertNotIn("crest_db", result)


if __name__ == "__main__":
    unittest.main()
