# Feature semantics (M11.2)

This document records **intentionally distinct** feature implementations. Only
formulas that are literally identical were consolidated into shared helpers.

## Momentum

| API | Layer | Semantics |
|-----|-------|-----------|
| `recentMomentum(candles, window?)` | Trading features (`src/lib/features/momentum.ts`) | Short-window price change for live feature vectors. Default window = 5 bars. Returns `{ change, changePercent, bars }`. Uses first close in slice; returns zeros when insufficient history. |
| `computeBtcMomentumPct(candles, lookbackBars)` | Trading strategy helpers (`strategyDecisionHelpers.ts`) | Fixed lookback percent change for strategy decisions and **research**. Requires `lookbackBars >= 2` and full window; returns `null` when insufficient data or zero first close. |
| `computeResearchObservationMomentumPercent` | Research (`researchDimensions/momentum`) | Thin wrapper around `computeBtcMomentumPct` with 15-bar default. **Canonical research momentum.** |

Do not merge `recentMomentum` with `computeBtcMomentumPct`: different defaults,
null handling, and return shapes.

## Volatility

| API | Layer | Semantics |
|-----|-------|-----------|
| `rollingVolatility(candles, window?)` | Trading features (`src/lib/features/volatility.ts`) | Rolling close-price std dev + coefficient of variation for feature vectors. Default window = 10 bars. |
| `estimateRealizedVolatility(candles, lookbackBars)` | Fair-value diffusion model | Log-return realized vol with annualization for research/regime/mispricing pipelines. **Canonical research volatility.** |

Do not merge: trading uses price-level std dev; research uses log-return
annualized realized vol.

## Consolidated identical helpers

| Helper | Location | Replaces |
|--------|----------|----------|
| `midProbabilityFromCents` | `src/lib/features/contractPricing.ts` | Inline `midProbability` in research parsers |
| `spreadSidePercent` / `maxSpreadSidePercent` | `src/lib/features/contractPricing.ts` | Duplicates in `marketFeatures`, `pricing` guards, `parseRegimeSteps` |
| `TIME_REMAINING_BUCKET_DEFINITIONS` | `src/lib/data/research/dimensions/bucketDefinitions.ts` | Duplicate copy in decision trace attribution |
| `mapEvaluationCandleSnapshots` | `src/lib/data/research/parsing/` | Duplicate `mapCandles` in mispricing/vol-premium parsers |
| `averageFinite`, `quantile`, `percentile` | `src/lib/utils/stats.ts` | Repeated local mean/percentile helpers |
