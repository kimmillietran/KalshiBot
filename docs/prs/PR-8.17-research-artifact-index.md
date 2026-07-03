# PR-8.17 — Research Artifact Index

## Summary

Milestone 8.17 adds a centralized Research Artifact Index that discovers and summarizes all canonical research outputs in one place.

This is inspection-only — it does **not** modify the official research pipeline or any research algorithms.

## CLI

```bash
npm run research:artifact-index
```

Defaults:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/research-artifact-index.json` |
| `--html-output` | `data/reports/research-artifact-index.html` |
| `--discovery-result` | `discovery-result.json` |
| `--imports-dir` | `data/imports` |
| `--research-results-dir` | `data/research-results` |
| `--leaderboard` | `data/leaderboards/strategy-leaderboard.json` |
| `--report-html` | `data/reports/research-report.html` |

## Outputs

### JSON

`data/research-results/research-artifact-index.json`

Each artifact entry includes:

- `artifactId`, `name`, `path`
- `generatedTimestamp`
- `producingPipelineStep`
- `upstreamDependencies`
- `downstreamConsumers`
- `fileSizeBytes`, `itemCount`
- `status`: `present` | `stale` | `missing`

### HTML

`data/reports/research-artifact-index.html` — human-readable health dashboard with summary counts and dependency columns.

## Status rules

| Status | Meaning |
|--------|---------|
| `missing` | Artifact file/collection not found |
| `present` | Artifact exists and is at least as fresh as present upstream inputs |
| `stale` | Artifact exists but is older than a present upstream dependency |

Timestamps prefer embedded JSON `generatedAt` when available, otherwise filesystem modification time.

## Architecture

```
researchArtifactCatalog (static dependency graph)
        ↓
buildResearchArtifactIndex (scan existing artifacts)
        ↓
research-artifact-index.json + research-artifact-index.html
```

- Module: `src/lib/data/research/artifactIndex/`
- CLI: `scripts/research/buildResearchArtifactIndex.ts`

## Relationship to other reports

- **Data health** (`research:data-health`) — stage-level trust checks and recommendations
- **Artifact index** — per-artifact inventory with dependency graph and freshness

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Missing artifacts marked missing
- [x] Present artifacts include generated timestamps
- [x] Stale detection from upstream freshness
- [x] Downstream consumer graph
- [x] Deterministic JSON serialization
- [x] HTML report generation
- [x] CLI smoke test
