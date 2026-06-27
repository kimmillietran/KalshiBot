# PR-5.6A — Pure Decision Policy

## Summary

Milestone 5.6A adds a pure decision policy module under `src/lib/trading/decision-policy/`. `evaluateDecisionPolicy()` converts probability, expected value, features, and engine thresholds into a deterministic trade action.

**Not wired into `evaluate()` in this milestone** — Builder #2 maps `DecisionPolicyResult` to `TradeDecision.action`.

## Policy rules

1. `NO_TRADE` when policy or engine is disabled (`enabled=false`)
2. `NO_TRADE` when combined confidence &lt; `minConfidence` (default **0.5**)
3. `NO_TRADE` when no side has positive net EV and edge ≥ `engineConfig.minEdgePercent` (default **5%**)
4. `BUY_UP` when YES passes: `netEvYesCents > 0` and `edgeYesPercent ≥ minEdgePercent`
5. `BUY_DOWN` when NO passes: `netEvNoCents > 0` and `edgeNoPercent ≥ minEdgePercent`
6. **Tie-break:** both sides qualify → `BUY_UP` (`reasonCode: BUY_UP_TIE_BREAK`)

Combined confidence = `min(probability.confidence, expectedValue.confidence)` clamped to [0, 1].

## API

```typescript
evaluateDecisionPolicy(
  { features, probability, expectedValue, engineConfig },
  config?,
) → DecisionPolicyResult
```

## Out of scope

- `evaluate()` wiring
- Kelly sizing / position sizing
- Dashboard UI
- Domain `TradeAction` mapping

## Tests

`evaluateDecisionPolicy.test.ts` — BUY_UP, BUY_DOWN, low edge, low confidence, disabled, determinism, tie-break, reasoning stability, bounded confidence, invalid inputs.

## Builder #2 integration

After guards + features + `estimateProbability()` + `estimateExpectedValue()`:

```typescript
import { evaluateDecisionPolicy } from "@/lib/trading/decision-policy";

const policy = evaluateDecisionPolicy({
  features,
  probability,
  expectedValue,
  engineConfig: config,
});

// Map policy.action → TradeAction:
// BUY_UP → "BUY UP", BUY_DOWN → "BUY DOWN", NO_TRADE → "NO TRADE"
```

Replace `decision-stub` reasoning step with policy summary; attach policy fields to `TradeDecision` as needed.
