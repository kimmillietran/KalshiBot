# PR-6.8B — Research Comparison Framework

## Summary

Milestone 6.8B adds a deterministic framework for comparing completed `ResearchExperimentResult` objects with attached backtest metrics.

**Comparison only** — no experiment execution, optimization, persistence, or dashboard wiring.

## Architecture

```
ResearchExperimentResultWithMetrics[]
        ↓
Metric extraction + validation
        ↓
Deterministic overall ranking
        ↓
Per-metric dominance + metric table
        ↓
ResearchComparison
```

## Comparison metrics

| Metric | Source field | Direction |
|---|---|---|
| Final Equity | `metrics.endEquityCents` | Higher is better |
| Total Return | `metrics.totalReturnPct` | Higher is better |
| CAGR | `metrics.annualizedReturnPct` | Higher is better |
| Sharpe | `metrics.sharpeRatio` | Higher is better |
| Max Drawdown | `metrics.maxDrawdownPct` | Lower is better |
| Profit Factor | `metrics.profitFactor` | Higher is better |
| Win Rate | `metrics.winRatePct` | Higher is better |
| Expectancy | `metrics.expectancyCents` | Higher is better |
| Trade Count | `metrics.tradeCount` | Higher is better |

Null Sharpe, CAGR, and profit factor values sort as worst-in-class for dominance and tie-break comparisons.

## Overall ranking tie-breaks

1. Final Equity (descending)
2. Sharpe (descending)
3. Max Drawdown (ascending)
4. Experiment id (lexicographic)

Input array order is never used for ranking.

## API

```typescript
import { compareResearchExperiments } from "@/lib/data/research/comparison";

const comparison = compareResearchExperiments(completedExperiments);
```

## Output contents

| Field | Description |
|---|---|
| `winner` | Top-ranked experiment (includes tie group) |
| `rankings` | Ordered `RankedExperiment[]` with competition ranks |
| `summary` | Winner id(s) and metric leader summary |
| `metricTable` | Rows sorted by `experimentId` |
| `dominance` | Per-metric leader ids and direction |
| `ties` | Overall rank groups with more than one experiment |

## Error codes

| Code | Trigger |
|---|---|
| `empty-experiments` | No results supplied |
| `invalid-experiment-status` | Result status is not `completed` |
| `invalid-experiment-metrics` | Non-finite or invalid metric values |
| `duplicate-experiment-id` | Duplicate `experimentId` in input |

## Deterministic guarantees

- No `Date.now()`, randomness, or hidden mutable state
- Rankings independent of input array order
- `serializeResearchComparison()` uses `stableStringify`
- Outputs are deeply frozen

## Out of scope

- Experiment execution
- Parameter sweeps / walk-forward / Monte Carlo
- CLI / persistence / dashboard
- Strategy optimization

## Future integration

- Parameter sweep and walk-forward milestones can pipe completed experiment results directly into `compareResearchExperiments()`
- Research report layer can consume `ResearchComparison` for side-by-side experiment summaries

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
