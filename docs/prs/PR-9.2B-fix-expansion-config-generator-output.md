# PR-9.2B — Fix Expansion Config Generator Output

## Summary

Fixes `research:generate-expansion-import-config` so it always materializes a true import expansion manifest (jobs + import defaults) at `data/import-configs/historical-expansion-config.json`, never the M9.1 coverage-plan schema.

## Changes

- **Write by default** — CLI persists JSON + HTML unless `--dry-run` is passed (replaces opt-in `--write`).
- **Output guard** — `assertExpansionConfigNotCoveragePlan` rejects documents containing `recommendations`, `snapshot`, `plannerNotes`, etc. before serialization.
- **M9.1 mapping** — `coverage-import-1` month-range recommendations convert to concrete `expansion-{series}-{start}-{end}` jobs with Kalshi discovery sampling + 6.22B import defaults.
- **Parser** — `parseHistoricalExpansionImportConfigJson` validates the written artifact round-trips cleanly.

## CLI

```bash
npm run research:generate-expansion-import-config
npm run research:generate-expansion-import-config -- --dry-run
```

| Flag | Default |
|------|---------|
| `--input` | `data/research-results/historical-coverage-plan.json` |
| `--output` | `data/import-configs/historical-expansion-config.json` |
| `--html-output` | `data/reports/historical-expansion-config.html` |
| `--dry-run` | off (writes enabled) |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
