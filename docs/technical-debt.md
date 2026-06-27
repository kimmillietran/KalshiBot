# Technical Debt Register

Tracked intentionally — not silent accumulation. Review at each milestone close-out.

## Resolved in 4.6

| Issue | Resolution |
|-------|------------|
| Binance HTTP 451 geo restriction | Replaced with Coinbase Exchange; typed 451/5xx errors in BFF |
| Single-provider Binance hardcoding in BFF routes | `BtcPriceProvider` interface + `providers/coinbase.ts`; Binance URLs removed |

## Resolved in 4.6B

| Issue | Resolution |
|-------|------------|
| Provider chain | `CompositeBtcPriceProvider` + `resolveBtcProvider()` with `BTC_PROVIDER` env |
| Kraken implementation | Full `BtcPriceProvider` in `providers/kraken.ts` |
| Automatic failover | Sequential chain Coinbase → Kraken → fallback; `BtcProviderChainError` on total failure |
| Provider health / metrics | `providerHealth.ts` (circuit breaker, scoring) + `providerMetrics.ts` (structured events) |

## Outstanding

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Chart UX improvements** | Low | Chart behavior unchanged from M3 polling model | Stale indicators, provider source badge, empty-state polish | Backlog |
| External metrics sink | Low | Metrics log to console + observer hook only | Wire Datadog/OpenTelemetry when ops needs it | Backlog |
| Shared circuit state | Low | Health/circuit is in-process per server instance | Redis or edge config if multi-instance | Backlog |
| Kalshi rate-limit retry/backoff | Medium | 429 surfaced but not retried | Exponential backoff in `kalshiServer` or BFF | Backlog |
| Provider context-bridge pattern | Medium | 4.5 uses TanStack Query but hooks read bridged context | Hooks read query cache directly | Backlog |
| NO last price null in odds display | Low | Kalshi list API omits NO last | Order book fetch or accept fallback | Backlog |
| Mock recommendation / overround cards | Medium | Edge/recommendation panels still static mock | Dynamic engine | 5 |
| Layout shell untested | Low | `AppShell`, `Sidebar`, `Topbar` at 0% coverage | Smoke tests | Backlog |
| Polling-only feeds | Low | No WebSocket for BTC or Kalshi | Evaluate WS when needed | 5+ |

## Health impact

After Milestone 4.6B → **Technical Debt: Low** (BTC provider chain, Kraken failover, and health/metrics in place; chart UX and external observability remain backlog).
