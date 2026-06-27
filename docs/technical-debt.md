# Technical Debt Register

Tracked intentionally — not silent accumulation. Review at each milestone close-out.

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Binance HTTP 451 geo restriction** | **High** | Binance returns 451 in restricted regions; BFF maps to 502; dashboard falls back to mock BTC prices. Pre-existing since M3; not caused by 4.5/4B. | Provider abstraction with Coinbase (or multi-provider fallback chain); distinguish 451 vs other upstream errors in BFF | **4.6** |
| **Single BTC provider dependency** | **High** | Hardcoded Binance URLs in `/api/btc/price` and `/api/btc/candles`; no failover | `btc-feed` provider interface + configurable primary/fallback providers | **4.6** |
| Kalshi rate-limit retry/backoff | Medium | 429 surfaced but not retried; transient failures go straight to fallback | Exponential backoff in `kalshiServer` or BFF; cap retries | 4C |
| Provider context-bridge pattern | Medium | 4.5 migrates to TanStack Query but hooks still read bridged context state | Hooks read query cache directly; remove bridge | Backlog |
| NO last price null in odds display | Low | Kalshi list API omits NO last; display falls back to mid/bid/ask | Accept or fetch from order book in 4C | 4C |
| Mock recommendation / overround cards | Medium | `MarketOddsPanel` live; edge/recommendation panels still static mock | Dynamic engine in M5 | 5 |
| Layout shell untested | Low | `AppShell`, `Sidebar`, `Topbar` at 0% coverage | Smoke tests when layout changes | Backlog |
| Polling-only feeds | Low | No WebSocket for BTC or Kalshi | Evaluate WS when latency requirements increase | 5+ |

## Health impact

After Milestones 4.5 and 4B merge → **Technical Debt: Medium** (elevated by Binance geo restriction blocking live BTC in some environments).
