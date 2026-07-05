# PR-9.21 — Temporal Balance Coverage Planner

## Summary

Extends the historical coverage planner with temporal-balance diagnostics so expansion recommendations target months that improve hypothesis validation, not just raw market count.

## Problem

After historical expansion, the strongest hypothesis can have hundreds of observations but uneven month distribution (e.g. strong Jan/Feb, 1 obs in Mar, 23 in Apr, 2 in May). Blind expansion by market count misses the real bottleneck: **temporal balance** for validation stability.

## Solution

### Temporal-balance diagnostics

Added to `historical-coverage-plan.json` and HTML:

| Diagnostic | Source |
|------------|--------|
| Per-month market count | Coverage snapshot |
| Per-month research observation count | Sum of hypothesis `monthPeriods` |
| Per-month qualifying hypothesis observation count | Promising hypotheses only |
| Per-hypothesis month distribution | `timeStability.monthPeriods` |
| Weakest / thin months | Below target minimum (default 3 obs/month) |
| Expected validation benefit | Month persistence, LOMO stability, sample concentration |

### Recommendation type: `temporal-balance-import`

New recommendation type prioritizes import windows that fill thin months for **promising hypotheses** (robustness ≥ 55 or high observation count with weak month persistence). Temporal-balance recommendations merge with existing `coverage-gap-import` windows and rank higher when they target validation-critical months.

### Outputs updated

- `data/research-results/historical-coverage-plan.json` — adds `temporalBalance` section and `recommendationType` on each recommendation
- `data/reports/historical-coverage-plan.html` — new **Temporal balance diagnostics** and **Hypothesis temporal balance** sections

## Architecture

New module: `buildTemporalBalanceDiagnostics.ts`

Extended: `buildCoverageImportRecommendations.ts`, `buildHistoricalCoveragePlan.ts`, `serializeHistoricalCoveragePlanHtml.ts`

## Out of scope

- No import execution
- No changes to validation scoring or promotion rules

## Tests

- Per-month diagnostics and thin-month detection
- Temporal-balance-import recommendation prioritization
- End-to-end JSON/HTML serialization

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:coverage-plan
```

After running coverage planning with hypothesis validation present, inspect `historical-coverage-plan.html` for thin-month diagnostics and `temporal-balance-import` recommendations targeting weak months for promising hypotheses.
