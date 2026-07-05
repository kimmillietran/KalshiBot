# PR-9.15 — Unsupported Historical Market Policy

## Summary

Adds a reusable unsupported-historical-market classifier and skips incomplete archived markets before bronze import, fixture generation, or settlement normalization. Expansion summaries and single-market smoke now report unsupported markets explicitly instead of surfacing them as reconciliation or parser failures.

## Why this is needed

M9.14F proved that some archived Kalshi markets (for example `KXBTC15M-25DEC311900-00`) return `expiration_value: ""` from the live historical API. That is an upstream data limitation, not a pipeline bug.

Previously those markets:

- Entered reconciliation/import validation
- Failed with `Schema reconciliation failed` or `missing required fields`
- Contributed to compatibility circuit breakers and retry noise

Skipping is safer than inventing or deriving `expiration_value`, and validation rules remain unchanged for supported markets.

## Policy

A market is **unsupported** when required immutable historical wire fields are missing after list/detail reconciliation, using the same required-field set as import validation (`ticker`, `open_time`, `close_time`, `expiration_value`).

Unsupported markets:

- Never call `runImport` (no bronze import, prefetch, or settlement normalization)
- Are marked `status: "skipped"` with reason prefix `Unsupported historical market:`
- Do not increment compatibility circuit breaker observations
- Do not enter rate-limit retry loops
- Are checkpointed as completed (no retry)

## What changed

| Area | Change |
| --- | --- |
| Classifier | `classifyUnsupportedHistoricalMarket.ts` |
| Expansion executor | Pre-import gate in `executeMarketImport` |
| Single-market smoke | Reports `unsupportedHistoricalMarket: true` |
| Summaries | `unsupportedCount`, `skippedUnsupportedCount` |
| Checkpoint | Unsupported skips treated as terminal |
| HTML reports | Unsupported counts in summary cards |

## Example outputs

### Single-market smoke

```json
{
  "unsupportedHistoricalMarket": true,
  "failureReason": "Unsupported historical market: Missing expiration_value from Kalshi historical API.",
  "importStatus": "skipped"
}
```

### Expansion summary

```json
{
  "summary": {
    "unsupportedCount": 1,
    "skippedUnsupportedCount": 1
  }
}
```

## Tests

| Scenario | File |
| --- | --- |
| Classifier supported/unsupported | `classifyUnsupportedHistoricalMarket.test.ts` |
| Expansion skips before import | `runHistoricalExpansionImport.test.ts` |
| Single-market unsupported reporting | `runSingleMarketExpansionImportDebug.test.ts` |

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`

## Next decision (out of scope)

Choose expansion windows/tickers where Kalshi returns populated `expiration_value`, or treat empty archived markets as permanently unsupported in coverage planning.
