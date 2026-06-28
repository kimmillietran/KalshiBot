# PR-6.2B — Kalshi Historical HTTP Adapter

## Summary

Milestone 6.2B adds a production HTTP adapter implementing `KalshiHistoricalHttpClient` and bronze mapping utilities that convert raw Kalshi historical payloads into `RawHistoricalRecord`-compatible objects.

No disk persistence, scheduled jobs, replay, dashboard, engine, or execution changes.

## HTTP adapter

`KalshiHistoricalHttpAdapter`:

- Implements `KalshiHistoricalHttpClient.get(url)`
- Uses **injected `fetchImpl`** (no global fetch in tests)
- Parses JSON responses; throws `KalshiHistoricalHttpAdapterError` on invalid JSON
- Returns `{ status, body }` for non-2xx responses (importer layer handles API errors)
- Sets `Accept: application/json`, `cache: no-store`

## Bronze mapping

`kalshiToBronzeRecord.ts` maps raw wire payloads to `RawHistoricalRecord`:

| Mapper | Content type | DataSource |
|---|---|---|
| `mapKalshiMarketPayloadToBronzeRecord` | `kalshi.historical.market` | `kalshi-rest` |
| `mapKalshiCandlestickPayloadToBronzeRecord` | `kalshi.historical.candlestick` | `kalshi-candles` |
| `mapKalshiSettlementPayloadToBronzeRecord` | `kalshi.historical.settlement` | `kalshi-rest` |

Each record includes: `recordId`, `ticker`, `contentType`, `payload` (raw, unmodified), `eventTime`, `collectionTime`, `observedAt`, `provenance`.

Record IDs are deterministic via `fnv1a32(stableStringify(...))` from `@/lib/trading/config/hashConfig` (cross-layer debt — move to shared util in a later milestone).

## Wiring example

```typescript
const importer = new KalshiHistoricalImporter({
  httpClient: new KalshiHistoricalHttpAdapter({ fetchImpl: fetch }),
});

const page = await importer.listHistoricalMarkets("KXBTC15M");
// Map individual raw wire payloads separately when persisting to bronze.
```

## Out of scope

- BronzeStore persistence (unless 6.1A store merges — not wired here)
- Silver normalization
- Replay pipeline
- Real network calls in tests

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
