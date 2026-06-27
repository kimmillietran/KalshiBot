# PR-4.6B — BTC Provider Chain & High Availability

## Summary

Milestone 4.6B adds a sequential provider chain with Kraken failover and mock fallback constants. Public hooks, dashboard components, and Kalshi integrations are unchanged. Provider selection is env-driven via `BTC_PROVIDER`.

Built on merged Milestone 4.6 (Coinbase abstraction, numeric candle parsing, typed BFF errors).

## Provider chain architecture

```text
BFF routes (/api/btc/*)
  ↓
btcServer.fetchBtcSpotPrice() / fetchBtcCandleHistory()
  ↓
getDefaultBtcProvider()  ← resolveBtcProvider() in providers/index.ts
  ↓
[auto mode] CompositeBtcPriceProvider
  ↓
Coinbase → Kraken → fallback (mock constants)
```

Single-provider modes skip the composite:

| `BTC_PROVIDER` | Resolved provider |
|----------------|-------------------|
| unset / `auto` (default) | Composite chain above |
| `coinbase` | `createRegisteredBtcProvider("coinbase")` |
| `kraken` | `createRegisteredBtcProvider("kraken")` |

## Kraken endpoints used

| Endpoint | Purpose |
|----------|---------|
| `GET https://api.kraken.com/0/public/Ticker?pair=XBTUSD` | Spot price + 24h change (`c[0]` vs `o`) |
| `GET https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1` | 1-minute OHLC candles |

No API key required (public REST).

## Failover behavior

`createCompositeBtcPriceProvider` tries providers in order; first success wins. On failure:

1. `onProviderFailure` logs a human-readable warning.
2. Health tracker records failure; circuit opens after 3 consecutive failures (60s cooldown).
3. Structured metric event emitted (`provider_failure`, `circuit_opened`, etc.).
4. Next provider in chain is attempted.

Open circuits are skipped until cooldown expires (half-open probe allowed). `fallback` is circuit-exempt.

`BtcProviderChainError` is thrown when every provider fails (including circuit skips) — BFF maps to HTTP 502.

## Files created

| File | Purpose |
|------|---------|
| `providers/composite.ts` | Sequential failover chain |
| `providers/config.ts` | `BTC_PROVIDER` env resolution |
| `providers/registry.ts` | Provider factory registry |
| `providers/fallback.ts` | Mock-constant last resort |
| `providers/providerHealth.ts` | Circuit breaker + health scoring |
| `providers/providerMetrics.ts` | Structured metric pipeline |
| `providers/*.test.ts` | Chain, Kraken, health, config, fallback tests |
| `docs/prs/PR-4.6B.md` | This file |

## Files modified

| File | Change |
|------|--------|
| `providers/kraken.ts` | Full implementation (was stub) |
| `providers/index.ts` | `resolveBtcProvider()`, cache reset, exports |
| `providers/errors.ts` | `BtcProviderChainError` |
| `api/btcServer.ts` | Re-export chain error |
| `app/api/btc/price/route.ts` | Map `BtcProviderChainError` → 502 |
| `app/api/btc/candles/route.ts` | Map `BtcProviderChainError` → 502 |
| `app/api/btc/candles/route.integration.test.ts` | Provider cache reset in hooks |
| `src/features/btc-feed/README.md` | Chain architecture docs |
| `docs/technical-debt.md` | Resolve 4.6B items |

**Unchanged:** `BtcFeedProvider.tsx`, `useBtcPrice`, `useBtcChartData`, `btcClient.ts`, dashboard components, Kalshi modules.

## Tests added / updated

| Area | Coverage |
|------|----------|
| `kraken.test.ts` | Ticker/OHLC mapping, 429/5xx, API errors, network, timeout, malformed |
| `composite.test.ts` | Ordering, unavailable/timeout/malformed failover, all-fail, fallback, circuit skip, metrics |
| `config.test.ts` | Env mode resolution |
| `fallback.test.ts` | Mock constant price/candles |
| `index.test.ts` | `resolveBtcProvider`, registry, cache |
| `providerHealth.test.ts` | Scoring, circuit open/close, exempt fallback |
| `providerMetrics.test.ts` | Structured logging, observer subscription |
| Existing Coinbase + BFF tests | Still passing |

## Configuration

```bash
# .env.local (optional — chain is default when unset)
BTC_PROVIDER=auto        # Coinbase → Kraken → fallback (default)
BTC_PROVIDER=coinbase      # Coinbase only
BTC_PROVIDER=kraken        # Kraken only
```

## Remaining limitations

- In-process circuit/health state (not shared across instances).
- No external metrics sink (Datadog/etc.) — JSON console + observer hook only.
- Chart UX improvements (provider badge, stale polish) deferred.
- WebSocket feeds still out of scope.

## Quality gates

```bash
npm run lint   # ✓
npm run test   # ✓ (185 tests)
npm run build  # ✓
```

## Test plan

- [ ] Default (no `BTC_PROVIDER`) — composite chain serves dashboard
- [ ] `BTC_PROVIDER=coinbase` — live Coinbase price/candles on dashboard
- [ ] `BTC_PROVIDER=kraken` — Kraken-only path
- [ ] `BTC_PROVIDER=auto` — simulate Coinbase 503; confirm Kraken or fallback serves BFF
- [ ] Confirm hooks/UI unchanged (price flash, chart, stale badge)
- [ ] Review structured `[btc-feed:metric]` logs under auto mode failures
