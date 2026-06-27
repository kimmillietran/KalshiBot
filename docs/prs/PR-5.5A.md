# PR-5.5A — Expected Value Model

## Summary

Milestone 5.5A adds a pure expected-value module under `src/lib/trading/expected-value/`. `estimateExpectedValue()` compares model fair probability (5.4A) to Kalshi ask prices and returns per-side EV, edge, and reasoning metadata.

**Not wired into `evaluate()` in this milestone** — Builder #2 integrates EV into the engine pipeline.

## Formula (per contract, cents)

```
EV_yes = P(up) × (100 − yesAsk) − P(down) × yesAsk
EV_no  = P(down) × (100 − noAsk) − P(up) × noAsk
edge%  = (fairCents − askCents) / askCents × 100
```

Optional fee deduction and EV magnitude clamp via `ExpectedValueConfig`.

## Tie-break policy

When both sides share equal **non-zero** net EV, `bestSide` resolves to **`yes`** (deterministic tie-break). When both net EVs are exactly **zero**, `bestSide` is **`null`**.

## API

```typescript
estimateExpectedValue(
  { probability, features, pricing },
  config?,
) → ExpectedValueEstimate
```

## Out of scope

- `evaluate()` wiring
- Kelly sizing
- BUY/SELL policy
- Dashboard UI

## Review fixes (re-review)

- Rebased onto `main` after M5.4B (`9c79f82`)
- Removed duplicate `probability/types.ts` stub — imports use approved `@/lib/trading/probability`
- Added boundary tests (P=0/1, zero-zero bestSide, extreme asks, golden fixture)
- Documented YES tie-break for equal non-zero EV

## Tests

`estimateExpectedValue.test.ts` — positive/negative/zero EV, determinism, invalid inputs, bounds, fees, reasoning stability.

## Builder #2 integration

After guards + features + `estimateProbability()`:

```typescript
const expectedValue = estimateExpectedValue({
  probability,
  features,
  pricing: snapshot.pricing!,
});
```

Attach to `TradeDecision.expectedValue` (field TBD) and add `model-expected-value` reasoning step.
