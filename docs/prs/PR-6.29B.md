# PR-6.29B — Batch Import Rate Limit Retry

## Summary

Milestone 6.29B makes batch historical imports resilient to Kalshi API 429 rate limits by adding configurable retry/backoff, per-market request throttling, and richer batch summary metrics.

## CLI

```bash
npm run import:batch -- \
  --input-dir data/import-configs \
  --output-dir data/imports \
  --concurrency 1 \
  --request-delay-ms 1000 \
  --max-retries 5 \
  --retry-base-delay-ms 2000
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--request-delay-ms` | `0` | Pause between market imports |
| `--max-retries` | `0` | 429 retries per market (preserves legacy behavior when omitted) |
| `--retry-base-delay-ms` | `2000` | Linear backoff base when `Retry-After` is absent |
| `--overwrite` | off | Re-import markets with existing `import-result.json` |

## Behavior

- On Kalshi `429`, retry with `Retry-After` or linear backoff.
- Continue batch after retry exhaustion.
- Skip existing successful imports (resume) unless `--overwrite`.
- Single-import CLI (`import:historical`) unchanged.

## Summary fields added

`requestDelayMs`, `maxRetries`, `retryBaseDelayMs`, `retryCount`, `recoveredImports`, `failedAfterRetries`, `failureReasonCounts`, per-market `retryCount`.

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
