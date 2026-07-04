# PR 9.7 — Expansion Import Safety + Resume

## Summary

Adds checkpoint/resume safety to the M9.5 historical expansion import executor. Imports can be interrupted and resumed without duplicating work, failed markets can be retried with a configurable limit, and partial summaries are written after each market for cancellation-safe progress tracking.

## CLI

```bash
npm run research:execute-expansion-import
```

Optional flags:

| Flag | Default | Description |
|------|---------|-------------|
| `--input` | `data/import-configs/historical-expansion-config.json` | Expansion import config |
| `--output` | `data/research-results/historical-expansion-import-summary.json` | Summary JSON |
| `--html-output` | `data/reports/historical-expansion-import-summary.html` | Summary HTML |
| `--checkpoint-path` | `data/research-results/historical-expansion-import-checkpoint.json` | Checkpoint JSON |
| `--summary-input` | _(none)_ | Optional prior summary for resume context |
| `--execute` | dry-run | Run imports (default is plan-only) |
| `--resume` | false | Resume from checkpoint |
| `--skip-failed` | false | Skip failed markets instead of retrying |
| `--force-market` | _(none)_ | Import only the specified ticker |
| `--max-retries` | `0` | Retry budget for failed markets |
| `--max-markets` | _(none)_ | Cap markets per run |
| `--job-id` | _(none)_ | Filter to one expansion job |

## Outputs

- `historical-expansion-import-checkpoint.json` — per-job and per-market progress
- Updated `historical-expansion-import-summary.json` with `runStatus`: `completed`, `partial`, or `interrupted`

## Architecture

```
historical-expansion-config.json
        │
        ▼
runHistoricalExpansionImport
        ├── expansionImportSafety (checkpoint plan/persist)
        └── deps.runImport → runHistoricalImportFromConfig
        │
        ▼
checkpoint.json + summary.json + summary.html
```

- M9.5 executor: `src/lib/data/importJobs/expansionExecutor/`
- M9.7 safety layer: `src/lib/data/importJobs/expansionImportSafety/`
- CLI: `scripts/research/executeExpansionImport.ts`

Import semantics and research outputs are unchanged — all imports delegate to `runHistoricalImportFromConfig`.

## Test plan

- [x] Interrupted import resume
- [x] Existing checkpoint skip
- [x] Retry then success
- [x] Retry exhaustion
- [x] Partial summary output
- [x] M9.5 dry-run and execute smoke tests
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
