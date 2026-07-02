# PR: Replay Pricing Diagnostics (Zero-Price Guard)

## Summary

Adds **diagnostic-only** replay pricing warnings to research outputs. This milestone does **not** fix replay pricing, change strategy behavior, or redesign the replay engine.

## Problem

During the 50-market smoke test, decision traces showed strategies receiving `yesBid = 0`, `yesAsk = 0`, and `yesMid = 0` even when source Kalshi candles contained nonzero historical prices earlier in the market. That led to suspicious intents (for example buy-at-0) while aggregate metrics still showed zero trades/PnL.

## Solution

New module: `src/lib/data/research/diagnostics/`

`computeReplayPricingDiagnostics()` inspects:

- replay step `engineInput.pricing` (what strategies see each decision)
- bronze Kalshi candlestick records (source snapshot pricing)

### Metrics per run

- `decisionCount`
- `zeroPriceDecisionCount` / `nonZeroPriceDecisionCount`
- `percentZeroPriceDecisions`
- `firstDecisionPrice` / `lastDecisionPrice`
- `observedYesPriceRange` (decision trace)
- `sourceSnapshotYesPriceRange` (bronze candles)
- `sourceKalshiCandleCount`
- `currentCandleCount` (latest replay snapshot candle count)
- `sourceKalshiCandleClassification` (missing / synthesized zero / legitimate zero / nonzero)

### Warnings (non-fatal)

| Code | When |
|------|------|
| `all-zero-decision-prices` | Every decision priced at 0/0/0 |
| `source-nonzero-decisions-zero` | Source candles had nonzero YES prices but all decisions are zero |
| `single-decision-multiple-source-candles` | One replay decision but multiple source candles |
| `synthesized-zero-decision-from-source` | All-zero decisions with synthesized zero close-only source quotes |
| `missing-price-in-decisions` | All-zero decisions with missing bid/ask in source |
| `legitimate-terminal-zero-price` | Info when terminal zero may be expected after earlier nonzero source prices |

Equal nonzero bid/ask (for example 50/50) is **not** flagged as invalid.

## Output wiring

- `research-output.json` — top-level `diagnostics` object (alongside `dataset`, `researchRun`, `metadata`)
- `sweep-summary.json` — optional per-run `pricingDiagnostics` summary on successful sweep jobs

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Note

Pricing replay fixes remain out of scope for this PR (Builder 1). These diagnostics make suspicious zero-price replay obvious in research artifacts and sweep summaries.
