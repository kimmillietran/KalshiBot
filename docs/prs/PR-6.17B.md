# PR-6.17B — BTC Historical HTTP Importer

## Summary

Milestone 6.17B adds the first real historical BTC fetch layer that produces normalized kline bars compatible with the 6.15B bronze provider contract.

**BTC historical fetching only** — no Kalshi changes, import job changes, CLI, replay, dataset building, or live dashboard feed changes.

## Architecture

```
BTC historical HTTP endpoint
        ↓
BtcHistoricalHttpClient
        ↓
BtcHistoricalImporter
        ↓
BtcHistoricalImporterBar[]
        ↓
createInMemoryBtcHistoricalBronzeProvider() (caller)
        ↓
HistoricalBronzeImportJob (caller)
```

## API

```typescript
import {
  BtcHistoricalHttpAdapter,
  createBtcHistoricalImporter,
} from "@/lib/data/importers/btc";

const httpClient = new BtcHistoricalHttpAdapter({ fetchImpl: fetch });
const importer = createBtcHistoricalImporter({
  httpClient,
  source: "binance-spot",
});

const bars = await importer.getHistoricalBars({
  symbol: "BTCUSDT",
  interval: "1m",
  startTime: "2026-06-26T23:15:00.000Z",
  endTime: "2026-06-26T23:30:00.000Z",
});
```

## Wire format

Initial adapter target uses Binance-compatible `/api/v3/klines` array rows:

| Index | Field |
|---|---|
| 0 | Open time (ms) |
| 1 | Open price |
| 2 | High price |
| 3 | Low price |
| 4 | Close price |
| 5 | Base volume |
| 6 | Close time (ms) |

Mapped to `BtcHistoricalImporterBar` with UTC ISO timestamps and `source` preserved from importer config.

## Validation

Rejects deterministically:

- Malformed/non-array responses
- Invalid row shape or non-numeric prices
- Invalid OHLC relationships
- Invalid timestamp ordering
- Negative volume
- Unsupported interval or source

## Deterministic guarantees

- Bars sorted by `openTime`
- No `Date.now()` or randomness in importer logic
- Injectable HTTP client (tests use mocks, not global fetch)
- Deep-frozen importer output

## Out of scope

- Kalshi provider / import job / CLI
- Filesystem, persistence, replay, research
- Live BTC dashboard feed
- Production HTTP provider wiring for import harness (future milestone)

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
