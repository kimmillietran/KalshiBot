# PR-9.11 — Coverage Depth Thresholds

## Summary

Milestone 9.11 improves the historical coverage planner so months are classified by **depth**, not just presence. A month with 5 markets is no longer treated as fully covered when research needs ~100 markets/month.

**Planning-only** — no import execution, replay, hypothesis, validation, synthesis, or importer behavior changes.

## Coverage depth model

| Status | Condition |
|--------|-----------|
| `MISSING` | 0 markets in month |
| `UNDER_COVERED` | markets &lt; `minMarketsPerMonth` **or** trading days &lt; `minTradingDaysPerMonth` |
| `COVERED` | both thresholds satisfied |

### Default thresholds

- `minMarketsPerMonth = 100`
- `minTradingDaysPerMonth = 10`

### CLI overrides

```bash
npm run research:coverage-plan -- --min-markets-per-month 100 --min-trading-days-per-month 10
```

## Planner outputs

`historical-coverage-plan.json` now includes per month:

- `marketCount`
- `tradingDayCount`
- `coverageStatus` (`MISSING` | `UNDER_COVERED` | `COVERED`)
- `thresholds` (`minMarketsPerMonth`, `minTradingDaysPerMonth`, `marketsMet`, `tradingDaysMet`)

Snapshot also adds:

- `underCoveredMonths`
- `coveredMonths`
- `depthThresholds`

Recommendations now target **both** missing and under-covered months, with priority scaled by under-coverage severity.

## Import config generator

`npm run research:generate-expansion-import-config` consumes the updated recommendations and schedules jobs for under-covered windows (same path as missing-month recommendations). Import execution is unchanged.

## HTML report

`historical-coverage-plan.html` shows color-coded badges:

- Missing — bearish/red tone
- Under-covered — warning/yellow tone
- Covered — bullish/green tone

Month table displays `actual / threshold` for markets and trading days.

## Architecture

```
scanCoverageMarketRecords
        ↓
computeCoverageSnapshot (depth thresholds)
        ↓
buildCoverageImportRecommendations (missing + under-covered)
        ↓
historical-coverage-plan.json + HTML
        ↓
research:generate-expansion-import-config (scheduled jobs)
```

- Module: `src/lib/data/research/coveragePlanner/`
- Depth helpers: `computeMonthCoverageDepth.ts`
- Expansion config adapter: `src/lib/data/importJobs/expansionConfig/loadHistoricalCoveragePlan.ts`

## Tests

- Missing month classification
- Under-covered month classification
- Fully covered month classification
- Configurable thresholds
- Recommendation generation for under-covered months
- Expansion import config job generation for under-covered recommendations

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
