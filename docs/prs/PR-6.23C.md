# PR-6.23C — Batch Research Runner

## Summary

Milestone 6.23C adds a deterministic batch runner that executes the existing historical research engine for every market listed in per-series `dataset-registry.json` files under `data/research-datasets/<series>/`.

## Architecture

```
data/research-datasets/<series>/dataset-registry.json
        ↓
discoverResearchDatasetRegistryPaths()
        ↓
runBatchResearch()
        ↓
runHistoricalResearchFromBronze()  (existing engine, unchanged)
        ↓
data/research-results/<series>/<marketTicker>/research-output.json
        ↓
data/research-results/batch-research-summary.json
```

## CLI

```bash
npm run research:batch -- \
  --registry data/research-datasets \
  --output-dir data/research-results \
  --concurrency 1
```

## Validation

- Missing registry directory (fatal)
- Invalid registry schema (fatal)
- Missing or invalid fixture (per-market failure, batch continues)
- Research execution failure (per-market failure, batch continues)
- Duplicate output locations (fatal pre-flight)
- Existing `research-output.json` (per-market skip)

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
