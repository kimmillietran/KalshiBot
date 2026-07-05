# PR-9.20 — Hypothesis Evolution Tracker

## Summary

Adds longitudinal tracking for hypothesis quality across research runs. Each `npm run research:full` cycle appends a snapshot to `data/research-results/hypothesis-history.json`, classifies trends (strengthening, weakening, stable, newly discovered, disappeared), and renders both a dedicated HTML report and a dashboard section.

## Problem

The research pipeline only exposed the latest hypothesis validation snapshot. As historical coverage expanded, there was no way to see whether robustness, calibration, persistence, or promotion eligibility were improving or degrading over time.

## Solution

### History artifact

`data/research-results/hypothesis-history.json` stores up to **100** research runs. Each run records per-hypothesis snapshots:

- timestamp, marketCount, observationCount, robustnessScore
- calibrationError, confidence, monthCount, uniqueTradingDays
- regimesWithData, regimesWithEdge, monthPersistenceRate, leaveOneMonthOutStdDev
- classification, passes, promotionEligible, candidateRank

Older runs roll off automatically; prior runs are never overwritten.

### Trend analysis

`analyzeHypothesisEvolution` computes:

- robustness trend, observation growth, coverage growth, calibration trend
- promotion trajectory from classification changes
- trend classification: strengthening / weakening / stable / newly-discovered / disappeared

### Reports

| Output | Path |
|--------|------|
| History JSON | `data/research-results/hypothesis-history.json` |
| Evolution HTML | `data/reports/hypothesis-evolution.html` |
| Dashboard section | `data/reports/research-dashboard.html` → **Hypothesis Evolution** |

### CLI

```bash
npm run research:hypothesis-history
```

Integrated into `npm run research:full` after hypothesis validation (and coverage validation when present), immediately before dashboard generation.

## Architecture

New feature module: `src/lib/data/research/hypothesisEvolution/`

| File | Role |
|------|------|
| `loadHypothesisEvolutionInputs.ts` | Reads candidates, validation, optional coverage + atlas |
| `buildHypothesisEvolutionRun.ts` | Builds per-run snapshots with candidate ranks |
| `hypothesisHistoryDocument.ts` | Append, parse, prune (100 runs), serialize |
| `analyzeHypothesisEvolution.ts` | Trend classification + dashboard highlights |
| `buildHypothesisEvolutionReport.ts` | Orchestrates load → append → analyze |
| `serializeHypothesisEvolutionHtml.ts` | Standalone evolution report |

Dashboard integration via `buildHypothesisEvolutionSection.ts` in `pipelineDashboard/`.

## Out of scope

No changes to hypothesis generation, validation scoring, promotion rules, replay, fixtures, or imports. This is purely longitudinal reporting.

## Tests

- First run creation and append behavior
- Multiple runs, disappeared / strengthening / weakening / stable classification
- Pruning to 100 runs
- HTML and dashboard rendering
- CLI smoke test
- Full orchestrator step order

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:hypothesis-history
npm run research:full
```

After multiple import → rebuild → research cycles, inspect `hypothesis-evolution.html` and the **Hypothesis Evolution** section on `research-dashboard.html` to see which hypotheses are improving, degrading, or approaching promotion.
