# Feature: trading-dashboard

Main dashboard experience — live BTC and Kalshi data wired to the trading engine
via snapshot mapping and `useTradeDecision()`.

```
trading-dashboard/
  components/
    TradingDashboard.tsx   # grid layout + engine orchestration
    CommandBar.tsx         # live BTC + contract question header
    BtcChartPanel.tsx      # live chart + settlement target
    RecommendationPanel.tsx  # TradeDecision.action + guard banner
    MarketOddsPanel.tsx    # live Kalshi odds (4B)
    ProbabilityEdgePanel.tsx # probability + expected value from engine
    MarketStructurePanel.tsx # feature vector from engine
    TradeManagementPanel.tsx # position sizing preview (no execution)
    AIReasoningPanel.tsx   # summarizeTradeDecision() + Copy Decision JSON export
    settings/              # TradingSettingsPanel (session-only form)
    decision/              # DecisionExportButton (presentation-only export)
  formatting/
    decisionDisplay.ts     # action tones, formatters (no business logic)
    positionSizingDisplay.ts # Kelly fraction / dollars formatters (no math)
  hooks/
    useTradeDecision.ts    # build snapshot → evaluate(resolvedSettings)
    useTradingSettingsForm.ts # session form state → resolveTradingSettings()
  utils/
    parseSettingsFormInput.ts      # string coercion only (no validation)
    buildEngineConfigFromSettings.ts # map resolved settings → EngineConfig
    serializeTradeDecision.ts    # stable TradeDecision JSON for clipboard export
    copyTextToClipboard.ts       # injectable clipboard helper (failure-safe)
    settingsFieldWarnings.ts
  types/
    tradingSettingsForm.ts
  mapping/
    buildEvaluationSnapshot.ts
    mapLifecycle.ts
  test-fixtures/
    engineDecisions.ts     # deterministic TradeDecision fixtures for tests
  constants.ts
  utils.ts
  index.ts
```

**Live:** `btc-feed`, `market-data` (CommandBar, chart, MarketOddsPanel).

**Engine-connected (5.6C–5.11B):** Dashboard renders live `TradeDecision` output —
`action`, `probability`, `expectedValue`, `positionSize` (fraction + dollars when bankroll
configured), `features`, and `summarizeTradeDecision()` reasoning. **Copy Decision JSON**
in Engine Reasoning exports stable decision JSON (no persistence, no network). Session-only
Trading Settings panel feeds `resolveTradingSettings()` → `buildEngineConfigFromSettings()` →
`evaluate()`. React components are presentation-only; validation stays in
`src/lib/trading/settings/`.

**Still deferred:** Trade execution, settings persistence, account bankroll source, LLM narrative,
export swap to `summarizeEngineSnapshot()`.
