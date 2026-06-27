# Technical Debt Register

Tracked intentionally — not silent accumulation. Review at each milestone close-out.

## Resolved in 4.6

| Issue | Resolution |
|-------|------------|
| Binance HTTP 451 geo restriction | Replaced with Coinbase Exchange; typed 451/5xx errors in BFF |
| Single-provider Binance hardcoding in BFF routes | `BtcPriceProvider` interface + `providers/coinbase.ts`; Binance URLs removed |

## Outstanding (4.6B)

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Provider chain** | Medium | `getDefaultBtcProvider()` returns Coinbase only; no ordered fallback list | Composite provider registry with configurable chain | **4.6B** |
| **Kraken implementation** | Medium | `kraken.ts` is a stub | Full `BtcPriceProvider` for Kraken public API | **4.6B** |
| **Automatic failover** | Medium | No retry across providers on upstream failure | Failover on 429/5xx/451/timeout; health metrics | **4.6B** |
| **Chart UX improvements** | Low | Chart behavior unchanged from M3 polling model | Stale indicators, provider source badge, empty-state polish | **4.6B** |

## Other outstanding

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| Kalshi rate-limit retry/backoff | Medium | 429 surfaced but not retried | Exponential backoff in `kalshiServer` or BFF | Backlog |
| Provider context-bridge pattern | Medium | 4.5 uses TanStack Query but hooks read bridged context | Hooks read query cache directly | Backlog |
| NO last price null in odds display | Low | Kalshi list API omits NO last | Order book fetch or accept fallback | Backlog |
| Mock recommendation / overround cards | Medium | Edge/recommendation panels still static mock | Dynamic engine | 5 |
| Layout shell untested | Low | `AppShell`, `Sidebar`, `Topbar` at 0% coverage | Smoke tests | Backlog |
| Polling-only feeds | Low | No WebSocket for BTC or Kalshi | Evaluate WS when needed | 5+ |

## Health impact

After Milestone 4.6 → **Technical Debt: Low–Medium** (BTC geo-block resolved; provider chain/failover deferred to 4.6B).
