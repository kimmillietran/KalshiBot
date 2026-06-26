# Feature: trading-dashboard

Milestone 2 mock trading cockpit — the main dashboard experience. Composes
panels that answer: *“Is Kalshi mispricing the probability that BTC finishes
above or below the target?”*

All data comes from `@/features/mock-data` (static). No live APIs.

```
trading-dashboard/
  components/
    TradingDashboard.tsx   # grid layout orchestrator
    CommandBar.tsx
    BtcChartPanel.tsx
    RecommendationPanel.tsx
    MarketOddsPanel.tsx
    ProbabilityEdgePanel.tsx
    MarketStructurePanel.tsx
    TradeManagementPanel.tsx
    AIReasoningPanel.tsx
  index.ts                 # public barrel
```

When live data arrives, this feature will consume `market-data`, `btc-feed`, and
`recommendations` modules instead of mock data. Panel components stay; only the
data source changes.
