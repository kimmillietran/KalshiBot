# PR-9.23 — Adaptive Expansion Import Throttling

## Summary

Adds optional adaptive inter-market throttling to the historical expansion import executor, reusing the M8 batch import pattern while preserving M9.14D fixed per-market 429 retry backoff.

When `--adaptive-throttle` is enabled, the executor:

- starts at a conservative minimum inter-market delay
- increases delay after HTTP 429 events (honoring `Retry-After` when present)
- decreases delay only after sustained clean imports (`--success-decay-after`)
- caps delay at `--max-backoff-ms`
- reports adaptive metrics in JSON/HTML summaries

Default behavior is unchanged: fixed `--rate-limit-backoff-ms` retry backoff only, no inter-market pacing.

## CLI

```bash
npm run research:execute-expansion-import -- --execute \
  --adaptive-throttle \
  --min-backoff-ms 500 \
  --max-backoff-ms 30000 \
  --backoff-multiplier 2 \
  --success-decay-after 3
```

| Flag | Default | Purpose |
| --- | --- | --- |
| `--adaptive-throttle` | off | Enable adaptive inter-market pacing |
| `--min-backoff-ms` | `500` | Baseline / minimum inter-market delay |
| `--max-backoff-ms` | `30000` | Maximum inter-market delay cap |
| `--backoff-multiplier` | `2` | Multiply current delay after 429 |
| `--success-decay-after` | `3` | Consecutive clean imports before decreasing delay |
| `--rate-limit-backoff-ms` | `5000` | Fixed per-market 429 retry backoff (unchanged) |

## Summary fields

`historical-expansion-import-summary.json` now includes `adaptiveThrottleDiagnostics`:

```json
{
  "adaptiveThrottleDiagnostics": {
    "adaptiveThrottleEnabled": true,
    "minBackoffMs": 500,
    "maxBackoffMs": 30000,
    "currentDelayMs": 1000,
    "initialDelayMs": 500,
    "rateLimitEvents": 2,
    "avoidedRetriesEstimate": 5,
    "totalBackoffMs": 125000,
    "throughputMarketsPerMinute": 4.2,
    "throttleAdjustmentCount": 4
  }
}
```

`totalBackoffMs` combines inter-market adaptive sleep and per-market 429 retry backoff.

## Architecture

| Module | Role |
| --- | --- |
| `expansionImportAdaptiveThrottle.ts` | Controller, parsing, diagnostics |
| `expansionImportRateLimit.ts` | `onRateLimited` callback for adaptive bumps |
| `runHistoricalExpansionImport.ts` | Inter-market sleep + summary wiring |

Reuses M8 concepts (`AdaptiveThrottleController` behavior) without changing import semantics, planner, or research logic.

## Tests

| Scenario | File |
| --- | --- |
| Parse options + controller behavior | `expansionImportAdaptiveThrottle.test.ts` |
| Adaptive inter-market sleep + summary | `runHistoricalExpansionImport.test.ts` |
| `onRateLimited` callback | `expansionImportRateLimit.test.ts` |

## Test plan

- [x] `npm run lint`
- [x] `npm run test`
- [x] `npm run build`
