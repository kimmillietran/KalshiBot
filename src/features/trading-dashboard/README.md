# Feature: trading-dashboard

Main dashboard experience — live BTC and Kalshi data wired to the Milestone 5.0
trading engine via snapshot mapping and `useTradeDecision()`.

```
trading-dashboard/
  components/
    TradingDashboard.tsx   # grid layout + engine orchestration
    CommandBar.tsx         # live BTC + contract question header
    BtcChartPanel.tsx      # live chart + settlement target
    RecommendationPanel.tsx  # engine decision (NO TRADE stub)
    MarketOddsPanel.tsx    # live Kalshi odds (4B)
    ProbabilityEdgePanel.tsx # guard trace from engine
    MarketStructurePanel.tsx
    TradeManagementPanel.tsx
    AIReasoningPanel.tsx   # reasoning trace skeleton
  hooks/
    useTradeDecision.ts    # build snapshot → evaluate()
  mapping/
    buildEvaluationSnapshot.ts
    mapLifecycle.ts
  constants.ts
  utils.ts                 # contract question + market subtitle formatters
  index.ts
```

**Live:** `btc-feed`, `market-data` (CommandBar, chart, MarketOddsPanel).

**Engine-connected (5.1):** Recommendation, AI reasoning, probability/edge guard
trace, trade management placeholder — all driven by `evaluate()` output.

**Still deferred:** Probability model, fair value, EV, LLM narrative, execution.
