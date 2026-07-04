# PR 9.4 — Full Research Orchestrator Coverage Phase

## Summary

Extends `npm run research:full` with a coverage planning phase before mispricing atlas / hypothesis generation, wires cross-validation into the core chain, and optionally runs coverage-aware validation after cross-validation when that CLI is available.

## Updated step order

```
data-health (independent)
coverage-plan
generate-expansion-import-config
mispricing-atlas
hypotheses
hypothesis-validation
strategy-synthesis
cross-validation
coverage-validation (optional)
research-harness
harness-results
candidate-registry
candidate-promotions
artifact-index (independent)
hypothesis-lifecycle
research-dashboard (independent)
```

## Coverage CLIs (reused when merged)

| Step | npm script | Expected outputs |
| --- | --- | --- |
| Coverage plan | `research:coverage-plan` | `historical-coverage-plan.json`, `historical-coverage-plan.html` |
| Expansion config | `research:generate-expansion-import-config` | `historical-expansion-config.json`, `historical-expansion-config.html` |
| Coverage validation | `research:coverage-validation` | `coverage-validation.json`, `coverage-validation.html` |

Missing required coverage scripts fail with `npm script not registered: …`. Missing optional `research:coverage-validation` skips with a clear message instead of failing the chain.

## Dashboard

`research:dashboard` now reads:

- `full-research-summary.json` (preferred for orchestrator step status)
- coverage plan / expansion config / coverage validation artifacts

and renders a **Coverage phase** panel with orchestrator status and artifact metrics.

## Scope

Orchestration and reporting only. Does **not** execute imports (`import:batch`, `import:historical`) or duplicate coverage planning logic.
