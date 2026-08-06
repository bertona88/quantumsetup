# QuantumSetup reference-listener iteration

Matched captures: 6. Structural mean nearest distance: 2.8987 -> 2.8835 (delta -0.0153).

## Direct measurements

| Metric | Before | After | Delta | Reference group range |
| --- | ---: | ---: | ---: | ---: |
| tempo_bpm | 133.929 | 128.968 | -4.96032 | 122.283–131.899 |
| onsets_per_beat | 2.0897 | 2.27014 | +0.180446 | 2.60958–3.42785 |
| kick_quarter_dominance | 3.07126 | 2.90802 | -0.163237 | 1.73479–2.09352 |
| hat_offbeat_dominance | 0.339965 | 0.979932 | +0.639967 | 1.07231–1.35868 |
| bar_repeat_similarity | 0.296153 | 0.337408 | +0.041255 | 0.41832–0.59614 |
| eight_bar_recurrence | 0.302272 | 0.313752 | +0.01148 | 0.32237–0.33485 |
| harmonic_change | 0.975383 | 0.92731 | -0.048073 | 0.53394–0.79103 |
| timbral_change | 1.1702 | 1.01397 | -0.156235 | 0.12983–0.60931 |
| section_changes_per_32_bars | 3.33431 | 2.59843 | -0.735882 | 2.01801–2.55666 |
| phrase_energy_arc | 0.042018 | 0.030958 | -0.01106 | 0.13899–0.21397 |
| spectral_centroid_hz | 217.258 | 445.004 | +227.746 | 2037.03–3009.68 |
| spectral_rolloff_hz | 160.156 | 369.141 | +208.984 | 4917.97–6599.61 |
| crest_db | 10.6213 | 11.4635 | +0.842194 | 11.0359–13.3131 |
| stereo_side_mid_ratio | 0.003683 | 0.011055 | +0.007372 | 0.00127–0.38199 |
| integrated_lufs | -20.0753 | -19.5483 | +0.52705 | -26.2178–-10.1449 |
| band_sub | 0.765178 | 0.75038 | -0.014798 | 0.59511–0.72968 |
| band_bass | 0.227263 | 0.241102 | +0.013839 | 0.24757–0.37442 |
| band_body | 6.5e-05 | 0.00014 | +7.5e-05 | 0.00153–0.00192 |
| band_presence | 3e-06 | 1.5e-05 | +1.2e-05 | 0.00026–0.00056 |
| band_air | 0 | 1e-05 | +1e-05 | 7e-05–0.00016 |

## Learned representation similarity

| Model | Reference group | Before | After | Delta |
| --- | --- | ---: | ---: | ---: |
| MERT | ann-clue-cercle-2024 | 0.738611 | 0.746176 | +0.007565 |
| MERT | dixon-cercle-2024 | 0.745128 | 0.753730 | +0.008602 |
| MERT | sven-vath-time-warp-2023 | 0.720721 | 0.728602 | +0.007881 |
| CLAP | ann-clue-cercle-2024 | 0.639036 | 0.650101 | +0.011065 |
| CLAP | dixon-cercle-2024 | 0.601042 | 0.624393 | +0.023351 |
| CLAP | sven-vath-time-warp-2023 | 0.631027 | 0.633257 | +0.002230 |

## Boundaries

This is reproducible machine-listening evidence, not literal hearing. The component captures are exact engine buses; the reference stems are model estimates. Human listening remains the acceptance gate.
