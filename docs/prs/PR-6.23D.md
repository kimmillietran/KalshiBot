# PR-6.23D — Aggregate Research Statistics

## Summary

Milestone 6.23D aggregates per-market batch research outputs under `data/research-results/<series>/**/research-output.json` into deterministic series summaries at `data/research-results/<series>/aggregate-summary.json`.

## Architecture

```
data/research-results/<series>/**/research-output.json
        ↓
scanResearchOutputs()
        ↓
parseResearchOutputJson() + computeResearchAggregateStatistics()
        ↓
buildResearchAggregateSummary()
        ↓
data/research-results/<series>/aggregate-summary.json
```

## Aggregate fields

- Market counts: total, completed, failed
- Performance: total/average/median PnL, trade-weighted win/loss rates, average return, max drawdown, Sharpe (when available)
- Duration: total, average, median, min, max
- Per-market rows sorted by ticker (strategy-agnostic summary)

## CLI

```bash
npm run research:aggregate -- \
  --input-dir data/research-results \
  --output-dir data/research-results
```

## Validation

- Missing research results directory
- Missing `research-output.json`
- Invalid output schema
- Duplicate market results
- Missing metrics on completed outputs
- Empty datasets

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
