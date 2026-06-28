# PR-6.13B — Historical Bronze Validation Report Builder

## Summary

Milestone 6.13B adds a deterministic report model for `HistoricalBronzeValidationResult`.

**Reporting only** — no validation, repair, normalization, dataset building, replay, research execution, filesystem, or networking.

## Architecture

```
HistoricalBronzeValidationResult
        ↓
buildHistoricalBronzeValidationReport()
        ↓
HistoricalBronzeValidationReport
        ↓
serializeHistoricalBronzeValidationReport()
```

## API

```typescript
import {
  buildHistoricalBronzeValidationReport,
  serializeHistoricalBronzeValidationReport,
} from "@/lib/data/datasets/validation/report";

const report = buildHistoricalBronzeValidationReport({
  validationResult,
  metadata: { datasetId: "ds-001" },
});

const json = serializeHistoricalBronzeValidationReport(report);
```

## Report shape

```typescript
{
  reportId: string;
  valid: boolean;
  summary: {
    totalRecords;
    errorCount;
    warningCount;
    marketCount;
    btcBarCount;
    settlementCount;
    duplicateCount;
  };
  issuesByCode: { errorCode; issues }[];
  issuesByTicker: { ticker; issues }[];
  topIssues: HistoricalBronzeValidationIssue[];
  metadata: Record<string, unknown>;
}
```

## Ordering

| Field | Order |
|---|---|
| `issuesByCode` | Groups sorted by `errorCode`; issues preserve validator ordering within each group |
| `issuesByTicker` | Groups sorted by `ticker` (non-null before null); issues preserve validator ordering within each group |
| `topIssues` | Errors first, then warnings — each in validator sort order |

## Deterministic guarantees

- `reportId` derived via `fnv1a32(stableStringify({ valid, errors, warnings, statistics, metadata }))`
- No `Date.now()`, randomness, filesystem, or networking
- Input validation result is never mutated
- Output is deeply frozen
- Serialization uses `stableStringify`

## Out of scope

- Validation (`HistoricalBronzeValidator` unchanged)
- Repair, normalization, dataset assembly
- CLI, runner, ledger, metrics, exports, persistence

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
