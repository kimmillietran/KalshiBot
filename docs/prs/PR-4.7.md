# PR-4.7 — Dashboard Truthfulness & Chart Clarity

## Summary

Milestone 4.7 removes misleading mock trading advice from the live dashboard while preserving live BTC and Kalshi data. Recommendation, AI reasoning, and probability/edge panels are clearly labeled as placeholders until Milestone 5. The command bar uses contract-style wording and the BTC chart clarifies settlement target context.

No recommendation engine, probability logic, or provider changes.

## Problems addressed

| Issue | Fix |
|-------|-----|
| Fake BUY UP / confidence / edge presented as live advice | Recommendation panel neutral placeholder (`—`, Milestone 5 badge) |
| AI reasoning implied live analysis | Placeholder copy: "Decision engine pending Milestone 5." |
| Mock probability contradicted live Kalshi odds | Probability panel hides static demo values; points users to Market Odds |
| Kalshi title read like a prediction | Command bar: "Will BTC settle above {target} at {expiration}?" |
| Chart target context unclear | Thicker target line, settlement label, above/below badge, distance caption |

## Files created

| File | Purpose |
|------|---------|
| `trading-dashboard/constants.ts` | Shared placeholder copy |
| `trading-dashboard/utils.ts` | `formatMarketContractQuestion()` |
| `trading-dashboard/utils.test.ts` | Contract question formatting |
| `components/RecommendationPanel.test.tsx` | No BUY UP regression |
| `components/BtcChartPanel.test.tsx` | Target line + above/below smoke |
| `docs/prs/PR-4.7.md` | This file |

## Files modified

| File | Change |
|------|--------|
| `RecommendationPanel.tsx` | Placeholder UI |
| `AIReasoningPanel.tsx` | Placeholder UI |
| `ProbabilityEdgePanel.tsx` | Placeholder UI (no mock odds) |
| `MarketStructurePanel.tsx` | Preview label + disclaimer banner |
| `TradeManagementPanel.tsx` | Preview label + disclaimer banner |
| `CommandBar.tsx` | Contract question header |
| `BtcChartPanel.tsx` | Target line, above/below state, zone shading |
| `TradingDashboard.tsx` | Simplified panel props |
| `TradingDashboard.test.tsx` | Placeholder + contract header assertions |

**Unchanged:** `MarketOddsPanel`, BTC feed, Kalshi market-data providers, hooks.

## Tests

| Area | Coverage |
|------|----------|
| `utils.test.ts` | Contract question formatting |
| `RecommendationPanel.test.tsx` | No BUY UP; placeholder copy |
| `BtcChartPanel.test.tsx` | Target line, above/below badge |
| `TradingDashboard.test.tsx` | End-to-end placeholder + live odds |
| `MarketOddsPanel.test.tsx` | Unchanged — live odds still pass |

## Quality gates

```bash
npm run lint   # ✓
npm run test   # ✓
npm run build  # ✓
```

## Test plan

- [ ] Dashboard shows no BUY UP or fake edge badges on recommendation panel
- [ ] Placeholder labels visible on recommendation, AI, probability panels
- [ ] Kalshi Market Odds still show live 16¢/85¢ (or fallback when BFF fails)
- [ ] Command bar shows "Will BTC settle above … at …?"
- [ ] Chart shows settlement target label and Above/Below target badge
- [ ] Live BTC price and feed badges unchanged

## Remaining limitations

- Market Structure and Trade Management still show static demo rows (labeled preview)
- Milestone 5 engine still required for real recommendations
- Chart provider source badge not added (backlog)
