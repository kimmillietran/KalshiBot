# PR-5.5B — Engine Expected Value Wiring

## Summary

Milestone 5.5B wires Builder #1's merged `estimateExpectedValue()` (5.5A on `main`) into the trading engine. After guards pass, features are extracted, probability is estimated, then expected value is computed and attached to `TradeDecision`. Guard failures short-circuit with `expectedValue: null`. Trade policy remains deferred (`action: "NO TRADE"`).

## Pipeline

```
EvaluationSnapshot
  → Guard Layer (5.3B)
  → Feature Extraction (5.2)
  → estimateProbability(features)              (5.4B)
  → estimateExpectedValue({ probability, features, pricing })   (5.5B)
  → decision-stub (skip)
  → TradeDecision
```

## API changes

- `TradeDecision.expectedValue: ExpectedValueEstimate | null`
- `ENGINE_VERSION` → `5.5.0`
- `model-expected-value` reasoning step → `outcome: "pass"` with `expectedValue.reasoning.summary`

## Integration

Engine imports the public estimator only (model from `main` / 5.5A):

```typescript
import { estimateExpectedValue } from "@/lib/trading/expected-value";

const expectedValue = estimateExpectedValue({
  probability,
  features,
  pricing: {
    yesBidCents: pricing.yesBidCents,
    yesAskCents: pricing.yesAskCents,
    noBidCents: pricing.noBidCents,
    noAskCents: pricing.noAskCents,
  },
});
```

No EV formulas in `evaluate()` — model lives in `src/lib/trading/expected-value/` (Builder #1).

## Out of scope

- Kelly / BUY|SELL policy
- Dashboard UI updates
- EV thresholds in engine config

## Tests

- `evaluate.test.ts` — EV attached on success, matches Builder #1 output, null on guard failure, determinism, `decision-stub` skip
- `extractFeatures.test.ts` — integration assertions updated
- `versioning.test.ts` — `5.5.0`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
