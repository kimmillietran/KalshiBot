# PR-5.1 — Engine Snapshot Wiring & UI Cleanup

## Summary

Milestone 5.1 connects live BTC and Kalshi feeds to the pure trading engine from 5.0. A feature-layer mapper builds `EvaluationSnapshot`, `useTradeDecision()` calls `evaluate()`, and dashboard panels render real engine output (`NO TRADE` + reasoning trace). Misleading mock UI artifacts are removed or labeled.

## Snapshot mapping

`buildEvaluationSnapshot()` in `trading-dashboard/mapping/` maps:

| Source | Snapshot field |
|--------|----------------|
| BTC spot + 24h change | `btc.price`, `btc.change24hPercent` |
| BTC feed status / fallback | `btc.feedStatus`, `btc.providerSource` |
| BTC chart points | `btc.candles[]` |
| Kalshi active market | `market` (ticker, lifecycle, strike, countdown) |
| Kalshi YES/NO quotes | `pricing` (bid/ask/mid per side) |
| Feed timestamps | `evaluatedAt` |

Lifecycle is converted from feature `MarketLifecycle` enum to domain `MarketLifecycle` const.

## Engine guards extended

Added to `evaluate()`:

| Guard | Failure → |
|-------|-----------|
| Missing/invalid BTC spot | NO TRADE |
| Missing contract pricing | NO TRADE |

Also added regression tests for UPCOMING/SETTLED lifecycle and zero strike.

## Dashboard wiring

| Panel | Change |
|-------|--------|
| `RecommendationPanel` | Shows `decision.action`, summary, connected badge |
| `ProbabilityEdgePanel` | Guard trace from `decision.reasoning.steps` |
| `AIReasoningPanel` | Full reasoning trace skeleton |
| `TradeManagementPanel` | Placeholder tied to engine — no mock entry/exit |
| `MarketOddsPanel` | Removed fake Combined / Best Edge footer rows |
| `CommandBar` | Friendly subtitle; raw ticker in tooltip only |

## CommandBar ticker fix

- `formatMarketSubtitle()` → `BTC 15m · Live Kalshi contract`
- Raw `KXBTC…` tickers hidden from prominent UI
- Contract ID available via `title` tooltip on subtitle

## Files created / modified

| File | Purpose |
|------|---------|
| `mapping/buildEvaluationSnapshot.ts` | Live feed → `EvaluationSnapshot` |
| `mapping/mapLifecycle.ts` | Feature → domain lifecycle |
| `hooks/useTradeDecision.ts` | Orchestrator hook |
| `utils.ts` | `formatMarketSubtitle`, `isRawKalshiTicker` |
| `components/*` | Engine-connected panels |
| `types/domain/trading.ts` | Extended btc/pricing snapshot fields |
| `lib/trading/evaluate.ts` | BTC + pricing guards |
| `types/domain/README.md` | Domain orientation |

## Tests

- Snapshot mapper builds expected shape
- Engine integration produces NO TRADE
- Dashboard renders NO TRADE, no BUY UP, no fake edge footer
- CommandBar hides raw ticker
- Live odds still render

## Deferred

- Probability model, EV, Monte Carlo, Kelly, LLM, execution, DB, journal
- BTC/Kalshi provider code unchanged

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
