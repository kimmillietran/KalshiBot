# PR-6.22C — Batch Historical Import Runner

## Summary

Milestone 6.22C adds a deterministic batch runner that executes the existing historical bronze import pipeline for every `config.json` discovered under `data/import-configs/<series>/<marketTicker>/`. The runner records per-market status, continues after individual failures, and writes a batch summary JSON.

## Architecture

```
data/import-configs/<series>/<marketTicker>/config.json
        ↓
discoverBatchImportConfigPaths()
        ↓
runBatchHistoricalImport()
        ↓
runHistoricalImportFromConfig()  (existing importer, unchanged)
        ↓
data/imports/<series>/<marketTicker>/import-result.json
        ↓
data/imports/batch-import-summary.json
```

## CLI

```bash
npm run import:batch -- \
  --input-dir data/import-configs \
  --output-dir data/imports \
  --concurrency 1
```

`--concurrency` defaults to sequential execution (`1`).

## Validation

- Missing input directory (fatal)
- Invalid `config.json` (per-market failure, batch continues)
- Duplicate output locations (fatal pre-flight)
- Existing `import-result.json` (per-market skip)
- Partial importer failures (recorded, batch continues)

## Batch summary

`batch-import-summary.json` includes:

- `totalConfigs`, `successfulImports`, `failedImports`, `skippedImports`
- `durationMs`, `startedAt`, `completedAt`
- per-market `status`, `outputPath`, and error details

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
