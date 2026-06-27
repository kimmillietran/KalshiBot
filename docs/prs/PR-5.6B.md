# PR-5.6B — Engine Decision Policy Wiring

## Summary

Milestone 5.6B wires Builder #1's merged `evaluateDecisionPolicy()` (5.6A on `main`) into the trading engine. After expected value, the policy selects `TradeDecision.action`. Guard failures short-circuit with `NO TRADE` and null model outputs.

## Pipeline

```
EvaluationSnapshot
  → Guard Layer (5.3B)
  → Feature Extraction (5.2)
  → estimateProbability(features)              (5.4B)
  → estimateExpectedValue({ ... })             (5.5B)
  → evaluateDecisionPolicy({ expectedValue, probability, features, engineConfig })   (5.6B)
  → TradeDecision
```

## API changes

- `decision-stub` replaced by `decision-policy` reasoning step
- `TradeDecision.action` mapped from `DecisionPolicyAction` (`BUY_UP` → `BUY UP`, etc.)
- `ENGINE_VERSION` → `5.6.0`

## Integration

```typescript
import { evaluateDecisionPolicy } from "@/lib/trading/decision-policy";

const policyResult = evaluateDecisionPolicy({
  expectedValue,
  probability,
  features,
  engineConfig: config,
});
```

Model implementation lives in `src/lib/trading/decision-policy/` (Builder #1, 5.6A). No policy formulas in `evaluate()`.

## Out of scope

- Kelly sizing
- Dashboard UI

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
