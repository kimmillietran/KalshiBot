# PR-4A — Kalshi Market Discovery and Hardening

## Summary

Milestone 4A delivers live Kalshi BTC 15-minute market discovery through a server-side BFF, with domain-normalized metadata driving the trading dashboard command bar (title, ticker, target strike, countdown, lifecycle badge).

Milestone 4A.2 hardens the integration:

- **`MarketLifecycle`** enum replaces raw Kalshi vendor status strings in the domain model.
- **Fallback decoupling** — display constants moved to `fallback.ts`, no longer imported from `mock-data`.
- **Timeout hardening** — reusable `fetchWithTimeout` with `KalshiRequestTimeoutError`; BFF maps upstream timeouts to HTTP 504.
- **Rollover fix** — expired open markets are skipped; provider refreshes on countdown expiry; discovery falls back to unopened markets when all open markets have passed `close_time`.

## Files changed

| Area | Files |
|------|-------|
| BFF route | `src/app/api/kalshi/markets/active/route.ts`, `route.test.ts` |
| Feature core | `MarketDataProvider.tsx`, `constants.ts`, `types.ts`, `schemas.ts`, `utils.ts`, `index.ts`, `README.md` |
| API layer | `fetchWithTimeout.ts`, `lifecycle.ts`, `kalshiServer.ts`, `kalshiClient.test.ts` |
| Fallback | `fallback.ts` |
| UI | `MarketStatusBadge.tsx`, `CommandBar.tsx` |
| Hook | `useActiveBtcMarket.ts` |
| Docs | `README.md` |
| Test helpers | `src/test/test-utils.tsx` |

**26 source files** (+ this PR doc). **+650 / −84** lines.

## Tests added / updated

| Test file | Coverage |
|-----------|----------|
| `fetchWithTimeout.test.ts` | Success, timeout, default MS, external abort propagation |
| `lifecycle.test.ts` | ACTIVE, UPCOMING, CLOSED, SETTLED, UNKNOWN mapping |
| `fallback.test.ts` | Standalone fallback constants |
| `MarketStatusBadge.test.tsx` | Live lifecycle, fallback, no-market labels |
| `kalshiServer.test.ts` | Upstream timeout; expired-open → unopened fallback |
| `route.test.ts` | 504 on upstream timeout |
| `useActiveBtcMarket.test.tsx` | 504 fallback, empty discovery, countdown rollover refresh |
| `utils.test.ts` | Expired market filtering, lifecycle mapping |

**86 tests passing** across 16 files.

## Known limitations

- Contract pricing (YES/NO, bid/ask, volume) not fetched — mock odds remain in the trading cockpit.
- Polling only; no Kalshi WebSocket integration.
- Single-series discovery (`KXBTC15M`); no multi-market browser UI.
- Fallback target price is a static display value, not derived from live BTC feed.
- Kalshi rate limits surfaced as 429; no retry/backoff strategy yet.

## Reviewer focus

- Vendor status strings confined to `lifecycle.ts` and Zod schemas — confirm no leakage to UI.
- `selectOpenMarket` strict `closeMs > nowMs` filter and null return — rollover path through `discoverActiveBtcMarket`.
- `refreshRequestedRef` guard in `MarketDataProvider` — single refresh per countdown expiry.
- BFF error mapping: 504 (timeout) vs 502 (upstream) vs 429 (rate limit).
- Fallback constants independent of `mock-data` — no circular feature dependency.

## Deferred work (4B+)

- Kalshi contract pricing and order book
- Dynamic AI recommendations (replace mock)
- Trade execution
- Auth, database, trade journal, analytics
- WebSockets beyond current polling
- TanStack Query, Zustand, Playwright e2e
