# PR-6.1A — Historical Data Contracts

## Summary

Milestone 6.1A adds pure data contracts under `src/lib/data/` for the historical Kalshi BTC 15-minute research platform.

**Contracts only** — no collection, replay, backtesting, dashboard, or engine changes.

## Layers

| Layer | Contracts |
|---|---|
| Bronze | `RawHistoricalRecord`, `DataSource`, `FetchProvenance` |
| Silver | `MarketWindow`, `KalshiCandle1m`, `BtcBar1m`, `SettlementRecord` |
| Common | `HistoricalTicker`, `SeriesTicker`, `EventTime`, `CollectionTime`, `ObservedAt`, `DatasetVersion`, `DataQualityFlag` |

## Temporal model

All instants are **UTC ISO-8601 with `Z` suffix** — local timezone offsets are rejected.

| Field | Meaning |
|---|---|
| `eventTime` | When the market event or bar interval occurred |
| `openTime` / `closeTime` | Bar or window interval bounds (also validated as UTC `EventTime`) |
| `collectionTime` | When the record was fetched or collected |
| `observedAt` | Knowledge time — when the observation became known |

Silver and bronze records require `eventTime`, `collectionTime`, and `observedAt` explicitly. Interval fields (`openTime`/`closeTime`) describe the quoted or OHLC window and must satisfy `openTime < closeTime`; they may equal `eventTime` for point-in-time records but are not interchangeable — `eventTime` is the canonical event anchor for lineage.

## Validation highlights

- Missing or empty tickers rejected
- Contract prices must be integer cents in `[0, 100]` with `bid <= ask`
- BTC OHLC must be finite, positive, and internally consistent
- Settlement `result` must be `yes` or `no` with finite strike/settlement prices
- `datasetVersion` locked to `DATA_CONTRACT_VERSION` (`6.1.0`)

## API

```typescript
import {
  marketWindowSchema,
  kalshiCandle1mSchema,
  btcBar1mSchema,
  settlementRecordSchema,
  rawHistoricalRecordSchema,
  DATA_CONTRACT_VERSION,
} from "@/lib/data";
```

## Out of scope

- Data collection / importers
- Replay engine
- Backtesting
- `evaluate()` / trading engine
- Dashboard / API routes
- Filesystem persistence

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
