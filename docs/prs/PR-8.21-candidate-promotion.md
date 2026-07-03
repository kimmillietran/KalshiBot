# PR-8.21 — Automatic Candidate Promotion Engine

## Summary

Milestone 8.21 adds an advisory candidate promotion engine that classifies synthesized strategies using existing research evidence. This does **not** modify strategy execution, trading behavior, leaderboard output, or sweep results.

## CLI

```bash
npm run research:candidate-promotions
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/candidate-promotions.json` |
| `--html-output` | `data/reports/research-candidate-promotions.html` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--strategy-synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--harness-results` | `data/research-results/harness-results.json` |
| `--harness-summary` | `data/research-results/harness/strategy-harness-summary.json` (fallback) |
| `--statistical-significance` | `data/research-results/statistical-significance.json` |

## Inputs

- `hypothesis-validation.json` — robustness score, pass/fail, sample concentration
- `strategy-synthesis-candidates.json` — synthesized strategy specs and synthesis promotion status
- `harness-results.json` — aggregated harness metrics per strategy (falls back to compiling from harness summary + research outputs)

## Outputs

### JSON

`data/research-results/candidate-promotions.json`

Each promotion entry includes:

- `decision`: `rejected` | `exploratory` | `needs-more-data` | `candidate` | `production-watchlist`
- `explanation`
- `supportingMetrics`
- `blockingIssues`
- `warnings`
- `recommendedNextAction`

### HTML

`data/reports/research-candidate-promotions.html` — human-readable advisory dashboard using the shared research report theme.

## Decision factors

- Robustness score thresholds (reject / candidate / watchlist)
- Hypothesis validation pass/fail
- Harness trade count and successful run count
- Minimum observation count
- Sample concentration flags
- Optional statistical significance (when available)
- Synthesis-level warnings and blocking issues

## Recommended next actions

- `gather-more-history`
- `tune-parameters`
- `reject-permanently`
- `run-expanded-backtest`
- `promote-to-watchlist`
- `monitor-in-exploratory`

## Architecture

```
hypothesis-validation.json ─────┐
strategy-synthesis-candidates.json ─┼→ loadCandidatePromotionInputs
harness-results.json ─────────────┤
statistical-significance.json ────┘
        ↓
classifyCandidatePromotion
        ↓
candidate-promotions.json + research-candidate-promotions.html
```

- Module: `src/lib/data/research/candidatePromotion/`
- CLI: `scripts/research/buildCandidatePromotions.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Rejection on failed validation
- [x] Needs-more-data on insufficient harness/observations
- [x] Candidate and watchlist promotion paths
- [x] Harness-results loader and harness-summary fallback aggregation
- [x] HTML + JSON serialization
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
