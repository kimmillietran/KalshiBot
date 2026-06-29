# PR-6.20B — BTC Provider Selection & Bootstrap

## Summary

Milestone 6.20B teaches the historical import bootstrap to construct the correct BTC historical importer based on `config.btc.provider`, enabling execute mode to use either Binance or Coinbase without CLI changes.

**Bootstrap wiring only** — no new importer implementation, bronze contract changes, import job changes, or CLI flag changes.

## Pipeline

```
config.json → btc.provider
        ↓
BINANCE_SPOT                    COINBASE_SPOT
        ↓                               ↓
createBtcHistoricalImporter()   createCoinbaseHistoricalImporter()
        ↓                               ↓
prefetch bars (same path)
        ↓
createBtcHistoricalBronzeProviderFromImporter()
        ↓
runConfiguredHistoricalBronzeImport()
        ↓
HistoricalBronzeImportJob
```

## Provider selection

| `btc.provider` | Importer factory | HTTP adapter |
|---|---|---|
| `binance-spot` | `createBtcHistoricalImporter()` | `BtcHistoricalHttpAdapter` |
| `coinbase-spot` | `createCoinbaseHistoricalImporter()` | `CoinbaseHistoricalHttpAdapter` |

Both paths prefetch bars, then wire through `createBtcHistoricalBronzeProviderFromImporter()` unchanged.

## Execution behavior

- **Dry-run:** unchanged
- **Execute with injected providers:** unchanged (uses `deps` directly)
- **Execute without deps:** bootstrap selects importer from `config.btc.provider`

## Out of scope

- New importer implementation (6.20A)
- Bronze provider / import job / fixture bridge / validator changes
- CLI flag changes, filesystem writes, persistence

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
