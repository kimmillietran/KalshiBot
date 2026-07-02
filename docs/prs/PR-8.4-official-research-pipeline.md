# PR-8.4 — Official Research Pipeline

## Summary

Milestone 8.4 promotes the local PowerShell smoke script into an official, cross-platform project command that orchestrates the full historical research workflow end-to-end.

This is an orchestration CLI only — it does not change replay, strategies, or individual research module behavior.

## CLI

```bash
npm run research:pipeline -- --series KXBTC15M --limit 500
```

Defaults:

| Flag | Default |
|------|---------|
| `--series` | `KXBTC15M` |
| `--limit` | `500` |
| `--concurrency` | `1` |
| `--rank-by` | `totalPnL` |
| `--output` | `data/research-results/pipeline-summary.json` |
| `--discovery-output` | `discovery-result.json` |
| `--continue-on-error` | off (fail-fast) |

## Pipeline steps (ordered)

1. `discover:markets`
2. `discovery:import-configs`
3. `import:batch` (with retry/throttle flags)
4. `imports:analyze-failures`
5. `fixtures:batch`
6. `research:registry`
7. `research:sweep`
8. `research:aggregate`
9. `leaderboard:strategies`
10. `research:calibration`
11. `research:report`
12. `research:lead-lag`
13. `research:significance`
14. `research:power-analysis`
15. `research:overfitting-diagnostics`
16. `research:tag-regimes`
17. `research:hypotheses`

## Output

`data/research-results/pipeline-summary.json` records:

- pipeline config
- overall status (`succeeded` / `failed` / `partial`)
- per-step command, exit code, duration, error message, and captured stdout/stderr tails on failure

Progress logs are written to stdout during execution.

Child npm scripts are spawned via `cmd.exe /d /s /c npm run ...` on Windows (`.cmd` shims cannot be spawned with `shell: false`) and via `npm` directly on Unix.

## Architecture

```
runResearchPipeline.ts (CLI)
        ↓
buildResearchPipelineSteps
        ↓
runResearchPipeline (injected npm runner)
        ↓
pipeline-summary.json
```

- Module: `src/lib/data/research/pipeline/`
- CLI: `scripts/research/runResearchPipeline.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Command ordering
- [x] Fail-fast vs `--continue-on-error`
- [x] Argv parsing
- [x] Deterministic summary serialization
- [x] CLI smoke test with injected runner
