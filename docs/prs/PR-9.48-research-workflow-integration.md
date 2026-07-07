# PR-9.48 — Research Workflow Integration

## CLI

```bash
npm run research:workflow
```

Optional flags mirror default diagnostic artifact paths (`--hypothesis-failure-analysis`, `--derived-settlement-sensitivity`, etc.) plus `--output` and `--html-output`.

## Inputs (all optional)

| Artifact | Default path |
|----------|--------------|
| Hypothesis failure analysis | `data/research-results/hypothesis-failure-analysis.json` |
| Derived settlement sensitivity | `data/research-results/derived-settlement-sensitivity.json` |
| Hypothesis refinements | `data/research-results/hypothesis-refinements.json` |
| Refinement hypothesis candidates | `data/research-results/refinement-hypothesis-candidates.json` |
| Strategy synthesis debug | `data/research-results/strategy-synthesis-debug.json` |
| Month regime analysis | `data/research-results/month-regime-analysis.json` |
| Harness summary | `data/research-results/harness/strategy-harness-summary.json` |

Missing artifacts do not fail execution.

## Outputs

- `data/research-results/research-workflow.json`
- `data/reports/research-workflow.html`

## Report

Per hypothesis pipeline:

Hypothesis → Validation → Failure reason → Derived sensitivity → Refinements available → Registered children → Harness status → Recommended next action

Overall research queue priority:

1. Validate refinement candidates
2. Run research-only harness
3. Investigate month instability
4. Gather additional history
5. Deprioritize

HTML dashboard includes overall funnel, active/blocked hypotheses, next recommended milestone, and highest-value research tasks.

## Constraints

Read-only integration — does not modify promotion, validation, imports, strategy synthesis, or replay.
