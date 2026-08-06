#!/usr/bin/env python3
"""Summarize matched before/after QuantumSetup listener evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any


REPORT_VERSION = "0.1.0"
DIRECT_METRICS = (
    "tempo_bpm",
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
    "spectral_rolloff_hz",
    "crest_db",
    "stereo_side_mid_ratio",
    "integrated_lufs",
    "band_sub",
    "band_bass",
    "band_body",
    "band_presence",
    "band_air",
)
COMPONENT_METRICS = (
    "integrated_lufs",
    "onsets_per_beat",
    "spectral_centroid_hz",
    "bar_repeat_similarity",
    "harmonic_change",
    "timbral_change",
    "band_sub",
    "band_bass",
    "band_body",
    "band_presence",
    "band_air",
)
COMPONENT_ROLES = (
    "secondary-percussion",
    "non-anchors",
    "harmony",
    "drums",
    "synth",
    "bass",
)


def load_documents(directory: Path) -> dict[str, dict[str, Any]]:
    return {
        path.name.removesuffix(".analysis.json"): json.loads(path.read_text())
        for path in sorted(directory.glob("*.analysis.json"))
    }


def average_metrics(documents: list[dict[str, Any]], keys: tuple[str, ...]) -> dict[str, float]:
    return {
        key: round(mean(document["metrics"][key] for document in documents), 6)
        for key in keys
    }


def comparison_rows(path: Path) -> dict[str, dict[str, Any]]:
    document = json.loads(path.read_text())
    return {row["candidate"].removesuffix(".wav"): row for row in document["comparisons"]}


def embedding_means(path: Path, candidate_ids: set[str]) -> dict[str, dict[str, float]]:
    document = json.loads(path.read_text())
    rows = [
        row
        for row in document["comparisons"]
        if row["candidate"].removesuffix(".wav") in candidate_ids
    ]
    reference_groups = sorted(
        {
            item["reference"].split("--", 1)[0]
            for row in rows
            for item in row["mert"]
        }
    )
    return {
        model: {
            group: round(
                mean(
                    item["cosine"]
                    for row in rows
                    for item in row[model]
                    if item["reference"].startswith(f"{group}--")
                ),
                6,
            )
            for group in reference_groups
        }
        for model in ("mert", "clap")
    }


def component_role(identifier: str) -> str | None:
    for role in COMPONENT_ROLES:
        if identifier.endswith(f"-{role}"):
            return role
    return None


def build_report(
    corpus_path: Path,
    baseline_analysis: Path,
    candidate_analysis: Path,
    baseline_comparison: Path,
    candidate_comparison: Path,
    baseline_embeddings: Path,
    candidate_embeddings: Path,
    component_analysis: Path,
    output_path: Path,
) -> dict[str, Any]:
    corpus = json.loads(corpus_path.read_text())
    baseline_documents = load_documents(baseline_analysis)
    candidate_documents = load_documents(candidate_analysis)
    matched_ids = sorted(set(baseline_documents) & set(candidate_documents))
    if not matched_ids:
        raise ValueError("baseline and candidate analysis have no matched captures")

    baseline_rows = comparison_rows(baseline_comparison)
    candidate_rows = comparison_rows(candidate_comparison)
    if not set(matched_ids) <= set(baseline_rows) & set(candidate_rows):
        raise ValueError("structural comparisons do not cover all matched captures")

    baseline_metrics = average_metrics(
        [baseline_documents[identifier] for identifier in matched_ids], DIRECT_METRICS
    )
    candidate_metrics = average_metrics(
        [candidate_documents[identifier] for identifier in matched_ids], DIRECT_METRICS
    )
    reference_metrics = {
        key: [group["metrics"][key] for group in corpus["groups"].values()]
        for key in DIRECT_METRICS
        if all(key in group["metrics"] for group in corpus["groups"].values())
    }
    metric_evidence = {
        key: {
            "baseline": baseline_metrics[key],
            "candidate": candidate_metrics[key],
            "delta": round(candidate_metrics[key] - baseline_metrics[key], 6),
            "reference_group_min": round(min(reference_metrics[key]), 6),
            "reference_group_max": round(max(reference_metrics[key]), 6),
        }
        for key in DIRECT_METRICS
        if key in reference_metrics
    }

    structural_rows = []
    for identifier in matched_ids:
        before = baseline_rows[identifier]
        after = candidate_rows[identifier]
        structural_rows.append(
            {
                "candidate": f"{identifier}.wav",
                "baseline_distance": before["normalized_distance"],
                "candidate_distance": after["normalized_distance"],
                "delta": round(after["normalized_distance"] - before["normalized_distance"], 6),
                "baseline_nearest_reference": before["nearest_reference"],
                "candidate_nearest_reference": after["nearest_reference"],
            }
        )
    structural = {
        "baseline_mean_nearest_distance": round(
            mean(row["baseline_distance"] for row in structural_rows), 6
        ),
        "candidate_mean_nearest_distance": round(
            mean(row["candidate_distance"] for row in structural_rows), 6
        ),
        "matched_captures": structural_rows,
    }
    structural["delta"] = round(
        structural["candidate_mean_nearest_distance"]
        - structural["baseline_mean_nearest_distance"],
        6,
    )

    baseline_embedding = embedding_means(baseline_embeddings, set(matched_ids))
    candidate_embedding = embedding_means(candidate_embeddings, set(matched_ids))
    embedding = {
        model: {
            group: {
                "baseline": baseline_embedding[model][group],
                "candidate": candidate_embedding[model][group],
                "delta": round(
                    candidate_embedding[model][group] - baseline_embedding[model][group],
                    6,
                ),
            }
            for group in baseline_embedding[model]
        }
        for model in ("mert", "clap")
    }

    component_documents = load_documents(component_analysis)
    by_role: dict[str, list[dict[str, Any]]] = {}
    for identifier, document in component_documents.items():
        role = component_role(identifier)
        if role:
            by_role.setdefault(role, []).append(document)
    components = {
        role: {
            "capture_count": len(documents),
            "metrics": average_metrics(documents, COMPONENT_METRICS),
        }
        for role, documents in sorted(by_role.items())
    }

    report = {
        "schema": "quantumsetup.reference-iteration-report.v1",
        "report_version": REPORT_VERSION,
        "analyzer_version": corpus["analyzer_version"],
        "matched_capture_count": len(matched_ids),
        "direct_metric_means": metric_evidence,
        "structural_distance": structural,
        "embedding_similarity": embedding,
        "candidate_component_evidence": components,
        "evidence_boundaries": {
            "comparison": "Same-seed, same-bar-window full mixes; lower structural distance and higher embedding cosine mean closer only on the selected evidence.",
            "components": "Exact engine component captures, not source-separated estimates.",
            "quality": "Neither feature movement nor learned embeddings establish musical quality, originality, or human acceptance.",
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n")
    output_path.with_suffix(".md").write_text(markdown_report(report))
    return report


def markdown_report(report: dict[str, Any]) -> str:
    structural = report["structural_distance"]
    lines = [
        "# QuantumSetup reference-listener iteration",
        "",
        f"Matched captures: {report['matched_capture_count']}. Structural mean nearest distance: "
        f"{structural['baseline_mean_nearest_distance']:.4f} -> "
        f"{structural['candidate_mean_nearest_distance']:.4f} "
        f"(delta {structural['delta']:+.4f}).",
        "",
        "## Direct measurements",
        "",
        "| Metric | Before | After | Delta | Reference group range |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for metric, evidence in report["direct_metric_means"].items():
        lines.append(
            f"| {metric} | {evidence['baseline']:.6g} | {evidence['candidate']:.6g} | "
            f"{evidence['delta']:+.6g} | {evidence['reference_group_min']:.6g}–"
            f"{evidence['reference_group_max']:.6g} |"
        )
    lines.extend(
        [
            "",
            "## Learned representation similarity",
            "",
            "| Model | Reference group | Before | After | Delta |",
            "| --- | --- | ---: | ---: | ---: |",
        ]
    )
    for model, groups in report["embedding_similarity"].items():
        for group, evidence in groups.items():
            lines.append(
                f"| {model.upper()} | {group} | {evidence['baseline']:.6f} | "
                f"{evidence['candidate']:.6f} | {evidence['delta']:+.6f} |"
            )
    lines.extend(
        [
            "",
            "## Boundaries",
            "",
            "This is reproducible machine-listening evidence, not literal hearing. The component captures are exact engine buses; the reference stems are model estimates. Human listening remains the acceptance gate.",
            "",
        ]
    )
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--baseline-analysis", type=Path, required=True)
    parser.add_argument("--candidate-analysis", type=Path, required=True)
    parser.add_argument("--baseline-comparison", type=Path, required=True)
    parser.add_argument("--candidate-comparison", type=Path, required=True)
    parser.add_argument("--baseline-embeddings", type=Path, required=True)
    parser.add_argument("--candidate-embeddings", type=Path, required=True)
    parser.add_argument("--component-analysis", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        args.corpus,
        args.baseline_analysis,
        args.candidate_analysis,
        args.baseline_comparison,
        args.candidate_comparison,
        args.baseline_embeddings,
        args.candidate_embeddings,
        args.component_analysis,
        args.out,
    )
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
