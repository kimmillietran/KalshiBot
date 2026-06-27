# PR-4B — Live Kalshi Contract Pricing

## Summary

Milestone 4B adds live Kalshi YES/NO contract pricing to the existing market-data integration. Pricing is normalized server-side from Kalshi market list fields and delivered through the existing BFF poll (`GET /api/kalshi/markets/active`). `MarketOddsPanel` now renders live bid/ask/mid/spread, volume, and liquidity quality with fallback when Kalshi is unavailable.

Recommendation, probability, edge, and combined/overround metric cards remain mocked.

## Endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC15M&status=open` | Active market + inline pricing fields |
| `GET …/markets?series_ticker=KXBTC15M&status=unopened` | Fallback discovery between slots (unchanged from 4A) |

**Pricing fields consumed from market payload:**

- `yes_bid_dollars`, `yes_ask_dollars`, `no_bid_dollars`, `no_ask_dollars`
- `last_price_dollars` (YES last)
- `volume_fp`, `liquidity_dollars`

No separate orderbook call in this milestone — list/detail market fields are sufficient for top-of-book display.

## Files changed

| Area | Files |
|------|-------|
| Domain + mapping | `pricing.ts`, `pricing.test.ts`, `types.ts`, `schemas.ts`, `fallback.ts` |
| Server discovery | `api/kalshiServer.ts`, `api/kalshiServer.test.ts` |
| BFF | `src/app/api/kalshi/markets/active/route.ts`, `route.test.ts` |
| Client | `api/kalshiClient.test.ts`, `MarketDataProvider.tsx`, `hooks/useActiveBtcMarket.ts`, `hooks/useActiveBtcMarket.test.tsx` |
| Dashboard | `MarketOddsPanel.tsx`, `MarketOddsPanel.test.tsx`, `TradingDashboard.tsx` |
| Tests/helpers | `src/test/test-utils.tsx`, `fallback.test.ts` |
| Docs | this file |

## Tests added / updated

| Test file | Coverage |
|-----------|----------|
| `pricing.test.ts` | Dollar→cent parse, mid/spread, volume format, liquidity quality, mapper, missing fields, odds view adapter |
| `useActiveBtcMarket.test.tsx` | Live pricing state, 504→fallback pricing, no-market clears pricing |
| `MarketOddsPanel.test.tsx` | Live odds render, fallback odds render |
| `kalshiServer.test.ts` | Pricing included in discovery result |
| `route.test.ts` | Pricing in BFF success + no-market responses |
| `kalshiClient.test.ts` | Zod validates pricing payload |
| `fallback.test.ts` | `FALLBACK_CONTRACT_PRICING` |

## Architecture decisions

- **Single BFF poll** — pricing piggybacks on active market discovery (no new client poll interval).
- **TanStack Query** — `MarketDataProvider` uses `useQuery` with `keepPreviousData` for pure render derivation; builds on QueryProvider from milestone 4.5.
- **Domain model** — `MarketContractPricing` with `ContractSidePricing` per YES/NO side; vendor strings never reach UI.
- **Presentation adapter** — `mapPricingToOddsViews()` maps YES→UP, NO→DOWN for `MarketOddsPanel`.
- **Fallback** — `FALLBACK_CONTRACT_PRICING` in `fallback.ts` (no `mock-data` import).
- **Stale state** — `pricingIsStale` derived from existing feed status; liquidity badge shows STALE/FALLBACK variants.

## Known limitations

- NO last price not provided by Kalshi list API — left `null`; display falls back to mid/bid/ask.
- Combined/overround and “Best Edge Side” cards remain static mock copy.
- No order book depth or WebSocket price stream.
- Liquidity heuristic uses `liquidity_dollars` + YES spread only.

## Deferred (4C+)

- Order book BFF (`GET /markets/{ticker}/orderbook`)
- Dynamic probability / edge / recommendation engine
- Trade execution, auth, database, journal, analytics
- WebSocket ticker feed
- Separate pricing poll or TanStack Query cache layer

## Reviewer focus

- Pricing mapper handles missing/null vendor fields without throwing.
- BFF response schema includes nullable `pricing`.
- Fallback path preserves dashboard usability (odds panel never blank).
- `MarketOddsPanel` layout unchanged — only data source swapped.

## Project health

Commands executed (all pass):

```bash
npm run lint
npm run test
npm run build
```

Do not merge without review.
