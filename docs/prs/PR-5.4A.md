# PR-5.4A — Deterministic Probability Model

## Summary

Milestone 5.4A adds a pure probability module under `src/lib/trading/probability/`. `estimateProbability()` consumes a `MarketFeatureVector` and returns a `ProbabilityEstimate` with fair-value UP/DOWN probabilities, confidence, and auditable driver contributions.

**Not wired into `evaluate()` in this milestone** — Builder #2 integrates probability into the engine and `TradeDecision`.

## Model (v1 heuristic)

Deterministic log-odds model:

| Driver | Signal |
|--------|--------|
| Distance | Percent from spot to strike |
| Momentum | Recent candle change % |
| Trend | Linear-regression trend score |
| Cross target | Recent strike cross direction |
| Volatility dampen | Shrinks log-odds when CV is high |
| Time urgency | Amplifies distance signal near expiry |

Output: `sigmoid(logOdds)` → `probabilityUp`, complement → `probabilityDown`.

## API

```typescript
estimateProbability(features, config?) → ProbabilityEstimate
```

## Out of scope (5.4B+)

- Engine wiring / reasoning step update
- EV, Kelly, recommendation policy
- Dashboard UI
- Monte Carlo / BRTI settlement simulation

## Tests

- `estimateProbability.test.ts` — determinism, bounds, directional cases, edge cases

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Review checklist

- [ ] Same features → same estimate
- [ ] `probabilityUp + probabilityDown === 1`
- [ ] No `Date.now()` / fetch / React in module
- [ ] `evaluate()` unchanged (still NO TRADE stub)
