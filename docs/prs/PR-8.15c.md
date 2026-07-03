# PR 8.15C — Harness Results Integration

## Purpose

Persist and summarize M8.15B harness evaluations alongside synthesized strategy specs, producing JSON and HTML artifacts for researcher review.

## Usage

```bash
npm run research:harness-results
```

Optional flags:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/harness-results.json` |
| `--html-output` | `data/reports/research-harness-results.html` |
| `--synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--harness-summary` | `data/research-results/harness/strategy-harness-summary.json` |
| `--harness-dir` | `data/research-results/harness` |
| `--hypothesis-validation` | `data/research-results/hypothesis-validation.json` |
| `--leaderboard` | `data/leaderboards/strategy-leaderboard.json` |

## Inputs

- `strategy-synthesis-candidates.json` (M8.15A)
- `harness/strategy-harness-summary.json` + per-market `research-output.json` files (M8.15B)
- Optional `hypothesis-validation.json` and baseline leaderboard for context

## Outputs

- `harness-results.json` — per-strategy metrics and promotion recommendation
- `research-harness-results.html` — dark-theme report with summary, table, and cards

## Promotion recommendations

| Recommendation | Typical criteria |
|----------------|------------------|
| `reject` | Not run, all runs failed, or synthesis/validation rejected |
| `needs-more-data` | Partial runs, low market coverage, experimental synthesis |
| `candidate` | Completed harness run, passing validation, strong metrics |

## Constraints

Read-only reporting integration. Does not modify replay, live trading, baseline strategies, or harness execution.

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:harness-results
```
