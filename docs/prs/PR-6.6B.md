# PR-6.6B — Parameter Sweep Framework

## Summary

Milestone 6.6B adds a deterministic parameter sweep framework that executes research experiments across the Cartesian product of declared parameter values.

This is **not** an optimizer — no AI, heuristics, Bayesian search, genetic algorithms, pruning, or concurrency.

## Architecture

```
Sweep Parameters
        ↓
Cartesian Product Generator
        ↓
ResearchExperiment (via experimentFactory)
        ↓
runResearchExperiment()
        ↓
ResearchExperimentResult[]
        ↓
ParameterSweepResult
```

## Cartesian product algorithm

Parameters are expanded in **declaration order**:

- Outermost parameter varies slowest
- Innermost parameter varies fastest

Example (`rsi: [20,30]`, `vwap: [true,false]`):

```
{ rsi: 20, vwap: true }
{ rsi: 20, vwap: false }
{ rsi: 30, vwap: true }
{ rsi: 30, vwap: false }
```

No randomization. No value sorting.

## Execution pipeline

1. Validate sweep configuration
2. `generateParameterCombinations()`
3. For each combination: `experimentFactory(values)`
4. Validate experiment config
5. `runResearchExperiment(config)`
6. Append immutable result
7. Return frozen `ParameterSweepResult`

Each combination executes exactly once — no retries or parallelism.

## Deterministic guarantees

- No `Date.now()`, `Math.random()`, crypto, or UUID generation
- Duplicate parameter values detected via `stableStringify`
- Repeated runs with identical inputs produce identical serialization
- Experiment ordering follows combination ordering

## Immutability guarantees

- Combinations, experiment results, and sweep results are deeply frozen
- Input parameter arrays and factory outputs are never mutated

## Serialization

```typescript
serializeParameterSweepResult(result); // stableStringify
```

## Validation rules

| Condition | Error |
|---|---|
| Empty parameter list | `empty-parameter-list` |
| Duplicate parameter names | `duplicate-parameter-name` |
| Empty parameter values | `empty-parameter-values` |
| Duplicate values in one parameter | `duplicate-parameter-value` |
| Blank `sweepId` | `invalid-sweep-id` |
| Factory throws | `experiment-factory-failed` |
| Invalid experiment config | `invalid-experiment-config` |
| `experimentFactory` output `sweepId` ≠ config `sweepId` | `invalid-experiment-config` |

`sweepId` on each factory-produced experiment config must exactly match the parent sweep config `sweepId`.

## Shared research contracts (6.6A integration)

6.6B uses sweep-layer types (`ParameterSweepExperimentConfig`, `ParameterSweepExperimentResult`) distinct from 6.6A `ResearchExperimentConfig` / `ResearchExperimentResult`. The default `runParameterSweep` stub returns sweep-layer results; inject `runExperiment` to wire the full 6.6A backtest pipeline. A future milestone may unify these contracts once sweep factories produce real experiment configs.

## API

```typescript
import { runParameterSweep } from "@/lib/data/research";

const result = runParameterSweep({
  sweepId: "sweep-rsi-vwap",
  parameters: [
    { name: "rsi", values: [20, 30] },
    { name: "vwap", values: [true, false] },
  ],
  experimentFactory: (parameters) => ({
    experimentId: `exp-${parameters.rsi}-${parameters.vwap}`,
    sweepId: "sweep-rsi-vwap",
    parameters,
  }),
});
```

## Out of scope

- Optimization / parameter ranking
- Bayesian / genetic search
- Monte Carlo integration
- Walk-forward validation
- Early stopping / pruning
- Concurrency / distributed execution
- Dashboard / persistence / networking

## Future optimization integration (6.6+)

`runParameterSweep` accepts optional `runExperiment` injection so later milestones can plug in richer experiment runners without changing Cartesian generation.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
