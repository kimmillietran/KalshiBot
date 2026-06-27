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

## Outstanding (5.1 follow-ups)

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Engine orchestrator / dashboard wiring** | High | Engine not connected to live feeds or UI panels | Map BTC/Kalshi into `EvaluationSnapshot`; wire recommendation panels | **5.1** |
| **BTC/pricing presence guards** | Medium | Guards cover market/strike; missing explicit BTC spot + contract pricing presence checks | Extend snapshot guards in `evaluate()` | **5.1** |
| **Invalid strike tests** | Low | Edge cases for zero/negative strike not fully covered | Add regression tests in `evaluate.test.ts` | **5.1** |
| **UPCOMING / SETTLED lifecycle tests** | Low | Only ACTIVE guard path tested explicitly | Add lifecycle regression tests | **5.1** |
| **`types/domain` README** | Low | Domain folder lacks orientation doc | Add `src/types/domain/README.md` | **5.1** |
| **Optional `gatesTriggered` field** | Low | Reviewer suggestion for explicit guard output on decision | Add to `TradeDecision` if orchestrator needs it | **5.1** |
| **MarketOddsPanel footer truthfulness** | Medium | Static "Combined / overround" and "Best Edge Side" rows look like model output | Remove, placeholder-label, or replace with engine output | **5.1** |

## Other outstanding

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| Chart UX — provider source badge | Low | Provider badge on chart header not added | Backlog item from 4.7 | Backlog |
| External metrics sink | Low | Metrics log to console only | Wire Datadog/OpenTelemetry | Backlog |
| Shared circuit state | Low | In-process circuit breaker per instance | Redis or edge config | Backlog |
| Kalshi rate-limit retry/backoff | Medium | 429 not retried | Exponential backoff | Backlog |
| Provider context-bridge pattern | Medium | Hooks read bridged context not query cache | Refactor providers | Backlog |
| NO last price null in odds display | Low | Kalshi list API omits NO last | Order book or accept fallback | Backlog |
| Market structure / trade mgmt preview rows | Low | Static demo rows with preview labels | Replace when engine wired | 5.1+ |
| Layout shell untested | Low | Shell components at 0% coverage | Smoke tests | Backlog |
| Polling-only feeds | Low | No WebSocket | Evaluate when needed | 5+ |

## Health impact

After Milestone 5.0 → **Technical Debt: Low–Medium** (engine foundation complete; wiring, guard hardening, and UI truthfulness remain for 5.1).
