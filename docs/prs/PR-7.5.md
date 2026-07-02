# PR-7.5 — Regime Tagging

## Summary

Milestone 7.5 adds descriptive regime classification for every historical market in research outputs. Each market receives deterministic volatility, trend, and market-state tags plus the raw metrics used to assign them.

This is **not** a trading strategy change — it produces a joinable research artifact only.

## CLI

```bash
npm run research:tag-regimes
```

Defaults:

| Flag | Default |
|------|---------|
| `--input-dir` | `data/research-results` |
| `--output` | `data/research-results/regime-tags.json` |

## Architecture

```
research-output.json (replay steps)
        ↓
extractRegimeStepsFromResearchOutput
        ↓
computeRegimeMarketEntry (aggregate metrics + tags)
        ↓
regime-tags.json
```

- Module: `src/lib/data/research/regimeTagging/`
- CLI: `scripts/research/buildRegimeTags.ts`

## Per-market metrics

- `realizedVolatilityAnnualized`
- `trendStrengthScore` / `trendSlopePerBar`
- `btcReturnPercent`
- `rangePercent`
- `timeRemainingProfile` (`minMs`, `maxMs`, `averageMs`)
- `averageSpreadPercent`
- `averageImpliedProbability`

## Tags

| Dimension | Values |
|-----------|--------|
| Volatility | `low`, `medium`, `high` |
| Trend | `uptrend`, `downtrend`, `sideways` |
| Market state | `quiet`, `trending`, `reversal`, `choppy` |

## Join key

Each market entry includes `joinKey`:

```
{strategyId}/{seriesTicker}/{marketTicker}
```

Future modules (mispricing atlas, lead-lag, calibration, significance) can filter or join on this key.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
