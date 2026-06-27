# Feature: btc-feed

Live BTC spot price and 1-minute chart data for the trading dashboard.

**Milestone 3:** Initial Binance BFF integration.  
**Milestone 4.6:** Provider abstraction — Coinbase Exchange is the default upstream.  
**Milestone 4.6B:** Provider chain with Kraken failover and mock fallback constants.

```
btc-feed/
  providers/
    interface.ts         # BtcPriceProvider contract
    coinbase.ts          # Coinbase Exchange (default single provider)
    kraken.ts            # Kraken public REST
    fallback.ts          # Mock constants last resort
    composite.ts         # Sequential failover chain
    registry.ts          # registerBtcProvider / factories
    config.ts            # BTC_PROVIDER env resolution
    providerHealth.ts    # Circuit breaker + health scoring
    providerMetrics.ts   # Structured metric events
    errors.ts
    index.ts             # resolveBtcProvider(), getDefaultBtcProvider()
  api/
    btcClient.ts         # browser → app BFF
    btcServer.ts         # server → provider (used by BFF routes)
  hooks/useBtcPrice.ts
  hooks/useBtcChartData.ts
  BtcFeedProvider.tsx
  components/
  constants.ts
  types.ts
  utils.ts
  index.ts
```

## Provider chain (default)

When `BTC_PROVIDER` is unset or `auto`, server routes resolve:

```text
btcServer → getDefaultBtcProvider()
              ↓
         CompositeBtcPriceProvider
              ↓
         Coinbase → Kraken → fallback constants
```

UI hooks are unchanged: `btcClient` → `/api/btc/*` → `btcServer` → provider.

**24h change:** Coinbase uses `stats` (`last` − `open`); Kraken uses ticker `c[0]` − `o`.

## Configuration

| `BTC_PROVIDER` | Behavior |
|----------------|----------|
| unset / `auto` (default) | Coinbase → Kraken → fallback |
| `coinbase` | Coinbase only |
| `kraken` | Kraken only |

Selection is centralized in `resolveBtcProvider()` (`providers/index.ts`).

## Adding a future provider

1. Implement `BtcPriceProvider` in `providers/<name>.ts`.
2. Register via `registerBtcProvider("<id>", factory)` in `registry.ts`.
3. Append to the auto chain array in `resolveBtcProvider()` when ready for failover.
4. Add unit tests beside the provider module.

## Health & metrics (auto mode)

- Per-provider health score (0–100), status, and circuit breaker (3 consecutive failures → 60s cooldown).
- Structured `[btc-feed:metric]` JSON logs; subscribe via `subscribeProviderMetrics()`.
- Fallback provider is exempt from circuit breaking.

## Limitations

- Polling-only (4s price / 60s candles); no WebSocket failover.
- Fallback constants are not live market data — last resort when all upstream providers fail.
- Circuit breaker state is in-process (resets on server restart).
- Chart UX polish (provider badge, stale indicators) deferred.

Polling: 4s (price), 60s (candles). Stale threshold: 15s. Client falls back to mock constants when BFF fails.

Interacts with: `app/api/btc/*` (thin BFF). Consumed by topbar, command bar, and chart.
