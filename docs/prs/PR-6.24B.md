# PR-6.24B — Baseline Strategy Pack

## Summary

Milestone 6.24B adds five deterministic baseline strategies on the strategy plugin interface (ported from 6.24A scope): `noop`, `buy-first-ask`, `buy-below-probability`, `simple-momentum`, and `simple-mean-reversion`.

## Architecture

```
Research fixture (strategyId + strategyConfig)
        ↓
resolveResearchStrategy()
        ↓
StrategyPluginRegistry.parseConfig()
        ↓
adaptStrategyPluginToBacktestStrategy()
        ↓
BacktestStrategyRunner
```

Baseline plugins live under `src/lib/data/strategies/plugin/builtins/`. Registry composition is controlled by `src/lib/data/strategies/baseline/baselineStrategyPack.ts`.

## CLI / fixture wiring

- `scripts/research/types.ts` delegates to `resolveResearchStrategy()`
- Fixture schema accepts optional `strategyConfig`
- `runHistoricalResearch.ts` passes config through to the runner

## Docs

See [docs/strategies/baseline/README.md](../strategies/baseline/README.md).

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
