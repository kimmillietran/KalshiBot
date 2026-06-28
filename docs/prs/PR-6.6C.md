# PR-6.6C — Walk-Forward Validation Framework

## Summary

Milestone 6.6C adds a deterministic walk-forward validation framework that partitions historical snapshots into sequential training and testing windows and executes research experiments over each window.

No optimization, parameter tuning, strategy ranking, Monte Carlo integration, dashboard, persistence, or networking.

## Architecture

```
HistoricalTradingSnapshot[]
        ↓
WalkForwardWindowGenerator
        ↓
Training Window + Testing Window
        ↓
ResearchExperiment (training, then testing)
        ↓
WalkForwardResult
```

## Rolling window algorithm

For window index `k` (0-based):

| Field | Index |
|---|---|
| `trainingStartIndex` | `k × stepSize` |
| `trainingEndIndex` | `trainingStart + trainingWindowSize - 1` |
| `testingStartIndex` | `trainingEndIndex + 1` |
| `testingEndIndex` | `testingStart + testingWindowSize - 1` |

Windows are emitted while `testingEndIndex < snapshotCount`.

Example with 100 snapshots, training 40, testing 10, step 10:

```
Train 0..39,  Test 40..49
Train 10..49, Test 50..59
Train 20..59, Test 60..69
...
```

No overlap inside a window. No skipped observations within emitted partitions.

## Execution pipeline

1. Validate config and snapshots
2. `generateWalkForwardWindows()`
3. For each window (sequential, no parallelism):
   - Run experiment on `trainingSnapshots`
   - Run experiment on `testingSnapshots`
4. Append immutable `WalkForwardRunResult`
5. Return frozen `WalkForwardResult`

## Deterministic guarantees

- No `Date.now()`, `Math.random()`, crypto, or UUID generation
- Window order fixed by rolling index
- Repeated runs with identical inputs produce identical serialization
- Optional injected `runExperiment` hook for future optimizer integration

## Validation rules

| Condition | Error code |
|---|---|
| Empty snapshots | `empty-snapshots` |
| Invalid `validationId` | `invalid-validation-id` |
| Non-positive window sizes | `invalid-window-size` |
| Non-positive `stepSize` | `invalid-step-size` |
| `training + testing > dataset` | `window-larger-than-dataset` |
| Mismatched experiment `sweepId` | `invalid-experiment-config` |
| Empty window partition at runtime | `empty-window-snapshots` |

## Serialization

```typescript
serializeWalkForwardResult(result); // stableStringify
```

## Immutable guarantees

- Snapshots, windows, run results, and final result are deeply frozen
- Input snapshot arrays are never mutated

## API

```typescript
import { runWalkForwardValidation } from "@/lib/data/research";

const result = runWalkForwardValidation({
  snapshots,
  config: {
    validationId: "wf-baseline",
    trainingWindowSize: 40,
    testingWindowSize: 10,
    stepSize: 10,
    experimentConfig: {
      experimentId: "wf-exp",
      sweepId: "wf-baseline",
      parameters: { strategy: "baseline" },
    },
  },
});
```

## Out of scope

- Optimization / parameter search
- Bayesian / genetic algorithms
- Monte Carlo integration
- Strategy ranking
- Dashboard / persistence / networking

## Future optimizer integration (6.6+)

`runWalkForwardValidation` accepts an optional `runExperiment` injection so later milestones can plug in richer experiment runners without changing window generation.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
