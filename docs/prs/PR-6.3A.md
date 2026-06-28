# PR-6.3A — Silver Normalization Core

## Summary

Milestone 6.3A adds a deterministic Bronze → Silver normalization layer under `src/lib/data/silver/`. `SilverNormalizer` converts validated `RawHistoricalRecord` inputs into `MarketWindow`, `KalshiCandle1m`, or `SettlementRecord` contracts from 6.1A.

**Normalization only** — no replay, backtesting, indicators, storage, collectors, dashboard, or engine changes.

## API

```typescript
const normalizer = new SilverNormalizer();
const result = normalizer.normalize(bronzeRecord);
// result: { bronzeRecordId, provenance, record }
```

Content-type dispatch:

| Bronze `contentType` | Silver output |
|---|---|
| `kalshi.historical.market` | `MarketWindow` |
| `kalshi.historical.candlestick` | `KalshiCandle1m` |
| `kalshi.historical.settlement` | `SettlementRecord` |

## Rules

- Validates bronze input with `rawHistoricalRecordSchema`
- Maps snake_case Kalshi wire fields to silver camelCase contracts
- Re-validates output with 6.1A silver schemas
- Preserves `eventTime`, `collectionTime`, `observedAt`, and `provenance`
- **`seriesTicker` derivation:** `series_ticker` when present, else first segment of `event_ticker` before `-`, else first segment of bronze `ticker` before `-`
- Never invents missing quote, strike, or interval fields
- Rejects incomplete Kalshi candle wire payloads lacking bid/ask cents
- Identical inputs produce deterministic normalized output

## Out of scope

- Replay / backtesting
- Indicators / feature engineering
- BTC joins
- Silver persistence
- Collectors / import jobs
- `evaluate()` / dashboard / execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
