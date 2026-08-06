#!/usr/bin/env python3
"""Heavy machine-listening adapters for devbox-home.

The structural analyzer intentionally stays usable without PyTorch. This module
owns the heavyweight, reproducible stages: Demucs stems, pooled MERT-95M music
representations, pooled CLAP audio/text representations, and cosine comparison.
Raw audio and stems belong in ignored artifact directories.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np


SCHEMA_VERSION = "quantumsetup.reference-ml.v1"
ADAPTER_VERSION = "0.1.0"
MERT_MODEL_ID = "m-a-p/MERT-v1-95M"
CLAP_MODEL_ID = "laion/clap-htsat-unfused"
MERT_REVISION = "12af15fef9d0ac838c3f475bfbbf26d2060dd4f5"
CLAP_REVISION = "8fa0f1c6d0433df6e97c127f64b2a1d6c0dcda8a"
MERT_SAMPLE_RATE = 24_000
CLAP_SAMPLE_RATE = 48_000


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def rounded_vector(values: np.ndarray, digits: int = 7) -> list[float]:
    return [round(float(value), digits) for value in np.asarray(values).reshape(-1)]


def l2_normalize(values: np.ndarray) -> np.ndarray:
    vector = np.asarray(values, dtype=np.float64)
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 1e-12 else np.zeros_like(vector)


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.dot(l2_normalize(left), l2_normalize(right)))


def pool_embeddings(vectors: Iterable[np.ndarray]) -> tuple[np.ndarray, dict[str, float]]:
    matrix = np.asarray([l2_normalize(vector) for vector in vectors], dtype=np.float64)
    if matrix.ndim != 2 or matrix.shape[0] == 0:
        raise ValueError("at least one embedding vector is required")
    pooled = l2_normalize(np.mean(matrix, axis=0))
    similarities = matrix @ pooled
    uncertainty = {
        "mean_chunk_cosine": round(float(np.mean(similarities)), 6),
        "minimum_chunk_cosine": round(float(np.min(similarities)), 6),
        "chunk_cosine_std": round(float(np.std(similarities)), 6),
    }
    return pooled, uncertainty


def chunk_audio(audio: np.ndarray, sample_rate: int, seconds: float) -> list[np.ndarray]:
    width = max(1, int(round(sample_rate * seconds)))
    source = np.asarray(audio, dtype=np.float32).reshape(-1)
    if source.size == 0:
        return [np.zeros(width, dtype=np.float32)]
    chunks = []
    for start in range(0, source.size, width):
        chunk = source[start : start + width]
        if chunk.size < width:
            chunk = np.pad(chunk, (0, width - chunk.size))
        chunks.append(chunk.astype(np.float32, copy=False))
    return chunks


def load_mono(path: Path, target_sample_rate: int) -> np.ndarray:
    import librosa

    audio, _ = librosa.load(path, sr=target_sample_rate, mono=True)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = audio / peak
    return np.asarray(audio, dtype=np.float32)


def model_revision(model: Any) -> str | None:
    commit = getattr(getattr(model, "config", None), "_commit_hash", None)
    return str(commit) if commit else None


@dataclass
class MertEmbedder:
    cache_dir: Path | None = None

    def __post_init__(self) -> None:
        import torch
        from transformers import AutoFeatureExtractor, AutoModel

        self.torch = torch
        self.processor = AutoFeatureExtractor.from_pretrained(
            MERT_MODEL_ID,
            revision=MERT_REVISION,
            trust_remote_code=True,
            cache_dir=self.cache_dir,
        )
        self.model = AutoModel.from_pretrained(
            MERT_MODEL_ID,
            revision=MERT_REVISION,
            trust_remote_code=True,
            cache_dir=self.cache_dir,
        ).eval()

    def embed(self, path: Path) -> dict[str, Any]:
        audio = load_mono(path, MERT_SAMPLE_RATE)
        vectors = []
        with self.torch.inference_mode():
            for chunk in chunk_audio(audio, MERT_SAMPLE_RATE, 5.0):
                inputs = self.processor(
                    chunk,
                    sampling_rate=MERT_SAMPLE_RATE,
                    return_tensors="pt",
                )
                outputs = self.model(**inputs, output_hidden_states=True)
                # The final representation remains compact and reproducible:
                # mean-pool time, then average the upper four contextual layers.
                hidden = outputs.hidden_states or (outputs.last_hidden_state,)
                upper = hidden[-min(4, len(hidden)) :]
                pooled_layers = [layer.mean(dim=1).squeeze(0) for layer in upper]
                vectors.append(
                    self.torch.stack(pooled_layers).mean(dim=0).cpu().numpy()
                )
        pooled, uncertainty = pool_embeddings(vectors)
        return {
            "model": MERT_MODEL_ID,
            "revision": model_revision(self.model),
            "license": "cc-by-nc-4.0",
            "sample_rate": MERT_SAMPLE_RATE,
            "chunk_seconds": 5.0,
            "chunk_count": len(vectors),
            "pooling": "mean-time then mean-upper-four-layers then mean-chunks and L2-normalize",
            "dimension": int(pooled.size),
            "uncertainty": uncertainty,
            "embedding": rounded_vector(pooled),
        }


@dataclass
class ClapEmbedder:
    prompts: list[str]
    cache_dir: Path | None = None

    def __post_init__(self) -> None:
        import torch
        from transformers import ClapModel, ClapProcessor

        self.torch = torch
        self.processor = ClapProcessor.from_pretrained(
            CLAP_MODEL_ID,
            revision=CLAP_REVISION,
            cache_dir=self.cache_dir,
        )
        self.model = ClapModel.from_pretrained(
            CLAP_MODEL_ID,
            revision=CLAP_REVISION,
            cache_dir=self.cache_dir,
        ).eval()
        with self.torch.inference_mode():
            text_inputs = self.processor(
                text=self.prompts,
                return_tensors="pt",
                padding=True,
            )
            text_vectors = self.model.get_text_features(**text_inputs).cpu().numpy()
        self.text_vectors = np.asarray([l2_normalize(vector) for vector in text_vectors])

    def embed(self, path: Path) -> dict[str, Any]:
        audio = load_mono(path, CLAP_SAMPLE_RATE)
        vectors = []
        with self.torch.inference_mode():
            for chunk in chunk_audio(audio, CLAP_SAMPLE_RATE, 10.0):
                inputs = self.processor(
                    audio=chunk,
                    sampling_rate=CLAP_SAMPLE_RATE,
                    return_tensors="pt",
                )
                vectors.append(self.model.get_audio_features(**inputs).squeeze(0).cpu().numpy())
        pooled, uncertainty = pool_embeddings(vectors)
        scores = self.text_vectors @ pooled
        ranked = sorted(
            zip(self.prompts, scores),
            key=lambda item: item[1],
            reverse=True,
        )
        return {
            "model": CLAP_MODEL_ID,
            "revision": model_revision(self.model),
            "license": "apache-2.0",
            "sample_rate": CLAP_SAMPLE_RATE,
            "chunk_seconds": 10.0,
            "chunk_count": len(vectors),
            "pooling": "model audio projection then mean-chunks and L2-normalize",
            "dimension": int(pooled.size),
            "uncertainty": uncertainty,
            "embedding": rounded_vector(pooled),
            "text_scores": [
                {"prompt": prompt, "cosine": round(float(score), 6)}
                for prompt, score in ranked
            ],
        }


def load_prompts(path: Path) -> list[str]:
    document = json.loads(path.read_text())
    prompts = document.get("prompts")
    if not isinstance(prompts, list) or not prompts or not all(isinstance(item, str) for item in prompts):
        raise ValueError("prompt file must contain a non-empty string list named prompts")
    return prompts


def embed_paths(
    paths: list[Path],
    output_dir: Path,
    prompt_path: Path,
    cache_dir: Path | None,
) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    prompts = load_prompts(prompt_path)
    mert = MertEmbedder(cache_dir=cache_dir)
    clap = ClapEmbedder(prompts=prompts, cache_dir=cache_dir)
    documents = []
    for index, path in enumerate(paths, 1):
        print(f"[{index}/{len(paths)}] embeddings: {path.name}", flush=True)
        document = {
            "schema": SCHEMA_VERSION,
            "adapter_version": ADAPTER_VERSION,
            "path": str(path.resolve()),
            "sha256": sha256(path),
            "group": path.stem.split("--", 1)[0],
            "mert": mert.embed(path),
            "clap": clap.embed(path),
            "claim_boundary": (
                "Embedding proximity is model inference, not proof of genre, quality, originality, "
                "artist intent, or human listening acceptance."
            ),
        }
        output_path = output_dir / f"{path.stem}.embeddings.json"
        output_path.write_text(json.dumps(document, indent=2) + "\n")
        documents.append(document)
    return documents


def save_float_audio(path: Path, tensor: Any, sample_rate: int) -> None:
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    audio = tensor.detach().cpu().numpy().T
    sf.write(path, audio, sample_rate, subtype="FLOAT")


def separate_paths(paths: list[Path], output_dir: Path, model_name: str) -> dict[str, Any]:
    import torch
    from demucs.api import Separator

    separator = Separator(
        model=model_name,
        device="cpu",
        shifts=0,
        split=True,
        overlap=0.1,
        jobs=1,
        progress=True,
    )
    records = []
    for index, path in enumerate(paths, 1):
        print(f"[{index}/{len(paths)}] stems: {path.name}", flush=True)
        _, sources = separator.separate_audio_file(path)
        if "drums" not in sources or "bass" not in sources:
            raise RuntimeError(f"{model_name} did not return drums and bass stems")
        remaining_sources = [source for name, source in sources.items() if name not in {"drums", "bass"}]
        remaining = torch.stack(remaining_sources).sum(dim=0)
        sample_dir = output_dir / path.stem
        stems = {
            "drums": sources["drums"],
            "bass": sources["bass"],
            "remaining": remaining,
        }
        stem_records = {}
        for name, tensor in stems.items():
            stem_path = sample_dir / f"{name}.wav"
            save_float_audio(stem_path, tensor, separator.samplerate)
            stem_records[name] = {
                "path": str(stem_path.resolve()),
                "sha256": sha256(stem_path),
            }
        records.append(
            {
                "source_path": str(path.resolve()),
                "source_sha256": sha256(path),
                "model": model_name,
                "sample_rate": separator.samplerate,
                "stems": stem_records,
                "uncertainty": (
                    "Source separation is an estimate; bleed and transient reassignment can affect "
                    "stem-level measurements."
                ),
            }
        )
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "schema": "quantumsetup.reference-stems.v1",
        "adapter_version": ADAPTER_VERSION,
        "records": records,
    }
    (output_dir / "stems.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def load_embedding_documents(directory: Path) -> list[dict[str, Any]]:
    return [json.loads(path.read_text()) for path in sorted(directory.glob("*.embeddings.json"))]


def embedding_similarity(
    reference_dir: Path,
    candidate_dir: Path,
    output_path: Path,
) -> dict[str, Any]:
    references = load_embedding_documents(reference_dir)
    candidates = load_embedding_documents(candidate_dir)
    if not references or not candidates:
        raise ValueError("both directories must contain embedding JSON files")

    comparisons = []
    for candidate in candidates:
        row = {
            "candidate": Path(candidate["path"]).name,
            "mert": [],
            "clap": [],
        }
        for reference in references:
            label = Path(reference["path"]).name
            row["mert"].append(
                {
                    "reference": label,
                    "cosine": round(
                        cosine_similarity(
                            np.asarray(candidate["mert"]["embedding"]),
                            np.asarray(reference["mert"]["embedding"]),
                        ),
                        6,
                    ),
                }
            )
            row["clap"].append(
                {
                    "reference": label,
                    "cosine": round(
                        cosine_similarity(
                            np.asarray(candidate["clap"]["embedding"]),
                            np.asarray(reference["clap"]["embedding"]),
                        ),
                        6,
                    ),
                }
            )
        row["mert"].sort(key=lambda item: item["cosine"], reverse=True)
        row["clap"].sort(key=lambda item: item["cosine"], reverse=True)
        comparisons.append(row)
    result = {
        "schema": "quantumsetup.embedding-comparison.v1",
        "adapter_version": ADAPTER_VERSION,
        "comparisons": comparisons,
        "claim_boundary": "Cosine proximity is model evidence only; it is neither a quality score nor human acceptance.",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n")
    return result


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)

    separate = commands.add_parser("separate", help="Create Demucs drums, bass, and remaining stems")
    separate.add_argument("paths", nargs="+", type=Path)
    separate.add_argument("--out-dir", type=Path, required=True)
    separate.add_argument("--model", default="htdemucs")

    embed = commands.add_parser("embed", help="Create pooled MERT-95M and CLAP embeddings")
    embed.add_argument("paths", nargs="+", type=Path)
    embed.add_argument("--out-dir", type=Path, required=True)
    embed.add_argument(
        "--prompts",
        type=Path,
        default=Path(__file__).with_name("clap_prompts.json"),
    )
    embed.add_argument("--cache-dir", type=Path)

    compare = commands.add_parser("compare", help="Compare candidate and reference embedding directories")
    compare.add_argument("--references", type=Path, required=True)
    compare.add_argument("--candidates", type=Path, required=True)
    compare.add_argument("--out", type=Path, required=True)
    return root


def main() -> None:
    args = parser().parse_args()
    if args.command == "separate":
        separate_paths(args.paths, args.out_dir, args.model)
    elif args.command == "embed":
        embed_paths(args.paths, args.out_dir, args.prompts, args.cache_dir)
    elif args.command == "compare":
        embedding_similarity(args.references, args.candidates, args.out)
    else:
        raise AssertionError(args.command)


if __name__ == "__main__":
    main()
