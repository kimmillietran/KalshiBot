# PR-6.21A — Fix Kalshi Historical Market Bronze Payload Preservation

## Summary

Live Kalshi historical imports reached Coinbase + Kalshi and generated bronze records, but validation failed because the `kalshi.historical.market` payload was missing `open_time` and sometimes `floor_strike`.

## Root cause

Two compounding issues in the Kalshi bronze pipeline:

1. **`parseMarketRecord()` / `HistoricalMarketRecord`** did not preserve `open_time` from the live market wire.
2. **`marketRecordToWire()`** reconstructed a partial wire object without `open_time`, so bronze market payloads failed `validateHistoricalBronzeDataset` checks for `open_time`, `close_time`, and `floor_strike`.
3. **Prefetch used `listHistoricalMarkets()`** to source the market record instead of the full `/historical/markets/{ticker}` response, which can omit fields present on the live market detail endpoint.

Settlement mapping was unchanged; settlement bronze still wraps `{ market: wire }` under `kalshi.historical.settlement`.

## Fix

| File | Change |
|---|---|
| `kalshiHistoricalTypes.ts` | Add `openTime` to `HistoricalMarketRecord` |
| `HistoricalImporter.ts` | Add `getHistoricalMarket(ticker)` |
| `KalshiHistoricalImporter.ts` | Parse `open_time`; implement `getHistoricalMarket()` (404 → `null`) |
| `KalshiHistoricalBronzeProvider.ts` | Include `open_time` in `marketRecordToWire()` |
| `KalshiHistoricalPrefetchAdapter.ts` | Prefetch market via `getHistoricalMarket()` instead of markets list lookup |

`eventTimeFromMarketWire()` microsecond normalization was already present and retained.

## Before / after validation

**Before:** `kalshi.historical.market` bronze payload lacked top-level `open_time` (and could have `floor_strike: null`), producing:

> `market payload requires open_time, close_time, and floor_strike`

**After:** Live-shaped market wires preserve `open_time`, `close_time`, and `floor_strike` on the flat market bronze payload. A complete import set (market + candles + BTC bars) passes `validateHistoricalBronzeDataset`.

## Untouched paths

- `HistoricalBronzeValidator` (no weakened checks)
- Coinbase / BTC importers and bronze mappers
- CLI flags, replay/research/backtest

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
