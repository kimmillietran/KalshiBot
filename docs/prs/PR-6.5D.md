# PR-6.5D — Monte Carlo Analysis Core

## Summary

Milestone 6.5D adds a deterministic Monte Carlo engine that resamples historical `ClosedTradeSummary` outcomes and produces distribution statistics for strategy robustness analysis.

No trade generation, strategy runner, replay, optimization, persistence, dashboard, or networking.

## Architecture

```
ClosedTradeSummary[]
        ↓
Deterministic Resampler (bootstrap | permutation)
        ↓
Equity Curve Simulations
        ↓
MonteCarloSummary statistics
```

## Deterministic sampling design

- **No** `Math.random()`, crypto, UUID, or `Date.now()`
- Caller supplies `seed` in `MonteCarloConfig`
- Default index generator: `fnv1a32("mc:{seed}:{simulationIndex}:{drawIndex}") % upperBound`
- **Modulo bias:** `% upperBound` introduces slight bias when `upperBound` does not divide the 32-bit hash space evenly; acceptable for robustness analysis at this milestone. Inject a custom `DeterministicIndexGenerator` for uniform sampling if required.
- Optional injected `DeterministicIndexGenerator` for tests and future frameworks
- Repeated runs with identical inputs produce byte-identical `serializeMonteCarloSummary()` output

### Resample modes

| Mode | Behavior |
|---|---|
| `bootstrap` | Sample `tradeCount` trades with replacement |
| `permutation` | Fisher-Yates shuffle using deterministic indices |

## Simulation rules

Each simulation:

1. Resample trade sequence
2. Apply `realizedPnlCents` sequentially to `startingEquityCents`
3. Track running peak and max drawdown %
4. Record ending equity and total return %

**Negative equity:** simulations do not clamp equity at zero. Large cumulative losses can produce negative `endingEquityCents`; drawdown % is computed against the running peak only when peak > 0.

## Statistical outputs

`MonteCarloSummary` includes per-simulation runs plus:

- mean / median ending equity
- min / max ending equity
- percentiles: 5, 25, 50, 75, 95
- average and worst drawdown %

## Assumptions

- Trades are independent resampling units (no serial correlation modeling)
- Equity updates are additive on cents
- Percentiles use linear interpolation over sorted ending-equity values
- Does not generate new trades — only reshuffles historical outcomes

## API

```typescript
import { runMonteCarloAnalysis, ResampleMode } from "@/lib/data/backtesting";

const summary = runMonteCarloAnalysis({
  closedTrades,
  config: {
    simulationCount: 1000,
    resampleMode: ResampleMode.BOOTSTRAP,
    startingEquityCents: 100_000,
    seed: 42,
  },
});
```

## Out of scope

- Strategy runner / replay execution
- Parameter search / optimization (Milestone 6.6)
- Genetic / Bayesian optimization
- Live trading / engine changes
- Dashboard / persistence

## Future integration (6.6)

The injected `DeterministicIndexGenerator` interface allows optimization frameworks to explore sampling sequences without introducing nondeterministic RNG.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
