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
- **Average cost:** weighted by quantity on additional buys; entry fees affect cash only (not cost basis)
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
- Fills are sorted deterministically after each record
- Identical fill sequences produce identical ledger snapshots

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
