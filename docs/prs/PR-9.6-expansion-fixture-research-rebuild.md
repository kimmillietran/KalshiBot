# PR-9.6 — Expansion Fixture + Research Rebuild Pipeline

## Summary

Adds `npm run research:rebuild-after-expansion` to rebuild fixtures and research outputs after M9.5 expansion imports. The command reads `historical-expansion-import-summary.json`, runs the existing fixture bridge and historical research replay for newly imported markets, refreshes the research dataset registry, and writes JSON + HTML rebuild summaries with before/after coverage metrics.

## CLI

```bash
npm run research:rebuild-after-expansion
npm run research:rebuild-after-expansion -- --full-rebuild
```

### Flags

| Flag | Default |
|------|---------|
| `--input` | `data/research-results/historical-expansion-import-summary.json` |
| `--output` | `data/research-results/expansion-rebuild-summary.json` |
| `--html-output` | `data/reports/expansion-rebuild-summary.html` |
| `--fixtures-dir` | `data/fixtures` |
| `--imports-dir` | `data/imports` |
| `--import-configs-dir` | `data/import-configs` |
| `--registry-dir` | `data/research-datasets` |
| `--research-results-dir` | `data/research-results` |
| `--mispricing-atlas` | `data/research-results/mispricing-atlas.json` |
| `--concurrency` | `1` |
| `--full-rebuild` | off |

## Architecture

| Layer | Path | Responsibility |
|-------|------|----------------|
| Orchestrator | `src/lib/data/research/expansionRebuild/runExpansionRebuild.ts` | Target selection, fixture bridge, registry rebuild, scoped research replay |
| Summary loader | `loadHistoricalExpansionImportSummary.ts` | Parses M9.5 import summary; extracts `status: imported` markets |
| Metrics | `collectExpansionRebuildMetrics.ts` | Before/after fixture, research, registry, trading-day, atlas counts |
| CLI | `scripts/research/rebuildAfterExpansion.ts` | Production deps wiring + stdout/stderr contract |

Reuses:

- `serializeHistoricalResearchFixtureFromImportResult` (fixture bridge)
- `buildResearchDatasetRegistryFromDirectories` (registry)
- `runHistoricalResearchFromBronze` (research replay)
- `validateSerializedBatchFixtureJson` / `validateSerializedResearchOutputJson`

## Behavior

- **Default:** rebuild fixtures + research for markets with `status: "imported"` in the expansion import summary; skip existing outputs.
- **`--full-rebuild`:** discover all import results under `--imports-dir`; overwrite fixtures and research outputs.
- **Partial success:** per-market fixture/research failures are recorded; the command exits `1` when any failures occur but still writes summary artifacts.
- **No semantic changes** to replay, strategy, hypothesis, or validation scoring.

## Tests

- `loadHistoricalExpansionImportSummary.test.ts` — summary parsing + imported market extraction
- `runExpansionRebuild.test.ts` — expansion-only rebuild, skip-existing, partial failure
- `serializeExpansionRebuildSummaryHtml.test.ts` — HTML report smoke
- `rebuildAfterExpansion.test.ts` — CLI error paths

## Verification

```bash
npm run lint
npm run test
npm run build
```
