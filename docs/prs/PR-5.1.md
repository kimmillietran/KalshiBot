# PR-5.1 — Engine Snapshot Wiring & Dashboard Integration

## Summary

Milestone 5.1 connects live BTC and Kalshi feeds to the pure trading engine from 5.0. A feature-layer mapper builds `EvaluationSnapshot`, `useTradeDecision()` calls `evaluate()`, and dashboard panels render real engine output (`NO TRADE` + reasoning trace). Misleading mock UI artifacts are removed or labeled.

**Synced with `main` after Milestone 5.2 merge** (`3699bb5`) and raw ticker UI leak fix (`fix/raw-ticker-ui-leak`).

## Branch sync (Builder #1 re-review)

| Item | Status |
|------|--------|
| Merged `main` into `feature/m51-engine-snapshot-wiring` | Yes |
| Raw ticker fix preserved | Yes — `formatMarketSubtitle`, tooltip-only contract ID |
| `src/lib/features/` (5.2) preserved | Yes — not consumed by engine yet |
| 5.1 engine wiring preserved | Yes |

### Merge conflicts resolved

- `CommandBar.tsx` — kept main ticker fix (`formatMarketContractIdTooltip`)
- `utils.ts` — unified with `tickerVisibility.ts` helpers from main
- `TradingDashboard.test.tsx` — combined engine NO TRADE + ticker regression assertions
- `README.md`, `docs/technical-debt.md` — merged 5.1 + 5.2 status

## 5.2 feature consumption

**Deferred to 5.3.**

`buildMarketFeatureVector()` from `src/lib/features/` is **not** wired into `evaluate()` or dashboard decisions in 5.1. Passing features as non-decision metadata would expand orchestrator scope without changing UI behavior. Milestone 5.3 will map feeds → features → snapshot for the probability model.

## Snapshot mapping

`buildEvaluationSnapshot()` in `trading-dashboard/mapping/` maps:

| Source | Snapshot field |
|--------|----------------|
| BTC spot + 24h change | `btc.price`, `btc.change24hPercent` |
| BTC feed status / fallback | `btc.feedStatus`, `btc.providerSource` |
| BTC chart points (real timestamps) | `btc.candles[]` |
| Kalshi active market | `market` (ticker, lifecycle, strike, countdown) |
| Kalshi YES/NO quotes | `pricing` (bid/ask/mid per side) |
| Feed timestamps | `evaluatedAt` |

Candle timestamps flow from upstream `BtcCandle.timestamp` → `BtcChartPoint.timestamp` → snapshot candles (no synthetic index).

## Engine guards extended

| Guard | Failure → |
|-------|-----------|
| Missing/invalid BTC spot | NO TRADE |
| Missing contract pricing | NO TRADE |

## Dashboard wiring

| Panel | Change |
|-------|--------|
| `RecommendationPanel` | Shows `decision.action`, summary, connected badge |
| `ProbabilityEdgePanel` | Guard trace from `decision.reasoning.steps` |
| `AIReasoningPanel` | Full reasoning trace skeleton |
| `TradeManagementPanel` | Placeholder tied to engine — no mock entry/exit |
| `MarketOddsPanel` | Removed fake Combined / Best Edge footer rows |
| `CommandBar` | Friendly subtitle; raw ticker tooltip-only |

## Reviewer follow-ups addressed

| Item | Resolution |
|------|------------|
| Synthetic candle timestamps | Fixed — real upstream ms on chart points |
| `useTradeDecision` renderHook test | Added |
| Raw ticker regression | Preserved from main + global dashboard test |
| BTC fallback/stale guard in `evaluate()` | Deferred to 5.3 (status captured, not guarded) |

## Tests added / updated

- `mapping/buildEvaluationSnapshot.test.ts` — snapshot shape + real timestamps
- `hooks/useTradeDecision.test.ts` — `renderHook` NO TRADE + candle timestamp mapping
- `dashboardTickerRegression.test.tsx` — global `/KXBTC15M-[A-Z0-9-]+/` visible-text guard
- `tickerRegression.test.tsx`, `CommandBar.test.tsx` — ticker leak scenarios
- `TradingDashboard.test.tsx` — NO TRADE + live odds + no raw ticker

## Deferred

- `buildMarketFeatureVector()` consumption (5.3)
- Probability model, EV, Kelly, LLM, execution, DB, journal
- BTC/Kalshi provider code unchanged (except `BtcChartPoint.timestamp` passthrough)

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Review checklist

- [ ] No visible `KXBTC15M-*` text in dashboard
- [ ] `Will BTC settle above …` contract question visible
- [ ] Dashboard shows NO TRADE from engine
- [ ] Live odds render; fake edge footer gone
- [ ] Engine remains pure (no feature imports from `src/lib/features/`)
