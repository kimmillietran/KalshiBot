# PR-9.12 — Historical Import Compatibility Investigation

## Summary

Expansion discovery successfully lists thousands of Kalshi historical markets, but bulk execute imports fail almost immediately with parser errors and then cascade into `429` rate limits. This milestone adds diagnostics, a failure-rate circuit breaker, CLI fixes, and progress reporting corrections so incompatible markets are identified early instead of hammering the API.

## Root cause

| Layer | Endpoint | Behavior |
| --- | --- | --- |
| Discovery | `GET /historical/markets?series_ticker=...` | Returns list payloads with required import fields (`open_time`, `close_time`, `expiration_value`, etc.) |
| Import | `GET /historical/markets/{ticker}` | Re-fetches each market individually during bronze prefetch |

For expansion-discovered tickers such as `KXBTC15M-25DEC311900-00`, the **list** response includes `expiration_value`, but the **single-market** response omits it. The historical bronze import path requires `expiration_value` when mapping market records and throws before any bronze records are written.

### Why this looked like a parser bug

The prior error was generic:

```text
Kalshi historical market response is missing required fields
```

That hid which fields were absent, which endpoint was used, and what the API actually returned.

### Why 429s followed

The executor continued attempting thousands of imports after repeated identical parser failures. Each failed import still issued Kalshi HTTP calls (market + candlesticks + settlement), so the job quickly exhausted rate limits.

### What this milestone does **not** do

- Does not invent missing `expiration_value` from discovery data
- Does not change trading, replay, hypothesis, validation, synthesis, or promotion logic
- Does not silently skip incompatible markets during discovery

A follow-up milestone should decide whether to filter discovery results, merge list payloads into import prefetch, or extend the parser for supported Kalshi schema variants.

## Changes

### Diagnostics (`kalshiMarketImportDiagnostics.ts`)

- Field-level missing-required analysis for wire and parsed records
- Sanitized raw response excerpts (secrets redacted)
- Debug artifacts written to `data/debug/kalshi-market-{ticker}.json`
- Actionable errors, e.g. `missing required fields: expiration_value. Raw response saved to ...`
- Fixture + tests for `KXBTC15M-25DEC311900-00` list vs detail schema comparison

### Failure-rate circuit breaker

- Evaluates the first 50 execute-mode import failures
- Trips when ≥90% are `import-compatibility` class errors
- Does **not** trip when isolated `429` / rate-limit failures dominate
- Aborts the job with failure class, affected count, first tickers, and suggested next action

### CLI `--max-markets` normalization

Supports npm/PowerShell forwarding quirks:

```bash
npm run research:execute-expansion-import -- --execute --max-markets=10
npm run research:execute-expansion-import -- --execute --max-markets 10
npm run research:execute-expansion-import -- data/import-configs/historical-expansion-config.json --execute --max-markets=10
```

Re-injects values from `npm_config_*` env vars and maps orphan numeric argv tokens after boolean flags.

### Progress denominator

- Progress bar uses planned import count (`toImportCount`) as the denominator
- Already-covered / deduped markets increment a separate `Deduped` counter and no longer inflate `completed/total`

## Reproduce locally

```bash
# Inspect failing ticker fixture comparison (unit tests)
npm run test -- src/lib/data/importers/kalshi/kalshiMarketImportDiagnostics.test.ts

# Dry-run with capped imports
npm run research:execute-expansion-import -- --execute --max-markets=10
```

After a failed execute import, inspect `data/debug/kalshi-market-*.json` for endpoint, HTTP status, top-level keys, missing fields, and sanitized response excerpts.

## Tests added / updated

| Area | File |
| --- | --- |
| Parser diagnostics + schema compare | `kalshiMarketImportDiagnostics.test.ts` |
| Importer failure for `KXBTC15M-25DEC311900-00` | `KalshiHistoricalImporter.test.ts` |
| Circuit breaker | `expansionImportCircuitBreaker.test.ts` |
| Executor integration | `runHistoricalExpansionImport.test.ts` |
| CLI argv normalization | `cliArgvSchemas.test.ts`, `executeExpansionImport.test.ts` |
| Progress reporting | `expansionImportProgress.test.ts` |

## Deferred

- Automatic discovery filtering to import-compatible markets only
- Using discovery list payloads to avoid redundant single-market fetches
- Settlement-endpoint diagnostics parity (market path only in this milestone)

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
