# PR-5.3B — Engine Guard Layer

## Summary

Milestone 5.3B adds `runEvaluationGuards()` — 15 ordered safety guards enforcing `EngineConfig` thresholds before feature extraction or model logic. Guard failures return **NO TRADE**, a reasoning trace with clear `detail`, `features: null`, and `gatesTriggered: readonly GuardStepId[]`.

When all guards pass, the engine still returns **NO TRADE** (probability model deferred).

**Base:** `main` (includes 5.3A feature vector integration).

## Architecture

| Module | Responsibility |
|--------|----------------|
| `guards/evaluationGuards.ts` | Ordered guard runner with short-circuit |
| `guards/pricing.ts` | Liquidity rank + spread helpers |
| `evaluate.ts` | Guards → feature extraction → model stub |

## Guard order (fixed)

1. `guard-config-enabled`
2. `guard-market-present`
3. `guard-market-lifecycle`
4. `guard-strike-present`
5. `guard-contract-expired`
6. `guard-settlement-window`
7. `guard-btc-present`
8. `guard-btc-feed-loading`
9. `guard-btc-feed-error`
10. `guard-btc-feed-stale`
11. `guard-btc-fallback-source`
12. `guard-btc-candles`
13. `guard-pricing-present`
14. `guard-liquidity-minimum`
15. `guard-spread-maximum`

## EngineConfig enforcement

| Field | Default | Guard |
|-------|---------|-------|
| `enabled` | `true` | `guard-config-enabled` |
| `minLiquidityQuality` | `"Fair"` | `guard-liquidity-minimum` |
| `maxSpreadPercent` | `15` | `guard-spread-maximum` |
| `minimumTimeRemaining` | `60_000` ms | `guard-settlement-window` |
| `minimumCandles` | `2` | `guard-btc-candles` |

## Feed status policy

The orchestrator may pass any `BtcFeedStatus`, but `evaluate()` blocks:

| `feedStatus` | Guard | Summary |
|--------------|-------|---------|
| `loading` | `guard-btc-feed-loading` | BTC feed loading — no trade |
| `error` | `guard-btc-feed-error` | BTC feed error — no trade |
| `stale` | `guard-btc-feed-stale` | Stale BTC feed — no trade |
| `fallback` (or `providerSource=fallback`) | `guard-btc-fallback-source` | BTC fallback source — no trade |

Only `live` upstream feeds proceed past feed guards.

## TradeDecision

```typescript
type TradeDecision = {
  features: MarketFeatureVector | null;
  gatesTriggered?: readonly GuardStepId[]; // omitted when all guards pass
};
```

## Spread guard

`guard-spread-maximum` fails when:

- Computed spread exceeds `maxSpreadPercent`, or
- Bid/ask quotes are insufficient to compute spread (mid-only pricing)

## Tests

- `guards/pricing.test.ts` — liquidity rank, spread math
- `guards/evaluationGuards.test.ts` — ordering, short-circuit, loading/error
- `evaluate.test.ts` — integration including config disabled, lifecycle, BTC null, spread unavailable

## Deferred

- Probability model, EV, Kelly, recommendation policy (5.4+)
- `minEdgePercent` enforcement

## Quality gates

```bash
npm run lint && npm run test && npm run build
```
