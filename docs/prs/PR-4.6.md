# PR-4.6 — BTC Provider Abstraction & Feed Hardening

## Summary

Milestone 4.6 replaces the hardcoded Binance BFF with a provider-agnostic BTC market-data layer. Coinbase Exchange is the default upstream. Public hooks (`useBtcPrice`, `useBtcChartData`), dashboard layout, and BFF client URLs are unchanged.

Binance was removed because it returns HTTP 451 in geo-restricted environments; the app correctly fell back but could not serve live BTC there. Coinbase Exchange public endpoints are widely available without API keys.

## Provider interface

```typescript
interface BtcPriceProvider {
  readonly id: string;
  getCurrentPrice(): Promise<BtcProviderPrice>;
  getCandles(interval: BtcCandleInterval, limit: number): Promise<BtcProviderCandle[]>;
}
```

Located in `src/features/btc-feed/providers/interface.ts`. Only `providers/` and `api/btcServer.ts` import vendor-specific code.

## Coinbase endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET https://api.exchange.coinbase.com/products/BTC-USD/stats` | Spot (`last`) + rolling 24h `open` for change |
| `GET https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&limit=30` | 1-minute OHLC candles |

**24h change approach:** Coinbase stats exposes `open` (24h rolling open) and `last`. We compute `change24h = last - open` and `change24hPercent = (change24h / open) * 100`. This is documented in `coinbase.ts` — not identical to Binance's `priceChangePercent` field but equivalent intent for dashboard display.

## Error-handling improvements

Typed provider errors mapped by BFF routes:

| Error | HTTP | When |
|-------|------|------|
| `BtcProviderTimeoutError` | 504 | AbortSignal timeout (5s) |
| `BtcProviderRateLimitError` | 429 | Upstream 429 |
| `BtcProviderMalformedResponseError` | 502 | Zod/parse failure |
| `BtcProviderUnavailableError` | 502 | 5xx, 451, other non-OK |
| `BtcProviderNetworkError` | 500 | Connection / DNS failures |

Previously all upstream failures collapsed to generic 502/500 with Binance-specific copy.

## Files created

| File | Purpose |
|------|---------|
| `providers/interface.ts` | `BtcPriceProvider` contract |
| `providers/errors.ts` | Typed upstream errors |
| `providers/fetchWithTimeout.ts` | Shared timeout helper |
| `providers/coinbase.ts` | Coinbase Exchange implementation |
| `providers/kraken.ts` | Stub for future provider |
| `providers/index.ts` | `getDefaultBtcProvider()`, factories |
| `providers/*.test.ts` | Provider + timeout tests |
| `api/btcServer.ts` | Server facade over provider |
| `api/btcServer.test.ts` | Delegation tests |
| `app/api/btc/price/route.test.ts` | BFF error mapping |
| `app/api/btc/candles/route.test.ts` | BFF error mapping |
| `docs/prs/PR-4.6.md` | This file |

## Files modified

| File | Change |
|------|--------|
| `app/api/btc/price/route.ts` | Thin BFF → `btcServer` + typed errors |
| `app/api/btc/candles/route.ts` | Thin BFF → `btcServer` + typed errors |
| `constants.ts` | `BTC_API_TIMEOUT_MS`, `BTC_CANDLES_LIMIT` |
| `README.md` (feature + root) | Provider architecture docs |
| `docs/technical-debt.md` | Resolve Binance items; note remaining debt |

**Unchanged:** `BtcFeedProvider.tsx`, `useBtcPrice`, `useBtcChartData`, `btcClient.ts`, dashboard components.

## Tests added

| Area | Coverage |
|------|----------|
| `coinbase.test.ts` | Mapping, malformed, 429, 5xx, 451, network, timeout |
| `fetchWithTimeout.test.ts` | Abort timeout |
| `coinbase.test.ts` (contract) | Interface shape, Kraken stub |
| `btcServer.test.ts` | Provider delegation |
| `route.test.ts` (×2) | Success + all error status codes |
| Existing hook tests | Unchanged — still pass via BFF mocks |

## Architecture decisions

- **Provider boundary** — vendor URLs live only under `providers/`.
- **Default provider** — `getDefaultBtcProvider()` returns Coinbase; future env-based switching via `createBtcProvider(id)`.
- **BFF stays thin** — routes call `btcServer`, map errors to HTTP.
- **No consumer changes** — browser still calls `/api/btc/price` and `/api/btc/candles`.

## Future provider extension points

1. Implement `createKrakenBtcProvider()` with the same interface.
2. Add `BTC_PROVIDER=coinbase|kraken` env in `getDefaultBtcProvider()`.
3. Optional failover chain: try primary, then secondary on `BtcProviderUnavailableError`.
4. CF Benchmarks or other institutional feeds as additional `BtcPriceProvider` impls.

## Remaining technical debt

- No multi-provider failover chain yet (single Coinbase default).
- Provider context-bridge pattern in feeds (4.5 backlog) unchanged.
- Kraken stub only — not production-ready.

## Project health

```bash
npm run lint
npm run test
npm run build
```

Do not merge without review.
