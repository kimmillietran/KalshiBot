# PR-5.2 — Feature Builder Foundation

## Summary

Milestone 5.2 adds a **pure feature extraction library** under `src/lib/features/`. The library converts raw BTC/Kalshi inputs into a deterministic `MarketFeatureVector`. It does not make trading decisions, compute probabilities, or calculate EV.

Dashboard wiring, `evaluate.ts`, providers, and BFF routes are **unchanged**.

## Architecture

| Module | Responsibility |
|--------|----------------|
| `types.ts` | Input/output types, `MarketFeatureVector` |
| `targetDistance.ts` | Distance, percent-to-target, recent cross detection |
| `candleFeatures.ts` | Last candle direction, higher highs/lows |
| `momentum.ts` | Recent momentum, velocity, acceleration |
| `volatility.ts` | Rolling volatility / coefficient of variation |
| `trend.ts` | Linear-regression trend strength |
| `marketFeatures.ts` | Time remaining, spread, liquidity, volume + vector builder |
| `normalize.ts` | Stable normalization helpers |
| `index.ts` | Public barrel |

## Purity constraints

- Pure functions only — no React, hooks, fetch, or `Date.now()`
- Caller supplies `evaluatedAtMs` and candle timestamps
- No imports from `src/features/*`
- Reuses `LiquidityQuality` from domain types only

## Public API

```typescript
import { buildMarketFeatureVector } from "@/lib/features";

const vector = buildMarketFeatureVector({
  evaluatedAtMs: Date.parse("2026-06-26T12:00:00.000Z"),
  spotPrice: 64_250,
  candles: [...],
  market: { strikePrice: 64_225, timeRemainingMs: 600_000, closeTime: "..." },
  pricing: { yesBidCents: 62, yesAskCents: 64, ... },
});
```

## Feature functions

| Function | Output |
|----------|--------|
| `distanceToTarget` | Absolute/signed distance, above/below flag |
| `percentToTarget` | Signed percent from strike |
| `crossedTargetRecently` | Cross direction + bars ago |
| `lastCandleDirection` | up / down / flat |
| `higherHighs` / `higherLows` | Consecutive structure streak |
| `rollingVolatility` | Std dev + CV |
| `recentMomentum` | Change over window |
| `priceVelocity` / `priceAcceleration` | Rate of change |
| `trendStrength` | Score, direction, slope |
| `minutesUntilSettlement` / `contractTimeRemaining` | Time features |
| `spreadPercent` | YES/NO spread as percent of ask |
| `liquidityScore` / `volumeBucket` | Contract liquidity features |

## Tests

Heavy unit coverage with edge cases:

- Empty / single candle series
- Flat, rising, falling markets
- Zero and wide spreads
- Expired contracts
- Below-target (negative distance)
- Target cross detection
- Stable normalization
- Deterministic vector assembly

## Files created

| Path | Purpose |
|------|---------|
| `src/lib/features/*.ts` | Feature modules + barrel |
| `src/lib/features/*.test.ts` | Unit tests |
| `docs/prs/PR-5.2.md` | This file |

## Minor fix (build)

`hasBtcSpot` / `hasContractPricing` in `snapshot/types.ts` narrowed to proper type guards so `evaluate.ts` type-checks without modification.

## Deferred

- Orchestrator mapping live feeds → `FeatureExtractionInput`
- Engine consumption of `MarketFeatureVector`
- Probability model (Milestone 5+)

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Review checklist

- [ ] No side effects or networking in `src/lib/features/`
- [ ] `buildMarketFeatureVector` deterministic for identical inputs
- [ ] Feature outputs typed and documented
- [ ] Edge-case tests cover empty candles, expired market, zero spread
