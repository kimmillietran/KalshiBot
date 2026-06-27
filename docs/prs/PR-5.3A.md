# PR-5.3A — Feature Vector Integration

## Summary

Milestone 5.3A wires the Milestone 5.2 feature builder into the pure trading engine. `evaluate()` now calls `buildMarketFeatureVector()` after guards pass. The engine still returns **NO TRADE** — no probability, EV, Kelly, or policy changes.

## Pipeline

```
EvaluationSnapshot
        ↓
snapshotToFeatureInput()
        ↓
buildMarketFeatureVector()
        ↓
evaluate()
        ↓
TradeDecision (NO TRADE + features metadata)
```

## What changed

| Area | Change |
|------|--------|
| `evaluate()` | Extracts features after guards; adds `feature-extraction` reasoning step |
| `TradeDecision` | New `features: MarketFeatureVector \| null` field (not shown in UI) |
| `EvaluationSnapshot` | Candles carry full OHLC; pricing includes `volumeDollars` |
| `buildEvaluationSnapshot()` | Maps live OHLC candles + parsed volume from Kalshi label |
| `BtcFeedProvider` | Exposes upstream `candles[]` for engine snapshot mapping |
| `calculateDistanceFromTarget()` | Delegates to `distanceToTarget` / `percentToTarget` from feature builder |

## Snapshot inputs used

- Live BTC spot + OHLC candles
- Strike price + settlement time + time remaining
- YES/NO pricing + liquidity quality + volume
- `evaluatedAt` timestamp (caller-supplied — no `Date.now()` in engine)

## Still deferred

- Probability model
- EV calculation
- Kelly sizing
- BUY/SELL decisions
- Dashboard UI for features
- BTC fallback/stale feed guard

## Tests added

- `lib/trading/features/extractFeatures.test.ts` — determinism, immutability, pipeline
- `lib/trading/snapshot/parseVolumeDollars.test.ts` — volume label parsing
- `evaluate.test.ts` — updated for `feature-extraction` step + `features` field
- `buildEvaluationSnapshot.test.ts` — OHLC candles + `volumeDollars`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Review checklist

- [ ] Engine returns NO TRADE when guards pass
- [ ] `decision.features` populated after guards pass, `null` on guard failure
- [ ] No probability / EV / Kelly code added
- [ ] Feature vector not rendered in dashboard UI
- [ ] Tests prove same snapshot → same features → same decision
