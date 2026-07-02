# PR-6.27D — Kalshi Discovery Rate Limit Handling

## Summary

Milestone 6.27D makes historical market discovery resilient to Kalshi API `429` responses by adding configurable request throttling and deterministic retry/backoff.

## CLI flags

| Flag | Default (CLI) | Description |
|------|---------------|-------------|
| `--request-delay-ms` | `250` | Delay between paginated discovery requests |
| `--max-retries` | `5` | Retry budget for `429` responses |
| `--retry-base-delay-ms` | `1000` | Base delay for linear backoff between retries |

## Safe smoke test

```bash
npm run discover:markets -- \
  --series KXBTC15M \
  --limit 50 \
  --request-delay-ms 500 \
  --max-retries 5 \
  --retry-base-delay-ms 1000 \
  --output discovery-result.json
```

## Behavior

- Throttling applies between successful paginated requests.
- `429` responses trigger warning logs on stderr and deterministic linear backoff.
- `Retry-After` response headers are honored when present.
- Discovery fails clearly after the retry budget is exhausted.
- No partial `discovery-result.json` is written on failure.
- Sampling semantics from 6.26C are unchanged.
- Programmatic discovery without rate-limit options keeps prior behavior (no inter-request delay); unexpected `429` responses still use fallback retries.

## Validation

| Condition | Behavior |
|-----------|----------|
| Negative delay/retry flags | Fail |
| `--max-retries 0` | No retries (fail immediately on sustained `429`) |
| Invalid `Retry-After` | Ignored; fallback backoff used |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
