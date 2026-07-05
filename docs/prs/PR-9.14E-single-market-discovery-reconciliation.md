# PR-9.14E — Single Market Discovery Reconciliation

## Summary

Fixes single-market smoke mode so it exercises the same discovery → config metadata → bootstrap → prefetch → merge → validation path as real expansion imports. After M9.14A–D, `--market-ticker KXBTC15M-25DEC311900-00` still reported `expirationValueSource: missing` because smoke fetched only the first list page (100 markets) and ran a separate reconciliation implementation.

## Why M9.13 alone was insufficient

M9.13 correctly merged list/detail payloads during historical import prefetch, but single-market smoke (M9.14C) diverged:

| Step | Expansion executor | Single-market smoke (before) |
| --- | --- | --- |
| List payload | `discoverKalshiHistoricalMarkets` → `listMarketWire` | First list page only (`limit=100`, no pagination) |
| Reconciliation | `mergeKalshiMarketWireFromListDetail` in importer prefetch | Duplicate inline merge in smoke runner |
| Config metadata | `buildExpansionMarketImportArtifacts` | Same helper, but fed rebuilt wire missing list fields |
| Provenance | `list` / `merged` / `detail` / `missing` | Custom `reconciled-from-list` label |

For tickers not on the first list page (including `KXBTC15M-25DEC311900-00`), smoke never obtained the discovery list payload M9.13 expects.

## Fix

### 1. Targeted discovery (`discoverSingleExpansionMarket`)

- Paginates the historical list endpoint until the target ticker is found
- Uses `normalizeDiscoveredMarket` + `mapDiscoveredMarketToExpansionMarket` — same normalization as full discovery
- Stops immediately on match (O(pages until found), not O(full expansion window))

### 2. Shared reconciliation (`evaluateExpansionMarketSchemaReconciliation`)

- Canonical wrapper around `mergeKalshiMarketWireFromListDetail` + required-field validation
- Used by smoke reporting and verified to match direct merge calls
- Reports `expirationValueSource` as `detail` | `list` | `merged` | `missing`

### 3. Unified smoke orchestration

Smoke now:

1. `discoverSingleExpansionMarket` → discovery list payload with `listMarketWire`
2. `fetchSingleMarketDetailWire` → detail payload for availability reporting
3. `evaluateExpansionMarketSchemaReconciliation` → reconciliation result
4. `buildExpansionMarketImportArtifacts` → config metadata (`kalshiDiscoveryListMarket`)
5. `runHistoricalImportFromConfig` → bootstrap → prefetch → merge → validation

Reconciliation success and import success are reported separately.

## Expected outcome for `KXBTC15M-25DEC311900-00`

```json
{
  "expirationValueSource": "list",
  "reconciliationSuccess": true,
  "importStatus": "planned"
}
```

## Tests

| Scenario | File |
| --- | --- |
| Paginated discovery finds ticker with `listMarketWire` | `discoverSingleExpansionMarket.test.ts` |
| Shared reconciliation helper matches merge + reports `list` | `evaluateExpansionMarketSchemaReconciliation.test.ts` |
| Smoke dry-run/execute uses discovery payload | `runSingleMarketExpansionImportDebug.test.ts` |
| Reconciliation vs import failure distinguished | `runSingleMarketExpansionImportDebug.test.ts` |
| CLI smoke stdout reports `reconciliationSuccess` + `list` | `executeExpansionImport.test.ts` |
| Detail fields preserved, list fills `expiration_value` | `runSingleMarketExpansionImportDebug.test.ts` |
| Both payloads missing still fails | `runSingleMarketExpansionImportDebug.test.ts` |

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
