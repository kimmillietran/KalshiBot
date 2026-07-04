# PR-9.13 — Historical Import Schema Reconciliation

## Summary

Fixes the M9.12 discovery/import schema mismatch by preserving Kalshi list-endpoint market payloads through expansion import and reconciling them with detail-endpoint responses during prefetch. Expansion-discovered markets such as `KXBTC15M-25DEC311900-00` can import successfully without inventing missing fields.

## Approach chosen: Option A (preferred)

| Option | Decision |
| --- | --- |
| **A — Merge discovery list payload into detail response** | **Implemented** |
| B — Relax `expiration_value` parser requirement | Rejected: field is required for bronze mapping and settlement normalization |
| C — Skip incompatible markets | Rejected: would silently drop large discovery windows without fixing the underlying mismatch |

### Why Option A is safest

- Uses only values Kalshi already returned on the discovery/list endpoint
- Does not overwrite non-empty detail fields (detail wins on conflicts)
- Does not synthesize `result`, settlement outcomes, or other absent fields
- Keeps M9.12 diagnostics for genuinely malformed responses (both endpoints incomplete)
- Limits scope to expansion imports via `HistoricalBronzeImportConfig.metadata`; batch/manual imports unchanged

## Data flow

```
discoverKalshiHistoricalMarkets
  → ExpansionDiscoveredMarket (includes expirationValue + provenance)
  → buildExpansionMarketImportArtifacts
      metadata.kalshiDiscoveryListMarket
      metadata.kalshiDiscoveryListMarketProvenance
  → runHistoricalImportFromConfig
  → createPrefetchedKalshiHistoricalBronzeProvider(listMarketWire)
  → KalshiHistoricalImporter.getHistoricalMarket({ listMarketWire })
      mergeKalshiMarketWireFromListDetail(list, detail)
```

## Key changes

### `kalshiMarketSchemaReconciliation.ts`

- `discoveredMarketToKalshiListWireShape`
- `mergeKalshiMarketWireFromListDetail` — fills only empty detail fields from list payload
- Metadata keys: `kalshiDiscoveryListMarket`, `kalshiDiscoveryListMarketProvenance`

### Expansion executor

- `ExpansionDiscoveredMarket` carries full discovery fields through `discoverMarkets`
- `buildExpansionMarketImportArtifacts` writes list wire + provenance into import config metadata

### Import prefetch

- `prefetchKalshiHistoricalBronzeImporter` forwards `listMarketWire` to market + settlement fetches
- `HistoricalImportBootstrap` reads metadata and passes list payload into prefetch

### `KalshiHistoricalImporter`

- `getHistoricalMarket` / `getSettlementResult` accept optional `listMarketWire`
- Reconcile before required-field validation; diagnostics unchanged when merge cannot satisfy parser

## Tests

| Scenario | File |
| --- | --- |
| List/detail merge for `KXBTC15M-25DEC311900-00` | `kalshiMarketSchemaReconciliation.test.ts` |
| Importer succeeds with list fallback; still fails when both incomplete | `KalshiHistoricalImporter.test.ts` |
| Metadata written to expansion import config | `runHistoricalExpansionImport.test.ts` |
| Prefetch forwards list payload | `KalshiHistoricalPrefetchAdapter.test.ts` |
| Circuit breaker not tripped on successful imports | `runHistoricalExpansionImport.test.ts` |

## Deferred

- Persisting per-field reconciliation provenance on bronze records (config metadata + list provenance is sufficient for this milestone)
- Filtering discovery to markets whose detail endpoint is permanently incompatible even after list merge

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
