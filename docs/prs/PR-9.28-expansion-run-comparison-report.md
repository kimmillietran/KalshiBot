# PR-9.28 — Expansion run comparison report

## Summary

Adds longitudinal expansion import run tracking so we can compare import efficiency and research yield across runs over time.

## CLI

```bash
npm run research:expansion-run-history
```

### Inputs

- `historical-expansion-import-summary.json` (required)
- Expansion import checkpoint (optional)
- Experiment index snapshot (optional)
- Expansion rebuild summary (optional)
- Previous `expansion-run-history.json` (optional, append)

### Outputs

- `data/research-results/expansion-run-history.json`
- `data/reports/expansion-run-history.html`

## Tracked per run

- Import counts, unsupported/rate-limit metrics, elapsed time, throughput
- Discovery overhead estimate and adaptive throttle state
- Rebuild fixture / atlas counts when available
- Research yield per imported market

## Trends

- Import success rate
- Unsupported rate
- Rate-limit rate
- Discovery overhead share
- Imports per minute
- Research yield per imported market
- Best throughput / worst bottleneck highlights
- Efficiency improving signal

## Dashboard

Research pipeline dashboard includes **Expansion Run History** with latest run, best throughput, worst bottleneck, and efficiency trend.

## Test plan

- [x] First run creates history
- [x] Append behavior
- [x] Trend calculations
- [x] Corrupted previous history handling
- [x] Pruning to latest 100 runs
- [x] Dashboard section rendering
- [x] `npm run lint`, `npm run test`, `npm run build`

## Constraints

Reporting only — no changes to import execution or research calculations.
