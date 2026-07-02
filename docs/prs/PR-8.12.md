# PR 8.12 — Settlement outcome recovery

## Summary

Fixes mispricing atlas and calibration skipping all markets because settlement was read from `dataset.snapshots[0]` while candle-replay datasets attach settlement only to the final expanded snapshot.

## Root cause

`expandMarketSnapshotsForCandleReplay` sets `settlement: null` on all but the last snapshot. Atlas/calibration parsers only inspected the first snapshot.

## Fix

- Shared helper: `src/lib/data/research/settlement/readResearchOutputSettlement.ts`
- Atlas and calibration scan all snapshots for the last yes/no settlement result
- Missing-settlement diagnostics name the checked field path

## Test plan

- [x] Expanded snapshot settlement recovery (atlas + calibration)
- [x] Missing settlement diagnostic message
- [x] Existing atlas/hypothesis tests still pass
- [x] `npm run lint`, `npm run test`, `npm run build`

## Note on settlement audit (M8.8)

No `research:settlement-audit` script exists in the repo. Use `npm run debug:settlement` (PR 8.9) for per-market traces.
