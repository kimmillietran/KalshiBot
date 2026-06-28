# PR-6.1B — Kalshi Historical API Importer Spike

## Summary

Milestone 6.1B adds a thin, testable Kalshi Historical API importer under `src/lib/data/importers/kalshi/`. This is interface + HTTP wiring only — no Bronze/Silver storage, replay, disk writes, or engine integration.

Safe before Builder #1 data contracts merge: minimal local importer types live in `kalshiHistoricalTypes.ts` and can rebase onto shared contracts later.

## Interface

```typescript
interface HistoricalImporter {
  listHistoricalMarkets(seriesTicker, dateRange?, pagination?)
  getMarketCandlesticks(ticker, interval, dateRange)
  getHistoricalTrades(scope, dateRange?, pagination?)
  getHistoricalCutoff()
  getSettlementResult(ticker)
}
```

Implementation: `KalshiHistoricalImporter` with injectable `KalshiHistoricalHttpClient`.

## Endpoints modeled

| Method | Kalshi path |
|---|---|
| `getHistoricalCutoff()` | `GET /historical/cutoff` |
| `listHistoricalMarkets()` | `GET /historical/markets?series_ticker=…` |
| `getMarketCandlesticks()` | `GET /historical/markets/{ticker}/candlesticks` |
| `getHistoricalTrades()` | `GET /historical/trades` |
| `getSettlementResult()` | `GET /historical/markets/{ticker}` |

**Markets dateRange:** `HistoricalDateRange` is accepted on `listHistoricalMarkets()` for forward compatibility but query params are **deferred** until Kalshi documents supported filters — the builder currently ignores `dateRange` and only emits `series_ticker` + pagination.

## Design notes

- **Dependency injection:** `KalshiHistoricalHttpClient.get(url)` — tests use fake handlers; no real network.
- **Provenance:** Each result includes `source`, `fetchedAt`, `requestPath`, and cursor when paginated.
- **Parsing:** Lightweight wire → domain mapping; no duplicated mega-schema logic.
- **Errors:** `KalshiHistoricalImporterError` surfaces API status/code/message.
- **Trades scope:** Kalshi historical trades require `ticker`; `seriesTicker`-only scope throws explicitly (no fake filter).

## Out of scope

- Bronze/Silver storage
- Replay pipeline
- Disk persistence
- `evaluate()` / engine / providers / BFF changes
- Real network calls in tests

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Future (post-6.1A)

Replace local types with Builder #1 data contracts when merged; keep `HistoricalImporter` surface stable.
