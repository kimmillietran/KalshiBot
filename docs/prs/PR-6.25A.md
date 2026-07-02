# PR 6.25A — Execution Cost Model Foundation

## Summary

Adds a deterministic execution cost model foundation for research backtest fills. Backtests can account for per-contract fees while preserving zero-cost defaults for existing fixtures.

## Scope

- Core cost model interfaces under `src/lib/data/backtesting/costModel/`
- Per-fill `executionCost` breakdown on simulated fills and ledger records
- Aggregate gross/net PnL and fee totals on `BacktestMetricsSummary`
- Optional `costModelConfig` in research fixture JSON
- Backward-compatible fallback from legacy `fillConfig.feeCentsPerContract`

Out of scope: live Kalshi fee schedules, spread/slippage modeling beyond a `none` placeholder, replay engine changes, strategy plugin changes.

## Architecture

| Layer | Path | Responsibility |
| --- | --- | --- |
| Cost model | `src/lib/data/backtesting/costModel/` | Types, validation, per-fill breakdown, aggregate summary |
| Fill simulation | `BacktestStrategyRunner.ts` | Resolves model, computes costs, attaches breakdown |
| Metrics | `BacktestMetrics.ts` | Adds `totalFeesCents`, `grossPnlCents`, `netPnlCents`, etc. |
| Fixtures | `researchFixtureSchema.ts` | Optional `costModelConfig` validation |

## Cost model kinds

- `zero` — default, matches previous frictionless behavior
- `per-contract-fee` — flat fee per contract via `feeCentsPerContract`
- Spread/slippage placeholder: `{ kind: "none" }` (always zero in 6.25A)

## Example fixture config

```json
{
  "costModelConfig": {
    "executionCostModel": {
      "kind": "per-contract-fee",
      "feeCentsPerContract": 2
    }
  }
}
```

Legacy fixtures with only `fillConfig.feeCentsPerContract` continue to work unchanged.

## Future work

Exact Kalshi fee tiers, maker/taker distinctions, and spread/slippage models can refine this interface without changing the replay engine.

## Test plan

- [x] Zero-cost backward compatibility
- [x] Fixed per-contract fee model
- [x] Invalid config rejection
- [x] Per-fill cost breakdown
- [x] Aggregate net vs gross PnL
- [x] Deterministic serialization
- [x] Schema validation for optional cost model config

## Commands

```bash
npm run lint
npm run test
npm run build
```
