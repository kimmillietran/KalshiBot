# PR-7.7 — Hypothesis Candidate Generator

## Summary

Milestone 7.7 adds a deterministic, rules-based research helper that reads descriptive research artifacts and proposes human-reviewable strategy hypotheses.

This is **not** an auto-trader, optimizer, or replay change. It produces conservative candidate ideas with kill criteria and explicit warnings when statistical validation is missing.

## CLI

```bash
npm run research:hypotheses
```

Defaults:

| Flag | Default |
|------|---------|
| `--output` | `data/research-results/hypothesis-candidates.json` |
| `--mispricing-atlas` | `data/research-results/mispricing-atlas.json` |
| `--lead-lag` | `data/research-results/lead-lag-analysis.json` |
| `--significance` | `data/research-results/statistical-significance.json` |
| `--regime-tags` | `data/research-results/regime-tags.json` (optional) |
| `--leaderboard` | `data/leaderboards/strategy-leaderboard.json` |
| `--min-sample` | `30` |

## Inputs

- `mispricing-atlas.json` — calibration bucket cells
- `lead-lag-analysis.json` — BTC vs Kalshi lag metrics
- `statistical-significance.json` — optional validation context
- `regime-tags.json` — optional regime labels
- `strategy-leaderboard.json` — loaded for future context; not required for candidate generation

## Output

`data/research-results/hypothesis-candidates.json` with:

- `candidates[]` — each includes `candidateId`, `hypothesis`, `rationale`, `marketCondition`, `suggestedStrategyFamily`, `requiredData`, entry/exit assumptions, `expectedFailureMode`, `killCriterion`, `confidence`, and `warnings`
- `summary.noCandidateReasons` — when no candidates qualify

## Architecture

```
mispricing-atlas.json ──┐
lead-lag-analysis.json ─┼→ buildHypothesisCandidates
significance.json ──────┤
regime-tags.json ───────┤
leaderboard.json ───────┘
        ↓
hypothesis-candidates.json
```

- Module: `src/lib/data/research/hypothesisCandidates/`
- CLI: `scripts/research/buildHypothesisCandidates.ts`

## Rules (conservative)

- Skip atlas cells below `--min-sample`
- Require calibration error magnitude ≥ 5% for atlas hypotheses
- Require BTC-leading lag ≥ 1 with correlation ≥ 0.2 and sufficient aligned candles
- Add warnings when significance artifact is missing or inconclusive
- Deterministic ordering and `stableStringify` serialization

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Test plan

- [x] Empty / missing inputs produce no candidates with summary reasons
- [x] Sparse atlas cell ignored
- [x] Significant atlas cell creates candidate
- [x] Lead-lag signal creates candidate
- [x] Missing significance produces warning
- [x] Deterministic serialization
- [x] CLI smoke test
