# PR 9.3 — Coverage-Aware Validation Report

## Summary

Adds an advisory report that separates weak-edge rejections from hypotheses that cannot yet be judged because historical coverage is insufficient. Does **not** modify hypothesis-validation scores, candidate promotion logic, or strategy synthesis.

## CLI

```bash
npm run research:coverage-validation
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/coverage-aware-validation.json` |
| `--html-output` | `data/reports/coverage-aware-validation.html` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--cross-validation` | `data/research-results/cross-validation.json` |
| `--historical-coverage-plan` | `data/research-results/historical-coverage-plan.json` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |

## Classifications

Each hypothesis receives one of:

- `rejected` — adequate coverage, weak edge
- `inconclusive-insufficient-coverage` — too few months/days/observations
- `inconclusive-regime-sparse` — calendar coverage OK but regime diversity insufficient
- `promising-needs-more-history` — partial edge signals; import more history before rejecting
- `robust-enough-to-test` — passes validation with sufficient coverage

## Entry fields

- Observation count, unique trading days, month count
- Regime coverage
- Robustness score (read from upstream validation, unchanged)
- Largest-day concentration
- Missing coverage explanation
- Recommended additional import windows

## Architecture

```
hypothesis-validation.json ────────┐
cross-validation.json ─────────────┼→ buildCoverageAwareValidationReport
historical-coverage-plan.json ─────┤      ↓
hypothesis-candidates.json ──────┘  coverage-aware-validation.json
                                      coverage-aware-validation.html
```

- Module: `src/lib/data/research/coverageAwareValidation/`
- CLI: `scripts/research/buildCoverageAwareValidation.ts`

## Test plan

- [x] Insufficient coverage vs weak-edge rejection
- [x] Regime-sparse classification
- [x] Robust-enough-to-test path
- [x] Import window recommendations from coverage plan
- [x] Missing artifact degradation
- [x] JSON + HTML serialization
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
