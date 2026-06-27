# types/domain

Shared domain language used across features and the trading engine.

## Trading engine (`trading.ts`)

| Type | Purpose |
|------|---------|
| `EvaluationSnapshot` | Immutable engine input assembled from live feeds |
| `TradeDecision` | Engine output — action, reasoning trace, version metadata |
| `EngineConfig` | Tunable guard/model thresholds |
| `MarketLifecycle` | Domain lifecycle enum (not Kalshi vendor strings) |

Vendor shapes (Kalshi/BTC raw payloads) live in feature modules (`@/features/market-data`, `@/features/btc-feed`) and are mapped into these types via `buildEvaluationSnapshot()` in `trading-dashboard/mapping/`.

Rule: vendor types never leak into UI or the pure engine — only `domain/*` does.
