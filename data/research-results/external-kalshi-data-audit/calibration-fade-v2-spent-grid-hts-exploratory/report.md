# kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0

Exploratory SPENT_VALIDATION grid-entry hold-to-settlement simulation on M16-ER retained friction observations. Simulated P&L at observed quotes only — not live fills, not confirmatory, not pristine. Does not modify or rerun continuous-first-crossing calibration-fade v2. A negative grid result does not reject continuous-first-crossing; a positive result does not establish live fillability.

## Economic result (primary)

| Metric | Value |
| --- | ---: |
| N (evaluable markets) | 321 |
| G (UTC entry-day clusters) | 24 |
| Mean net P&L ¢/contract | -8.6417 |
| Median net P&L ¢ | -43.0000 |
| Total simulated net P&L ¢ | -2774.0000 |
| Mean gross P&L ¢ | -6.6417 |
| Mean entry fee ¢ | 2.0000 |
| Mean entry price (noAsk) ¢ | 50.5670 |
| NO settlement rate | 0.4393 |
| CR2 SE ¢ | 1.7435 |
| Two-sided 95% CI ¢ | [-12.2485, -5.0350] |
| df (G−1) | 23 |

### Interpretation

- **Status:** `evidence-against-positive-mean`
- CI upper bound -5.0350¢ ≤ 0 under CR2 df=G−1 assumptions for this grid variant.

## Coverage

| Metric | Count |
| --- | ---: |
| Rows scanned | 47307 |
| Eligible rows | 1128 |
| Selected markets | 321 |
| Evaluable markets | 321 |
| Unevaluable markets | 0 |
| Selected with half-spread mismatch | 0 |
| Selected Class B uncertain | 0 |

Exclusion counts: `{"cited-high-vol-false-or-missing":43730,"book-feature-not-ok":26,"yes-midpoint-out-of-range":2423,"label:missing-label":0,"label:invalid-result":0,"label:conflicting-labels":0}`

## Execution limitations

- Simulated P&L at observed displayed noAskCents — not confirmed live fills
- Quote-age / exchange-vs-receive freshness not present on preentry-feature rows
- 315/321 selected entries have yesBidSize ≥ 1; remaining size evidence missing or <1
- Population is the retained 60s friction-admission grid, not continuous quote coverage
- Hold-to-settlement charges one STANDARD taker entry fee only (no exit/round-trip fee)

## Prior evidence notes

- Sealed calibration-fade-v2 forward-validation / atlas artifacts are absent under data/research-results/calibration-fade-v2/ in this checkout — cannot verify the reported five-market unfavorable calibration-gap result with zero executable fee-adjusted evaluations against retained report files here.
- Hypothesis config minimumEvidenceRequirements.minimumIndependentCandidateMarkets = 5; classificationRules include forward-rejects-hypothesis — design intent only without sealed run artifacts.
- M16-ER fee-adjusted mean ≈ −4.427¢ (N=461, G=34) is a different strategy family (documented in m17-prep-m16p-suspension.md); not this grid variant.
- All 34 SPENT days are SPENT_VALIDATION; no pristine subset.

## Per-day clusters

| UTC day | Markets | Mean net ¢ | Total net ¢ |
| --- | ---: | ---: | ---: |
| 2026-08-19 | 19 | -0.7368 | -14.0000 |
| 2026-08-20 | 21 | -4.9048 | -103.0000 |
| 2026-08-21 | 60 | -8.0500 | -483.0000 |
| 2026-08-22 | 11 | -17.0000 | -187.0000 |
| 2026-08-23 | 6 | -38.0000 | -228.0000 |
| 2026-08-24 | 21 | -9.3810 | -197.0000 |
| 2026-08-25 | 22 | -7.7273 | -170.0000 |
| 2026-08-26 | 6 | -49.5000 | -297.0000 |
| 2026-08-27 | 13 | -0.8462 | -11.0000 |
| 2026-08-28 | 12 | -2.4167 | -29.0000 |
| 2026-08-30 | 5 | 9.2000 | 46.0000 |
| 2026-08-31 | 11 | -27.3636 | -301.0000 |
| 2026-09-01 | 7 | -4.8571 | -34.0000 |
| 2026-09-02 | 4 | -3.5000 | -14.0000 |
| 2026-09-03 | 13 | -12.4615 | -162.0000 |
| 2026-09-04 | 12 | 3.4167 | 41.0000 |
| 2026-09-07 | 1 | -48.0000 | -48.0000 |
| 2026-09-10 | 9 | 15.6667 | 141.0000 |
| 2026-09-11 | 15 | -10.4000 | -156.0000 |
| 2026-09-15 | 14 | -4.5000 | -63.0000 |
| 2026-09-16 | 12 | -9.5000 | -114.0000 |
| 2026-09-17 | 4 | -27.5000 | -110.0000 |
| 2026-09-19 | 1 | 48.0000 | 48.0000 |
| 2026-09-21 | 22 | -14.9545 | -329.0000 |

## Leave-one-day-out means (descriptive)

| Held-out day | N remaining | Mean net ¢ |
| --- | ---: | ---: |
| 2026-08-19 | 302 | -9.1391 |
| 2026-08-20 | 300 | -8.9033 |
| 2026-08-21 | 261 | -8.7778 |
| 2026-08-22 | 310 | -8.3452 |
| 2026-08-23 | 315 | -8.0825 |
| 2026-08-24 | 300 | -8.5900 |
| 2026-08-25 | 299 | -8.7090 |
| 2026-08-26 | 315 | -7.8635 |
| 2026-08-27 | 308 | -8.9708 |
| 2026-08-28 | 309 | -8.8835 |
| 2026-08-30 | 316 | -8.9241 |
| 2026-08-31 | 310 | -7.9774 |
| 2026-09-01 | 314 | -8.7261 |
| 2026-09-02 | 317 | -8.7066 |
| 2026-09-03 | 308 | -8.4805 |
| 2026-09-04 | 309 | -9.1100 |
| 2026-09-07 | 320 | -8.5188 |
| 2026-09-10 | 312 | -9.3429 |
| 2026-09-11 | 306 | -8.5556 |
| 2026-09-15 | 307 | -8.8306 |
| 2026-09-16 | 309 | -8.6084 |
| 2026-09-17 | 317 | -8.4038 |
| 2026-09-19 | 320 | -8.8187 |
| 2026-09-21 | 299 | -8.1773 |

## Attestation

- Simulated P&L at observed quotes: true
- No purchase / subscription / live trade / capture
- Continuous-first-crossing hypothesis config not modified
- No threshold sweep / vol ablation / avg_60s strategy feature

Code authority SHA: `30dee7161cfecaa06510db8faf798efb21c77e0a`
Generated (UTC): 2026-09-26T01:50:03.339Z
