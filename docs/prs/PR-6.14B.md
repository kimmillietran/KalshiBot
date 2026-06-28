# PR-6.14B — Historical Bronze Import CLI Input Builder

## Summary

Milestone 6.14B adds deterministic input/config models for historical bronze import jobs.

**Config validation only** — no HTTP, filesystem, providers, import execution, bronze generation, or validation execution.

## Architecture

```
Import config object
        ↓
buildHistoricalBronzeImportConfig()
        ↓
HistoricalBronzeImportConfig
        ↓
serializeHistoricalBronzeImportConfig()
```

## API

```typescript
import {
  buildHistoricalBronzeImportConfig,
  serializeHistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";

const config = buildHistoricalBronzeImportConfig({
  jobId: "import-job-001",
  marketTicker: "KXBTC15M-26JUN262315-15",
  startTime: "2026-06-26T23:15:00.000Z",
  endTime: "2026-06-26T23:30:00.000Z",
  collectionTime: "2026-06-27T01:00:00.000Z",
  observedAt: "2026-06-27T01:00:05.000Z",
  kalshi: {
    marketSource: "kalshi-rest",
    candleSource: "kalshi-candles",
    settlementSource: "kalshi-rest",
  },
  btc: {
    provider: "binance-spot",
    symbol: "BTCUSDT",
    interval: "1m",
  },
  output: {
    format: "json",
    includeValidationReport: true,
    includeFixture: false,
  },
  metadata: { label: "cli-fixture" },
});

const json = serializeHistoricalBronzeImportConfig(config);
```

## Config shape

| Field | Notes |
|---|---|
| `jobId` | Non-empty string |
| `marketTicker` | Non-empty string |
| `startTime` / `endTime` | Valid UTC ISO-8601; `startTime < endTime` |
| `collectionTime` / `observedAt` | Valid UTC ISO-8601 |
| `kalshi` | `marketSource`, `candleSource`, `settlementSource` |
| `btc` | `provider`, `symbol`, `interval` |
| `output` | `format`, `includeValidationReport`, `includeFixture` |
| `metadata` | Caller-supplied only |

## Supported values

| Category | Values |
|---|---|
| Kalshi sources | `kalshi-rest`, `kalshi-candles` |
| BTC providers | `binance-spot`, `coinbase-spot` |
| BTC intervals | `1m` |
| Output formats | `json`, `ndjson` |

## Deterministic guarantees

- No `Date.now()`, randomness, filesystem, or networking
- Input is never mutated
- Output is deeply frozen
- Serialization uses `stableStringify`

## Out of scope

- Import job execution (6.14A)
- Provider calls, HTTP, filesystem
- Bronze record generation
- Validation report execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
