# PR 8.16 — Hypothesis Lifecycle Dashboard

## Summary

Adds a presentation-only HTML dashboard that tracks every hypothesis candidate through the research pipeline from generation through promotion or rejection.

This milestone does **not** modify replay, research calculations, strategy execution, or upstream artifact generation.

## CLI

```bash
npm run research:hypothesis-lifecycle
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/reports/research-hypothesis-lifecycle.html` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--evidence-html` | `data/reports/research-hypotheses.html` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--strategy-synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--harness-summary` | `data/research-results/harness/strategy-harness-summary.json` |
| `--harness-dir` | `data/research-results/harness` |

## Pipeline stages

Each hypothesis card shows progress through:

1. Generated
2. Evidence Report
3. Robustness Validation
4. Strategy Synthesized
5. Backtested
6. Promoted / Rejected

## Report fields

Per hypothesis:

- title
- status
- robustness score
- linked strategy (when synthesized)
- validation outcome
- promotion decision
- timestamps
- warnings

## Architecture

```
hypothesis-candidates.json ──┐
research-hypotheses.html ────┤
hypothesis-validation.json ──┼→ buildHypothesisLifecycleReport → research-hypothesis-lifecycle.html
strategy-synthesis-candidates.json ─┤
strategy-harness-summary.json ──────┘
```

- Module: `src/lib/data/research/hypothesisLifecycle/`
- CLI: `scripts/research/buildHypothesisLifecycleDashboard.ts`

## Test plan

- [x] Empty project dashboard
- [x] Healthy full pipeline with promoted and rejected hypotheses
- [x] Missing validation
- [x] Failed validation rejection
- [x] Synthesized but not backtested
- [x] Deterministic ordering
- [x] HTML serialization smoke test
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
