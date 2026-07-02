# PR 8.7 — Progress reporting for batch import and strategy sweep

## Summary

Adds shared CLI progress reporting for the two longest research pipeline steps: batch import and strategy sweep. Progress writes to stderr with TTY redraw or periodic non-TTY updates; stdout JSON summaries are unchanged.

## Changes

- `src/lib/cli/progress/` — shared math, renderer, batch import and sweep reporters
- `runBatchHistoricalImport` — rich `[Import]` progress blocks
- `runStrategySweep` — rich `[Sweep]` progress blocks
- `spawnNpmScript` — streams child stderr live during pipeline runs

## Test plan

- [x] Progress renderer (TTY + non-TTY)
- [x] ETA / duration formatting
- [x] Batch import + sweep reporters
- [x] Pipeline stderr streaming
- [x] No stdout pollution in progress tests
- [x] `npm run lint`, `npm run test`, `npm run build`
