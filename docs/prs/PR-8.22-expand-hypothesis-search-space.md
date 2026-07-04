# PR-8.22 — Expand Hypothesis Search Space

## Summary

M8.22 broadens hypothesis discovery by adding multi-axis mispricing atlas buckets, bidirectional over/under confidence candidates, configurable per-group sample thresholds, and unique-trading-day filtering before synthesis.

## New bucket combinations

| Group | Axes |
|-------|------|
| `probabilityTime` | probability × time remaining (existing) |
| `probabilityMoneyness` | probability × moneyness |
| `moneynessTime` | moneyness × time remaining |
| `volatilityMoneyness` | volatility × moneyness |
| `volatilityProbabilityTime` | volatility × probability × time (higher default min sample: 45) |

## CLI

```bash
npm run research:hypotheses
```

New flags:

| Flag | Default |
|------|---------|
| `--min-unique-days` | `2` |

## Candidate metadata

Each atlas-derived candidate now includes structured `bucketMetadata` (group, bucket id/label, observations, unique trading days, calibration error, direction).

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Multi-axis bucket parsing and observation matching
- [x] Per-group sample thresholds (triple-axis default)
- [x] Unique trading day filtering
- [x] Over/under candidate generation
- [x] HTML report renders moneyness/volatility/bucket group fields
- [x] `npm run lint`, `npm run test`, `npm run build`
