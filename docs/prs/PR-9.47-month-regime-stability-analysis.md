# PR-9.47 — Month and Regime Stability Deep Dive

## Summary

Adds a read-only diagnostic CLI that explains why hypotheses fail month persistence and regime persistence.

```bash
npm run research:month-regime-analysis
```

Outputs:

- `data/research-results/month-regime-analysis.json`
- `data/reports/month-regime-analysis.html`

## Architecture

New feature module: `src/lib/data/research/monthRegimeAnalysis/`

| File | Role |
| --- | --- |
| `monthRegimeAnalysisTypes.ts` | Report and metric types |
| `monthRegimeAnalysisMath.ts` | Wilson CI, edge classification, explanation strings |
| `analyzeMonthRegimeStability.ts` | Per-hypothesis month/regime analysis |
| `buildMonthRegimeCrossTabIndex.ts` | Diagnostic scan for month×regime heatmap |
| `buildMonthRegimeAnalysisReport.ts` | Report builder + JSON serializer |
| `loadMonthRegimeAnalysisInputs.ts` | Loads validation + candidate artifacts |
| `serializeMonthRegimeAnalysisHtml.ts` | HTML report with timeline, heatmap, tables |

CLI: `scripts/research/buildMonthRegimeAnalysis.ts`

## Metrics

Per month: observations, implied/realized probability (from accumulators when available), calibration error, edge direction, Wilson 95% CI.

Per regime: observations, calibration error, edge direction, robustness contribution estimate.

Aggregate: strongest/weakest month, reversing/persistent months, month/regime agreement scores, instability index, algorithmic explanations.

## Constraints

Read-only. Does not modify validation, hypotheses, imports, promotions, or synthesis.

## Test plan

- [x] stable hypothesis
- unstable hypothesis with reversing months
- empty inputs
- missing months with zero observations
- regime reversal
- deterministic output
- CLI argv defaults

```bash
npm run lint
npm run test
npm run build
npm run research:month-regime-analysis
```
