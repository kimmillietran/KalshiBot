# PR 8.1 — Implied vs realized volatility study

## Summary

Adds a research analysis module that compares Kalshi-implied volatility (inverted from mid prices via the diffusion model) against realized forward BTC volatility.

## CLI

```bash
npm run research:vol-premium
# --input-dir  default: data/research-results
# --output     default: data/research-results/vol-premium-study.json
```

Optional regime bucketing joins `data/research-results/regime-tags.json` when present (from `npm run research:tag-regimes`).

## Output

Deterministic JSON with:

- Overall summary (average implied/realized vol, vol premium, inversion failure counts)
- Per-bucket stats by time remaining, moneyness, realized-vol regime, and regime tags (volatility/trend/market state)
- Sample counts and warnings

## Architecture

| Layer | Path |
|-------|------|
| Engine | `src/lib/data/research/volPremium/` |
| CLI | `scripts/research/buildVolPremiumStudy.ts` |

Reuses `scanCalibrationResearchOutputs` and mispricing atlas bucket definitions. No strategy, replay, or execution changes.

## Tests

- `volPremiumMath.test.ts` — inversion round-trip, boundary/ATM/zero-time failures
- `buildVolPremiumStudy.test.ts` — bucket aggregation, deterministic output, empty dataset, regime join
- `buildVolPremiumStudy.test.ts` (CLI) — argv parsing, empty dataset write

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
