# PR-5.7C — Dashboard Position Sizing Presentation

## Summary

Milestone 5.7C wires `TradeDecision.positionSize` into the dashboard. React components format and display Kelly sizing output only — no position sizing math in the UI layer.

**Base:** `main` (includes position sizing engine wiring from 5.7B).

**On `main`:** `af78f7a` (content-equivalent to approved branch tip `37abd21`).

## Data flow

```
evaluate() → TradeDecision.positionSize
  → positionSizingDisplay formatters
  → PositionSizeSummary / TradeManagementPanel
```

## Components

| Component | Renders from `TradeDecision` |
|-----------|------------------------------|
| `PositionSizeSummary` | `recommendedFraction`, optional `recommendedDollars`, reasoning |
| `TradeManagementPanel` | Sizing preview rows; execution remains disabled |

## Presentation states

- Guard failure → unavailable sizing
- Bankroll unavailable → fraction only, no dollar display
- Policy `NO TRADE` → zero allocation messaging
- `BUY UP` / `BUY DOWN` → side-specific formatting

## Out of scope

- Kelly calculations (5.7A)
- Engine wiring (5.7B)
- Bankroll configuration
- Trade execution

## Quality gates

```
npm run lint   ✓
npm run test   ✓
npm run build  ✓
```

Tag: `m5.7c-position-sizing-dashboard` → `af78f7a`
