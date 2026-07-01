# PR 6.24C — Strategy Leaderboard

## Summary

Adds a deterministic strategy leaderboard that compares aggregate research results across strategies under `data/research-results/<strategyId>/`.

## Scope

- Input: discovered `aggregate-summary.json` files (6.23D format)
- Output: `data/leaderboards/strategy-leaderboard.json`
- CLI: `npm run leaderboard:strategies`
- Ranking metrics: `totalPnL`, `sharpe`, `winRate`

## Architecture

| Layer | Path | Responsibility |
| --- | --- | --- |
| Core | `src/lib/data/research/leaderboard/` | Discovery, merge, ranking, serialization |
| CLI | `scripts/leaderboard/` | Filesystem IO and argv parsing |
| Barrel | `src/lib/data/research/index.ts` | Public exports |

Reuses 6.23D aggregation helpers (`computePerformanceStatistics`, `computeDurationStatistics`, path utilities) without modifying the replay engine or strategy implementations.

## Validation

- Missing input directory
- Missing aggregate summaries per strategy
- Invalid aggregate JSON
- Duplicate strategy entries
- Duplicate market results when merging series
- Invalid rank metrics
- Empty datasets

## Test plan

- [x] Ranking by `totalPnL`, `sharpe`, and `winRate`
- [x] Deterministic ordering and serialization
- [x] Duplicate strategy and market handling
- [x] Validation for missing summaries, invalid metrics, empty datasets
- [x] CLI success and failure paths

## Commands

```bash
npm run lint
npm run test
npm run build
npm run leaderboard:strategies -- --input-dir data/research-results --output data/leaderboards/strategy-leaderboard.json --rank-by totalPnL
```
