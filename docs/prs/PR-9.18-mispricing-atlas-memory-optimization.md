# PR-9.18 — Mispricing Atlas Memory Optimization

## Summary

Refactors mispricing atlas building to process research outputs incrementally and aggregate bucket metrics online, eliminating the heap OOM that occurred after historical expansion scaled to thousands of markets and tens of thousands of observations.

## Cause of OOM

The previous builder:

1. Scanned all `research-output.json` files and loaded every JSON payload into memory at once
2. Materialized all mispricing observations across all markets before computing buckets
3. Re-filtered the full observation array for each bucket dimension

At ~4,500 research outputs and ~61,000 observations this exceeded the default Node heap during `npm run research:mispricing-atlas` inside `npm run research:full`.

## Memory strategy

- **Enumerate** research output paths without reading file contents
- **Read one file at a time**, extract only atlas-required fields, then discard the JSON payload
- **Update online bucket accumulators** (counts, sums, Brier components, trading-day sets) instead of retaining observations
- **Finalize** the same `mispricing-atlas.json` schema at the end

No markets are dropped. Bucket math is unchanged for the same inputs.

## CLI

Optional memory instrumentation:

```bash
npm run research:mispricing-atlas -- --memory-report
```

When enabled, atlas output includes `memoryDiagnostics`:

- `filesProcessed`
- `peakHeapUsedBytes` (when `process.memoryUsage` is available)
- `largestFileBytes` / `largestFilePath`
- `totalObservations`

Stdout also echoes `memoryDiagnostics`.

## Out of scope

No changes to replay, fixture generation, settlement parsing, hypothesis generation, validation scoring, strategy synthesis, or promotion logic.

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:mispricing-atlas
npm run research:full
```

Expected: atlas completes without `NODE_OPTIONS` heap overrides; `marketCount` remains consistent with available research outputs.
