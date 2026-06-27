# Feature: btc-feed

Live BTC spot price and 1-minute chart data for the trading dashboard.

**Milestone 3:** Initial Binance BFF integration.  
**Milestone 4.6:** Provider abstraction — Coinbase Exchange is the default upstream; consumers remain provider-agnostic via `/api/btc/*`.

```
btc-feed/
  providers/             # BtcPriceProvider interface + Coinbase (default) + stubs
    interface.ts
    coinbase.ts
    kraken.ts            # stub for future failover
    errors.ts
    index.ts
  api/
    btcClient.ts         # browser → app BFF
    btcServer.ts         # server → provider (used by BFF routes)
  hooks/useBtcPrice.ts   # spot + distance from target
  hooks/useBtcChartData.ts
  BtcFeedProvider.tsx    # TanStack Query polling context
  components/            # LivePrice, FeedStatusBadge
  constants.ts
  types.ts
  utils.ts
  index.ts
```

## Provider model

Only `providers/` and `api/btcServer.ts` know about Coinbase URLs. UI hooks call `btcClient` → BFF → `getDefaultBtcProvider()`.

**24h change (Coinbase):** derived from `GET /products/BTC-USD/stats` — `last` minus rolling `open`, not a native percent field.

Polling: 4s (price), 60s (candles). Stale threshold: 15s. Fallback to mock constants when BFF fails.

Interacts with: `app/api/btc/*` (thin BFF). Consumed by topbar, command bar, and chart.
