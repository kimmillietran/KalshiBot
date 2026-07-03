# PR 8.18 — Research Pipeline Dashboard

## Summary

Adds a presentation-only HTML landing page that summarizes the entire research pipeline from discovery through hypothesis promotion and strategy execution.

This milestone does **not** modify replay, research calculations, or strategy execution.

## CLI

```bash
npm run research:dashboard
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/reports/research-dashboard.html` |
| `--pipeline-summary` | `data/research-results/pipeline-summary.json` |
| `--artifact-index` | `data/research-results/research-artifact-index.json` |
| `--hypothesis-candidates` | `data/research-results/hypothesis-candidates.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--strategy-synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--harness-results` | `data/research-results/harness-results.json` |
| `--harness-summary` | `data/research-results/harness/strategy-harness-summary.json` |
| `--leaderboard` | `data/leaderboards/strategy-leaderboard.json` |
| `--data-health` | `data/research-results/data-health.json` |

## Dashboard sections

1. **Pipeline status** — status, completed/failed steps, generated timestamp, duration
2. **Artifact health** — present / stale / missing counts with link to artifact index
3. **Hypothesis summary** — hypothesis, validated, promoted, rejected counts
4. **Strategy summary** — synthesized, executed, top leaderboard candidate
5. **Research health** — calibration coverage, atlas observations, warning count, data health summary

## Architecture

```
pipeline-summary.json ────────────┐
research-artifact-index.json ─────┤
hypothesis-candidates.json ───────┤
hypothesis-validation.json ───────┼→ buildPipelineDashboardReport → research-dashboard.html
strategy-synthesis-candidates.json ┤
harness-results.json ─────────────┤
strategy-leaderboard.json ────────┤
data-health.json ─────────────────┘
```

- Module: `src/lib/data/research/pipelineDashboard/`
- CLI: `scripts/research/buildResearchPipelineDashboard.ts`

When `research-artifact-index.json` is missing, artifact health falls back to `data-health.json` stage statuses.

## Test plan

- [x] Empty dashboard with missing artifacts
- [x] Healthy full pipeline summary
- [x] Artifact health fallback without artifact index
- [x] Harness summary fallback path
- [x] HTML serialization smoke test
- [x] CLI smoke test
- [x] `npm run lint`, `npm run test`, `npm run build`
