# PR-6.16B — Historical Import Provider Harness

## Summary

Milestone 6.16B adds a deterministic harness that wires validated import config (6.14B) and Kalshi/BTC provider implementations into `runHistoricalBronzeImportJob()` (6.14A).

**Provider composition only** — no provider construction, HTTP, filesystem, or CLI.

## Architecture

```
HistoricalBronzeImportConfig
  + KalshiHistoricalBronzeProvider
  + BtcHistoricalBronzeProvider
        ↓
runConfiguredHistoricalBronzeImport()
        ↓
HistoricalBronzeImportJobResult
```

## API

```typescript
import {
  buildHistoricalBronzeImportConfig,
  runConfiguredHistoricalBronzeImport,
} from "@/lib/data/importJobs";

const config = buildHistoricalBronzeImportConfig({ ... });

const result = runConfiguredHistoricalBronzeImport({
  config,
  kalshiProvider,
  btcProvider,
});
```

## Behavior

- Maps config fields (`jobId`, `marketTicker`, `startTime`, `endTime`, `collectionTime`, `observedAt`) into the import job input
- Delegates orchestration, validation, ordering, and serialization to `runHistoricalBronzeImportJob()`
- Preserves bronze records and validation results from the import job
- Does not mutate the input config

## Dependencies

| Milestone | Role |
|---|---|
| 6.14A | `runHistoricalBronzeImportJob()` orchestration |
| 6.14B | `HistoricalBronzeImportConfig` input model |
| 6.15B | BTC provider contract (caller-supplied) |

## Out of scope

- Provider construction or HTTP adapters
- CLI, filesystem, persistence
- Dataset building, replay, research execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
