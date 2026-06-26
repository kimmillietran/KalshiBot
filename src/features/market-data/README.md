# Feature: market-data

Kalshi BTC markets browser and detail views (list, filters, order book, implied
probability).

Deferred to a later milestone. When implemented, follow the standard feature
shape:

```
market-data/
  components/   # MarketsView, MarketTable, MarketDetail
  hooks/        # useMarkets, useMarket (wrap server state)
  api/          # data access -> lib/api/kalshi
  types.ts      # feature-local types (re-export from @/types/domain)
  index.ts      # public barrel (only import surface for other code)
```

Interacts with: `lib/api/kalshi`, `@/types/domain`. Consumed by the markets
route and the dashboard. Other features import only via `index.ts`.
