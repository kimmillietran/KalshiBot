# PR-7.4 — Statistical Power Analysis

## Summary

Milestone 7.4 adds a descriptive power-analysis module that estimates whether existing research datasets are large enough to detect realistic per-market trading edges.

This does **not** modify replay, strategies, fills, execution, or research outputs.

## CLI

```bash
npm run research:power-analysis
```

| Flag | Default |
|------|---------|
| `--input-dir` | `data/research-results` |
| `--output` | `data/research-results/power-analysis.json` |

## Input

Reads per-strategy `aggregate-summary.json` files (via `discoverStrategyAggregateSummaries`), using completed per-market `totalPnlCents` samples.

## Output

Deterministic JSON with:

- Overall summary (strategy count, underpowered count, median required sample for 2¢ edge)
- Per-strategy statistics (sample size, variance, std dev, effect size, 95% CI)
- Power table for 80% / 90% / 95% power at α=0.05
- Required sample sizes for 1¢ / 2¢ / 5¢ / 10¢ average edges
- Recommendations (e.g. estimated markets required)

## Architecture

- Module: `src/lib/data/research/powerAnalysis/`
- CLI: `scripts/research/buildPowerAnalysis.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
