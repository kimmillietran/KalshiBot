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

## Resolved in 4.7

| Issue | Resolution |
|-------|------------|
| Mock recommendation / overround cards | Placeholder panels; fake BUY UP and model edge hidden until Milestone 5 |
| Chart UX — target context | Settlement target label, above/below badge, distance caption on BTC chart |
| Misleading market title | Command bar uses contract question wording with live target + expiration |

## Outstanding

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Chart UX improvements** | Low | Provider source badge, empty-state polish still open | Provider badge on chart header | Backlog |
| External metrics sink | Low | Metrics log to console + observer hook only | Wire Datadog/OpenTelemetry when ops needs it | Backlog |
| Shared circuit state | Low | Health/circuit is in-process per server instance | Redis or edge config if multi-instance | Backlog |
| Kalshi rate-limit retry/backoff | Medium | 429 surfaced but not retried | Exponential backoff in `kalshiServer` or BFF | Backlog |
| Provider context-bridge pattern | Medium | 4.5 uses TanStack Query but hooks read bridged context | Hooks read query cache directly | Backlog |
| NO last price null in odds display | Low | Kalshi list API omits NO last | Order book fetch or accept fallback | Backlog |
| Market structure / trade mgmt preview rows | Low | Static demo rows remain with preview labels | Replace when Milestone 5 engine ships | 5 |
| Layout shell untested | Low | `AppShell`, `Sidebar`, `Topbar` at 0% coverage | Smoke tests | Backlog |
| Polling-only feeds | Low | No WebSocket for BTC or Kalshi | Evaluate WS when needed | 5+ |

## Health impact

After Milestone 4.7 → **Technical Debt: Low** (live data clearly separated from Milestone 5 placeholders; chart target context improved).
