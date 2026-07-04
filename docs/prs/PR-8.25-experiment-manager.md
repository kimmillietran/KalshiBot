# PR 8.25 — Research Experiment Manager

## Summary

Adds `npm run research:experiments` to snapshot each research workflow invocation as an immutable experiment record, maintain a rolling index, and render an HTML comparison report against the previous run.

## CLI

```bash
npm run research:experiments
```

| Flag | Default |
| --- | --- |
| `--experiments-dir` | `data/research-results/experiments` |
| `--index-output` | `data/research-results/experiment-index.json` |
| `--html-output` | `data/reports/research-experiments.html` |
| `--pipeline-summary` | `data/research-results/pipeline-summary.json` |
| `--full-research-summary` | `data/research-results/full-research-summary.json` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--strategy-synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--harness-results` | `data/research-results/harness-results.json` |
| `--candidate-promotions` | `data/research-results/candidate-promotions.json` |
| `--artifact-index` | `data/research-results/research-artifact-index.json` |

## Outputs

Each invocation writes:

```
data/research-results/experiments/<experimentId>/experiment.json
data/research-results/experiment-index.json
data/reports/research-experiments.html
```

### Experiment record fields

- `experimentId`, `timestamp`, `gitCommit`
- `pipelineConfiguration` (pipeline + full-research configs when present)
- `hypothesisCount`, `validationSummary`, `synthesizedStrategyCount`
- `harnessSummary`, `candidatePromotionSummary`, `promotionSnapshot`
- `topCandidate`, `warnings`, `runtime`, `artifactSnapshot`

## Comparison features

The index stores `latestComparison` between the newest experiment and its immediate predecessor:

- Hypothesis count delta
- Average robustness delta
- Promotion decision changes
- Candidate additions / removals
- Pipeline and full-research duration deltas
- Artifact status changes

Missing historical experiment files are flagged in the index (`present: false`) and surfaced in the HTML report without failing registration.

## Immutability

Experiment records are write-once. Re-registering with the same generated id path raises `IMMUTABLE_RECORD_CONFLICT`.

## Scope

Read-only tracking layer. Does **not** modify replay, strategy execution, trading, or hypothesis calculations.

## Suggested workflow

```bash
npm run research:pipeline
npm run research:full
npm run research:experiments
```

Repeat `research:experiments` after subsequent pipeline runs to accumulate history.
