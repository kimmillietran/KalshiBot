# PR-5.4B — Engine Probability Wiring

## Summary

Milestone 5.4B wires Builder #1's `estimateProbability()` into the trading engine. After guards pass and features are extracted, `evaluate()` attaches a `ProbabilityEstimate` to `TradeDecision`. Guard failures short-circuit with `probability: null`. Trade policy remains deferred (`action: "NO TRADE"`).

## Pipeline

```
EvaluationSnapshot
  → Guard Layer (5.3B)
  → Feature Extraction (5.2)
  → estimateProbability(features)   ← 5.4B
  → decision-stub (skip)
  → TradeDecision
```

## API changes

- `TradeDecision.probability: ProbabilityEstimate | null`
- `ENGINE_VERSION` → `5.4.0`
- `model-probability` reasoning step → `outcome: "pass"` with estimate summary

## Integration

Engine imports the public estimator only:

```typescript
import { estimateProbability } from "@/lib/trading/probability";

const probability = estimateProbability(features);
```

No heuristics in `evaluate()` — model changes stay in `src/lib/trading/probability/`.

## Out of scope

- EV / Kelly / BUY|SELL policy (5.5+)
- Dashboard UI updates
- `ProbabilityModelConfig` on `EngineConfig` (uses `DEFAULT_PROBABILITY_MODEL_CONFIG`)

## Tests

- `evaluate.test.ts` — probability attached on success, null on guard failure, determinism
- `extractFeatures.test.ts` — integration assertions updated
- `versioning.test.ts` — `5.4.0`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
