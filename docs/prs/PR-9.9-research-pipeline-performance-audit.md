# PR-9.9 — Research Pipeline Performance Audit

## Summary

Milestone 9.9 adds a **diagnostic-only** performance audit for the full research orchestrator (~16 sequential steps). The audit identifies where time is spent, duplicated I/O, parallelization opportunities, cache/incremental-rebuild candidates, network bottlenecks, memory pressure from large JSON deserialization, and the critical dependency path.

**No pipeline behavior is changed** — no orchestration updates, parallelization, caching, or research/import/replay modifications.

## CLI

```bash
npm run research:performance-audit
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/research-performance-audit.json` |
| `--html-output` | `data/reports/research-performance-audit.html` |
| `--full-research-summary` | `data/research-results/full-research-summary.json` |
| `--artifact-index` | `data/research-results/research-artifact-index.json` |
| `--historical-coverage-plan` | `data/research-results/historical-coverage-plan.json` |
| `--experiment-index` | `data/research-results/experiment-index.json` |

## Outputs

### Per-step report

- duration and % of total runtime
- files read / files written (from static step profiles)
- upstream dependencies / downstream dependents
- primary artifact size (from artifact index when available)
- CPU-bound, I/O-bound, and network time estimates

### Analysis sections

1. **Parallel execution** — independent steps that share the same schedule wave (e.g. `data-health` + `coverage-plan`, tail reporting steps)
2. **Duplicate artifact loading** — repeated JSON reads across steps
3. **Duplicate filesystem scans** — repeated directory traversals (e.g. `data-health` + `artifact-index`)
4. **Cache opportunities** — steps skippable when inputs are unchanged
5. **Incremental rebuild** — full-directory recomputation steps
6. **Network bottlenecks** — import-execution / networked-rebuild steps
7. **Memory observations** — large JSON deserialization hotspots
8. **Critical path** — longest dependency chain and theoretical minimum runtime

### Overall summary

- total runtime
- estimated parallel runtime
- estimated cache savings
- estimated incremental rebuild savings
- top 10 optimization opportunities

## Architecture

```
full-research-summary.json
research-artifact-index.json (optional)
historical-coverage-plan.json (optional)
experiment-index.json (optional)
        ↓
loadPerformanceAuditInputs + buildPipelineStepResourceProfiles
        ↓
analyzePerformanceOpportunities (parallel, duplicates, cache, critical path)
        ↓
research-performance-audit.json + research-performance-audit.html
```

- Module: `src/lib/data/research/performanceAudit/`
- CLI: `scripts/research/buildResearchPerformanceAudit.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
