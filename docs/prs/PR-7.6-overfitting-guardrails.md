# PR-7.6 — Overfitting Guardrails

## Summary

Milestone 7.6 adds registry-wide overfitting diagnostics so leaderboards and sweeps do not become a false-discovery machine. This is **analysis-only** — no replay or strategy behavior changes.

The report aggregates experiment registry counts, strategy-family best results, family-wise multiple-testing corrections, Benjamini-Hochberg FDR, a rank-degradation backtest-overfitting approximation when fold data exists, and a simplified deflated-Sharpe hair-cut when Sharpe data is available.

## CLI

```bash
npm run research:overfitting-diagnostics
```

Defaults:

| Flag | Default |
|------|---------|
| `--input-dir` | `data/research-results` |
| `--experiments-root` | `data/experiments` |
| `--output` | `data/research-results/overfitting-diagnostics.json` |

## Inputs

- `data/experiments` — optional experiment registry (`experiment.json` per experiment)
- `data/research-results` — strategy-scoped `aggregate-summary.json` trees
- `statistical-significance.json` — optional; enables p-value and FDR corrections
- Walk-forward summaries — optional; enables rank-degradation PBO approximation

## Output sections

| Section | Status when insufficient |
|---------|--------------------------|
| `evaluationScope` | Always computed (may be zero) |
| `experimentRegistry` | Graceful zero counts + warning when missing |
| `strategyFamilies` | Best observed PnL per family |
| `multipleTesting` | `unavailable` without p-values or <2 families |
| `backtestOverfitting` | `unavailable` without ≥2 folds and ≥2 variants |
| `deflatedSharpe` | `unavailable` without Sharpe data or multiple trials |

Computed vs unavailable metrics are explicitly distinguished via `status: "computed" | "unavailable"` and per-section `warnings`.

## Architecture

```
data/experiments + data/research-results
        ↓
discoverExperimentRegistry + discoverStrategyAggregateSummaries
        ↓
loadStatisticalSignificanceReport (optional)
        ↓
computeMultipleTestingAdjustments / computePboDiagnostic / computeDeflatedSharpe
        ↓
overfitting-diagnostics.json
```

- Module: `src/lib/data/research/overfittingDiagnostics/`
- CLI: `scripts/research/buildOverfittingDiagnostics.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
