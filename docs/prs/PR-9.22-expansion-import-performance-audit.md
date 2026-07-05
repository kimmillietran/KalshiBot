# PR-9.22: Expansion Import Performance Audit

## Summary

Adds a read-only performance audit for historical expansion imports. The audit analyzes existing summary, checkpoint, import-config, and imports-directory artifacts to quantify where time was spent and suggest optimizations without changing import behavior.

## CLI

```bash
npm run research:expansion-import-audit
```

### Flags

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/expansion-import-performance-audit.json` |
| `--html-output` | `data/reports/expansion-import-performance-audit.html` |
| `--expansion-import-summary` | `data/research-results/historical-expansion-import-summary.json` |
| `--expansion-import-checkpoint` | `data/research-results/historical-expansion-import-checkpoint.json` |
| `--import-configs-dir` | `data/import-configs` |
| `--imports-dir` | `data/imports` |

## Report contents

- Total elapsed time, imports/minute, average import duration
- p50 / p95 / p99 market import duration
- Rate-limit count and backoff time (with share of elapsed)
- Failed and unsupported market breakdowns
- Slowest tickers and retry counts (summary + checkpoint)
- Estimated discovery, dedupe, and import-write time
- Throughput by hour, month, and job window
- Recommended batch size, backoff setting, adaptive-throttling assessment
- Optimization suggestions (adaptive backoff, batching, parallelism safety, checkpoint/resume, unsupported filtering, discovery dedupe)

## Architecture

```
scripts/research/buildExpansionImportPerformanceAudit.ts
  └─ src/lib/data/research/expansionImportPerformanceAudit/
       loadExpansionImportPerformanceAuditInputs
       computeExpansionImportPerformanceMetrics
       analyzeExpansionImportPerformanceOptimizations
       buildExpansionImportPerformanceAudit
       serialize* (JSON + HTML)
```

Planner/reporting only — no import executor, replay, or hypothesis changes.

## Tests

- `src/lib/data/research/expansionImportPerformanceAudit/buildExpansionImportPerformanceAudit.test.ts`
- `scripts/research/buildExpansionImportPerformanceAudit.test.ts`

## Example interpretation

For a run with `imported=984`, `rateLimitedCount=87`, and `backoffDurationMs=435000` over ~11m38s, the audit attributes a large share of elapsed time to backoff and recommends adaptive throttling, conservative batch sizing, and serialized Kalshi API access.
