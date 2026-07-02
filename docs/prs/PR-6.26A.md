# PR-6.26A — Diffusion Fair Value Strategy

## Summary

Milestone 6.26A adds KalshiBot's flagship quantitative research strategy, `fair-value-diffusion`. The plugin estimates fair settlement probability from a geometric diffusion model using BTC spot, strike, time remaining, and realized volatility, then emits deterministic trade intents when edge versus Kalshi implied probability exceeds a configurable threshold.

## Architecture

```
Replay step (market, btc candles, pricing)
        ↓
fairValueDiffusionStrategyPlugin.decide()
        ↓
fairValueDiffusionModel (volatility → fair prob → edge)
        ↓
TradeIntent[] (YES or NO when |edge| ≥ threshold)
```

- Model: `src/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel.ts`
- Plugin: `src/lib/data/strategies/plugin/builtins/fairValueDiffusionStrategyPlugin.ts`
- Registration: baseline pack + `BUILTIN_STRATEGY_IDS`

## Config

| Field | Default | Purpose |
|-------|---------|---------|
| `volatilityLookbackBars` | `10` | Realized vol window |
| `minimumEdgeThresholdCents` | `5` | Minimum fair-vs-implied edge |
| `minimumTimeRemainingMs` | `60000` | Minimum time before close |
| `maxPositionSize` | `1` | Contracts per intent |

## Validation / no-trade cases

- Invalid config (Zod strict schema)
- Missing strike, BTC feed, or pricing
- Insufficient candle history for volatility lookback
- Time remaining below minimum
- Edge below threshold

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Docs

See [docs/strategies/baseline/README.md](../strategies/baseline/README.md).
