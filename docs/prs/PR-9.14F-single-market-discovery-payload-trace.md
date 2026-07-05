# PR-9.14F — Single Market Discovery Payload Trace

## Summary

Fixes the real single-market smoke command for `KXBTC15M-25DEC311900-00` by using the Kalshi historical list API `tickers` filter for O(1) lookup instead of paginating through the full `KXBTC15M` series window. Adds deep discovery payload trace fields to `single-market-expansion-import-debug.json` so future regressions show exactly where `expiration_value` disappears.

## Why M9.14E was insufficient

M9.14E correctly unified smoke with the expansion import reconciliation path, but single-market discovery still called:

```
GET /historical/markets?series_ticker=KXBTC15M&limit=100&cursor=...
```

and paginated until the target ticker appeared. For `KXBTC15M-25DEC311900-00` (Dec 2025, deep in an 11,780+ market series), paginated discovery exhausted pages without finding the ticker. Smoke then ran reconciliation with:

- `listMarketWire = null` (discovery miss)
- `detailMarketWire` present but **without** `expiration_value` (detail endpoint omits it)

Result:

```json
{
  "mode": "single-market-smoke",
  "marketTicker": "KXBTC15M-25DEC311900-00",
  "expirationValueSource": "missing",
  "reconciliationSuccess": false,
  "failureReason": "Schema reconciliation failed: missing expiration_value"
}
```

Unit tests passed because mocks returned the fixture market on the first (or second) mocked page. The real API path never reached that ticker via series pagination alone.

### Trace diagnosis (after fix)

| Stage | `expiration_value` present? |
| --- | --- |
| Tickers discovery (`?tickers=KXBTC15M-25DEC311900-00`) | **Ticker found** in 1 page |
| Raw API list wire | **No** — Kalshi returns `expiration_value: ""` |
| `normalizeDiscoveredMarket` | **No** — empty string preserved as absent |
| `listMarketWire` | **No** — raw wire used directly (no rebuild drop) |
| Detail wire | **No** — omitted by detail endpoint |
| Reconciliation input/output | **No** |

**Root cause (two parts):**

1. **M9.14E discovery miss (fixed):** Series pagination often never reaches Dec 2025 tickers; the `tickers` filter finds the market in O(1).
2. **Kalshi API data gap (external):** As of 2026-07-05, the live historical list/detail endpoints return `expiration_value: ""` for `KXBTC15M-25DEC311900-00` and sibling Dec 2025 markets. The fixture (`94210.55`) captured an earlier API response. Newer May 2026 markets in the same series do return populated `expiration_value`.

The pipeline no longer drops the field — the trace proves the API source is empty. Reconciliation correctly fails without inventing values.

## Fix

### 1. Ticker-targeted list lookup (`discoverSingleExpansionMarket`)

- First request: `GET /historical/markets?tickers=KXBTC15M-25DEC311900-00&limit=100`
- Kalshi documents `tickers` as mutually exclusive with `series_ticker`; returns the specific market in one page
- Pagination fallback retained only when the tickers filter returns no match (edge cases)

### 2. `HistoricalPaginationOptions.tickers` + `buildHistoricalMarketsPath`

- Adds `tickers` query param support to the historical markets path builder
- When `tickers` is set, omits `series_ticker` per API contract

### 3. Deep discovery payload trace (`discoveryTrace`)

`single-market-expansion-import-debug.json` now reports:

- `pagesScanned`, `tickerFound`, `foundOnPage`
- `rawDiscoveredMarketTopLevelKeys`, `rawDiscoveredMarketHasExpirationValue`, `rawDiscoveredMarketExpirationValue`
- `normalizedMarketHasExpirationValue`, `normalizedMarketExpirationValue`
- `listMarketWireHasExpirationValue`, `listMarketWireExpirationValue`
- `configMetadataHasExpirationValue`, `configMetadataExpirationValue`
- `reconciliationInputHasExpirationValue`, `reconciliationInputExpirationValue`
- `reconciliationOutputHasExpirationValue`, `reconciliationOutputExpirationValue`

## Real command output

### Before

```json
{
  "mode": "single-market-smoke",
  "marketTicker": "KXBTC15M-25DEC311900-00",
  "expirationValueSource": "missing",
  "reconciliationSuccess": false,
  "failureReason": "Schema reconciliation failed: missing expiration_value"
}
```

### After (pipeline fixed; API still empty for this ticker)

```json
{
  "mode": "single-market-smoke",
  "marketTicker": "KXBTC15M-25DEC311900-00",
  "expirationValueSource": "missing",
  "reconciliationSuccess": false,
  "failureReason": "Schema reconciliation failed: missing expiration_value"
}
```

`discoveryTrace` confirms `tickerFound: true`, `pagesScanned: 1`, and all pipeline stages lack a non-empty `expiration_value` because the Kalshi list wire returns `expiration_value: ""`.

When the API returns a populated list wire (fixture / newer markets), stdout shows:

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
| Tickers filter finds market with `expiration_value` | `discoverSingleExpansionMarket.test.ts` |
| Pagination fallback when tickers filter misses | `discoverSingleExpansionMarket.test.ts` |
| `tickers` path builder | `historicalEndpoints.test.ts` |
| Deep trace at each pipeline stage | `buildSingleMarketDiscoveryPayloadTrace.test.ts` |
| `KXBTC15M-25DEC311900-00` acceptance trace + reconciliation | `runSingleMarketExpansionImportDebug.test.ts` |
| CLI smoke stdout `list` + `reconciliationSuccess: true` | `executeExpansionImport.test.ts` |

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
- [x] Real command run: `npm run research:execute-expansion-import -- --market-ticker=KXBTC15M-25DEC311900-00` (trace proves API `expiration_value` empty; acceptance regression uses fixture)
