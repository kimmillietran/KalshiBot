# PR-7.2 — Lead-Lag Analysis

## Summary

Milestone 7.2 adds a descriptive research module that measures whether Coinbase BTC spot movements systematically lead Kalshi implied probability movements across replay datasets.

This is **not** a trading strategy — it produces a deterministic diagnostic report only.

## CLI

```bash
npm run research:lead-lag
```

Defaults:

| Flag | Default |
|------|---------|
| `--input-dir` | `data/research-results` |
| `--output` | `data/research-results/lead-lag-analysis.json` |

## Architecture

```
research-output.json (replay steps)
        ↓
extractLeadLagCandlesFromResearchOutput
        ↓
computeLeadLagMetricsForCandles (lag 0..10)
        ↓
lead-lag-analysis.json
```

- Module: `src/lib/data/research/leadLag/`
- CLI: `scripts/research/buildLeadLagAnalysis.ts`

## Metrics per lag (0–10 candles)

- `correlation` — Pearson r between BTC % changes and lagged Kalshi probability changes
- `crossCorrelation` — normalized cross-correlation at the lag
- `direction` — `synchronous` (lag 0), `btc-leads-kalshi` (lag > 0), or `insufficient-data`
- `observationCount` — aligned candle pairs used

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
