# PR 9.2 — Batch Import Expansion Config Generator

## Purpose

Convert M9.1 historical coverage recommendations into concrete, deduplicated import expansion jobs without executing imports.

## Usage

Dry-run by default (stdout plan only):

```bash
npm run research:generate-expansion-import-config
```

Write JSON + HTML artifacts:

```bash
npm run research:generate-expansion-import-config -- --write
```

| Flag | Default |
|------|---------|
| `--input` | `data/research-results/historical-coverage-plan.json` |
| `--output` | `data/import-configs/historical-expansion-config.json` |
| `--html-output` | `data/reports/historical-expansion-config.html` |
| `--import-configs-dir` | `data/import-configs` |
| `--write` | off (dry-run) |

## Behavior

1. Loads M9.1 `historical-coverage-plan.json`
2. Sorts recommendations by `priority`
3. Skips windows already covered by plan snapshot or existing import configs
4. Emits jobs with Kalshi discovery sampling windows and 6.22B import defaults (`coinbase-spot`, `kalshi-rest`)
5. Writes expansion manifest + HTML report when `--write` is set

## Constraints

- Config generation only — no imports executed
- Does not modify import runner, replay, or research pipelines

## Verification

```bash
npm run lint
npm run test
npm run build
```
