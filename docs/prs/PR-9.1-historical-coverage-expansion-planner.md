# PR-9.1 — Historical Coverage Expansion Planner

## Summary

Milestone 9.1 adds a read-only historical coverage expansion planner that analyzes current dataset coverage and recommends which market/date windows to import next. The planner does **not** run imports and does not modify importer, replay, or research calculation behavior.

## CLI

```bash
npm run research:coverage-plan
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/historical-coverage-plan.json` |
| `--html-output` | `data/reports/historical-coverage-plan.html` |
| `--data-health` | `data/research-results/data-health.json` |
| `--mispricing-atlas` | `data/research-results/mispricing-atlas.json` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--regime-tags` | `data/research-results/regime-tags.json` |
| `--import-configs-dir` | `data/import-configs` |
| `--fixtures-dir` | `data/fixtures` |
| `--research-results-dir` | `data/research-results` |
| `--month-persistence-threshold` | `0.67` |

## Report sections

1. **snapshot.marketCount** — unique markets across import configs and research outputs
2. **snapshot.uniqueTradingDays** — distinct UTC trading days observed
3. **snapshot.monthCoverage** — per-month market and trading-day counts
4. **snapshot.missingMonths** — intra-horizon month gaps
5. **snapshot.volatilityRegimeCoverage** — low/medium/high/untagged market counts from regime tags
6. **snapshot.marketTypeCoverage** — series ticker / pattern coverage
7. **recommendations** — prioritized import windows with rationale, expected research benefit, and priority score

Example recommendation:

> Import KXBTC15M markets for 2026-01 through 2026-03 because current hypotheses fail month-stability checks (monthPersistenceRate < 0.67) and 2026-Q1 coverage is absent.

## Architecture

```
data-health.json + mispricing-atlas.json + hypothesis-validation.json + regime-tags.json
import-configs/** + fixtures/** + research-results/**/research-output.json
        ↓
scanCoverageMarketRecords + loadCoveragePlannerArtifacts (read-only)
        ↓
computeCoverageSnapshot + buildCoverageImportRecommendations
        ↓
historical-coverage-plan.json + historical-coverage-plan.html
```

- Module: `src/lib/data/research/coveragePlanner/`
- CLI: `scripts/research/buildHistoricalCoveragePlan.ts`

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
