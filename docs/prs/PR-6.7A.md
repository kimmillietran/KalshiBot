# PR-6.7A — Historical Backtest Orchestrator

## Summary

Milestone 6.7A adds `runHistoricalBacktest()` — the single orchestration entrypoint for running a complete deterministic historical backtest through the existing pipeline.

**Orchestration only** — no new trading logic, optimization, walk-forward, parameter sweeps, Monte Carlo, dashboard, persistence, or networking.

## Pipeline

```mermaid
flowchart TD
  A[HistoricalTradingSnapshot array] --> B[ReplaySession.stepAll]
  B --> C[ReplayStepResult array]
  C --> D[BacktestStrategyRunner.run]
  D --> E[BacktestLedger]
  E --> F[deriveBacktestMetricsInput]
  F --> G[computeBacktestMetrics]
  G --> H[HistoricalBacktestResult]
```

## Input contract

```typescript
type RunHistoricalBacktestInput = {
  snapshots: readonly HistoricalTradingSnapshot[];
  strategy: BacktestStrategy;
  engineConfig: EngineConfig;
  initialCashCents: number;
  fillConfig?: BacktestFillSimulationConfig;
  metricsConfig?: {
    periodsPerYear?: number;
    riskFreeRatePerPeriod?: number;
  };
};
```

Unlike `runResearchExperiment()`, this entrypoint accepts `engineConfig` for `ReplaySession.create()`.

## Result contract

```typescript
type HistoricalBacktestResult = {
  replayResult: { results: readonly ReplayStepResult[] };
  strategyRun: BacktestStrategyRunResult;
  ledger: BacktestLedger;
  metrics: BacktestMetricsSummary;
  metadata: HistoricalBacktestMetadata;
};
```

`serializeHistoricalBacktestResult()` uses `stableStringify` for deterministic output.

## Shared metrics derivation

`deriveBacktestMetricsInput()` maps replay output + ledger fills into `ComputeBacktestMetricsInput` (equity curve + closed trades). Both `runHistoricalBacktest()` and `runResearchExperiment()` consume this public helper — no duplicated summary math.

## Rules

- Consumes public APIs only (`ReplaySession`, `BacktestStrategyRunner`, `deriveBacktestMetricsInput`, `computeBacktestMetrics`)
- Immutable deep-frozen outputs
- Does not mutate input snapshots
- No replay, ledger, or metrics logic duplicated in the orchestrator

## Out of scope

- Optimization / ranking
- Walk-forward validation
- Parameter sweeps
- Monte Carlo
- Dashboard / UI
- Persistence

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## API

```typescript
import { runHistoricalBacktest } from "@/lib/data/backtesting";

const result = runHistoricalBacktest({
  snapshots,
  strategy: myStrategy,
  engineConfig: DEFAULT_ENGINE_CONFIG,
  initialCashCents: 100_000,
});
```
