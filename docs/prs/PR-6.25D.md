# PR-6.25D — Kalshi Fee Schedule Model

## Summary

Milestone 6.25D extends the 6.25A execution cost model with a configurable Kalshi fee schedule while preserving the existing backtest fill abstraction and `costModelConfig` override semantics.

## Execution cost models

| Model | Config | Behavior |
|-------|--------|----------|
| `zero` | `{ kind: "zero" }` | No execution fees |
| `per-contract-fee` | `{ kind: "per-contract-fee", feeCentsPerContract }` | Legacy flat fee (`fee × quantity`) |
| `kalshi-fee-schedule` | `{ kind: "kalshi-fee-schedule", role, schedule? }` | Kalshi probability-weighted schedule |

Configure via fixture `costModelConfig.executionCostModel`. Legacy `fillConfig.feeCentsPerContract` still resolves when `costModelConfig` is absent; explicit `costModelConfig` overrides legacy fill config.

## Kalshi fee assumptions

Fees follow Kalshi's published quadratic schedule:

```
feeDollars = multiplier × quantity × P × (1 - P)
feeCents = ceil(feeDollars × 100)
```

Where `P = priceCents / 100`.

Default multipliers:

| Variant | Taker | Maker |
|---------|-------|-------|
| `standard` | `0.07` | `0.0175` |
| `reduced-index` | `0.035` | `0.00875` |

Assumptions for backtests:

- Fills are treated as immediate taker executions unless `role: "maker"` is configured.
- Fees use the execution price from engine-input pricing (ask for buys, bid for sells).
- Rounding matches Kalshi's round-up-to-next-cent behavior.

## Metrics integration

`BacktestMetricsSummary` includes flat gross/net cost fields (6.25A) plus nested `executionCostSummary`:

- `modelKind`
- `fillCount`
- `totalFeeCents`
- `averageFeeCentsPerFill`

## Example fixture config

```json
{
  "fillConfig": {
    "feeCentsPerContract": 0,
    "allowPartialFills": false,
    "priceSource": "engine-input-pricing"
  },
  "costModelConfig": {
    "executionCostModel": {
      "kind": "kalshi-fee-schedule",
      "role": "taker",
      "schedule": "standard"
    }
  }
}
```

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
