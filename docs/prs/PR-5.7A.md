# PR-5.7A — Pure Kelly Position Sizing

## Summary

Milestone 5.7A adds a pure Kelly position sizing module under `src/lib/trading/position-sizing/`. `estimatePositionSize()` converts a policy `TradeAction`, probability, expected value, and engine thresholds into a deterministic bankroll fraction recommendation.

**Not wired into `evaluate()` in this milestone** — Builder #2 integrates sizing after decision policy.

## Sizing formula

Binary Kalshi contract bought at ask `c` (cents), win probability `p`:

```
b = (100 − c) / c                 // net odds
f* = (b × p − (1 − p)) / b        // full Kelly fraction
f  = clamp( f* × kellyFraction × confidence, 0, maxFraction )
recommend = f >= minFraction ? f : 0
dollars   = bankroll × recommend   (null when bankroll absent)
```

Ask `c` is derived from EV outputs: `c = fairCents / (1 + edgePercent/100)`.

Gates (zero size when any fail): `NO TRADE` / `HOLD`, invalid inputs, `netEv ≤ 0`, `edge < minEdgePercent`, `f* ≤ 0`, `f < minFraction`.

## Config defaults

| Parameter | Default | Source |
|---|---|---|
| `kellyFraction` | **0.25** (quarter Kelly) | `PositionSizingConfig` |
| `maxFraction` | **0.10** (10% cap) | `PositionSizingConfig` |
| `minFraction` | **0.005** (0.5% floor) | `PositionSizingConfig` |
| `minEdgePercent` | **5%** | `EngineConfig` |
| Confidence dampening | `min(probability.confidence, expectedValue.confidence)` | combined |

## API

```typescript
estimatePositionSize(
  { action, probability, expectedValue, engineConfig, bankrollDollars? },
  config?,
) → PositionSizeEstimate
```

## Out of scope

- `evaluate()` wiring
- Dashboard UI
- Trade execution

## Builder #2 integration

After `evaluateDecisionPolicy()`:

```typescript
import { estimatePositionSize } from "@/lib/trading/position-sizing";

const positionSize = estimatePositionSize({
  action: decision.action,
  probability,
  expectedValue,
  engineConfig: config,
  bankrollDollars: userBankroll, // optional
});
```

Attach to `TradeDecision` (field TBD) and add `model-position-sizing` reasoning step.
