# PR-9.14A — Expansion Import Reconciliation Trace

## Summary

Fixes the M9.13 regression where expansion imports still failed for `KXBTC15M-25DEC311900-00` with `missing required fields: expiration_value` because the discovery list wire snapshot was dropped between discovery and import config metadata. Adds `--trace-market` end-to-end diagnostics and hard regression tests for list/detail reconciliation through the expansion executor path.

## Root cause

M9.13 merged list/detail payloads during prefetch, but the expansion executor rebuilt `kalshiDiscoveryListMarket` from normalized `ExpansionDiscoveredMarket` fields via `discoveredMarketToKalshiListWireShape` instead of preserving the raw list wire captured at discovery time. `executeExpansionImport.ts` also omitted `listMarketWire` when mapping `discoverKalshiHistoricalMarkets` results into `ExpansionDiscoveredMarket`.

When normalized fields were incomplete (or missing list-only fields such as `result`), metadata written to import configs could lack `expiration_value` even though the discovery list response included it.

## Fix

1. **Capture list wire at discovery** — `normalizeDiscoveredMarket` sets `listMarketWire` via `historicalMarketRecordToKalshiListWireShape`.
2. **Propagate through expansion executor** — `executeExpansionImport.ts` passes `listMarketWire` in `discoverMarkets` mapping.
3. **Prefer raw list wire in config metadata** — `buildExpansionMarketImportArtifacts` writes `market.listMarketWire` (fallback: rebuilt normalized wire).
4. **Write config.json on import failure** — failed markets still persist `config.json` for inspection.
5. **End-to-end trace** — `--trace-market <ticker>` records stages from discovery through validation.

## Trace stages

| Stage | What is reported |
| --- | --- |
| `discovery-list-response` | List wire at normalization |
| `expansion-import-config-metadata` | Metadata keys + list wire |
| `per-market-config-json` | Serialized config includes metadata |
| `executor-load` | Config handed to `runImport` |
| `historical-import-bootstrap` | Bootstrap resolved `listMarketWire` |
| `kalshi-prefetch-adapter` | Prefetch forwards list wire |
| `kalshi-importer-get-market` | Detail payload before merge |
| `merge-list-detail` | Merged wire + merged fields |
| `required-field-validation` | Final validation outcome |

Each stage reports: ticker, `expiration_value` present?, source (list/detail/merged/missing), top-level keys, metadata preserved/dropped.

## CLI

```bash
npm run research:execute-expansion-import -- --execute --trace-market KXBTC15M-25DEC311900-00
```

Trace output is written to stderr as JSON lines.

## Tests

| Scenario | File |
| --- | --- |
| List wire preferred over normalized rebuild in config metadata | `expansionImportReconciliationTrace.test.ts` |
| E2E import succeeds when list has `expiration_value`, detail omits it | `expansionImportReconciliationTrace.test.ts` |
| E2E import fails when both omit `expiration_value` (no invented fields) | `expansionImportReconciliationTrace.test.ts` |
| `--trace-market` argv parsing | `executeExpansionImport.test.ts` |
| `historicalMarketRecordToKalshiListWireShape` | `kalshiMarketSchemaReconciliation.test.ts` |
| M9.12 diagnostics preserved | `KalshiHistoricalImporter.test.ts` (unchanged) |

## Constraints honored

- No changes to replay, fixture bridge, hypothesis, validation, strategy synthesis, promotion, or trading logic
- No invented settlement/result/outcome fields
- Detail endpoint values still win when both endpoints return non-empty values

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
