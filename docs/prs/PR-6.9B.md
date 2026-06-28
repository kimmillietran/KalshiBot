# PR-6.9B — Research Result Export Model

## Summary

Milestone 6.9B adds a pure data transformation layer that converts completed historical research runs and research comparisons into deterministic, export-ready documents.

No filesystem writes, CSV, PDF, dashboard, or console output.

## Architecture

```
HistoricalResearchRun | ResearchComparison
        ↓
buildResearchRunExport() | buildResearchComparisonExport()
        ↓
ResearchExportDocument
        ↓
serializeResearchExportDocument()
```

## Export document contents

| Field | Run export | Comparison export |
|---|---|---|
| `exportId` | Caller-supplied | Caller-supplied |
| `exportType` | `research-run` | `research-comparison` |
| `generated` | Caller metadata (`generatedAt`, optional label/source) | Same |
| `strategyId` | From backtest metadata | `null` |
| `datasetMetadata` | From run artifact | `null` |
| `summary` | Full run metrics | Winner metrics |
| `rankings` | `null` | Ordered ranking rows |
| `tableRows` | Single row keyed by `runId` | Rows keyed by `experimentId` |

## Summary metrics

| Metric | Source |
|---|---|
| Final Equity | `endEquityCents` / comparison final equity |
| Total P/L | `totalPnlCents` (run only; `null` for comparison) |
| Total Return | `totalReturnPct` |
| Max Drawdown | `maxDrawdownPct` |
| Sharpe | `sharpeRatio` (nullable) |
| Win Rate | `winRatePct` |
| Trade Count | `tradeCount` |

## Table rows

Rows use a fixed column order via `RESEARCH_EXPORT_TABLE_COLUMNS` for CLI/dashboard compatibility later. Rows are sorted by `rowKey` lexicographically — never by input array order.

## API

```typescript
import {
  buildResearchRunExport,
  buildResearchComparisonExport,
} from "@/lib/data/research/export";

const runExport = buildResearchRunExport({
  exportId: "run-export-1",
  generated: { generatedAt: "2026-06-27T12:00:00.000Z" },
  run: historicalResearchRun,
});

const comparisonExport = buildResearchComparisonExport({
  exportId: "comparison-export-1",
  generated: { generatedAt: "2026-06-27T12:00:00.000Z" },
  comparison,
});
```

## Error codes

| Code | Trigger |
|---|---|
| `invalid-export-id` | Blank `exportId` |
| `invalid-generated-metadata` | Blank `generatedAt` |
| `invalid-research-run` | Missing run id, strategy id, dataset id, or invalid metrics |
| `invalid-comparison` | Empty or invalid comparison input |

## Deterministic guarantees

- No `Date.now()`, randomness, or hidden mutable state
- Caller supplies all generation timestamps
- Deep-frozen outputs
- `serializeResearchExportDocument()` uses `stableStringify`
- Table rows sorted by `rowKey`

## Out of scope

- Filesystem / CSV / PDF export
- Dashboard rendering
- Experiment execution
- Console logging

## Future integration

- 6.8A CLI can pipe `HistoricalResearchRun` artifacts directly into `buildResearchRunExport()`
- Comparison and report layers can share `ResearchExportDocument.tableRows` for tabular UI

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
