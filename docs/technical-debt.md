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

## Resolved in 5.1

| Issue | Resolution |
|-------|------------|
| Engine orchestrator / dashboard wiring | `buildEvaluationSnapshot()` + `useTradeDecision()` wire live feeds to `evaluate()` |
| BTC/pricing presence guards | `guard-btc-present` and `guard-pricing-present` in `evaluate()` |
| MarketOddsPanel footer truthfulness | Fake Combined / Best Edge rows removed |
| Raw ticker in CommandBar | Friendly subtitle + tooltip-only contract ID (preserved from bugfix) |
| Synthetic candle timestamps | Chart points carry upstream `timestamp`; snapshot maps real ms values |

## Resolved in 5.3A

| Issue | Resolution |
|-------|------------|
| Feature consumption by engine | `extractFeaturesFromSnapshot()` + `evaluate()` pipeline; `TradeDecision.features` metadata |
| Duplicate distance calculation in BTC feed | `calculateDistanceFromTarget()` delegates to feature builder |

## Resolved in 5.3B

| Issue | Resolution |
|-------|------------|
| Engine guard layer inline in `evaluate.ts` | Extracted to `src/lib/trading/guards/` with `runEvaluationGuards()` |
| BTC stale/fallback feed not guarded | `guard-btc-feed-stale`, `guard-btc-fallback-source` |
| BTC loading/error feed not guarded | `guard-btc-feed-loading`, `guard-btc-feed-error` |
| Missing candle guard | `guard-btc-candles` enforces `minimumCandles` |
| Settlement / spread / liquidity not config-enforced | `guard-settlement-window`, `guard-spread-maximum`, `guard-liquidity-minimum` |
| `gatesTriggered` for programmatic consumers | `TradeDecision.gatesTriggered?: readonly GuardStepId[]` |

## Resolved in 5.4A

| Issue | Resolution |
|-------|------------|
| No deterministic probability model | `estimateProbability()` in `src/lib/trading/probability/` — distance, momentum, volatility, trend, time decay |
| No `ProbabilityEstimate` type | `probabilityUp` / `probabilityDown` / `confidence` / `modelVersion` in `probability/types.ts` |

## Resolved in 5.4B

| Issue | Resolution |
|-------|------------|
| Probability not wired into engine | `evaluate()` calls `estimateProbability(features)` after feature extraction |
| `TradeDecision` missing probability | `probability: ProbabilityEstimate \| null` on domain type |
| Engine version stale | `ENGINE_VERSION` → `5.4.0` |

## Resolved in 5.5A

| Issue | Resolution |
|-------|------------|
| No expected value calculation | `estimateExpectedValue()` in `src/lib/trading/expected-value/` — per-side EV, edge %, `bestSide` |
| Duplicate probability stub on branch | Removed — imports use approved `@/lib/trading/probability` |
| No `ExpectedValueEstimate` type | `evUp` / `evDown` / `edgeUpPercent` / `edgeDownPercent` / `bestSide` / `modelVersion` |

## Resolved in 5.5B

| Issue | Resolution |
|-------|------------|
| EV not wired into engine | `evaluate()` calls `estimateExpectedValue()` after probability step |
| `TradeDecision` missing expected value | `expectedValue: ExpectedValueEstimate \| null` on domain type |
| Temporary EV stub on branch | Removed — consumes merged 5.5A module from `main` |
| Engine version stale | `ENGINE_VERSION` → `5.5.0` |

## Resolved in 5.6A

| Issue | Resolution |
|-------|------------|
| No decision policy module | `evaluateDecisionPolicy()` in `src/lib/trading/decision-policy/` — edge thresholds, liquidity gate, `BUY UP`/`BUY DOWN`/`HOLD`/`NO TRADE` |
| No `DecisionPolicyResult` type | `action`, `reasonCode`, `selectedSide`, `reasoning` on policy result |

## Outstanding (5.6B+)

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Decision policy engine wiring** | Medium | `evaluate()` still uses decision-stub / `NO TRADE` | Wire `evaluateDecisionPolicy()` after EV step | **5.6B** |
| **Kelly sizing** | Medium | No position sizing from edge | Add after policy wiring | **5.7** |
| **Dashboard decision rendering** | Medium | UI still placeholder | Wire `TradeDecision.action` to panels | **5.9** |

## Minor follow-ups (5.3A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Stale test name in `useTradeDecision.test.tsx` | Low | Rename to reflect feature-vector integration |
| Optional hook assertion for `decision.features` | Low | Assert `features` shape in hook test |
| Vitest teardown warning in `tickerRegression.test.tsx` | Low | Cancel timers on unmount |

## Minor follow-ups (5.3B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Accidental `?` in `evaluate.ts` reasoning strings | Low | Replace with em dashes (—) |
| Stale "5.3A" description in `versioning.test.ts` | Low | Rename to reflect guard layer milestone |
| Zero-spread explicit regression test | Low | Optional coverage in `guards/pricing.test.ts` |
| `GuardStepId` in trading types | Low | Optional relocation to `src/types/domain/` |

## Minor follow-ups (5.4B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Explicit `decision-stub` outcome assertion | Low | Assert `outcome: "skip"` in `evaluate.test.ts` |
| `ProbabilityEstimate` layering cleanup | Low | Consider re-export via domain types barrel |
| `ProbabilityModelConfig` on `EngineConfig` | Low | Wire config when model tuning is needed |

## Minor follow-ups (5.5A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Optional immutability tests | Low | Assert frozen outputs on `ExpectedValueEstimate` |
| Fee/clamp boundary tests | Low | Expand edge cases for `feeCentsPerContract` and `maxEvMagnitude` |
| YES tie-break documentation | Low | Already in PR-5.5A; optional inline comment in `estimateExpectedValue.ts` |

## Minor follow-ups (5.5B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Domain re-export for `ExpectedValueEstimate` | Low | Re-export via `src/types/domain/` barrel |
| Type narrowing after pricing guards | Low | Optional non-null assertion cleanup in `evaluate()` |
| `EngineConfig` policy thresholds | Low | Wire `minEdgePercent` when decision policy lands (5.6) |

## Minor follow-ups (5.6A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Golden policy fixture | Low | Add deterministic golden test vectors |
| Composition test | Low | End-to-end policy input from real EV/probability shapes |
| Infinity input test | Low | Guard `Number.POSITIVE_INFINITY` edge inputs |
| `features` / `minLiquidityQuality` ownership | Low | Decide policy vs guard-layer responsibility |

## Other outstanding

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| Chart UX — provider source badge | Low | Provider badge not added | Backlog | Backlog |
| External metrics sink | Low | Console-only metrics | Datadog/OTel | Backlog |
| Shared circuit state | Low | In-process circuit breaker | Redis/edge config | Backlog |
| Kalshi rate-limit retry/backoff | Medium | 429 not retried | Exponential backoff | Backlog |
| Provider context-bridge pattern | Medium | Hooks read bridged context | Refactor to query cache | Backlog |
| Layout shell untested | Low | Shell at 0% coverage | Smoke tests | Backlog |
| Polling-only feeds | Low | No WebSocket | Evaluate when needed | 5+ |

## Health impact

After Milestone 5.6A → **Technical Debt: Low** (decision policy module complete; engine wiring and dashboard remain for 5.6B+).
