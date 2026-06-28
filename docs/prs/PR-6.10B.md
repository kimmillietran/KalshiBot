# PR-6.10B — Research Export JSON Formatter

## Summary

Milestone 6.10B adds deterministic JSON formatting utilities for `ResearchExportDocument` objects.

**Formatting only** — no filesystem writes, CSV, PDF, dashboard, or console output.

## Architecture

```
ResearchExportDocument
        ↓
formatResearchExportJson() | formatResearchExportSummaryJson()
        ↓
Deterministic JSON string
```

## API

```typescript
import {
  formatResearchExportJson,
  formatResearchExportSummaryJson,
} from "@/lib/data/research/export";

const fullJson = formatResearchExportJson(document, {
  pretty: true,
  trailingNewline: true,
});

const summaryJson = formatResearchExportSummaryJson(document, {
  pretty: false,
  trailingNewline: false,
});
```

## Format options

| Option | Default | Behavior |
|---|---|---|
| `pretty` | `false` | Compact stable JSON vs indented pretty JSON |
| `trailingNewline` | `false` | Append `\n` when `true` |

## Deterministic guarantees

- Compact mode uses `serializeResearchExportDocument()` / `stableStringify()`
- Pretty mode uses recursive stable key ordering with 2-space indentation
- Repeated calls with identical input/options produce identical output
- Input documents are never mutated
- No `Date.now()` or randomness

## Summary JSON payload

`formatResearchExportSummaryJson()` emits a smaller payload:

- `exportId`, `exportType`, `generated`
- `strategyId`, `datasetId`
- `summary` metrics
- `winnerExperimentId`, `rankingCount` (comparison exports)

`winnerExperimentId` is taken from the first ranking row in the export document (the comparison winner). Tied winners are not expanded in summary JSON — use the full export document or source `ResearchComparison` for tie metadata.

Full `tableRows` and ranking details are omitted.

## Error codes

| Code | Trigger |
|---|---|
| `invalid-export-document` | Missing export id, invalid export type, invalid generated metadata, invalid summary metrics, or malformed table rows |

## Out of scope

- Filesystem writes
- CSV / PDF generation
- Dashboard rendering
- CLI command wiring (Builder #1)

## Future integration

- Builder #1 CLI can call `formatResearchExportJson()` before writing files in a later milestone
- Dashboard tables can consume summary JSON without parsing full export documents

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
