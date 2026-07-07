# PR 9.41 — Derived Settlement Sensitivity Audit

## Summary

Adds a read-only audit that measures how much **derived `expiration_value` settlements** influence hypothesis validation metrics. For each hypothesis, compares robustness, calibration, and pass/fail status using **all observations** versus **official-settlement observations only**.

Does **not** modify hypothesis validation scores, candidate generation, imports, replay, or promotion logic.

## CLI

```bash
npm run research:derived-sensitivity
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/derived-settlement-sensitivity.json` |
| `--html-output` | `data/reports/derived-settlement-sensitivity.html` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--research-results-dir` | `data/research-results` |
| `--regime-tags` | `data/research-results/regime-tags.json` |

## Per-hypothesis fields

- Robustness with all observations (from `hypothesis-validation.json`)
- Robustness excluding derived-settlement observations (recomputed via `validateCandidate`)
- Observation counts before/after
- Signed calibration error before/after
- Pass/fail before/after
- `deltaRobustness`, `deltaCalibration`
- Recommendation: `robust` | `moderately-sensitive` | `highly-sensitive` | `dominated-by-derived-data`

## Summary fields

- Hypotheses affected (any derived observations in bucket)
- Largest robustness drop and hypothesis id
- Counts becoming stronger/weaker when derived data excluded
- Derived market count scanned from research outputs

## Architecture

```
hypothesis-validation.json ────────┐
hypothesis-candidates.json ────────┼→ discover derived market keys
research-results/**/research-output.json ─┘      ↓
                                         filter observations + validateCandidate
                                                  ↓
                         derived-settlement-sensitivity.json
                         derived-settlement-sensitivity.html
```

- Module: `src/lib/data/research/derivedSettlementSensitivity/`
- CLI: `scripts/research/buildDerivedSettlementSensitivity.ts`
- Settlement flag reader: `src/lib/data/research/settlement/readResearchOutputSettlement.ts` (reads `qualityFlags` / `quality_flags` on settlement records)

Derived markets are identified by `DataQualityFlag.DERIVED_EXPIRATION_VALUE` on the resolved settlement snapshot in each `research-output.json`.

## Test plan

- [x] Settlement quality flag detection on dataset snapshots
- [x] Derived market key discovery from research output paths
- [x] Sensitivity recommendation classification
- [x] Per-hypothesis delta metrics
- [x] Report + HTML serialization
- [x] CLI smoke with missing inputs
- [x] `npm run lint`, `npm run test`, `npm run build`

## Related

- M9.38 — opt-in derived `expiration_value` import support
- M9.40 — hypothesis failure analysis (`inspect-derived-data-sensitivity` action)
