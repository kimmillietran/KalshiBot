# PR-6.23B — Research Dataset Registry

## Summary

Milestone 6.23B indexes replay-ready research fixtures under `data/fixtures/<series>/<marketTicker>/fixture.json` into deterministic per-series registry files at `data/research-datasets/<series>/dataset-registry.json`.

## Architecture

```
data/fixtures/**
        ↓
scanResearchFixtures()
        ↓
buildResearchFixtureSummary() + optional import metadata link
        ↓
buildResearchDatasetRegistries()
        ↓
data/research-datasets/<series>/dataset-registry.json
```

## Registry entry fields

- series/market tickers and fixture path
- optional import metadata path + summary
- market close time and settlement presence
- bronze / BTC / Kalshi candle counts
- bronze validation status
- provenance summary (`runId`, `strategyId`, sources)

## CLI

```bash
npm run research:registry -- \
  --input-dir data/fixtures \
  --metadata-dir data/imports \
  --output-dir data/research-datasets
```

## Validation

- Missing fixture directory
- Missing `fixture.json`
- Invalid fixture schema (`historicalResearchCliInputSchema`)
- Duplicate market tickers
- Broken fixture path segments
- Malformed metadata when present (missing metadata tolerated)
- Empty dataset set

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
