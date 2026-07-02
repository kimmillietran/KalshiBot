# PR-6.27A — Walk-Forward Validation Engine

## Summary

Milestone 6.27A adds a deterministic walk-forward validation engine that splits research dataset registries into rolling training and validation market folds ordered by `marketCloseTime`. Each fold is written under `data/walk-forward/` with train markets, validation markets, embargo metadata, and stable ordering.

## Architecture

```
data/research-datasets/<series>/dataset-registry.json
        ↓
orderWalkForwardMarkets()  (time-based sort)
        ↓
generateWalkForwardFolds()
        ↓
runWalkForwardSplit()
        ↓
data/walk-forward/<splitId>/folds/fold-000.json
data/walk-forward/<splitId>/walk-forward-summary.json
```

Core logic lives in `src/lib/data/research/walkForwardEngine/`. The existing snapshot-level 6.6C validator is unchanged.

## CLI

```bash
npm run research:walk-forward -- \
  --registry data/research-datasets \
  --output-dir data/walk-forward \
  --split-id wf-kxbtc15m \
  --training-window 10 \
  --validation-window 3 \
  --step-size 3 \
  --embargo 1
```

Reusable split definitions:

```bash
npm run research:walk-forward -- --config walk-forward-split.json
```

## Split definition

```json
{
  "splitId": "wf-kxbtc15m",
  "trainingWindowSize": 10,
  "validationWindowSize": 3,
  "stepSize": 3,
  "embargoMarketCount": 1,
  "allowOverlappingValidationWindows": true
}
```

## Validation

| Condition | Error code |
|---|---|
| Missing registry directory | `missing-registry-dir` |
| Empty dataset | `empty-dataset` |
| Invalid window sizes | `invalid-window-size` |
| Invalid step size | `invalid-step-size` |
| Invalid embargo | `invalid-embargo` |
| Window larger than dataset | `window-larger-than-dataset` |
| Zero folds generated | `empty-folds` |
| Duplicate market ticker | `duplicate-market` |
| Missing `marketCloseTime` | `missing-market-close-time` |
| Train/validation overlap in fold | `overlapping-fold-partitions` |
| Overlapping validation windows (when disabled) | `overlapping-validation-windows` |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
