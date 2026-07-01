# PR-6.24D — Strategy Sweep Runner

## Summary

Milestone 6.24D adds a strategy sweep runner that executes every selected registered strategy across every market listed in dataset registries.

## Architecture

```
Dataset registries (data/research-datasets/**/dataset-registry.json)
        ↓
StrategyPluginRegistry (registered baseline strategies)
        ↓
runStrategySweep()
        ↓
runHistoricalResearchFromBronze() per strategy × market
        ↓
data/research-results/<strategyId>/<series>/<market>/research-output.json
        ↓
sweep-summary.json
```

The sweep module lives under `src/lib/data/research/sweep/`. The CLI is wired through `scripts/research/runStrategySweep.ts`.

## CLI

```bash
npm run research:sweep -- --all
npm run research:sweep -- --strategy noop --strategy buy-first-ask
npm run research:sweep -- --all --concurrency 2
```

Flags:

- `--all` — run every registered strategy
- `--strategy <id>` — run one strategy (repeatable)
- `--registry <path>` — dataset registry root (default: `data/research-datasets`)
- `--output-dir <path>` — sweep output root (default: `data/research-results`)
- `--summary <path>` — summary file (default: `data/research-results/sweep-summary.json`)
- `--concurrency <n>` — parallel job count (default: `1`)

Partial failures are recorded in `sweep-summary.json`; the CLI exits with code `1` when any run fails.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
