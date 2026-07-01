# PR-6.22B — Batch Import Config Generator

## Summary

Milestone 6.22B converts a normalized `discovery-result.json` from 6.22A into one historical bronze import `config.json` per discovered market. Generation is deterministic, validates inputs strictly, and preserves the existing Coinbase BTC provider defaults.

## Architecture

```
discovery-result.json
        ↓
parseMarketDiscoveryResultJson()
        ↓
buildBatchImportConfigs()
        ↓
data/import-configs/<series>/<marketTicker>/config.json
        ↓
runHistoricalImport.ts --input <config.json>
```

## Import window derivation

| Field | Source |
|---|---|
| `startTime` | `openTime` |
| `endTime` | `closeTime` |
| `collectionTime` / `observedAt` | `closeTime + 10s` |

Kalshi and BTC providers share the same window via the existing import config contract.

## CLI

```bash
npm run discovery:import-configs -- --input discovery-result.json --output-dir data/import-configs
```

## Validation

- Missing discovery file
- Invalid discovery schema
- Invalid discovery validation (`validation.valid === false`)
- Missing `openTime` / `closeTime` for import window derivation
- Duplicate output paths
- Invalid market ticker path characters

## Defaults preserved

```json
{
  "btc": {
    "provider": "coinbase-spot",
    "symbol": "BTC-USD",
    "interval": "1m"
  }
}
```

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
