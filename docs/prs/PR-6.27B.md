# PR-6.27B — Experiment Registry

## Summary

Milestone 6.27B adds a deterministic experiment registry so research runs can be reproduced from immutable metadata records.

## Experiment record fields

Each registered experiment writes:

```
data/experiments/<experimentId>/experiment.json
```

| Field | Description |
|-------|-------------|
| `experimentId` | Deterministic `exp-v1-<hash>` from strategy/config/dataset/fixture/engine identity |
| `runId` | Research run identifier from sweep output metadata |
| `strategyId` | Strategy plugin identifier |
| `strategyConfig` | Strategy configuration object when present |
| `costModelConfig` | Execution cost model or legacy fill config |
| `datasetHash` | Dataset identity (`datasetId` or hashed dataset payload) |
| `fixtureHash` | Fixture content hash when `data/fixtures/<series>/<market>/fixture.json` exists |
| `engineVersion` | Replay engine version from research output |
| `gitCommit` | Git HEAD at registration time |
| `timestamp` | Research run timestamp from output metadata |
| `researchOutputLocations` | Paths to `research-output.json` artifacts |
| `calibrationReportLocations` | Paths to `calibration-report.json` when available |
| `leaderboardSnapshot` | Ranked aggregate-summary snapshot when available |

## Deterministic experiment IDs

Experiment IDs exclude `runId`, `gitCommit`, and registration timestamps so equivalent strategy/config/dataset/fixture/engine combinations always resolve to the same ID.

## CLI

```bash
npm run experiments:register
npm run experiments:register -- --research-root data/research-results --experiments-root data/experiments --fixtures-root data/fixtures
```

## Validation behavior

| Condition | Behavior |
|-----------|----------|
| Empty research tree | Fail with `empty-dataset` |
| Missing required metadata (`runId`, `strategyId`, dataset) | Fail with `incomplete-experiment` |
| Invalid runner JSON | Fail with `invalid-metadata` |
| Existing record with different content | Fail with `immutable-record-conflict` |
| Existing identical record | Skip write (idempotent) |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
