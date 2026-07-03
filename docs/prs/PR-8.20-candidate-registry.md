# PR 8.20 — Research Candidate Registry

## Summary

Adds a canonical, read-only registry of every strategy candidate produced by the research pipeline. The registry merges hypothesis, validation, synthesis, and harness artifacts into stable candidate records with promotion history.

This milestone does **not** modify replay, strategies, sweep logic, or hypothesis generation.

## CLI

```bash
npm run research:candidate-registry
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/research-candidate-registry.json` |
| `--html-output` | `data/reports/research-candidate-registry.html` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--strategy-synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--harness-results` | `data/research-results/harness-results.json` |
| `--harness-summary` | `data/research-results/harness/strategy-harness-summary.json` |

## Candidate fields

Each registry entry includes:

- `candidateId` (stable across runs)
- `hypothesisId`
- `strategyId`
- strategy family
- creation timestamp
- validation score
- harness metrics (when available)
- current status: `hypothesis`, `validated`, `synthesized`, `backtested`, `candidate`, `rejected`
- rejection reason(s)
- promotion history

## Registry behavior

- Append/update only: existing entries are preserved and updated in place
- Candidate IDs remain stable (`candidateId` = hypothesis id)
- Missing upstream artifacts degrade gracefully
- Promotion history records status transitions across runs

## Architecture

```
hypothesis-candidates.json ────────┐
hypothesis-validation.json ────────┼→ buildResearchCandidateRegistryReport
strategy-synthesis-candidates.json ┤      ↓
harness-results.json ──────────────┤  research-candidate-registry.json
existing registry (optional) ──────┘  research-candidate-registry.html
```

- Module: `src/lib/data/research/candidateRegistry/`
- CLI: `scripts/research/buildResearchCandidateRegistry.ts`

## Test plan

- [x] Empty registry with missing artifacts
- [x] Full pipeline candidate registration
- [x] Stable IDs and deterministic ordering
- [x] Append/update promotion history across runs
- [x] JSON + HTML serialization
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
