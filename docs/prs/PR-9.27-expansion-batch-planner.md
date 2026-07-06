# PR-9.27 — Expansion Batch Planner

## Summary

Milestone 9.27 adds a transparent expansion import batch planner that turns a `--max-markets` budget into month-level allocations using research value, temporal balance, importability, and unsupported-risk signals from existing coverage artifacts. The expansion executor can optionally consume the resulting plan.

## CLI

```bash
npm run research:plan-expansion-batch -- --max-markets=1000
npm run research:execute-expansion-import -- --batch-plan data/research-results/expansion-batch-plan.json --execute --max-markets=1000
```

### Planner flags

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/expansion-batch-plan.json` |
| `--html-output` | `data/reports/expansion-batch-plan.html` |
| `--max-markets` | `1000` |
| `--selection-strategy` | `research-value` |
| `--selection-seed` | `expansion-batch-plan` |
| `--historical-coverage-plan` | `data/research-results/historical-coverage-plan.json` |
| `--historical-expansion-config` | `data/import-configs/historical-expansion-config.json` |
| `--historical-expansion-import-summary` | `data/research-results/historical-expansion-import-summary.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--coverage-aware-validation` | `data/research-results/coverage-aware-validation.json` |
| `--discovery-result` | `discovery-result.json` |

### Selection strategies

- `research-value` (default)
- `temporal-balance`
- `supported-first`
- `evenly-spaced`
- `random`

## Outputs

Each allocation reports:

- month and market count
- rationale
- target hypothesis IDs
- expected validation benefit
- expected importability and unsupported rate
- current vs desired observations
- discovery availability when cached
- risk notes

Example:

- 500 markets → 2026-03
- 300 markets → 2026-05
- 200 markets → 2026-01

## Architecture

```
historical-coverage-plan.json
historical-expansion-config.json
historical-expansion-import-summary.json
hypothesis-validation.json
coverage-aware-validation.json
discovery-result.json (optional)
        ↓
loadExpansionBatchPlannerInputs
buildExpansionBatchMonthCandidates
scoreExpansionBatchMonthCandidates
allocateExpansionBatchBudget
        ↓
expansion-batch-plan.json + expansion-batch-plan.html
        ↓ (optional)
runHistoricalExpansionImport (--batch-plan)
```

- Module: `src/lib/data/research/expansionBatchPlanner/`
- CLI: `scripts/research/planExpansionBatch.ts`
- Executor hook: `src/lib/data/importJobs/expansionExecutor/applyExpansionBatchPlan.ts`

## Constraints

- Read-only planner: no replay/research calculation changes
- No validation scoring changes
- Deterministic allocation for identical inputs and seed

## Tests

- Budget allocation sums to `maxMarkets`
- Promising-hypothesis months prioritized under `research-value`
- Under-covered months prioritized under `temporal-balance`
- Unsupported-heavy windows deprioritized under `supported-first`
- HTML renders plan
- Deterministic output
- Executor batch-plan month selection

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
