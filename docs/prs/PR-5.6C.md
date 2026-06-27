# PR-5.6C — Decision Dashboard Integration

## Summary

Milestone 5.6C wires the trading dashboard to live `TradeDecision` output from the engine (5.6B). Panels render `action`, `probability`, `expectedValue`, `features`, and `reasoning` with presentation-only React components — no business logic in the UI layer.

**Base:** `main` (includes full engine pipeline through decision policy).

## Data flow

```
Live feeds (BTC, Kalshi)
  → buildEvaluationSnapshot()
  → evaluate()
  → TradeDecision
  → dashboard panels (presentation only)
```

## Panels updated

| Panel | Renders from `TradeDecision` |
|-------|------------------------------|
| `RecommendationPanel` | `action`, `reasoning.summary`, guard failure banner |
| `ProbabilityEdgePanel` | `probability`, `expectedValue` |
| `MarketStructurePanel` | `features` (distance, trend, momentum, volatility, liquidity, time) |
| `AIReasoningPanel` | `reasoning.steps` via `ReasoningTraceList` |
| `MarketOddsPanel` | Live Kalshi odds (unchanged source); footer defers Kelly |

## New presentation components

`components/decision/` — `DecisionActionHero`, `ProbabilitySummary`, `ExpectedValueSummary`, `GuardFailureBanner`, `ReasoningTraceList`, `UnavailableMetric`

`formatting/decisionDisplay.ts` — action tones, percent/cents formatters, guard-failure detection

## Guard failures

When `gatesTriggered` is set or model outputs are null, panels show truthful unavailable states — no fake BUY signals or placeholder model edge.

## Out of scope

- Kelly sizing / position sizing UI
- Trade execution
- Engine or policy changes
- LLM narrative generation

## Tests

- `RecommendationPanel.test.tsx`, `ProbabilityEdgePanel.test.tsx` — live decision fixtures
- `decisionDisplay.test.ts` — formatters and guard-failure helper
- `TradingDashboard.test.tsx` — engine-connected smoke

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
