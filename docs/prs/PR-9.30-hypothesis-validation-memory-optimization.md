# PR-9.30 — Hypothesis Validation Memory Optimization

## Summary

Eliminates the heap OOM in `npm run research:hypothesis-validation` by replacing full-corpus observation materialization with single-pass incremental bucket aggregates, allowing `npm run research:full` to proceed past validation on the current ~9,100-market dataset.

## Cause of OOM

After M9.29 fixed hypothesis generation, validation became the bottleneck:

1. **`collectEnrichedMispricingObservations`** used `scanCalibrationResearchOutputs`, loading all ~9,100 `research-output.json` payloads into memory at once
2. The function then materialized and sorted **all ~136,000 enriched observations** into one retained array
3. **`buildHypothesisValidationReport`** filtered that global array per candidate and computed grouped metrics (month/quarter/regime/day, leave-one-month-out) on filtered sub-arrays
4. Peak heap reached ~4 GB before Node's default limit during `research:hypothesis-validation` inside `research:full`

## Memory strategy

### Path enumeration

- Use **`enumerateCalibrationResearchOutputPaths`** instead of `scanCalibrationResearchOutputs` when scanning research outputs (paths only for listing; one file read at a time during processing)

### Incremental validation aggregates (primary fix)

- **`collectValidationBucketReferences`** — dedupe atlas bucket refs required by hypothesis candidates
- **`buildValidationObservationAccumulators`** — scan each research output once, route matching observations into per-bucket online aggregates:
  - total count / sum(predicted) / sum(outcome)
  - month, quarter, regime, and trading-day buckets
- **`validateCandidateFromAccumulator`** — compute identical robustness metrics from aggregates (no observation array materialization)
- **`buildHypothesisValidationReportFromInputs`** — uses accumulator path for production; legacy observation-array path retained for unit tests

No changes to validation scoring formulas, LOMO semantics, temporal stability logic, promotion thresholds, or output schema (aside from optional `memoryDiagnostics` when `--memory-report` is enabled).

## CLI

```bash
npm run research:hypothesis-validation -- --memory-report
```

Stdout echoes `memoryDiagnostics` when enabled:

- `hypothesisCandidateCount`
- `validationCandidateCount` / `atlasBucketReferenceCount`
- `researchOutputFilesScanned`
- `observationsProcessed` / `observationsMatched`
- `monthBucketCount`
- `peakHeapUsedBytes`
- `largestFileBytes` / `largestFilePath`
- `skippedUnsupportedCandidates`

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:hypothesis-validation
npm run research:full
```

Expected: validation completes without `NODE_OPTIONS` heap overrides; `research:full` proceeds into downstream strategy synthesis steps.

## Remaining limitations

- Cross-validation (`loadCrossValidationInputs`) still uses `collectEnrichedMispricingObservations` with full observation materialization — separate milestone if it OOMs at scale
- Per-file inner loop is `references × observations`; pre-indexed bucket keys on observations would reduce CPU further
