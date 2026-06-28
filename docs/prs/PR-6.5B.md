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
| `returnVolatilityPct` | Sample std-dev of per-period equity returns (not annualized), × 100 |
| `sharpeRatio` | `(mean(excessReturns) / std(returns)) × sqrt(periodsPerYear)` when `periodsPerYear` and `riskFreeRatePerPeriod` supplied and return volatility > 0 |

## Optional metric inputs

| Field | Required for | Notes |
|---|---|---|
| `periodsPerYear` | `annualizedReturnPct`, `returnVolatilityPct`, `sharpeRatio` | Positive finite number |
| `riskFreeRatePerPeriod` | `sharpeRatio` only | Finite decimal per period; also requires `periodsPerYear` and non-zero return volatility |

When optional inputs are omitted, the corresponding summary fields are `null`. A single equity point still computes total return and drawdown; period-return metrics require at least two points.

## Ledger → metrics handoff (6.5A → 6.5B)

6.5B does not import `BacktestLedger`. Callers map ledger output into metrics input:

```typescript
const snapshot = ledger.snapshot();
const marks = /* caller-supplied mark prices */;
const unrealized = ledger.computeUnrealizedPnL(marks);

const equityCurve: BacktestEquityPoint[] = steps.map((step) => ({
  stepIndex: step.index,
  timestamp: step.timestamp,
  equityCents: snapshot.cashCents + unrealized.totalUnrealizedPnLCents,
}));

const closedTrades: ClosedTradeSummary[] = /* derived from round-trip fills */;

const metrics = computeBacktestMetrics({ equityCurve, closedTrades });
```

Entry fees affect cash only in 6.5A; equity curves should include cash plus marked position value. Closed-trade P/L uses realized amounts from completed round trips.

## Edge-case behavior

- Empty equity curve → `EMPTY_EQUITY_CURVE`
- Negative equity → `NEGATIVE_EQUITY`
- Zero starting equity → `ZERO_START_EQUITY`
- Invalid `periodsPerYear` or `riskFreeRatePerPeriod` → configuration errors
- Flat period returns → `returnVolatilityPct = 0`, `sharpeRatio = null`
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
