# PR-9.5 — Historical Expansion Import Executor

## Summary

Milestone 9.5 adds a safe executor that consumes `historical-expansion-config.json` and runs scheduled historical expansion imports using existing discovery and import modules.

## CLI

Dry-run by default (summary only, no import artifacts):

```bash
npm run research:execute-expansion-import
```

Execute imports:

```bash
npm run research:execute-expansion-import -- --execute
npm run research:execute-expansion-import -- --execute --max-markets 5 --job-id expansion-KXBTC15M-20260101-20260331
```

| Flag | Default |
|------|---------|
| `--input` | `data/import-configs/historical-expansion-config.json` |
| `--output` | `data/research-results/historical-expansion-import-summary.json` |
| `--html-output` | `data/reports/historical-expansion-import-summary.html` |
| `--import-configs-dir` | `data/import-configs` |
| `--imports-dir` | `data/imports` |
| `--fixtures-dir` | `data/fixtures` |
| `--research-results-dir` | `data/research-results` |
| `--execute` | off (dry-run) |
| `--max-markets` | unlimited |
| `--job-id` | all scheduled jobs |

## Behavior

1. Loads M9.2 expansion manifest
2. For each scheduled job: discovers markets via Kalshi historical discovery with sampling window
3. Dedupes markets already in import configs, fixtures, or research outputs
4. Builds per-market import configs using job `importDefaults` (Coinbase 1m + Kalshi REST)
5. Dry-run: records planned imports in summary only
6. Execute: runs `runHistoricalImportFromConfig` and writes `config.json`, `import-result.json`, and `metadata.json` under existing batch import conventions

## Architecture

```
historical-expansion-config.json
        ↓
runHistoricalExpansionImport (expansionExecutor/)
  ├── scanExistingExpansionMarketTickers
  ├── discoverKalshiHistoricalMarkets
  ├── buildExpansionMarketImportArtifacts
  └── runHistoricalImportFromConfig
        ↓
historical-expansion-import-summary.json + .html
data/import-configs/** + data/imports/** (execute only)
```

- Module: `src/lib/data/importJobs/expansionExecutor/`
- CLI: `scripts/research/executeExpansionImport.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
