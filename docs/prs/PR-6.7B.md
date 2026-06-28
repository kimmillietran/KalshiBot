# PR-6.7B — Historical Dataset Pipeline

## Summary

Milestone 6.7B adds the deterministic bronze → silver → snapshot pipeline that produces replay-ready `HistoricalDataset` outputs from stored bronze records.

No download, import, replay, evaluation, backtest, optimization, or persistence.

## Architecture

```
RawHistoricalRecord[] (BronzeStore output)
        ↓
SilverNormalizer (+ BTC kline normalization)
        ↓
HistoricalSnapshotAssembler (per market group)
        ↓
orderReplaySnapshots()
        ↓
HistoricalDataset
```

## Pipeline responsibilities

| Step | Behavior |
|---|---|
| Group by market | Bronze records grouped by `ticker` |
| Normalize | Kalshi market/candle/settlement via `SilverNormalizer`; BTC klines via `normalizeBtcKlineBronze` in this module |
| Assemble | One `HistoricalTradingSnapshot` per complete market group |
| Order | Deterministic ordering via `orderReplaySnapshots` |
| Reject | Incomplete groups, duplicate record ids, duplicate market/settlement per ticker |
| Immutability | Deep-frozen dataset, snapshots, metadata, and provenance |

## Bronze content types

| Content type | Role |
|---|---|
| `kalshi.historical.market` | Market window anchor |
| `kalshi.historical.candlestick` | Kalshi 1m candles |
| `binance.historical.kline` | BTC 1m bars |
| `kalshi.historical.settlement` | Optional settlement |

## BTC kline normalization placement

Binance BTC 1m klines use `normalizeBtcKlineBronze()` in `HistoricalDatasetBuilder.ts` because `SilverNormalizer` currently covers Kalshi bronze content types only. The helper reuses silver shared utilities (`parsePayloadObject`, `btcBar1mSchema`, quality flags) for consistent validation. **Future:** move BTC kline normalization into `SilverNormalizer` when Binance bronze import lands.

## Fail-fast behavior

`buildHistoricalDataset()` fails on the first deterministic validation error — duplicate record ids, duplicate market/settlement per ticker, unsupported content types, or incomplete market groups. It does not emit partial datasets or skip bad tickers. Callers receive a typed `HistoricalDatasetBuildError` with a stable `code` and contextual fields (`ticker`, `recordId`).

## API

```typescript
import { buildHistoricalDataset } from "@/lib/data/datasets";

const dataset = buildHistoricalDataset(bronzeRecords);
```

## Dataset contents

| Field | Description |
|---|---|
| `snapshots` | Ordered `HistoricalTradingSnapshot[]` |
| `metadata.datasetId` | Deterministic hash from snapshot serialization |
| `metadata.snapshotCount` | Number of assembled snapshots |
| `metadata.marketTickers` | Sorted unique market tickers |
| `provenance.bronzeRecordIds` | Sorted source bronze record ids |
| `provenance.provenanceByBronzeRecordId` | Fetch provenance per bronze record |

## Error codes

| Code | When |
|---|---|
| `empty-bronze-records` | No input records |
| `duplicate-record-id` | Same `recordId` appears more than once |
| `duplicate-market-window` | Multiple market bronze records for one ticker |
| `duplicate-settlement` | Multiple settlement bronze records for one ticker |
| `incomplete-snapshot-group` | Missing market, candles, or BTC bars for a ticker |
| `unsupported-bronze-content-type` | Unknown bronze content type |

## Deterministic guarantees

- Market tickers processed in lexicographic order
- Final snapshot order: eventTime → collectionTime → ticker → serialization
- Bronze candle/BTC records sorted by eventTime then recordId before assembly
- `serializeHistoricalDataset()` uses `stableStringify`

## Out of scope

- Bronze download / HTTP import
- Replay session wiring
- Backtest / research execution
- Dataset persistence

## Future integration

- Builder #1 bronze importers can append Binance klines with `binance.historical.kline`
- Replay session can consume `HistoricalDataset.snapshots` directly
