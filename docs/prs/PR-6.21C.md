# PR-6.21C — Fix Kalshi Historical Settlement Silver Normalization

## Summary

Live Kalshi settlement bronze records failed silver normalization during fixture bridging with `SilverMalformedPayloadError` because `normalizeSettlement()` required `floor_strike` and canonical millisecond `settlement_ts` while live wire payloads use microsecond timestamps and may omit strike on the settlement record.

## Root cause

`normalizeSettlement()` validated settlement body fields before normalization:

1. **`settlement_ts` microsecond precision** failed `eventTimeSchema` (expects `.SSSZ`, not `.271822Z`).
2. **`floor_strike: null`** failed required positive `floor_strike` in the bronze body schema even when `expiration_value`, `settlement_value_dollars`, and `result` were present.

## Fix

| File | Change |
|---|---|
| `normalizeSettlement.ts` | Normalize `settlement_ts` via `new Date().toISOString()`; accept live `{ market: wire }` shape; resolve `settlementPriceUsd` from `expiration_value` or `settlement_value_dollars`; allow null `floor_strike` when settlement fields complete (flag `partial-window` when strike inferred) |
| `normalizeSettlement.test.ts` | Live-shaped settlement cases + missing-value rejection |
| `importResultFixtureBridge.test.ts` | Regression using repo `import-result.json` |

## Before / after

**Before:** `kalshi-bronze-3e3caae7` threw `SilverMalformedPayloadError` (`expected number, received undefined` + invalid timestamp).

**After:** Live settlement bronze normalizes; `buildHistoricalResearchFixtureFromImportResult(import-result.json)` succeeds.

## Untouched

- Coinbase / BTC importers and bronze mappers
- `HistoricalBronzeValidator`
- Research runner
- `SilverNormalizer` dispatch (settlement path only)

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
