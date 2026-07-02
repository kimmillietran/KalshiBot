# PR-6.28B — Parameter Strategy Sweep

## Summary

Adds a parameter sweep runner that executes one strategy across markets for every generated parameter combination (`markets × strategies × parameter sets`).

## Architecture

```
ParameterSweepDefinition (JSON)
        ↓
generateParameterSets() → ps-0001, ps-0002, ...
        ↓
runParameterStrategySweep()
        ↓
runStrategySweep() per parameter set (existing research runner unchanged)
        ↓
data/research-results/<strategyId>/ps-0001/<series>/<market>/research-output.json
        ↓
parameter-sweep-summary.json
```

The engine lives under `src/lib/data/research/parameterSweep/`. The CLI is wired through `scripts/research/runParameterSweep.ts`.

## Definition format

```json
{
  "strategyId": "fair-value-diffusion",
  "parameters": {
    "minimumEdgeThresholdCents": [2, 4, 6, 8],
    "volatilityLookbackBars": [5, 10, 20],
    "minimumTimeRemainingMs": [30000, 60000]
  }
}
```

- Cartesian products are generated deterministically in parameter declaration order.
- Each combination receives a stable `parameterSetId` (`ps-0001`, `ps-0002`, ...).
- An empty `parameters` object yields a single default parameter set.

## CLI

```bash
npm run research:parameter-sweep -- \
  --config data/sweeps/fair-value-diffusion.json \
  --registry data/research-datasets \
  --output-dir data/research-results
```

Flags:

- `--config <path>` — parameter sweep definition JSON (required)
- `--registry <path>` — dataset registry root (default: `data/research-datasets`)
- `--output-dir <path>` — output root (default: `data/research-results`)
- `--concurrency <n>` — parallel market runs per parameter set (default: `1`)
- `--summary <path>` — summary file (default: `data/research-results/<strategyId>/parameter-sweep-summary.json`)

## Aggregation

Each parameter set is written under its own directory (`<strategyId>/ps-0001/`). Run `research:aggregate` with `--input-dir data/research-results/<strategyId>/ps-0001` to treat each parameter set as an independent strategy variant.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
