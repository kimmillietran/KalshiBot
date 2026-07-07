# PR-9.46: Refinement Hypothesis Registration

## Summary

Turns M9.42 refinement suggestions into **registered hypothesis candidates** compatible with the existing validation pipeline, without promoting refinements or modifying parent hypotheses.

## Pipeline

```
Hypothesis → Failure analysis → Refinement generator → Registered child hypotheses → Validation → Cross validation → Strategy synthesis
```

## Command

```bash
npm run research:register-refinements
```

### Inputs

| Artifact | Default path |
|----------|--------------|
| Refinements (M9.42) | `data/research-results/hypothesis-refinements.json` |
| Parent candidates | `data/research-results/hypothesis-candidates.json` |
| Failure analysis | `data/research-results/hypothesis-failure-analysis.json` |

### Outputs

| Artifact | Path |
|----------|------|
| JSON | `data/research-results/refinement-hypothesis-candidates.json` |
| HTML | `data/reports/refinement-hypothesis-candidates.html` |

## Registered candidate fields

Each child hypothesis includes:

- Standard `HypothesisCandidate` fields (validation-compatible)
- `refinementRegistration.parentHypothesisId`
- `refinementRegistration.refinementType`
- `refinementRegistration.generatedFromFailureAnalysis`
- `refinementRegistration.suggestedFilters`
- `refinementRegistration.generationReason`
- `refinementRegistration.refinementRank`
- `refinementRegistration.status: "candidate-refinement"`

Deterministic `candidateId` equals M9.42 `refinementId`.

## Validation integration

```bash
npm run research:hypothesis-validation -- --input refinement-hypothesis-candidates.json
```

Validation resolves the parent atlas bucket, applies refinement filters to observations, then runs the **unchanged** robustness scoring path.

## Safety

- Read-only registration step
- Does not promote refinements
- Does not replace parent hypotheses
- Does not change replay, imports, or strategy synthesis scoring

## Architecture

| Layer | Path |
|-------|------|
| Registration module | `src/lib/data/research/refinementHypothesisRegistration/` |
| Filter application | `src/lib/data/research/hypothesisRobustness/applyRefinementSuggestedFilters.ts` |
| CLI | `scripts/research/registerRefinementHypotheses.ts` |

## Recommended next milestone

Run validation + cross-validation on registered refinements, compare child vs parent robustness scores, and feed passing refinements into strategy synthesis as a separate gated milestone.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
