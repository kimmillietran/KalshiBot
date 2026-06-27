# PR-5.7B — Engine Position Sizing Wiring

## Summary

Milestone 5.7B wires the merged Kelly position sizing module into `evaluate()` after decision policy. The engine calls `estimatePositionSize()` and attaches `PositionSizeEstimate` to `TradeDecision`. Guard failures short-circuit with `positionSize: null`. `NO TRADE` policy success yields zero-size estimate (not null).

## Pipeline

```
Guards → Features → Probability → EV → Decision Policy → Position Sizing → TradeDecision
```

## API changes

- `TradeDecision.positionSize: PositionSizeEstimate | null`
- `model-position-sizing` reasoning step
- `ENGINE_VERSION` → `5.7.0`

## Integration

```typescript
import { estimatePositionSize } from "@/lib/trading/position-sizing";

const positionSize = estimatePositionSize({
  action,
  probability,
  expectedValue,
  engineConfig: config,
  bankrollDollars: undefined,
});
```

Uses merged 5.7A module — no stub.

## Out of scope

- Kelly formulas in `evaluate()`
- Dashboard UI
- Trade execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
