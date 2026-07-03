# PR-8.19 — End-to-End Research Orchestrator

## Summary

Milestone 8.19 adds a single command that runs the post-import research workflow in dependency order by invoking existing research CLIs. This is orchestration only — no replay, import, or backtesting behavior changes.

## CLI

```bash
npm run research:full
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/full-research-summary.json` |
| `--continue-on-error` | fail-fast (omit to halt core chain on first failure) |

## Step order

| # | Step | npm script | Independent |
|---|------|------------|-------------|
| 1 | Data health | `research:data-health` | yes |
| 2 | Mispricing atlas | `research:mispricing-atlas` | no |
| 3 | Hypotheses | `research:hypotheses` | no |
| 4 | Hypothesis validation | `research:hypothesis-validation` | no |
| 5 | Strategy synthesis | `research:strategy-synthesis` | no |
| 6 | Research harness | `research:harness` | no |
| 7 | Artifact index | `research:artifact-index` | yes |
| 8 | Hypothesis lifecycle | `research:hypothesis-lifecycle` | no |
| 9 | Research dashboard | `research:dashboard` | yes |

Independent reporting steps (`data-health`, `artifact-index`, `research-dashboard`) still run when the core chain fails.

Steps whose npm scripts are not yet registered in `package.json` fail with a clear `npm script not registered` message.

## Output

`data/research-results/full-research-summary.json`

Each step records:

- `status` — `succeeded`, `failed`, or `skipped`
- `durationMs`
- `outputsGenerated` — expected artifact paths that exist after the step
- `warnings` — lines containing warning markers from step output
- `errorMessage` — skip/failure reason when applicable

## Architecture

```
buildFullResearchSteps (static step graph)
        ↓
runFullResearchOrchestrator (spawn existing npm scripts)
        ↓
full-research-summary.json
```

- Module: `src/lib/data/research/fullOrchestrator/`
- CLI: `scripts/research/runFullResearchOrchestrator.ts`
- Reuses pipeline spawn helpers (`createNpmScriptRunner`, progress logging pattern)

## Relationship to `research:pipeline`

| Command | Scope |
|---------|-------|
| `research:pipeline` | Discovery → import → sweep → aggregate → early hypothesis generation |
| `research:full` | Post-pipeline research analysis, synthesis, harness, and reporting |

Run `research:pipeline` first to populate research outputs, then `research:full` for the analysis workflow.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Step order and independent-step classification
- [x] Fail-fast halts core chain, continues reporting steps
- [x] Upstream skip reasons
- [x] Missing npm script handling
- [x] Outputs generated + warnings capture
- [x] CLI writes summary JSON
- [x] `npm run lint`, `npm run test`, `npm run build`
