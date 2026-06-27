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
| Mock recommendation / AI / probability panels | Placeholder UI; fake BUY UP and model edge hidden until engine wiring |
| Chart UX — target context | Settlement target label, above/below badge, distance caption on BTC chart |
| Misleading market title | Command bar uses contract question wording with live target + expiration |

## Resolved in 5.0

| Issue | Resolution |
|-------|------------|
| No deterministic trading engine | Pure `evaluate()` in `src/lib/trading/` with guard rails and reasoning trace |
| No domain types for engine I/O | `src/types/domain/trading.ts` — snapshot, config, decision types |

## Resolved in 5.2

| Issue | Resolution |
|-------|------------|
| No feature extraction layer | Pure `buildMarketFeatureVector()` in `src/lib/features/` — distance, momentum, volatility, trend, liquidity |

## Outstanding (5.1 — Builder #1, not merged)

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Engine orchestrator / dashboard wiring** | High | Engine not connected to live feeds or UI panels | Map BTC/Kalshi into `EvaluationSnapshot`; wire recommendation panels | **5.1** |
| **MarketOddsPanel footer truthfulness** | Medium | Static "Combined / overround" and "Best Edge Side" rows | Replace with engine output | **5.1** |

## Outstanding (5.3+)

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Feature consumption by engine** | High | `MarketFeatureVector` not passed into `evaluate()` | Orchestrator maps feeds → features → snapshot | **5.3** |
| **Probability model** | High | No fair-value / implied probability calculation | Deterministic model in `src/lib/trading/` | **5.3+** |
| **EV calculation** | Medium | No expected-value from model vs market prices | Add after probability model | **5.3+** |
| **Kelly sizing** | Medium | No position sizing from edge | Add after EV | **5.3+** |
| **Recommendation policy** | Medium | No action selection (BUY UP/DOWN/NO TRADE) from edge + Kelly | Add after sizing | **5.3+** |

## Other outstanding

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| BTC/pricing presence guards | Medium | Explicit BTC spot + contract pricing checks | Extend snapshot guards | 5.1 |
| Invalid strike / lifecycle tests | Low | Edge-case guard coverage | Regression tests | 5.1 |
| Chart UX — provider source badge | Low | Provider badge not added | Backlog | Backlog |
| External metrics sink | Low | Console-only metrics | Datadog/OTel | Backlog |
| Shared circuit state | Low | In-process circuit breaker | Redis/edge config | Backlog |
| Kalshi rate-limit retry/backoff | Medium | 429 not retried | Exponential backoff | Backlog |
| Provider context-bridge pattern | Medium | Hooks read bridged context | Refactor to query cache | Backlog |
| Layout shell untested | Low | Shell at 0% coverage | Smoke tests | Backlog |
| Polling-only feeds | Low | No WebSocket | Evaluate when needed | 5+ |

## Health impact

After Milestone 5.2 → **Technical Debt: Low–Medium** (feature builder complete; engine consumption and probability stack remain for 5.3+).
