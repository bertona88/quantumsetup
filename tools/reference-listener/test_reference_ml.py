import tempfile
import unittest
from pathlib import Path

import numpy as np

from reference_ml import chunk_audio, cosine_similarity, l2_normalize, pool_embeddings


class ReferenceMlTests(unittest.TestCase):
    def test_chunks_pad_only_the_tail(self):
        chunks = chunk_audio(np.arange(11, dtype=np.float32), sample_rate=2, seconds=2)
        self.assertEqual([len(chunk) for chunk in chunks], [4, 4, 4])
        np.testing.assert_array_equal(chunks[-1], [8, 9, 10, 0])

    def test_pooling_is_normalized_and_reports_disagreement(self):
        pooled, uncertainty = pool_embeddings(
            [np.asarray([1.0, 0.0]), np.asarray([0.8, 0.2])]
        )
        self.assertAlmostEqual(float(np.linalg.norm(pooled)), 1.0)
        self.assertLess(uncertainty["minimum_chunk_cosine"], 1.0)
        self.assertGreater(uncertainty["mean_chunk_cosine"], 0.9)

    def test_cosine_ignores_vector_scale(self):
        self.assertAlmostEqual(
            cosine_similarity(np.asarray([2.0, 0.0]), np.asarray([8.0, 0.0])),
            1.0,
        )
        np.testing.assert_array_equal(l2_normalize(np.zeros(3)), np.zeros(3))


if __name__ == "__main__":
    unittest.main()
