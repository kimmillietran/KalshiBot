# Feature: market-data

Live Kalshi BTC 15-minute market discovery for the trading dashboard (Milestone 4A).

Polls the app BFF (`/api/kalshi/markets/active`), normalizes vendor payloads into
domain types, and drives command-bar market metadata (title, ticker, target,
countdown, lifecycle). Contract pricing and order book remain deferred to 4B.

```
market-data/
  api/
    fetchWithTimeout.ts   # reusable AbortSignal timeout wrapper
    kalshiClient.ts       # browser → BFF client
    kalshiServer.ts       # server-side Kalshi discovery + mapping
    lifecycle.ts          # vendor status → MarketLifecycle
  components/
    MarketStatusBadge.tsx
  hooks/
    useActiveBtcMarket.ts
  fallback.ts             # standalone fallback constants (no mock-data coupling)
  MarketDataProvider.tsx  # polling, countdown, feed status
  types.ts                # ActiveBtcMarket, MarketLifecycle enum
  schemas.ts              # Zod validation
  utils.ts                # selection, countdown helpers
  constants.ts            # poll intervals, API timeout
  index.ts                # public barrel
```

**BFF:** `src/app/api/kalshi/markets/active/route.ts` — proxies Kalshi production
API (`KXBTC15M` series). Browser never calls Kalshi directly.

**Consumed by:** `DashboardProviders`, `CommandBar`, `BtcChartPanel` (subtitle only).

**Deferred (4B+):** YES/NO prices, bid/ask, volume, order book, WebSockets.

Other features import only via `index.ts`.
