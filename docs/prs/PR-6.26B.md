# PR-6.26B — Probability Calibration Report

## Summary

Milestone 6.26B adds calibration reporting for research sweep outputs. Reports compare Kalshi implied probabilities and strategy fair-value estimates against settled market outcomes.

## Metrics

Each calibration channel reports:

| Metric | Description |
|--------|-------------|
| Brier score | Mean squared error between predicted probability and settlement outcome |
| Log loss | Cross-entropy loss with epsilon-clamped probabilities |
| Calibration error (ECE) | Weighted average absolute gap between bin mean prediction and observed frequency |
| Reliability table | Bin label, sample count, predicted mean, observed frequency, calibration gap |
| Sample counts | Total observations, market count, per-channel counts, skip counts |

## Probability sources

| Channel | Source |
|---------|--------|
| `kalshi-implied` | `(yesBidCents + yesAskCents) / 2 / 100` from dataset `kalshiCandles[]` |
| `strategy-fair-value` | `engineOutput.probability.probabilityUp` from replay steps |

## Input layout

Strategy-aware sweep output (preferred):

```
data/research-results/<strategyId>/<series>/<market>/research-output.json
```

Legacy aggregate layout (fallback):

```
data/research-results/<series>/<market>/research-output.json
```

## Output layout

```
data/research-results/<strategyId>/<series>/calibration-report.json
```

## CLI

```bash
npm run research:calibration
npm run research:calibration -- --input-dir data/research-results --output-dir data/research-results
```

## Validation behavior

| Condition | Behavior |
|-----------|----------|
| Empty input tree | Fail with `empty-dataset` |
| Duplicate market for strategy/series | Fail with `duplicate-market` |
| Missing settlement | Warning; market skipped from observations |
| Missing probabilities | Warning; affected channel omitted or reduced |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
