# PR-6.25B — Bid/Ask Fidelity Audit and Diagnostics

## Summary

Milestone 6.25B adds bid/ask fidelity diagnostics for Kalshi historical candle datasets. The audit detects zero-spread candles, inverted spreads, missing quote fields, and live close-only payloads that synthesize identical bid/ask values.

## Warnings vs failures

All bid/ask fidelity findings are **warnings only**. They do not fail imports, fixture generation, registry builds, or research runs. Use the audit to decide whether execution-sensitive strategy results are trustworthy.

Warning codes:

| Code | Meaning |
|------|---------|
| `no-candles` | No Kalshi candle records found |
| `missing-bid-ask-fields` | Candle payload lacks usable YES bid/ask |
| `live-close-only-quotes` | Every candle uses close-only live historical payloads |
| `inverted-spreads` | One or more candles have YES bid > YES ask |
| `all-candles-zero-spread` | Every candle has identical YES bid and ask |
| `high-zero-spread` | Zero-spread percentage meets/exceeds threshold (default 90%) |

## Architecture

```
Import/fixture bronze candle records
        ↓
extractBidAskCandleQuote()
        ↓
computeBidAskSpreadStatistics()
        ↓
buildBidAskFidelityWarnings()
        ↓
data/audits/bid-ask-fidelity.json
```

Core logic lives under `src/lib/data/datasets/validation/audit/`.

Registry integration adds `bidAskFidelity` to each dataset registry market entry and `suspiciousZeroSpreadMarketCount` to series summaries via `buildResearchFixtureSummary()`.

## CLI

```bash
npm run data:audit-bid-ask -- \
  --input-dir data/imports \
  --output data/audits/bid-ask-fidelity.json
```

When `--input-dir` points at `data/imports`, the scanner pairs each `<series>/<market>` directory with `data/fixtures/<series>/<market>/fixture.json`.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
