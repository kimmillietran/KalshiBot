# PR-6.4A — Replay Input Adapter

## Summary

Milestone 6.4A adds a pure replay input adapter under `src/lib/data/replay/`. `adaptHistoricalSnapshot()` converts an immutable `HistoricalTradingSnapshot` (6.3B) into the existing engine `EvaluationSnapshot` shape while preserving temporal and provenance metadata.

**Adapter only** — no replay loop, backtesting, indicators, storage, collectors, dashboard, or engine behavior changes.

## API

```typescript
import { adaptHistoricalSnapshot } from "@/lib/data/replay";

const adaptation = adaptHistoricalSnapshot(historicalSnapshot);
// adaptation.engineInput → EvaluationSnapshot
// adaptation.temporal / provenance preserved for orchestration
```

## Mapping rules

| Engine field | Historical source |
|---|---|
| `evaluatedAt` | `temporal.observedAt` (knowledge time) |
| `market` | `marketWindow` (lifecycle from status, strike, closeTime) |
| `market.timeRemainingMs` | `closeTime - observedAt` (deterministic, may be negative) |
| `btc.price` | Latest `btcBars[].closeUsd` (last array element — positional, not time-sorted) |
| `btc.candles` | All `btcBars` mapped to OHLC + `closeTime` timestamp |
| `btc.change24hPercent` | `null` (not present in historical bars) |
| `pricing` | Latest `kalshiCandles[]` bid/ask (last array element — positional); mids derived from quotes |
| `pricing.liquidityQuality` | Derived from merged silver `qualityFlags` (market window + latest candle) |
| `pricing.volumeDollars` | `null` (contract volume is not USD volume) |
| `settlement` | **Not mapped** — preserved on `HistoricalTradingSnapshot` / adaptation provenance only; engine input has no settlement field |

Replay feed semantics: `feedStatus: "live"`, `providerSource: "upstream"` — adapter constants meaning historical data is authoritative for replay, not live BFF state.

## Validation

Deterministic `ReplayAdaptationError` when:

- Kalshi candles or BTC bars are missing
- `ticker` ≠ `marketWindow.ticker`
- `temporal.observedAt` or `marketWindow.closeTime` do not parse

## Out of scope

- Replay timeline iteration
- Order simulation / P&L
- Backtesting runner
- `evaluate()` modifications
- Dashboard / network / filesystem

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
