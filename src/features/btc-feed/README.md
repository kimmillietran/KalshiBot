# Feature: btc-feed

Live BTC spot price and 1-minute chart data for the trading dashboard.

**Milestone 3:** Binance public API via Next.js BFF routes (`/api/btc/price`, `/api/btc/candles`).
Polling every 4s (price) and 60s (candles). Kalshi target remains mocked.

```
btc-feed/
  api/btcClient.ts       # client → app BFF
  hooks/useBtcPrice.ts   # spot + distance from target
  hooks/useBtcChartData.ts
  BtcFeedProvider.tsx    # shared polling context
  components/            # LivePrice, FeedStatusBadge
  constants.ts
  types.ts
  utils.ts
  index.ts
```

Interacts with: `app/api/btc/*` (server proxies). Consumed by topbar, command bar, and chart.
