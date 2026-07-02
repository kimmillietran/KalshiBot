# PR-8.10 — Research Data Health

## Summary

Milestone 8.10 adds a deterministic research data health report that summarizes whether the current dataset and artifact tree is healthy enough to trust downstream research. This is **analysis/reporting only** — no mutation of generated data and no changes to replay, strategy, import, or research algorithms.

## CLI

```bash
npm run research:data-health
```

Optional flags:

| Flag | Default |
|------|---------|
| `--discovery-result` | `discovery-result.json` |
| `--imports-dir` | `data/imports` |
| `--import-configs-dir` | `data/import-configs` |
| `--fixtures-dir` | `data/fixtures` |
| `--registry-dir` | `data/research-datasets` |
| `--research-results-dir` | `data/research-results` |
| `--leaderboard` | `data/leaderboards/strategy-leaderboard.json` |
| `--report-html` | `data/reports/research-report.html` |
| `--output` | `data/research-results/data-health.json` |

## Report sections

1. **pipelineCoverage** — discovery, imports, fixtures, registry, research outputs, aggregates, calibration, leaderboard, report HTML
2. **settlementHealth** — settlement present/missing counts, coverage %, examples, optional settlement-audit reason counts
3. **researchCoverage** — calibration/atlas/lead-lag/significance coverage plus presence flags for power analysis, overfitting diagnostics, regime tags, hypotheses
4. **artifactFreshness** — last-modified timestamps and stale dependency warnings (e.g. hypotheses older than mispricing atlas, report older than leaderboard)
5. **stageStatuses** — per-stage `green | yellow | red` status with reason and required action
6. **recommendations** — prioritized next actions derived from non-green stages

## Architecture

```
discovery / imports / fixtures / registry / research-results trees
        ↓
scanDataHealthInputs (read-only filesystem scan)
        ↓
computeStageStatuses + recommendations
        ↓
data-health.json
```

- Module: `src/lib/data/research/dataHealth/`
- CLI: `scripts/research/buildDataHealthReport.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
