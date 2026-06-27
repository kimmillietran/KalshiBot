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
    AIReasoningPanel.tsx   # summarizeTradeDecision() presentation
    decision/              # presentation-only decision subcomponents
  formatting/
    decisionDisplay.ts     # action tones, formatters (no business logic)
    positionSizingDisplay.ts # Kelly fraction / dollars formatters (no math)
  hooks/
    useTradeDecision.ts    # build snapshot → evaluate()
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

**Engine-connected (5.6C–5.8B):** Dashboard renders live `TradeDecision` output —
`action`, `probability`, `expectedValue`, `positionSize`, `features`, and
`summarizeTradeDecision()` reasoning (headline, summary, risk notes, technical trace).
React components are presentation-only; all trading logic stays in `src/lib/trading/`.

**Still deferred:** Trade execution, bankroll config, LLM narrative.
