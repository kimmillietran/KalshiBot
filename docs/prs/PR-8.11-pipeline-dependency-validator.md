# PR-8.11 — Pipeline Dependency Validator

## Summary

Milestone 8.11 adds reusable dependency validation so the official research pipeline fails clearly when prerequisite artifacts are missing or stale, instead of producing empty or misleading downstream outputs.

This is validation/orchestration only — no changes to replay, strategies, imports, fixtures, or research algorithms.

## CLI

```bash
npm run research:pipeline -- --series KXBTC15M --limit 500
npm run research:pipeline -- --series KXBTC15M --limit 500 --strict-dependencies
```

New flag:

| Flag | Default | Behavior |
|------|---------|----------|
| `--strict-dependencies` | off | Fail on stale output artifacts, not just missing required inputs |

## Default vs strict behavior

| Condition | Default | `--strict-dependencies` |
|-----------|---------|-------------------------|
| Missing required artifact | Fail step | Fail step |
| Missing optional artifact | Warn, continue | Warn, continue |
| Stale output vs fresher input | Warn, continue | Fail step |

## Pipeline summary schema

Each step in `data/research-results/pipeline-summary.json` now includes:

- `dependencyStatus`: `passed` | `warning` | `failed`
- `missingDependencies`: string[]
- `staleDependencies`: string[]
- `warnings`: string[]

Example stale case: `hypothesis-candidates.json` older than `mispricing-atlas.json`.

## Key dependency rules

| Step | Required | Optional |
|------|----------|----------|
| `research:hypotheses` | mispricing atlas, lead-lag, significance | regime tags, leaderboard |
| `research:mispricing-atlas` | research replay outputs | — |
| `research:calibration` | research replay outputs | — |
| `research:report` | leaderboard, aggregate summaries | calibration reports |

## Architecture

```
buildResearchStepDependencySpecs
        ↓
validateResearchStepDependencies (per step, before npm run)
        ↓
runResearchPipeline
        ↓
pipeline-summary.json
```

- Module: `src/lib/data/research/dependencyValidation/`
- Integration: `src/lib/data/research/pipeline/runResearchPipeline.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Missing required dependency fails
- [x] Optional dependency warns
- [x] Stale output warns
- [x] Strict mode fails on stale
- [x] Dependency results included in summary
- [x] Existing pipeline tests updated
- [x] Deterministic serialization
