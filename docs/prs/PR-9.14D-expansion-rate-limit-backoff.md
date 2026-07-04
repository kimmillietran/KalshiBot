# PR-9.14D — Expansion import rate-limit backoff

## Summary

Adds rate-limit-aware retry and abort behavior to the historical expansion import executor (`research:execute-expansion-import`).

When Kalshi returns HTTP 429 during per-market imports, the executor now:

- classifies 429 separately from compatibility/parser, network, and other failures
- pauses with configurable backoff before retrying the same market
- honors `Retry-After` when present on importer errors
- aborts gracefully after repeated post-retry 429 failures to prevent runaway API pressure
- reports rate-limit diagnostics in the JSON/HTML summary

## CLI

```bash
npm run research:execute-expansion-import -- --execute \
  --rate-limit-backoff-ms 5000 \
  --max-rate-limit-retries 3
```

| Flag | Default | Purpose |
| --- | --- | --- |
| `--rate-limit-backoff-ms` | `5000` | Base backoff delay when Retry-After is absent |
| `--max-rate-limit-retries` | `3` | Per-market 429 retries before marking the market failed |

## Summary fields

`historical-expansion-import-summary.json` now includes:

```json
{
  "rateLimitDiagnostics": {
    "rateLimitedCount": 0,
    "backoffDurationMs": 0,
    "retryCount": 0,
    "firstRateLimitedTicker": null,
    "recommendedNextAction": "..."
  }
}
```

## Safety model

- **Per-market retry:** 429 → backoff → retry up to `--max-rate-limit-retries`
- **Cascade abort:** after 5 consecutive markets fail with 429 (post-retry), the run stops with a clear warning
- **Compatibility circuit breaker unchanged:** parser/compatibility failure-rate breaker remains separate and still ignores isolated 429 noise

## Files

- `src/lib/data/importJobs/expansionExecutor/expansionImportRateLimit.ts`
- `src/lib/data/importJobs/expansionExecutor/runHistoricalExpansionImport.ts`
- `scripts/research/executeExpansionImportTypes.ts`

## Test plan

- [x] Single 429 backs off and succeeds on retry
- [x] Repeated 429 aborts before compatibility circuit breaker trips
- [x] Retry-After honored when present
- [x] Summary includes rate-limit diagnostics
- [x] `npm run lint`, `npm run test`, `npm run build`
