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

## Resolved in 5.6B

| Issue | Resolution |
|-------|------------|
| Decision policy not wired into engine | `evaluate()` calls `evaluateDecisionPolicy()` after EV step |
| `decision-stub` placeholder | Replaced by `decision-policy` reasoning step |
| `TradeDecision.action` always `NO TRADE` | Mapped from `DecisionPolicyAction` via `toTradeAction()` |
| Engine version stale | `ENGINE_VERSION` → `5.6.0` |

## Resolved in 5.6C

| Issue | Resolution |
|-------|------------|
| Dashboard placeholder / deferred model copy | Panels render live `TradeDecision` — action, probability, EV, features, reasoning |
| Fake recommendation / model edge UI | Removed; `RecommendationPanel`, `ProbabilityEdgePanel` use engine output |
| Guard failures hidden in UI | `GuardFailureBanner` + `UnavailableMetric` show truthful unavailable states |
| Business logic in React | Presentation-only `decision/` components + `decisionDisplay` formatters |

## Resolved in 5.7A

| Issue | Resolution |
|-------|------------|
| No Kelly position sizing module | `estimatePositionSize()` in `src/lib/trading/position-sizing/` — fractional Kelly, confidence dampening, min/max gates |
| No `PositionSizeEstimate` type | `recommendedFraction`, `recommendedDollars`, `rawKellyFraction`, reasoning metadata |

## Resolved in 5.7B

| Issue | Resolution |
|-------|------------|
| Position sizing not wired into engine | `evaluate()` calls `estimatePositionSize()` after decision policy |
| `TradeDecision` missing position size | `positionSize: PositionSizeEstimate \| null` on domain type |
| Engine version stale | `ENGINE_VERSION` → `5.7.0` |

## Resolved in 5.8A

| Issue | Resolution |
|-------|------------|
| No reasoning presentation module | `summarizeTradeDecision()` in `src/lib/trading/reasoning-presentation/` |
| Raw trace not UI-ready | `ReasoningPresentation` with headline, summary, risk notes, technical trace |

## Resolved in 5.7C

| Issue | Resolution |
|-------|------------|
| Dashboard position sizing placeholder | `PositionSizeSummary` + `TradeManagementPanel` render `TradeDecision.positionSize` |
| Kelly math in React | `positionSizingDisplay.ts` formatters only — no sizing calculations in UI |
| Unavailable vs zero sizing conflated | Distinct copy for guard failure, bankroll unavailable, and policy zero allocation |

## Resolved in 5.8B

| Issue | Resolution |
|-------|------------|
| Dashboard reasoning integration | `AIReasoningPanel` calls `summarizeTradeDecision()` — headline, summary, risk notes |
| Raw trace only in UI | Expandable `TechnicalTraceList` for full engine reasoning steps |
| `AIReasoningPanel` untested | Dedicated tests for BUY UP/DOWN, NO TRADE, guard failure, snapshot coverage |

## Resolved in 5.9A

| Issue | Resolution |
|-------|------------|
| No bankroll validation module | `resolveBankroll()` in `src/lib/trading/bankroll/` |
| Engine inventing default bankroll | Validation only — `configured: false` when absent or invalid |
| No `ResolvedBankroll` type | `bankrollDollars`, `configured`, `reasoning`, `modelVersion` |

## Resolved in 5.9B

| Issue | Resolution |
|-------|------------|
| Bankroll not wired into engine | `evaluate()` calls `resolveBankroll(config)` after decision policy |
| Kelly dollar sizing always null | `estimatePositionSize()` receives resolved `bankrollDollars` |
| No bankroll reasoning step | `model-bankroll` step in engine trace |
| Dashboard bankroll messaging | Shows dollars when configured; "Bankroll not configured" when absent |
| Engine version stale | `ENGINE_VERSION` → `5.9.0` (later → `5.10.0` with settings config surface in 5.10B) |

## Resolved in 5.10A

| Issue | Resolution |
|-------|------------|
| No settings normalization module | `resolveTradingSettings()` in `src/lib/trading/settings/` |
| Scattered threshold defaults | Defaults sourced from `DEFAULT_ENGINE_CONFIG` and `DEFAULT_POSITION_SIZING_CONFIG` |
| Bankroll in settings without invention | Delegates to `resolveBankroll()` — optional, never defaulted |

## Resolved in 5.10B

| Issue | Resolution |
|-------|------------|
| Settings UI not connected to engine | `TradingSettingsPanel` + `useTradingSettingsForm` → `resolveTradingSettings()` → `evaluate()` |
| Raw form validation in React | `parseSettingsFormInput` coercion only; resolver owns validation |
| No live settings re-evaluation | `useTradeDecision(resolvedSettings)` rebuilds `EngineConfig` on change |
| Bankroll dollars from UI | Valid bankroll populates `EngineConfig.bankrollDollars`; invalid omits field |
| Settings module duplicated | Dashboard delegates to `resolveTradingSettings()` — no duplicate rules |

## Resolved in 5.11A

| Issue | Resolution |
|-------|------------|
| No serializable engine snapshot contract | `summarizeEngineSnapshot()` in `src/lib/trading/engine-snapshot/` |
| Raw `TradeDecision` not export-ready | `EngineSnapshotPresentation` with formatted sections + metadata |
| Unavailable values invented in UI | Sections use `null` + `available: false`; no placeholder strings |

## Resolved in 5.11B

| Issue | Resolution |
|-------|------------|
| Dashboard snapshot export not wired | `DecisionExportButton` in `AIReasoningPanel` copies stable `TradeDecision` JSON |
| Clipboard failures blocking UI | Injectable `copyTextToClipboard()` + non-blocking error feedback |
| Null vs zero position sizing lost on export | `serializeTradeDecision()` preserves `positionSize: null` vs zero object |

## Resolved in 6.1A

| Issue | Resolution |
|-------|------------|
| No historical data contract layer | `src/lib/data/` with Bronze/Silver Zod schemas |
| Ambiguous timestamp handling | UTC-only ISO-8601 with `Z` suffix; `eventTime` / `collectionTime` / `observedAt` |
| No provenance model | `FetchProvenance` + `DataSource` literals on bronze records |

## Resolved in 6.1B

| Issue | Resolution |
|-------|------------|
| No Kalshi Historical API abstraction | `HistoricalImporter` + `KalshiHistoricalImporter` with injectable HTTP client |
| Endpoint wiring untested | `historicalEndpoints.ts` builders + unit tests |
| Real network in tests | Fake `KalshiHistoricalHttpClient` only; no global `fetch` in importer tests |

## Resolved in 6.2A

| Issue | Resolution |
|-------|------------|
| No bronze storage abstraction | `BronzeStore` + `InMemoryBronzeStore` under `src/lib/data/bronze/` |
| No deterministic bronze keys/serialization | `bronzeKeys.ts`, `serializeBronzeRecord.ts` with stable JSON + clone helpers |
| Duplicate append semantics undefined | Idempotent identical append; `BronzeDuplicateConflictError` on content conflict |

## Resolved in 6.2B

| Issue | Resolution |
|-------|------------|
| No production HTTP adapter | `KalshiHistoricalHttpAdapter` implements `KalshiHistoricalHttpClient` |
| Raw Kalshi payloads not bronze-mapped | `kalshiToBronzeRecord.ts` maps wire JSON to `RawHistoricalRecord` |

## Resolved in 6.3A

| Issue | Resolution |
|-------|------------|
| No Silver normalization pipeline | `SilverNormalizer` + content-type dispatch under `src/lib/data/silver/` |
| Bronze → Silver contract gap | `normalizeMarketWindow`, `normalizeKalshiCandle`, `normalizeSettlement` validate against 6.1A schemas |
| Malformed bronze payloads untyped | Stable `SilverNormalizationError` codes (`SilverMalformedPayloadError`, etc.) |

## Resolved in 6.3B

| Issue | Resolution |
|-------|------------|
| No historical snapshot contract | `HistoricalTradingSnapshot` + `SnapshotAssemblyInput` under `src/lib/data/snapshots/` |
| Silver records not assembled for replay | `assembleHistoricalTradingSnapshot()` combines market window, Kalshi candles, BTC bars, optional settlement |
| Snapshot provenance lost | Per-record provenance preserved on output envelope |
| Caller input mutated by freeze | Assembly clones inputs before `deepFreeze`; caller envelopes remain mutable |

## Outstanding (post-6.3B)

| Issue | Priority | Reason | Suggested fix | Milestone |
|-------|----------|--------|---------------|-----------|
| **Filesystem/DB bronze persistence** | Medium | In-memory store only | Production bronze writers | **Backlog** |
| **Bronze import job** | Medium | HTTP adapter exists; no scheduled import pipeline | Wire importer + store append job | **Backlog** |
| **Market dateRange query** | Medium | `listHistoricalMarkets()` defers date filters | Wire when Kalshi API documents supported params | **Backlog** |
| **Replay engine** | Medium | Snapshots assembled; no replay runner | Replay engine over `HistoricalTradingSnapshot` | **6.4** |
| **snapshotVersion field** | Medium | Deferred from 6.3B assembler | Add with replay contract versioning | **6.4** |
| **Export uses raw TradeDecision** | Medium | 5.11B ships pre-5.11A serializer path | Swap to `summarizeEngineSnapshot()` for compact payload | **Backlog** |
| **Settings persistence** | Medium | Session-only form state — lost on refresh | localStorage or account-backed settings | **Backlog** |
| **Account/bankroll source** | Medium | Manual bankroll entry only | Future brokerage/account integration | **Backlog** |

## Minor follow-ups (6.2A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| `stableStringify` location | Low | Relocate to shared util outside `trading/config` when low-risk |
| Filter semantics documentation | Low | Keep inclusivity + canonical identity rules tested and documented |
| `BronzeDuplicateConflictError` metadata | Low | Optional structured diff on conflict |

## Minor follow-ups (6.3A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| `quality_flags` error wrapping consistency | Medium | Keep invalid flags wrapped in `SilverMalformedPayloadError` across normalizers |
| `seriesTicker` derivation alignment | Medium | Keep documented derivation order aligned with bronze mapper |
| Additional Silver boundary tests | Low | Expand malformed-payload and content-type edge cases |

## Minor follow-ups (6.3B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| `snapshotVersion` on snapshots | Medium | Add with replay contract in 6.4 |
| Additional assembly boundary tests | Low | Expand temporal/provenance edge cases |

## Minor follow-ups (6.1)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Importer ↔ contract type alignment | Low | Replace local `kalshiHistoricalTypes` with shared contracts where safe |
| Additional wire validation | Low | Deeper API response shape guards in importer |

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

## Minor follow-ups (5.6B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Restore three dropped guard integration cases | Low | Re-add BTC null, spread unavailable, config-disabled tests in `evaluate.test.ts` |
| Document pass/skip semantics in PR-5.6B | Low | Clarify reasoning step outcomes in PR doc |
| Domain/lib type-coupling polish | Low | Consider `DecisionPolicyAction` re-export via domain types |

## Minor follow-ups (5.6C)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| `AIReasoningPanel` dedicated test | Low | Smoke test with `ReasoningTraceList` fixture |
| `MarketStructurePanel` dedicated test | Low | Assert feature rows from `engineDecisions` fixture |
| BUY UP dashboard smoke test | Low | Extend `TradingDashboard.test.tsx` for bullish action |
| README/docs upkeep | Low | Keep feature README aligned with panel changes |

## Minor follow-ups (5.7A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Invalid bankroll test | Low | Assert zero/negative bankroll handling |
| Edge-at-threshold documentation | Low | Covered in PR-5.7A; optional inline comment |
| Future portfolio exposure limits | Low | Multi-contract cap deferred to backlog |

## Minor follow-ups (5.7C)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| BUY with zero allocation vs policy NO TRADE wording | Low | Clarify guidance copy in `positionSizingDisplay.ts` |
| "Kelly Fraction" label precision | Low | Consider "Capped Fraction" label for capped Kelly output |

## Minor follow-ups (5.8B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| `MarketStructurePanel` dedicated test | Low | Assert feature rows from `engineDecisions` fixture |
| BUY UP dashboard smoke test | Low | Extend `TradingDashboard.test.tsx` for bullish action |

## Minor follow-ups (5.8A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Invalid bankroll test | Low | Assert zero/negative bankroll in position-sizing tests |
| Edge-at-threshold inline doc | Low | PR-5.7A covers; optional comment in module |

## Minor follow-ups (6.6A)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Metrics adapter extraction | Medium | Move `buildEquityCurve` / `buildClosedTrades` into standalone module |
| Optional `engineConfig` on experiment config | Medium | Expose replay engine overrides without duplicating replay logic |
| Runner step/rejection artifacts on result | Medium | Attach `BacktestStrategyRunResult` step outputs and `rejectedIntents` |
| Metrics adapter accounting reconstruction | Medium | Document or simplify closed-trade derivation vs ledger realized P/L |

## Minor follow-ups (6.6B)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Default sweep stub vs 6.6A integration | Medium | Wire `experimentFactory` to produce full `ResearchExperimentConfig` and inject 6.6A `runResearchExperiment` |
| Injected `runExperiment` path test coverage | Medium | Expand beyond basic call-count assertion |
| Shared research contract extraction | Medium | Unify sweep-layer and 6.6A experiment types when sweep factories mature |
| Large Cartesian sweep guardrails | Medium | Add max-combination limit or warning before sweep execution |

## Minor follow-ups (6.6C)

| Issue | Priority | Suggested fix |
|-------|----------|---------------|
| Default walk-forward runner uses sweep stub | Medium | Inject `runExperiment` wired to 6.6A `runResearchExperiment` for real backtests |
| `deepFreeze` shares caller snapshot references | Low | Document or clone snapshots before freezing windows |
| Additional validation-path tests | Low | Cover `validationId`, `stepSize`, sweepId mismatch, injected-runner failures |

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

After Milestone 6.3B → **Technical Debt: Low** (Silver normalization + historical snapshot assembly complete; replay engine and persistence remain backlog).
