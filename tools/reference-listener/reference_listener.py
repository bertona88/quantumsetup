#!/usr/bin/env python3
"""Reference-track sampler, analyzer, and QuantumSetup comparison harness.

Raw reference audio is deliberately kept outside Git. The analyzer emits JSON and
Markdown evidence that can be reproduced from a local manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import librosa
    import numpy as np
    import pyloudnorm as pyln
    from scipy.signal import find_peaks
    from sklearn.preprocessing import StandardScaler
except ModuleNotFoundError as error:  # The ffmpeg sampler stays Mac-light.
    librosa = None
    np = None
    pyln = None
    find_peaks = None
    StandardScaler = None
    CORE_IMPORT_ERROR = error
else:
    CORE_IMPORT_ERROR = None


ANALYZER_VERSION = "0.1.3"
TARGET_SAMPLE_RATE = 24_000
HOP_LENGTH = 512
N_FFT = 2048
EPSILON = 1e-10

BANDS = (
    ("sub", 20.0, 60.0),
    ("bass", 60.0, 140.0),
    ("low_mid", 140.0, 500.0),
    ("body", 500.0, 2_000.0),
    ("presence", 2_000.0, 6_000.0),
    ("air", 6_000.0, 12_000.0),
)

FEATURE_VECTOR_KEYS = (
    "tempo_bpm",
    "tempo_stability",
    "crest_db",
    "percussive_energy_ratio",
    "onsets_per_beat",
    "kick_quarter_dominance",
    "hat_offbeat_dominance",
    "backbeat_dominance",
    "bar_repeat_similarity",
    "eight_bar_recurrence",
    "harmonic_change",
    "timbral_change",
    "section_changes_per_32_bars",
    "phrase_energy_arc",
    "spectral_centroid_hz",
    "spectral_rolloff_hz",
    "band_sub",
    "band_bass",
    "band_body",
    "band_air",
)

MAJOR_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
MINOR_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
PITCH_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def clamp01(value: float) -> float:
    return float(max(0.0, min(1.0, value)))


def require_core() -> None:
    if CORE_IMPORT_ERROR is not None:
        raise SystemExit(
            "Analysis dependencies are unavailable. Install requirements-core.txt on devbox-home. "
            f"Original import error: {CORE_IMPORT_ERROR}"
        )


def finite(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(np.asarray(value).reshape(-1)[0])
    except (TypeError, ValueError, IndexError):
        return fallback
    return number if math.isfinite(number) else fallback


def rounded(value: Any, digits: int = 5) -> float:
    return round(finite(value), digits)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def run_json(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(completed.stdout)


def ffprobe(path: Path) -> dict[str, Any]:
    return run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ]
    )


def slug(value: str) -> str:
    text = "".join(character.lower() if character.isalnum() else "-" for character in value)
    return "-".join(part for part in text.split("-") if part)


def sample_reference_sets(
    manifest_path: Path,
    output_dir: Path,
    duration: float,
    fractions: list[float],
) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text())
    output_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    for source in manifest["sets"]:
        source_path = Path(source["path"]).expanduser().resolve()
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        probe = ffprobe(source_path)
        source_duration = float(probe["format"]["duration"])
        usable = max(0.0, source_duration - duration)
        for fraction in fractions:
            start = usable * fraction
            filename = f"{slug(source['id'])}--p{round(fraction * 100):02d}.wav"
            destination = output_dir / filename
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-ss",
                    f"{start:.3f}",
                    "-i",
                    str(source_path),
                    "-t",
                    f"{duration:.3f}",
                    "-map",
                    "0:a:0",
                    "-ac",
                    "2",
                    "-ar",
                    str(TARGET_SAMPLE_RATE),
                    "-c:a",
                    "pcm_s16le",
                    str(destination),
                ],
                check=True,
            )
            records.append(
                {
                    "group": source["id"],
                    "label": source.get("label", source["id"]),
                    "sample": filename,
                    "source_path": str(source_path),
                    "source_duration_seconds": round(source_duration, 3),
                    "start_seconds": round(start, 3),
                    "duration_seconds": duration,
                    "fraction": fraction,
                    "source_sha256": sha256(source_path),
                    "sample_sha256": sha256(destination),
                }
            )
    result = {
        "schema": "quantumsetup.reference-samples.v1",
        "analyzer_version": ANALYZER_VERSION,
        "sample_rate": TARGET_SAMPLE_RATE,
        "records": records,
    }
    (output_dir / "samples.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
    denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denominator <= EPSILON:
        return 0.0
    return float(np.dot(left, right) / denominator)


def band_envelopes(power: np.ndarray, frequencies: np.ndarray) -> dict[str, np.ndarray]:
    envelopes: dict[str, np.ndarray] = {}
    for name, lower, upper in BANDS:
        mask = (frequencies >= lower) & (frequencies < min(upper, frequencies[-1] + 1))
        envelopes[name] = np.mean(power[mask], axis=0) if np.any(mask) else np.zeros(power.shape[1])
    return envelopes


def normalize_tempo(raw_bpm: float) -> float:
    tempo = raw_bpm
    while tempo < 100.0:
        tempo *= 2.0
    while tempo > 160.0:
        tempo /= 2.0
    return tempo


def estimate_key(chroma: np.ndarray) -> tuple[str, float]:
    average = np.mean(chroma, axis=1)
    average = (average - np.mean(average)) / (np.std(average) + EPSILON)
    candidates: list[tuple[float, str]] = []
    for root in range(12):
        for mode, values in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            template = np.asarray(values)
            rolled = np.roll(template, root)
            rolled = (rolled - np.mean(rolled)) / (np.std(rolled) + EPSILON)
            candidates.append((cosine_similarity(average, rolled), f"{PITCH_NAMES[root]} {mode}"))
    score, label = max(candidates)
    return label, score


def bar_slices(downbeat_frames: np.ndarray, frame_count: int) -> list[slice]:
    slices: list[slice] = []
    for start, end in zip(downbeat_frames[:-1], downbeat_frames[1:]):
        start_frame = max(0, min(frame_count - 1, int(start)))
        end_frame = max(start_frame + 1, min(frame_count, int(end)))
        slices.append(slice(start_frame, end_frame))
    return slices


def step_profile(envelope: np.ndarray, slices: list[slice], steps: int = 16) -> list[float]:
    profiles: list[np.ndarray] = []
    for item in slices:
        segment = envelope[item]
        if segment.size < steps:
            continue
        boundaries = np.linspace(0, segment.size, steps + 1).astype(int)
        profile = np.asarray(
            [np.mean(segment[boundaries[index] : boundaries[index + 1]]) for index in range(steps)]
        )
        profile /= np.mean(profile) + EPSILON
        profiles.append(profile)
    if not profiles:
        return [0.0] * steps
    return [rounded(value, 4) for value in np.median(np.stack(profiles), axis=0)]


def align_step_profiles(
    low_profile: list[float], high_profile: list[float], onset_profile: list[float]
) -> tuple[list[float], list[float], list[float], int]:
    """Align the inferred grid to the strongest quarter-pulse sixteenth phase."""

    low = np.asarray(low_profile)
    phase = int(np.argmax([np.mean(low[offset::4]) for offset in range(4)]))

    def rotate(profile: list[float]) -> list[float]:
        return [rounded(value, 4) for value in np.roll(np.asarray(profile), -phase)]

    return rotate(low_profile), rotate(high_profile), rotate(onset_profile), phase


def bar_feature_matrix(
    envelopes: dict[str, np.ndarray],
    rms: np.ndarray,
    centroid: np.ndarray,
    chroma: np.ndarray,
    onset_envelope: np.ndarray,
    slices: list[slice],
) -> np.ndarray:
    rows: list[np.ndarray] = []
    for item in slices:
        band_values = np.asarray([np.mean(envelopes[name][item]) for name, _, _ in BANDS])
        band_values /= np.sum(band_values) + EPSILON
        chroma_values = np.mean(chroma[:, item], axis=1)
        chroma_values /= np.sum(chroma_values) + EPSILON
        rows.append(
            np.concatenate(
                [
                    band_values,
                    [np.mean(rms[item]), np.mean(centroid[item]) / 12_000.0, np.mean(onset_envelope[item])],
                    chroma_values,
                ]
            )
        )
    return np.stack(rows) if rows else np.zeros((0, len(BANDS) + 3 + 12))


def adjacent_distances(matrix: np.ndarray) -> np.ndarray:
    if matrix.shape[0] < 2:
        return np.zeros(0)
    return np.asarray([1.0 - cosine_similarity(left, right) for left, right in zip(matrix[:-1], matrix[1:])])


def robust_scale(matrix: np.ndarray) -> np.ndarray:
    if matrix.shape[0] < 2:
        return matrix.copy()
    center = np.median(matrix, axis=0)
    scale = np.quantile(matrix, 0.75, axis=0) - np.quantile(matrix, 0.25, axis=0)
    fallback = np.std(matrix, axis=0)
    scale = np.where(scale > 1e-7, scale, np.where(fallback > 1e-7, fallback, 1.0))
    return (matrix - center) / scale


def normalized_step_distances(matrix: np.ndarray) -> np.ndarray:
    if matrix.shape[0] < 2:
        return np.zeros(0)
    scaled = robust_scale(matrix)
    return np.linalg.norm(np.diff(scaled, axis=0), axis=1) / math.sqrt(matrix.shape[1])


def recurrence(matrix: np.ndarray, lag: int) -> float:
    if matrix.shape[0] <= lag:
        return 0.0
    scaled = robust_scale(matrix)
    distances = np.linalg.norm(scaled[:-lag] - scaled[lag:], axis=1) / math.sqrt(matrix.shape[1])
    return float(np.mean(np.exp(-distances)))


def phrase_arc(values: np.ndarray, bars_per_phrase: int = 8) -> float:
    arcs: list[float] = []
    x = np.linspace(-1.0, 1.0, bars_per_phrase)
    for start in range(0, len(values) - bars_per_phrase + 1, bars_per_phrase):
        window = values[start : start + bars_per_phrase]
        scale = np.mean(np.abs(window)) + EPSILON
        arcs.append(abs(float(np.polyfit(x, window / scale, 1)[0])))
    return float(np.mean(arcs)) if arcs else 0.0


def style_scores(metrics: dict[str, float]) -> dict[str, float]:
    low_share = metrics["band_sub"] + metrics["band_bass"]
    return {
        "four_floor_authority": clamp01(
            0.45 * ((metrics["kick_quarter_dominance"] - 1.0) / 1.6)
            + 0.30 * metrics["tempo_stability"]
            + 0.25 * (metrics["percussive_energy_ratio"] / 0.65)
        ),
        "bass_authority": clamp01((low_share - 0.78) / 0.22),
        "offbeat_motor": clamp01((metrics["hat_offbeat_dominance"] - 0.9) / 1.5),
        "syncopated_detail": clamp01(
            0.55 * ((metrics["onsets_per_beat"] - 1.0) / 2.5)
            + 0.45 * (1.0 - metrics["bar_repeat_similarity"])
        ),
        "harmonic_motion": clamp01(metrics["harmonic_change"] / 1.5),
        "timbral_motion": clamp01(metrics["timbral_change"] / 1.0),
        "sectional_dramaturgy": clamp01(
            0.55 * (metrics["section_changes_per_32_bars"] / 5.0)
            + 0.45 * (metrics["phrase_energy_arc"] / 0.45)
        ),
        "spatial_openness": clamp01(metrics["stereo_side_mid_ratio"] / 0.75),
        "restraint": clamp01(
            0.55 * (1.0 - clamp01((metrics["onsets_per_beat"] - 0.75) / 2.75))
            + 0.45 * metrics["bar_repeat_similarity"]
        ),
    }


@dataclass(frozen=True)
class Analysis:
    document: dict[str, Any]

    @property
    def metrics(self) -> dict[str, float]:
        return self.document["metrics"]


def analyze_audio(path: Path, group: str | None = None) -> Analysis:
    stereo, sample_rate = librosa.load(path, sr=TARGET_SAMPLE_RATE, mono=False)
    if stereo.ndim == 1:
        stereo = np.stack([stereo, stereo])
    elif stereo.shape[0] > 2:
        stereo = stereo[:2]
    mono = np.mean(stereo, axis=0).astype(np.float64)
    duration = mono.size / sample_rate

    peak = float(np.max(np.abs(stereo)))
    signal_rms = float(np.sqrt(np.mean(stereo**2)))
    crest_db = 20.0 * math.log10((peak + EPSILON) / (signal_rms + EPSILON))
    meter = pyln.Meter(sample_rate)
    try:
        integrated_lufs = float(meter.integrated_loudness(stereo.T))
    except ValueError:
        integrated_lufs = -70.0
    mid = 0.5 * (stereo[0] + stereo[1])
    side = 0.5 * (stereo[0] - stereo[1])
    side_mid_ratio = float(np.sqrt(np.mean(side**2)) / (np.sqrt(np.mean(mid**2)) + EPSILON))
    stereo_correlation = float(np.corrcoef(stereo[0], stereo[1])[0, 1])

    stft = librosa.stft(mono, n_fft=N_FFT, hop_length=HOP_LENGTH)
    power = np.abs(stft) ** 2
    frequencies = librosa.fft_frequencies(sr=sample_rate, n_fft=N_FFT)
    envelopes = band_envelopes(power, frequencies)
    total_band_energy = sum(float(np.mean(value)) for value in envelopes.values()) + EPSILON
    band_shares = {name: float(np.mean(value)) / total_band_energy for name, value in envelopes.items()}

    harmonic, percussive = librosa.effects.hpss(mono)
    percussive_ratio = float(np.sum(percussive**2) / (np.sum(mono**2) + EPSILON))
    onset_envelope = librosa.onset.onset_strength(y=mono, sr=sample_rate, hop_length=HOP_LENGTH)
    raw_tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_envelope, sr=sample_rate, hop_length=HOP_LENGTH, trim=False
    )
    raw_bpm = finite(raw_tempo, 128.0)
    bpm = normalize_tempo(raw_bpm)
    beat_frames = np.asarray(beat_frames, dtype=int)
    if bpm != raw_bpm and beat_frames.size:
        if raw_bpm < 100.0:
            expanded: list[int] = []
            for left, right in zip(beat_frames[:-1], beat_frames[1:]):
                expanded.extend([int(left), int(round((left + right) / 2))])
            beat_frames = np.asarray(expanded + [int(beat_frames[-1])])
        elif raw_bpm > 160.0:
            beat_frames = beat_frames[::2]
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=HOP_LENGTH)
    intervals = np.diff(beat_times)
    tempo_stability = clamp01(1.0 - float(np.std(intervals) / (np.mean(intervals) + EPSILON)) * 5.0) if intervals.size else 0.0

    low_envelope = envelopes["sub"] + envelopes["bass"]
    low_attack = np.maximum(0.0, np.diff(np.log1p(low_envelope), prepend=0.0))
    phase_scores = []
    for phase in range(4):
        indices = beat_frames[phase::4]
        indices = indices[indices < low_attack.size]
        phase_scores.append(float(np.mean(low_attack[indices])) if indices.size else 0.0)
    downbeat_phase = int(np.argmax(phase_scores))
    downbeat_frames = beat_frames[downbeat_phase::4]
    slices = bar_slices(downbeat_frames, power.shape[1])

    low_profile = step_profile(low_envelope, slices)
    high_profile = step_profile(envelopes["presence"] + envelopes["air"], slices)
    onset_profile = step_profile(onset_envelope, slices)
    low_profile, high_profile, onset_profile, sixteenth_phase = align_step_profiles(
        low_profile, high_profile, onset_profile
    )
    quarter_steps = (0, 4, 8, 12)
    offbeat_steps = (2, 6, 10, 14)
    backbeat_steps = (4, 12)
    kick_quarter = float(np.mean([low_profile[index] for index in quarter_steps]))
    hat_offbeat = float(np.mean([high_profile[index] for index in offbeat_steps]))
    backbeat = float(np.mean([onset_profile[index] for index in backbeat_steps]))

    rms = librosa.feature.rms(S=np.abs(stft))[0]
    centroid = librosa.feature.spectral_centroid(S=np.abs(stft), sr=sample_rate)[0]
    bandwidth = librosa.feature.spectral_bandwidth(S=np.abs(stft), sr=sample_rate)[0]
    flatness = librosa.feature.spectral_flatness(S=power)[0]
    rolloff = librosa.feature.spectral_rolloff(S=np.abs(stft), sr=sample_rate, roll_percent=0.85)[0]
    chroma = librosa.feature.chroma_stft(S=power, sr=sample_rate, hop_length=HOP_LENGTH)
    key_label, key_confidence = estimate_key(chroma)
    matrix = bar_feature_matrix(envelopes, rms, centroid, chroma, onset_envelope, slices)
    distances = normalized_step_distances(matrix)
    bar_similarity = float(np.mean(np.exp(-distances))) if distances.size else 0.0
    eight_bar_recurrence = recurrence(matrix, 8)
    harmonic_matrix = matrix[:, -12:] if matrix.size else np.zeros((0, 12))
    timbral_matrix = matrix[:, : len(BANDS)] if matrix.size else np.zeros((0, len(BANDS)))
    harmonic_change = float(np.median(normalized_step_distances(harmonic_matrix))) if harmonic_matrix.size else 0.0
    timbral_change = float(np.median(normalized_step_distances(timbral_matrix))) if timbral_matrix.size else 0.0
    if distances.size >= 5:
        threshold = max(float(np.quantile(distances, 0.80)), 0.04)
        peaks, _ = find_peaks(distances, height=threshold, distance=4)
    else:
        peaks = np.zeros(0, dtype=int)
    section_changes_per_32 = float(len(peaks) * 32.0 / max(1, len(slices)))
    bar_rms = np.asarray([float(np.mean(rms[item])) for item in slices])
    phrase_energy_arc = phrase_arc(bar_rms)
    onset_times = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=HOP_LENGTH,
        units="time",
        backtrack=False,
    )
    beats_in_duration = duration * bpm / 60.0
    onsets_per_beat = float(len(onset_times) / max(1.0, beats_in_duration))

    metrics: dict[str, float] = {
        "duration_seconds": duration,
        "tempo_raw_bpm": raw_bpm,
        "tempo_bpm": bpm,
        "tempo_stability": tempo_stability,
        "integrated_lufs": integrated_lufs,
        "peak_dbfs": 20.0 * math.log10(peak + EPSILON),
        "crest_db": crest_db,
        "stereo_side_mid_ratio": side_mid_ratio,
        "stereo_correlation": stereo_correlation,
        "percussive_energy_ratio": percussive_ratio,
        "onsets_per_beat": onsets_per_beat,
        "kick_quarter_dominance": kick_quarter,
        "hat_offbeat_dominance": hat_offbeat,
        "backbeat_dominance": backbeat,
        "bar_repeat_similarity": bar_similarity,
        "eight_bar_recurrence": eight_bar_recurrence,
        "harmonic_change": harmonic_change,
        "timbral_change": timbral_change,
        "section_changes_per_32_bars": section_changes_per_32,
        "phrase_energy_arc": phrase_energy_arc,
        "spectral_centroid_hz": float(np.median(centroid)),
        "spectral_bandwidth_hz": float(np.median(bandwidth)),
        "spectral_flatness": float(np.median(flatness)),
        "spectral_rolloff_hz": float(np.median(rolloff)),
    }
    for band, share in band_shares.items():
        metrics[f"band_{band}"] = share
    metrics = {key: rounded(value) for key, value in metrics.items()}
    scores = {key: rounded(value, 4) for key, value in style_scores(metrics).items()}
    feature_vector = {key: metrics[key] for key in FEATURE_VECTOR_KEYS}
    stem_role = path.stem if path.stem in {"drums", "bass", "remaining"} else "full"
    inferred_group = (
        path.parent.name.split("--", 1)[0]
        if stem_role != "full"
        else path.stem.split("--", 1)[0]
    )
    document = {
        "schema": "quantumsetup.reference-analysis.v1",
        "analyzer_version": ANALYZER_VERSION,
        "path": str(path.resolve()),
        "sha256": sha256(path),
        "group": group or inferred_group,
        "stem_role": stem_role,
        "audio": {"sample_rate": sample_rate, "channels": int(stereo.shape[0])},
        "musical_grid": {
            "estimated_downbeat_phase": downbeat_phase,
            "estimated_sixteenth_phase": sixteenth_phase,
            "beat_count": int(beat_frames.size),
            "bar_count": len(slices),
            "key": key_label,
            "key_confidence": rounded(key_confidence),
        },
        "metrics": metrics,
        "style_scores": scores,
        "step_profiles": {
            "low_energy": low_profile,
            "high_energy": high_profile,
            "onset_strength": onset_profile,
        },
        "section_change_bars": [int(index + 1) for index in peaks],
        "feature_vector": feature_vector,
        "claim_boundary": (
            "Machine-listening evidence only. It does not establish subjective quality, originality, "
            "artist intent, or human listening acceptance."
        ),
    }
    return Analysis(document)


def analysis_markdown(document: dict[str, Any]) -> str:
    metrics = document["metrics"]
    scores = sorted(document["style_scores"].items(), key=lambda item: item[1], reverse=True)
    lines = [
        f"# Reference analysis: {Path(document['path']).stem}",
        "",
        f"- Group: `{document['group']}`",
        f"- SHA-256: `{document['sha256']}`",
        f"- Analyzer: `{document['analyzer_version']}`",
        "",
        "## Musical readout",
        "",
        f"- Tempo: {metrics['tempo_bpm']:.2f} BPM (raw estimate {metrics['tempo_raw_bpm']:.2f})",
        f"- Grid: {document['musical_grid']['bar_count']} complete inferred bars; downbeat phase {document['musical_grid']['estimated_downbeat_phase'] + 1}",
        f"- Tonal center hypothesis: {document['musical_grid']['key']} ({document['musical_grid']['key_confidence']:.2f} confidence)",
        f"- Loudness: {metrics['integrated_lufs']:.2f} LUFS; crest {metrics['crest_db']:.2f} dB",
        f"- Low-end share: {(metrics['band_sub'] + metrics['band_bass']) * 100:.1f}%",
        f"- Percussive energy ratio: {metrics['percussive_energy_ratio']:.2f}",
        f"- Bar repeat similarity: {metrics['bar_repeat_similarity']:.2f}; eight-bar recurrence {metrics['eight_bar_recurrence']:.2f}",
        f"- Section-change hypotheses: {document['section_change_bars'] or 'none in this excerpt'}",
        "",
        "## Strongest inferred traits",
        "",
    ]
    lines.extend(f"- {name.replace('_', ' ')}: {value:.2f}" for name, value in scores[:5])
    lines.extend(
        [
            "",
            "## Claim boundary",
            "",
            document["claim_boundary"],
            "",
        ]
    )
    return "\n".join(lines)


def analyze_many(paths: Iterable[Path], output_dir: Path) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    documents: list[dict[str, Any]] = []
    for path in paths:
        analysis = analyze_audio(path)
        name = (
            f"{path.parent.name}--{path.stem}"
            if path.stem in {"drums", "bass", "remaining"}
            else path.stem
        )
        (output_dir / f"{name}.analysis.json").write_text(json.dumps(analysis.document, indent=2) + "\n")
        (output_dir / f"{name}.analysis.md").write_text(analysis_markdown(analysis.document))
        documents.append(analysis.document)
    return documents


def load_documents(directory: Path) -> list[dict[str, Any]]:
    return [json.loads(path.read_text()) for path in sorted(directory.glob("*.analysis.json"))]


def mean_dictionary(documents: list[dict[str, Any]], key: str) -> dict[str, float]:
    names = documents[0][key].keys()
    return {name: rounded(np.mean([document[key][name] for document in documents])) for name in names}


def build_corpus(reference_dir: Path, output_path: Path) -> dict[str, Any]:
    documents = load_documents(reference_dir)
    if not documents:
        raise ValueError(f"No analysis JSON files found in {reference_dir}")
    grouped: dict[str, list[dict[str, Any]]] = {}
    for document in documents:
        grouped.setdefault(document["group"], []).append(document)
    groups = {}
    for name, items in grouped.items():
        groups[name] = {
            "sample_count": len(items),
            "metrics": mean_dictionary(items, "metrics"),
            "style_scores": mean_dictionary(items, "style_scores"),
            "feature_vector": mean_dictionary(items, "feature_vector"),
            "samples": [Path(item["path"]).name for item in items],
        }
    reference_matrix = np.asarray(
        [
            [document["feature_vector"][key] for key in FEATURE_VECTOR_KEYS]
            for document in documents
        ],
        dtype=float,
    )
    scaler = StandardScaler().fit(reference_matrix)
    result = {
        "schema": "quantumsetup.reference-corpus.v1",
        "analyzer_version": ANALYZER_VERSION,
        "sample_count": len(documents),
        "feature_keys": list(FEATURE_VECTOR_KEYS),
        "reference_scaler": {
            "mean": [rounded(value, 10) for value in scaler.mean_],
            "scale": [rounded(value, 10) for value in scaler.scale_],
            "fit_sample_count": len(documents),
        },
        "groups": groups,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n")
    markdown_path = output_path.with_suffix(".md")
    lines = ["# Reference-listener corpus", ""]
    for name, group in groups.items():
        traits = sorted(group["style_scores"].items(), key=lambda item: item[1], reverse=True)[:4]
        lines.extend(
            [
                f"## {name}",
                "",
                f"{group['sample_count']} excerpts; {group['metrics']['tempo_bpm']:.1f} BPM average; "
                f"{(group['metrics']['band_sub'] + group['metrics']['band_bass']) * 100:.1f}% low-end share.",
                "",
                "Strongest inferred traits: " + ", ".join(f"{key.replace('_', ' ')} {value:.2f}" for key, value in traits) + ".",
                "",
            ]
        )
    lines.extend(
        [
            "Machine-listening summaries are evidence for comparison, not human listening acceptance.",
            "",
        ]
    )
    markdown_path.write_text("\n".join(lines))
    return result


def compare_candidate(reference_corpus: Path, candidate_dir: Path, output_path: Path) -> dict[str, Any]:
    corpus = json.loads(reference_corpus.read_text())
    candidates = load_documents(candidate_dir)
    if not candidates:
        raise ValueError(f"No candidate analysis files found in {candidate_dir}")
    group_names = list(corpus["groups"])
    reference_vectors = np.asarray(
        [[corpus["groups"][name]["feature_vector"][key] for key in FEATURE_VECTOR_KEYS] for name in group_names]
    )
    candidate_vectors = np.asarray(
        [[document["feature_vector"][key] for key in FEATURE_VECTOR_KEYS] for document in candidates]
    )
    scaler_document = corpus.get("reference_scaler")
    if not scaler_document or corpus.get("feature_keys") != list(FEATURE_VECTOR_KEYS):
        raise ValueError("reference corpus must contain a matching reference-fitted feature scaler")
    center = np.asarray(scaler_document["mean"], dtype=float)
    scale = np.asarray(scaler_document["scale"], dtype=float)
    scale = np.where(scale > EPSILON, scale, 1.0)
    normalized_references = (reference_vectors - center) / scale
    normalized_candidates = (candidate_vectors - center) / scale
    comparisons = []
    for document, vector in zip(candidates, normalized_candidates):
        distances = np.linalg.norm(normalized_references - vector, axis=1) / math.sqrt(len(FEATURE_VECTOR_KEYS))
        ranked = sorted(zip(group_names, distances), key=lambda item: item[1])
        comparisons.append(
            {
                "candidate": Path(document["path"]).name,
                "nearest_reference": ranked[0][0],
                "normalized_distance": rounded(ranked[0][1]),
                "all_distances": {name: rounded(distance) for name, distance in ranked},
            }
        )
    result = {
        "schema": "quantumsetup.reference-comparison.v1",
        "analyzer_version": ANALYZER_VERSION,
        "feature_keys": list(FEATURE_VECTOR_KEYS),
        "scaler": "reference-corpus excerpts only",
        "comparisons": comparisons,
        "claim_boundary": "Relative feature distance only; lower is closer, not better or more original.",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2) + "\n")
    return result


def parse_fractions(value: str) -> list[float]:
    fractions = [float(part) for part in value.split(",")]
    if not fractions or any(fraction < 0.0 or fraction > 1.0 for fraction in fractions):
        raise argparse.ArgumentTypeError("fractions must be comma-separated values from 0 to 1")
    return fractions


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    subcommands = root.add_subparsers(dest="command", required=True)
    sample = subcommands.add_parser("sample", help="Extract deterministic interior WAV excerpts")
    sample.add_argument("manifest", type=Path)
    sample.add_argument("--out-dir", type=Path, required=True)
    sample.add_argument("--duration", type=float, default=72.0)
    sample.add_argument("--fractions", type=parse_fractions, default=parse_fractions("0.2,0.5,0.8"))
    analyze = subcommands.add_parser("analyze", help="Analyze WAV excerpts")
    analyze.add_argument("paths", nargs="+", type=Path)
    analyze.add_argument("--out-dir", type=Path, required=True)
    corpus = subcommands.add_parser("corpus", help="Aggregate analyzed excerpts by filename group")
    corpus.add_argument("analysis_dir", type=Path)
    corpus.add_argument("--output", type=Path, required=True)
    compare = subcommands.add_parser("compare", help="Compare candidate analyses with a reference corpus")
    compare.add_argument("reference_corpus", type=Path)
    compare.add_argument("candidate_dir", type=Path)
    compare.add_argument("--output", type=Path, required=True)
    return root


def main() -> None:
    arguments = parser().parse_args()
    if arguments.command == "sample":
        result = sample_reference_sets(arguments.manifest, arguments.out_dir, arguments.duration, arguments.fractions)
        print(json.dumps({"samples": len(result["records"]), "output": str(arguments.out_dir)}, indent=2))
    elif arguments.command == "analyze":
        require_core()
        documents = analyze_many(arguments.paths, arguments.out_dir)
        print(json.dumps({"analyzed": len(documents), "output": str(arguments.out_dir)}, indent=2))
    elif arguments.command == "corpus":
        require_core()
        result = build_corpus(arguments.analysis_dir, arguments.output)
        print(json.dumps({"samples": result["sample_count"], "groups": list(result["groups"])}, indent=2))
    elif arguments.command == "compare":
        require_core()
        result = compare_candidate(arguments.reference_corpus, arguments.candidate_dir, arguments.output)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
