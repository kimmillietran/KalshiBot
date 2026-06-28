# PR-6.5B — Backtest Metrics Core

## Summary

Milestone 6.5B adds pure, deterministic backtest metrics primitives that summarize an equity curve and closed trade outcomes.

No trade ledger, strategy runner, replay execution, dashboard, persistence, network, Monte Carlo, or parameter optimization.

## Scope

| In scope | Out of scope |
|---|---|
| Equity curve metrics | Trade ledger (6.5A internals) |
| Closed trade statistics | Strategy runner |
| Drawdown / return math | Replay execution |
| Optional Sharpe / annualized return | Dashboard wiring |
| Input validation | Persistence / network |

## Input contracts

Standalone types — no dependency on 6.5A ledger internals:

```typescript
type BacktestEquityPoint = {
  stepIndex: number;
  timestamp: string;
  equityCents: number;
};

type ClosedTradeSummary = {
  tradeId: string;
  ticker: string;
  openedAt: string;
  closedAt: string;
  realizedPnlCents: number;
  entryNotionalCents: number;
  exitNotionalCents: number;
};
```

## Metric definitions

| Metric | Formula |
|---|---|
| `totalReturnPct` | `(endEquity - startEquity) / startEquity × 100` |
| `totalPnlCents` | `endEquity - startEquity` |
| `maxDrawdownCents` | Max running peak − current equity |
| `maxDrawdownPct` | Max `(drawdownCents / runningPeak) × 100` |
| `winRatePct` | `winningTrades / tradeCount × 100` |
| `lossRatePct` | `losingTrades / tradeCount × 100` |
| `averageWinCents` | `grossProfit / winningTrades` (0 if none) |
| `averageLossCents` | `grossLoss / losingTrades` (0 if none; signed negative) |
| `profitFactor` | `grossProfit / abs(grossLoss)`; `null` if no losses with profit; `0` if no profit |
| `expectancyCents` | `sum(realizedPnl) / tradeCount` (0 if no trades) |
| `annualizedReturnPct` | `(end/start)^(periodsPerYear/periods) - 1` when `periodsPerYear` supplied |
| `returnVolatilityPct` | Sample std-dev of period returns × 100 |
| `sharpeRatio` | `(mean(excessReturns) / std(returns)) × sqrt(periodsPerYear)` when inputs supplied |

## Edge-case behavior

- Empty equity curve → error
- Negative equity → error
- Zero starting equity → error
- Empty trades → zero rates/counts; `profitFactor = null`
- Flat equity → zero drawdown and zero return
- All wins → `profitFactor = null` (no gross loss denominator)
- All losses → `profitFactor = 0`
- Breakeven trades counted separately; excluded from win/loss averages

## Deterministic guarantees

- Equity curve ordered by `stepIndex → timestamp → input index`
- No `Date.now()`, randomness, or hidden mutable state
- Input arrays never mutated
- `serializeBacktestMetrics()` uses `stableStringify` for repeatable output

## API

```typescript
import { computeBacktestMetrics } from "@/lib/data/backtesting";

const metrics = computeBacktestMetrics({
  equityCurve,
  closedTrades,
  periodsPerYear: 365,
  riskFreeRatePerPeriod: 0.0001,
});
```

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
