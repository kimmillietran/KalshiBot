# Fix replay strategy pricing snapshot

## Summary

Historical datasets previously assembled **one snapshot per market** containing the full Kalshi candle history. Replay therefore advanced one step per market and `adaptHistoricalSnapshot` always priced from the **terminal** candle (`kalshiCandles.at(-1)`). Near settlement that terminal quote is often `0¢`, so strategies emitted buy intents at `limitPriceCents: 0` and fills never matched live-window prices.

## Fix

`expandMarketSnapshotsForCandleReplay` expands each assembled market snapshot into **one replay snapshot per Kalshi candle**:

- `kalshiCandles` / `btcBars` use prefix history through the current candle
- `temporal.observedAt` anchors to the current candle `closeTime`
- `settlement` is attached only on the final candle snapshot
- `adaptHistoricalSnapshot` is unchanged — the last candle in each prefix is the current candle

Integrated in `buildHistoricalDataset` before `orderReplaySnapshots`.

## Verification

After sweep:

```powershell
Get-Content "data\research-results\buy-below-probability\KXBTC15M\KXBTC15M-26APR301900-00\decision-trace.json" -Raw
```

Early trace entries should show non-zero `yesBid` / `yesAsk` / `yesMid` aligned with the Kalshi candle sequence.
