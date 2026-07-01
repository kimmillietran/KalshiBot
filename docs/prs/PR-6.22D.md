# PR-6.22D — Organized Dataset Storage

## Summary

Milestone 6.22D adds deterministic filesystem organization and indexing for imported historical markets under `data/imports/<series>/<marketTicker>/`.

## Layout

```
data/imports/
  KXBTC15M/
    KXBTC15M-26APR281945-45/
      config.json
      import-result.json
      metadata.json
```

## Architecture

```
data/imports/**
        ↓
scanImportedMarketDatasets()
        ↓
buildImportedMarketMetadata()
        ↓
buildDatasetManifest()
        ↓
dataset-manifest.json
```

## metadata.json

Per-market metadata includes:

- market/event/series tickers
- import timestamp and duration
- source providers (Kalshi + BTC)
- bronze / BTC / Kalshi candle counts
- settlement presence
- validation status
- provenance summary

## CLI

```bash
npm run datasets:build -- --input-dir data/imports --output dataset-manifest.json
```

## Validation

- Duplicate market directories
- Missing `import-result.json`
- Invalid `metadata.json`
- Manifest consistency checks
- Broken directory structure

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
