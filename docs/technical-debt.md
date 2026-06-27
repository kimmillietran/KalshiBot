# Technical Debt Register

Tracked intentionally — not silent accumulation. Review at each milestone close-out.

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Single BTC provider (no failover)** | Medium | 4.6 adds abstraction + Coinbase default; Kraken is stub-only | Implement Kraken + primary/fallback chain in `getDefaultBtcProvider()` | 4.7 / backlog |
| Kalshi rate-limit retry/backoff | Medium | 429 surfaced but not retried; transient failures go straight to fallback | Exponential backoff in `kalshiServer` or BFF; cap retries | 4C |
| Provider context-bridge pattern | Medium | 4.5 migrates to TanStack Query but hooks still read bridged context state | Hooks read query cache directly; remove bridge | Backlog |
| NO last price null in odds display | Low | Kalshi list API omits NO last; display falls back to mid/bid/ask | Accept or fetch from order book in 4C | 4C |
| Mock recommendation / overround cards | Medium | `MarketOddsPanel` live; edge/recommendation panels still static mock | Dynamic engine in M5 | 5 |
| Layout shell untested | Low | `AppShell`, `Sidebar`, `Topbar` at 0% coverage | Smoke tests when layout changes | Backlog |
| Polling-only feeds | Low | No WebSocket for BTC or Kalshi | Evaluate WS when latency requirements increase | 5+ |

## Resolved in 4.6

| Issue | Resolution |
|-------|------------|
| Binance HTTP 451 geo restriction | Replaced with Coinbase Exchange; typed 451/5xx errors in BFF |
| Single-provider hardcoding in BFF routes | `BtcPriceProvider` interface + `providers/coinbase.ts` |

## Health impact

After Milestone 4.6 → **Technical Debt: Low–Medium** (BTC geo-block resolved; failover chain remains).
