# PR-8.19B — Full Research Orchestrator Update

## Summary

M8.19B extends `research:full` with the downstream harness/registry/promotion CLIs and fixes the harness invocation to pass synthesized strategy candidates via `--input`.

## CLI

```bash
npm run research:full
```

Harness step now runs as:

```bash
npm run research:harness -- --input data/research-results/strategy-synthesis-candidates.json
```

(`--input` is an alias for `--synthesis`.)

## Step order

| # | Step | npm script | Independent |
|---|------|------------|-------------|
| 1 | Data health | `research:data-health` | yes |
| 2 | Mispricing atlas | `research:mispricing-atlas` | no |
| 3 | Hypotheses | `research:hypotheses` | no |
| 4 | Hypothesis validation | `research:hypothesis-validation` | no |
| 5 | Strategy synthesis | `research:strategy-synthesis` | no |
| 6 | Research harness | `research:harness -- --input …` | no |
| 7 | Harness results | `research:harness-results` | no |
| 8 | Candidate registry | `research:candidate-registry` | no |
| 9 | Candidate promotions | `research:candidate-promotions` | no |
| 10 | Artifact index | `research:artifact-index` | yes |
| 11 | Hypothesis lifecycle | `research:hypothesis-lifecycle` | no |
| 12 | Research dashboard | `research:dashboard` | yes |

Independent reporting steps (`data-health`, `artifact-index`, `research-dashboard`) still run when the core chain fails.

When no synthesized strategies match harness filters, the harness CLI writes an empty `strategy-harness-summary.json` and exits successfully (no-op), allowing downstream integration steps to proceed.

## Output

`data/research-results/full-research-summary.json` — now includes 12 step records.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] 12-step order and upstream chaining
- [x] Harness `--input` args passed through orchestrator
- [x] Harness no-op when filters match zero strategies
- [x] CLI writes updated summary JSON
- [x] `npm run lint`, `npm run test`, `npm run build`
