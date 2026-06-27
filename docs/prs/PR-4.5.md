# PR-4.5 — TanStack Query Foundation

## Summary

Milestone 4.5 adds TanStack Query as the server-state foundation for the dashboard. Network fetching for BTC spot/candles and Kalshi active-market discovery now runs through `useQuery` with polling intervals matching the previous manual `setInterval` behavior. Public hooks (`useBtcPrice`, `useBtcChartData`, `useActiveBtcMarket`) and UI are unchanged.

## Migration approach

| Layer | Before | After |
|-------|--------|-------|
| App shell | Manual fetch + `setInterval` in providers | `QueryProvider` + `useQuery` with `refetchInterval` |
| Public hooks | Context selectors (`useBtcFeedContext`, `useMarketDataContext`) | **Unchanged** — same return shapes |
| Polling | 4s price, 60s candles, 12s market | Preserved via per-query `refetchInterval` |
| Countdown rollover | Local interval → `loadMarket()` | Local interval → `refetchMarket()` |
| Stale detection | Local 1s intervals | **Unchanged** — still local timers |
| Fallback / error UX | Provider state machine | **Unchanged** — query results bridged into context |

Query client defaults (`src/lib/query/createQueryClient.ts`):

- `staleTime`: 5s (overridden per polling query)
- `retry`: up to 2 attempts; skips 4xx client errors
- `refetchOnWindowFocus` / `refetchOnReconnect`: `false` (polling-only behavior preserved)
- `refetchOnMount`: `true`

## Files changed

| Area | Files |
|------|-------|
| Dependency | `package.json`, `package-lock.json` |
| Query infra | `src/lib/query/queryKeys.ts`, `createQueryClient.ts`, `index.ts`, `createQueryClient.test.ts` |
| Providers | `src/providers/QueryProvider.tsx`, `QueryProvider.test.tsx`, `DashboardProviders.tsx`, `README.md` |
| Internal migration | `src/features/btc-feed/BtcFeedProvider.tsx`, `src/features/market-data/MarketDataProvider.tsx` |
| Test helpers | `src/test/query-test-utils.tsx`, `src/test/test-utils.tsx` |
| Hook tests | `src/features/btc-feed/hooks/useBtcPrice.test.tsx`, `src/features/market-data/hooks/useActiveBtcMarket.test.tsx` |

**Not modified:** BFF routes, `MarketOddsPanel` component, contract pricing logic, Kalshi server discovery.

## Tests added / updated

| Test file | Coverage |
|-----------|----------|
| `createQueryClient.test.ts` | Retry policy, default options, test client factory |
| `QueryProvider.test.tsx` | Renders children |
| `useBtcPrice.test.tsx` | Loading, live price, fallback, chart points via Query |
| `useActiveBtcMarket.test.tsx` | Query wrapper, polling/rollover preserved |

**96 tests passing** across 19 files.

## Behavior preserved

- Dashboard layout and all panel UI unchanged
- BTC price flash direction, chart merge, stale thresholds unchanged
- Kalshi market countdown, rollover refresh, fallback/no-market states unchanged
- Polling intervals: 4s / 60s / 12s

## Known limitations / deferred

- Context bridge in providers (query → local state) remains until hooks read query cache directly
- No React Query Devtools
- No shared prefetch/hydration for SSR
- Zustand client-state store still deferred

## Reviewer focus

- `DashboardProviders` wraps `QueryProvider` outside feature providers
- `queryKeys` centralization for future cache invalidation
- `MarketDataProvider` countdown effect uses stable `refetchMarket` dep (not whole query object)
- Test helper cancels queries on unmount to avoid timer leaks
- No BFF or pricing logic changes

## Quality gates

```bash
npm run lint   # pass (coverage artifact warning only)
npm run test   # 96/96 pass
npm run build  # pass
```

Do not merge without review.
