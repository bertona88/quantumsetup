#!/usr/bin/env python3
"""Build concise evidence/interpretation reports from listener JSON artifacts."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np


REPORT_VERSION = "0.1.0"
METRIC_KEYS = (
    "tempo_bpm",
    "tempo_stability",
    "onsets_per_beat",
    "kick_quarter_dominance",
    "hat_offbeat_dominance",
    "bar_repeat_similarity",
    "eight_bar_recurrence",
    "harmonic_change",
    "timbral_change",
    "section_changes_per_32_bars",
    "phrase_energy_arc",
    "spectral_centroid_hz",
    "crest_db",
    "stereo_side_mid_ratio",
    "band_sub",
    "band_bass",
)

TRANSLATIONS = {
    "ann-clue-cercle-2024": {
        "id": "patient-pressure",
        "interpretation": (
            "Preserve a stable floor and resident rhythmic identity while letting upper-detail "
            "energy draw a stronger eight-bar arc; mutate secondary layers more slowly than anchors."
        ),
    },
    "dixon-cercle-2024": {
        "id": "spatial-weave",
        "interpretation": (
            "Allow slower tempo envelopes, denser syncopated detail, wider upper material, and more "
            "frequent harmonic/texture entrances without copying melodic content."
        ),
    },
    "sven-vath-time-warp-2023": {
        "id": "kinetic-mutation",
        "interpretation": (
            "Favor faster pressure, stronger offbeat articulation, brighter secondary percussion, "
            "and more timbral turnover while keeping phrase loudness motion comparatively restrained."
        ),
    },
}


def normalize(vector: list[float] | np.ndarray) -> np.ndarray:
    values = np.asarray(vector, dtype=np.float64)
    norm = float(np.linalg.norm(values))
    return values / norm if norm > 1e-12 else np.zeros_like(values)


def mean_metrics(documents: list[dict[str, Any]]) -> dict[str, float]:
    return {
        key: round(float(np.mean([document["metrics"][key] for document in documents])), 5)
        for key in METRIC_KEYS
        if all(key in document.get("metrics", {}) for document in documents)
    }


def load_jsons(directory: Path, suffix: str) -> list[dict[str, Any]]:
    return [json.loads(path.read_text()) for path in sorted(directory.glob(f"*{suffix}"))]


def embedding_summary(documents: list[dict[str, Any]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for document in documents:
        grouped.setdefault(document["group"], []).append(document)
    summaries = {}
    centroids: dict[str, dict[str, np.ndarray]] = {}
    for group, items in grouped.items():
        centroids[group] = {}
        model_summary = {}
        for model_name in ("mert", "clap"):
            vectors = [normalize(item[model_name]["embedding"]) for item in items]
            centroid = normalize(np.mean(vectors, axis=0))
            centroids[group][model_name] = centroid
            model_summary[model_name] = {
                "model": items[0][model_name]["model"],
                "revision": items[0][model_name]["revision"],
                "sample_count": len(items),
                "within_group_cosine": round(
                    float(np.mean([vector @ centroid for vector in vectors])),
                    6,
                ),
                "mean_chunk_cosine": round(
                    float(
                        np.mean(
                            [item[model_name]["uncertainty"]["mean_chunk_cosine"] for item in items]
                        )
                    ),
                    6,
                ),
            }
        prompt_scores: dict[str, list[float]] = {}
        for item in items:
            for score in item["clap"]["text_scores"]:
                prompt_scores.setdefault(score["prompt"], []).append(score["cosine"])
        model_summary["clap"]["top_text_inferences"] = [
            {"prompt": prompt, "mean_cosine": round(float(np.mean(scores)), 6)}
            for prompt, scores in sorted(
                prompt_scores.items(),
                key=lambda item: float(np.mean(item[1])),
                reverse=True,
            )[:4]
        ]
        summaries[group] = model_summary

    pairs = []
    names = sorted(centroids)
    for left_index, left in enumerate(names):
        for right in names[left_index + 1 :]:
            pairs.append(
                {
                    "left": left,
                    "right": right,
                    "mert_cosine": round(float(centroids[left]["mert"] @ centroids[right]["mert"]), 6),
                    "clap_cosine": round(float(centroids[left]["clap"] @ centroids[right]["clap"]), 6),
                }
            )
    return summaries, pairs


def stem_summary(documents: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {}
    for document in documents:
        grouped.setdefault(document["group"], {}).setdefault(
            document.get("stem_role", "unknown"),
            [],
        ).append(document)
    return {
        group: {
            role: {
                "sample_count": len(items),
                "metrics": mean_metrics(items),
                "uncertainty": "Demucs-estimated stem; bleed and reassignment remain possible.",
            }
            for role, items in roles.items()
        }
        for group, roles in grouped.items()
    }


def build_report(
    corpus_path: Path,
    embedding_dir: Path,
    stem_analysis_dir: Path | None,
    sample_manifest_path: Path | None,
    output_path: Path,
) -> dict[str, Any]:
    corpus = json.loads(corpus_path.read_text())
    embeddings = load_jsons(embedding_dir, ".embeddings.json")
    embedding_groups, embedding_pairs = embedding_summary(embeddings)
    stem_documents = (
        load_jsons(stem_analysis_dir, ".analysis.json")
        if stem_analysis_dir and stem_analysis_dir.exists()
        else []
    )
    stems = stem_summary(stem_documents)
    sample_provenance = (
        json.loads(sample_manifest_path.read_text()).get("records", [])
        if sample_manifest_path and sample_manifest_path.exists()
        else []
    )
    groups = {}
    for group, core in corpus["groups"].items():
        groups[group] = {
            "sample_count": core["sample_count"],
            "direct_measurement": {key: core["metrics"][key] for key in METRIC_KEYS},
            "style_heuristics": core["style_scores"],
            "embedding_inference": embedding_groups.get(group),
            "estimated_stems": stems.get(group, {}),
            "runtime_translation": TRANSLATIONS.get(group),
        }
    report = {
        "schema": "quantumsetup.reference-report.v1",
        "report_version": REPORT_VERSION,
        "analyzer_version": corpus["analyzer_version"],
        "groups": groups,
        "sample_provenance": sample_provenance,
        "reference_embedding_pairs": embedding_pairs,
        "evidence_boundaries": {
            "direct_measurement": "Signal and inferred-grid measurements from exact hashed excerpts.",
            "estimated_stems": "Demucs estimates, not isolated studio multitracks.",
            "embedding_inference": "MERT and CLAP cosine evidence, not semantic truth or quality.",
            "runtime_translation": "Authored abstraction from the evidence; no melody, sample, or artist preset is copied.",
            "acceptance": "Human listening acceptance remains unresolved by this report.",
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n")
    output_path.with_suffix(".md").write_text(markdown_report(report))
    return report


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# QuantumSetup reference-listening report",
        "",
        "Three 72-second interior excerpts per set were analyzed. Measurements, separated-stem estimates, learned embeddings, and authored musical interpretation are kept distinct.",
        "",
    ]
    for group, evidence in report["groups"].items():
        metrics = evidence["direct_measurement"]
        embedding = evidence.get("embedding_inference") or {}
        translation = evidence.get("runtime_translation") or {}
        lines.extend(
            [
                f"## {group}",
                "",
                "Direct measurement:",
                "",
                f"- {metrics['tempo_bpm']:.1f} BPM; {metrics['onsets_per_beat']:.2f} inferred onsets per beat.",
                f"- Quarter-kick dominance {metrics['kick_quarter_dominance']:.2f}; offbeat-high dominance {metrics['hat_offbeat_dominance']:.2f}.",
                f"- Bar repeat {metrics['bar_repeat_similarity']:.2f}; eight-bar recurrence {metrics['eight_bar_recurrence']:.2f}.",
                f"- Harmonic change {metrics['harmonic_change']:.2f}; timbral change {metrics['timbral_change']:.2f}; phrase arc {metrics['phrase_energy_arc']:.2f}.",
                f"- Median spectral centroid {metrics['spectral_centroid_hz']:.0f} Hz. Stereo width is reported separately because source/mastering artifacts can dominate it.",
                "",
            ]
        )
        samples = [
            record
            for record in report.get("sample_provenance", [])
            if record.get("group") == group
        ]
        if samples:
            lines.extend(
                [
                    "Exact windows: "
                    + ", ".join(
                        f"{record['start_seconds']:.3f}s (`{record['sample_sha256'][:12]}…`)"
                        for record in samples
                    )
                    + ".",
                    "",
                ]
            )
        stems = evidence.get("estimated_stems") or {}
        if all(role in stems for role in ("drums", "bass", "remaining")):
            drum_metrics = stems["drums"]["metrics"]
            bass_metrics = stems["bass"]["metrics"]
            remaining_metrics = stems["remaining"]["metrics"]
            lines.extend(
                [
                    "Estimated-stem evidence (bleed remains possible):",
                    "",
                    f"- Drums: {drum_metrics['onsets_per_beat']:.2f} onsets/beat, kick dominance {drum_metrics['kick_quarter_dominance']:.2f}, offbeat-high dominance {drum_metrics['hat_offbeat_dominance']:.2f}, centroid {drum_metrics['spectral_centroid_hz']:.0f} Hz.",
                    f"- Bass: {bass_metrics['onsets_per_beat']:.2f} onsets/beat, low-band share {(bass_metrics['band_sub'] + bass_metrics['band_bass']) * 100:.1f}%, bar repeat {bass_metrics['bar_repeat_similarity']:.2f}.",
                    f"- Remaining material: harmonic change {remaining_metrics['harmonic_change']:.2f}, timbral change {remaining_metrics['timbral_change']:.2f}, centroid {remaining_metrics['spectral_centroid_hz']:.0f} Hz.",
                    "",
                ]
            )
        if embedding:
            lines.extend(
                [
                    "Model inference:",
                    "",
                    f"- MERT within-set cohesion {embedding['mert']['within_group_cosine']:.3f}; CLAP within-set cohesion {embedding['clap']['within_group_cosine']:.3f}.",
                    f"- Strongest CLAP text hypothesis: “{embedding['clap']['top_text_inferences'][0]['prompt']}” ({embedding['clap']['top_text_inferences'][0]['mean_cosine']:.3f}).",
                    "",
                ]
            )
        if translation:
            lines.extend(
                [
                    f"Transferable tendency: `{translation['id']}`",
                    "",
                    translation["interpretation"],
                    "",
                ]
            )
    lines.extend(
        [
            "## Evidence boundary",
            "",
            "This is functional machine listening, not literal hearing. Stem measurements may contain separation bleed; embedding similarities are model-dependent; and neither deterministic tests nor feature proximity establishes musical quality. Human listening acceptance remains open.",
            "",
        ]
    )
    return "\n".join(lines)


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--corpus", type=Path, required=True)
    root.add_argument("--embeddings", type=Path, required=True)
    root.add_argument("--stem-analysis", type=Path)
    root.add_argument("--samples", type=Path)
    root.add_argument("--out", type=Path, required=True)
    return root


def main() -> None:
    args = parser().parse_args()
    build_report(
        args.corpus,
        args.embeddings,
        args.stem_analysis,
        args.samples,
        args.out,
    )


if __name__ == "__main__":
    main()
