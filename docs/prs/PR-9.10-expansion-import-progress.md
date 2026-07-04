# PR-9.10 — Historical Expansion Import Progress Reporting

## Summary

Adds live stderr progress reporting for `research:execute-expansion-import` (and orchestrator `--execute-expansion-import` runs). Users see per-job discovery summaries and per-market progress bars with counts, elapsed time, and ETA while long expansion imports run.

## CLI

No new commands. Progress appears automatically on stderr for:

```bash
npm run research:execute-expansion-import
npm run research:execute-expansion-import -- --execute
npm run research:full -- --execute-expansion-import
```

## Architecture

| Layer | Path | Responsibility |
|-------|------|----------------|
| Progress formatter | `src/lib/cli/progress/expansionImportProgress.ts` | Job header + market progress lines, reporter factory |
| Executor hooks | `runHistoricalExpansionImport.ts` | Calls progress hooks without changing import semantics |
| CLI wiring | `scripts/research/executeExpansionImport.ts` | Creates reporter, writes to stderr |

Reuses `createCliProgressRenderer`, `formatProgressBar`, `formatDurationClock`, and `calculateEtaMs` from existing batch import progress utilities.

## Behavior

- Progress in dry-run and execute modes (`DRY RUN` label when not executing).
- Job header: job index, jobId, window, discovered/already covered/to import counts.
- Market block: progress bar, current ticker, imported/planned/failed/skipped, elapsed, ETA.
- `--max-markets` and `--resume` surfaced in job header when set.
- JSON/HTML summaries unchanged; stdout JSON contract unchanged.

## Tests

- `expansionImportProgress.test.ts` — formatter + reporter unit tests
- `runHistoricalExpansionImport.test.ts` — progress hook integration
- `executeExpansionImport.test.ts` — stderr progress in dry-run and execute modes

## Verification

```bash
npm run lint
npm run test
npm run build
```
