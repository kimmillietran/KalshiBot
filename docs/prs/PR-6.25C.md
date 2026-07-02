# PR 6.25C — Historical Bid/Ask Preservation Audit

## Summary

Audited the Kalshi historical import pipeline for separate YES/NO bid and ask OHLC fidelity. The historical candlesticks API exposes **trade-price close only** (`price.close`), not separate bid/ask time series. The importer is unchanged; silver now marks synthesized quotes with `missing-bid-ask` so downstream replay and research outputs surface zero-spread live imports explicitly.

## Audit findings

| Question | Result |
| --- | --- |
| YES bid OHLC in historical API? | **No** |
| YES ask OHLC in historical API? | **No** |
| Historical orderbook endpoint? | **No** (live orderbook only) |
| Bronze preservation | Raw wire passthrough (unchanged) |
| Live import silver behavior | Synthesizes `yesBidCents = yesAskCents = round(price.close × 100)` |
| Legacy fixture behavior | Preserves explicit `yes_bid_cents` / `yes_ask_cents` when present |

Documented in code: `KalshiHistoricalBidAskAuditFinding` (`src/lib/data/importers/kalshi/kalshiHistoricalBidAskAudit.ts`).

## Changes

| Layer | Change |
| --- | --- |
| Importer | **Unchanged** — still maps `price.close` only |
| Bronze | **Unchanged** — full wire payload preserved |
| Silver | Adds `missing-bid-ask` quality flag on live-shaped candle normalization |
| Snapshots / replay | Inherit quality flags; `missing-bid-ask` → `liquidityQuality: Poor` |
| Fixtures / research | Backward compatible — legacy bid/ask fixtures unchanged |

## Implications for backtests

- **Live historical imports:** backtest fills execute at trade close (zero spread) because bid equals ask.
- **Legacy bronze fixtures:** true spread preserved when explicit bid/ask cents are supplied.
- True historical spread reconstruction would require a future data source (historical orderbook, trade tape, or live quote snapshots).

## Test plan

- [x] Audit constants document missing bid/ask OHLC
- [x] Importer parses trade-close-only candlesticks
- [x] Live normalization sets `missing-bid-ask` and collapses bid/ask
- [x] Legacy normalization preserves separate bid/ask without flag
- [x] Dataset build propagates quality flags for live imports
- [x] Deterministic serialization with quality flags
- [x] Existing fixture bridge and dataset tests remain valid

## Commands

```bash
npm run lint
npm run test
npm run build
```
