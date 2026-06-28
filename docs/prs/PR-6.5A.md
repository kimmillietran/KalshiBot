# PR-6.5A — Backtest Trade Ledger Core

## Summary

Milestone 6.5A adds a deterministic simulated-trade ledger under `src/lib/data/backtesting/` for backtesting replay outputs.

**Ledger model only** — no replay session wiring, strategy optimization, analytics, dashboard, execution, network, or persistence.

## Scope

| In scope | Out of scope |
|---|---|
| `BacktestLedger` cash + position accounting | Replay session integration |
| Entry/exit fill recording | Trading engine / `evaluate()` |
| Realized + unrealized P/L primitives | Sharpe, CAGR, drawdown, Monte Carlo |
| Immutable snapshots | Dashboard UI |
| Deterministic validation errors | Live execution |
| Caller-supplied timestamps | Network / filesystem persistence |

## Ledger model

All monetary values are integer **cents**.

| Field | Meaning |
|---|---|
| `initialCashCents` | Starting capital |
| `cashCents` | Current cash balance |
| `realizedPnLCents` | Closed-trade P/L net of exit fees |
| `openPositions` | Per `(ticker, side)` quantity + average cost |
| `fills` | Immutable recorded fills sorted by `occurredAt`, `sourceStepIndex`, `fillId` |

## Accounting assumptions

- **Buy:** `cash -= quantity * priceCents + feeCents`; position quantity increases with weighted average cost
- **Sell:** requires open position; `cash += quantity * priceCents - feeCents`; realized P/L += `(sellPrice - avgCost) * quantity - feeCents`
- **Average cost:** weighted by quantity on additional buys; fractional cent averages are retained (not rounded) for deterministic replay math
- **Entry fees:** debited from `cashCents` only — they do **not** increase `averageCostCents`; downstream metrics (6.5B) should treat entry fees as cash drag, not cost-basis inflation
- **Exit fees:** reduce proceeds and are included in `realizedPnLCents`
- **Unrealized P/L:** `(markPriceCents - averageCostCents) * quantity` for each open position; caller must supply marks for all open positions
- **No hidden clock:** `occurredAt` and `sourceStepIndex` are caller-provided

## Fill schema

```typescript
type TradeFill = {
  fillId: string;           // ledger-assigned: fill-000001
  ticker: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  priceCents: number;       // 0–100 integer
  quantity: number;         // positive integer
  feeCents: number;         // non-negative
  occurredAt: string;       // caller-supplied instant
  sourceStepIndex: number;  // replay step index
};
```

## Deterministic guarantees

- `BacktestLedger.create()` and `recordFill()` return new instances; prior `snapshot()` values are unchanged
- Fill ids are monotonic `fill-000001`, `fill-000002`, …
- Fills are sorted deterministically after each record (`occurredAt` → `sourceStepIndex` → `fillId`)
- Identical fill sequences produce identical ledger snapshots
- `snapshot()` returns a deep clone — mutating the returned object does not affect the ledger

## Handoff to 6.5B

`BacktestLedger.snapshot()` supplies cash, realized P/L, and open positions for metrics modules. Entry fees are already reflected in `cashCents`; metrics should not double-count them against cost basis.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
