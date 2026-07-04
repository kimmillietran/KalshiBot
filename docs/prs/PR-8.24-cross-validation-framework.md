# PR 8.24 — Cross-Validation Framework

## Summary

Adds a read-only cross-validation diagnostics layer for research hypotheses and synthesized strategies. The framework evaluates calibration stability using five methods without modifying existing hypothesis validation scores or promotion logic.

## CLI

```bash
npm run research:cross-validation
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/cross-validation.json` |
| `--html-output` | `data/reports/research-cross-validation.html` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--strategy-synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--research-results-dir` | `data/research-results` |
| `--regime-tags` | `data/research-results/regime-tags.json` |
| `--rolling-window-months` | `2` |
| `--bootstrap-iterations` | `100` |
| `--bootstrap-seed` | `42` |

## Validation methods

Each target is evaluated with:

- Rolling window validation
- Expanding window validation
- Leave-one-month-out (reuses existing robustness implementation)
- Leave-one-regime-out
- Random bootstrap sampling (configurable iterations)

Each method reports:

- Calibration error
- Variance
- Observation count
- Pass/fail
- Stability metrics (std dev, persistence rate, coefficient of variation)

## Integration

- Loads optional `hypothesis-validation.json` for reference metadata only
- Does **not** change hypothesis validation scores or promotion logic
- Missing upstream artifacts degrade gracefully

## Architecture

```
hypothesis-candidates.json ────────┐
hypothesis-validation.json ────────┼→ buildCrossValidationReport
strategy-synthesis-candidates.json ┤      ↓
research outputs + regime tags ────┘  cross-validation.json
                                      research-cross-validation.html
```

- Module: `src/lib/data/research/crossValidation/`
- CLI: `scripts/research/buildCrossValidation.ts`

## Test plan

- [x] Rolling, expanding, LOMO, LORO, and bootstrap metrics
- [x] Hypothesis + synthesized strategy targets
- [x] Hypothesis validation reference integration
- [x] Empty/missing artifact degradation
- [x] JSON + HTML serialization
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
