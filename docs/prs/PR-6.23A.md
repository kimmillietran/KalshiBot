# PR-6.23A — Batch Fixture Bridge

## Summary

Milestone 6.23A adds a deterministic batch runner that converts discovered `import-result.json` files into replay-ready `fixture.json` outputs using the existing fixture bridge from 6.19B.

## Architecture

```
data/imports/<series>/<marketTicker>/import-result.json
        ↓
discoverBatchFixtureImportPaths()
        ↓
runBatchFixtureBridge()
        ↓
serializeHistoricalResearchFixtureFromImportResult()  (existing bridge)
        ↓
data/fixtures/<series>/<marketTicker>/fixture.json
        ↓
data/fixtures/batch-fixtures-summary.json
```

## CLI

```bash
npm run fixtures:batch -- \
  --input-dir data/imports \
  --output-dir data/fixtures \
  --summary batch-fixtures-summary.json
```

## Validation

- Missing input directory (fatal)
- Invalid `import-result.json` (per-market failure, batch continues)
- Fixture bridge failure (per-market failure, batch continues)
- Duplicate output locations (fatal pre-flight)
- Existing `fixture.json` (per-market skip)
- Partial failures recorded in summary

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
