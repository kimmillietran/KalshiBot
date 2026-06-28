# PR-6.12B — Historical Bronze Dataset Validator

## Summary

Milestone 6.12B adds a deterministic validation layer for `RawHistoricalRecord` collections before they enter `HistoricalDatasetBuilder`.

**Validation only** — no repair, normalization, download, persistence, dataset build, replay, or research execution.

## Architecture

```
RawHistoricalRecord[]
        ↓
validateHistoricalBronzeDataset()
        ↓
HistoricalBronzeValidationResult
        ↓
HistoricalDatasetBuilder (caller)
```

## API

```typescript
import { validateHistoricalBronzeDataset } from "@/lib/data/datasets/validation";

const result = validateHistoricalBronzeDataset(bronzeRecords);
```

## Validation rules

| Rule | Error code |
|---|---|
| Duplicate record ids | `duplicate-record-id` |
| Duplicate market windows per ticker | `duplicate-market-window` |
| Duplicate settlements per ticker | `duplicate-settlement` |
| Duplicate BTC bars per ticker/interval | `duplicate-btc-bar` |
| Missing/invalid timestamps | `missing-timestamp` |
| openTime ≥ closeTime | `invalid-timestamp-ordering` |
| Missing ticker | `missing-ticker` |
| Missing contentType | `missing-content-type` |
| Unsupported contentType | `unsupported-content-type` |
| Malformed payload / schema failure | `malformed-payload` |
| Incomplete snapshot group | `incomplete-market-group` |
| Settlement without market window | `orphan-settlement` |
| BTC bar without market window | `orphan-btc-history` |
| Non-positive prices | `negative-price` |
| Invalid BTC OHLC relationships | `invalid-ohlc` |
| Negative volume | `invalid-volume` |
| Empty dataset | `empty-dataset` |

## Issue ordering

Issues are sorted by:

1. `eventTime`
2. `ticker`
3. `recordId`
4. `errorCode`

## Result shape

```typescript
{
  valid: boolean;
  errors: HistoricalBronzeValidationIssue[];
  warnings: HistoricalBronzeValidationIssue[]; // reserved — always empty in 6.12B
  statistics: {
    totalRecords;
    marketCount;
    btcBarCount;
    settlementCount;
    duplicateCount; // count of duplicate-class error issues emitted
  };
}
```

### `duplicateCount` semantics

`statistics.duplicateCount` is the number of validation **issues** whose `errorCode` is one of:

- `duplicate-record-id`
- `duplicate-market-window`
- `duplicate-settlement`
- `duplicate-btc-bar`

A conflicting duplicate `recordId` (same id, different payload) emits **two** `duplicate-record-id` issues and increments `duplicateCount` by 2.

### Warnings channel

`warnings` is reserved for future non-fatal findings. Milestone 6.12B emits errors only; `warnings` is always an empty frozen array.

## Deterministic guarantees

- No `Date.now()`, randomness, UUID, filesystem, or networking
- Input records are never mutated
- Output is deeply frozen
- `serializeHistoricalBronzeValidation()` uses `stableStringify`

## Out of scope

- Record repair or normalization
- Dataset assembly (`HistoricalDatasetBuilder` unchanged)
- CLI / research runner changes
- File writes

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
