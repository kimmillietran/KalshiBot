# Feature: trading-dashboard

Main dashboard experience — live BTC and Kalshi data with Milestone 5 placeholders
for recommendations, probability/edge, and AI reasoning.

```
trading-dashboard/
  components/
    TradingDashboard.tsx   # grid layout orchestrator
    CommandBar.tsx         # live BTC + contract question header
    BtcChartPanel.tsx      # live chart + settlement target
    RecommendationPanel.tsx
    MarketOddsPanel.tsx    # live Kalshi odds (4B)
    ProbabilityEdgePanel.tsx
    MarketStructurePanel.tsx
    TradeManagementPanel.tsx
    AIReasoningPanel.tsx
  constants.ts             # placeholder copy
  utils.ts                 # contract question formatter
  index.ts
```

**Live:** `btc-feed`, `market-data` (via hooks in CommandBar, chart, MarketOddsPanel).

**Placeholder (Milestone 5):** Recommendation, AI reasoning, probability/edge panels
show "Model not live yet" — static mock advice is not presented as active.
