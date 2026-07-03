# PR 8.15B — Research Strategy Harness

## Purpose

Evaluate synthesized strategy specifications through the existing historical research backtesting pipeline. The harness translates M8.15A strategy synthesis output into executable research-only strategies without changing built-in strategy behavior.

## Usage

```bash
npm run research:harness
```

Optional flags:

| Flag | Default |
|------|---------|
| `--synthesis` | `data/research-results/strategy-synthesis-candidates.json` |
| `--registry-dir` | `data/research-datasets` |
| `--output-dir` | `data/research-results/harness` |
| `--family` | all supported families |
| `--strategy-id` | filter to one synthesized strategy id |
| `--concurrency` | `1` |
| `--include-rejected` | exclude rejected strategies (default) |

## Supported families

- `calibration-fade` — research-only plugin that fades miscalibrated YES pricing

Directions:

- `fade-yes` / `buy-no` — buy NO when yes mid is at or above threshold
- `fade-no` / `buy-yes` — buy YES when yes mid is at or below threshold

## Outputs

- Per run: `data/research-results/harness/{synthesizedStrategyId}/{series}/{market}/research-output.json`
- Summary: `data/research-results/harness/strategy-harness-summary.json`

## Constraints

- Research-only — no live trading integration
- Built-in strategy registry unchanged; `calibration-fade` is registered only in the harness registry
- Existing batch/sweep/historical research commands are unaffected unless `research:harness` is invoked explicitly

## Verification

```bash
npm run lint
npm run test
npm run build
npm run research:harness
```
