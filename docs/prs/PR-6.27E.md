# PR-6.27E — Discovery Early Stop + Progress Logging

## Summary

Milestone 6.27E makes sampled historical discovery practical for smoke tests by stopping pagination early when safe and emitting stderr progress logs while discovery runs.

## Early stop

When `--limit` is set and no `--after` / `--before` date filters are active:

- Pagination stops after collecting `offset + limit` raw markets.
- Example: `--limit 50` stops after the first page when it already contains ≥ 50 markets.
- Example: `--offset 100 --limit 50` stops after ≥ 150 markets are collected.
- `--limit 0` skips pagination entirely.

Date-filtered discovery still scans the full catalog to preserve correctness.

## Progress logging

Stderr lines (stdout JSON summary unchanged):

```text
[discover] page=1 collected=100 limitTarget=50
[discover] early stop: collected 100 >= target 50
```

Rate-limit retry warnings continue to use stderr via existing 6.27D logging.

## Metadata / stdout summary

When `--limit` is used, discovery output includes:

| Field | Description |
|-------|-------------|
| `earlyStopApplied` | Whether pagination stopped before catalog exhaustion |
| `pagesFetched` | Pages retrieved from Kalshi |
| `limitTarget` | `offset + limit` collection target |
| `totalDiscoveredMayBePartial` | `true` when early stop means full-catalog `totalDiscovered` is unknown |

## Smoke test

```bash
npm run discover:markets -- \
  --series KXBTC15M \
  --limit 50 \
  --request-delay-ms 500 \
  --max-retries 5 \
  --retry-base-delay-ms 1000 \
  --output discovery-result.json
```

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
