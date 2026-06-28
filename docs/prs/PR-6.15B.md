# PR-6.15B — BTC Historical Bronze Provider Contract

## Summary

Milestone 6.15B defines the provider-agnostic BTC historical bronze adapter boundary and ships one deterministic in-memory provider for tests.

**Contract only** — no real Binance/Coinbase/Kraken HTTP, filesystem, persistence, dataset building, replay, or research execution.

## Architecture

```
BTC historical bars
        ↓
BtcHistoricalBronzeProvider
        ↓
RawHistoricalRecord[]
        ↓
HistoricalBronzeImportJob (6.14A)
```

## API

```typescript
import {
  mapBtcHistoricalBarToBronzeRecord,
  createInMemoryBtcHistoricalBronzeProvider,
} from "@/lib/data/importJobs/providers/btc";

const record = mapBtcHistoricalBarToBronzeRecord({
  bar,
  marketTicker,
  collectionTime,
  observedAt,
});

const provider = createInMemoryBtcHistoricalBronzeProvider({ bars });
const records = provider.importBtcKlineRecords({
  marketTicker,
  startTime,
  endTime,
  collectionTime,
  observedAt,
});
```

## Bronze mapping

| Field | Value |
|---|---|
| `contentType` | `binance.historical.kline` (`DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE`) |
| `ticker` | Kalshi market ticker from provider input |
| `eventTime` | Bar `closeTime` |
| `recordId` | `btc-bronze-{fnv1a32(...)}` |
| Payload keys | `open_time`, `close_time`, `open_usd`, `high_usd`, `low_usd`, `close_usd`, `volume_btc` |

## Validation

Rejects deterministically:

- Invalid/missing UTC timestamps
- `openTime >= closeTime`
- Non-positive or invalid OHLC relationships
- Negative volume
- Missing ticker
- Unsupported BTC source

## Ordering

Records sorted by:

1. `eventTime`
2. `collectionTime`
3. `ticker`
4. `recordId`

## Out of scope

- Real HTTP providers
- Retries, pagination, CLI, filesystem
- Dataset building, replay, research execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
