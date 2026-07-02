# PR 8.5 — Adaptive batch import throttling

## Summary

Replaces fixed per-market import delays with adaptive throttling that speeds up when the Kalshi API is healthy and backs off only when rate limits appear.

## CLI

```bash
npm run import:batch -- \
  --input-dir data/import-configs \
  --output-dir data/imports \
  --concurrency 1 \
  --adaptive-throttle \
  --min-request-delay-ms 100 \
  --max-request-delay-ms 3000 \
  --max-retries 5 \
  --retry-base-delay-ms 2000
```

Optional tuning flags:

- `--throttle-increase-factor`
- `--throttle-decrease-ms`

When `--adaptive-throttle` is omitted, existing fixed `--request-delay-ms` behavior is unchanged.

## Behavior

- Starts at `min-request-delay-ms`
- Decreases delay after clean successes
- Increases delay on HTTP 429 responses (capped at `max-request-delay-ms`)
- Preserves resume semantics (`--overwrite` still required to re-import existing outputs)
- Progress lines go to stderr; stdout remains the compact JSON summary

## Summary output

`batch-import-summary.json` now records adaptive throttle metrics plus per-market `requestDelayMs`, `retryCount`, and `rateLimited`.

## Architecture

| Layer | Path |
|-------|------|
| Engine | `src/lib/data/importJobs/batchImport/batchImportAdaptiveThrottle.ts` |
| Runner | `src/lib/data/importJobs/batchImport/runBatchHistoricalImport.ts` |
| CLI | `scripts/import/runBatchHistoricalImport.ts` |

Import orchestration only — no replay, strategy, or research analysis changes.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
