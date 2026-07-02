# PR-6.27C — Walk-Forward Strategy Sweep

## Summary

Milestone 6.27C connects walk-forward validation folds (6.27A) with the strategy sweep runner (6.24D). For each fold, selected strategies run historical research against **validation markets only**, producing deterministic out-of-sample results under `data/walk-forward-results/`.

The existing `runStrategySweep()` module and `research:sweep` CLI are unchanged.

## Architecture

```
data/walk-forward/<splitId>/walk-forward-summary.json
        ↓
discoverWalkForwardSplit()
        ↓
runWalkForwardStrategySweep()
        ↓
runHistoricalResearchFromBronze() per fold × strategy × validation market
        ↓
data/walk-forward-results/<splitId>/fold-000/<strategyId>/<series>/<market>/research-output.json
        ↓
walk-forward-summary.json
```

Core logic: `src/lib/data/research/walkForwardSweep/`

## CLI

```bash
npm run research:walk-forward-sweep -- \
  --split-id wf-kxbtc15m \
  --all

npm run research:walk-forward-sweep -- \
  --split-id wf-kxbtc15m \
  --strategy fair-value-diffusion \
  --strategy noop \
  --concurrency 2
```

Flags:

- `--split-id <id>` — required walk-forward split id
- `--all` — run every registered strategy
- `--strategy <id>` — run one strategy (repeatable)
- `--split-input-dir <path>` — walk-forward split root (default: `data/walk-forward`)
- `--output-dir <path>` — sweep output root (default: `data/walk-forward-results`)
- `--concurrency <n>` — parallel job count (default: `1`)

Partial failures are recorded in `walk-forward-summary.json`; the CLI exits with code `1` when any run fails.

## Validation

| Condition | Error code |
|---|---|
| Missing split directory | `missing-split-dir` |
| Missing split summary | `missing-split-summary` |
| Duplicate fold index | `duplicate-fold-index` |
| Empty validation set | `empty-validation-set` |
| Unknown strategy | `unknown-strategy-id` |
| Missing fixture | per-run failure (batch continues) |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
