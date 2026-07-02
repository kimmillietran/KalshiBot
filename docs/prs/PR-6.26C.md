# PR-6.26C — Historical Market Sampling Controls

## Summary

Milestone 6.26C extends the historical market discovery CLI with deterministic sampling and date filtering so researchers can run pipelines on manageable market subsets.

## Filtering order

1. Discover all matching markets
2. Sort deterministically by `marketTicker`
3. Apply `--after` / `--before` date filters on `closeTime` (fallback `openTime`)
4. Apply `--offset`
5. Apply `--limit`
6. Write `discovery-result.json`

## CLI

```bash
npm run discover:markets -- --series KXBTC15M --limit 50

npm run discover:markets -- \
  --series KXBTC15M \
  --after 2026-01-01 \
  --before 2026-02-01 \
  --limit 100

npm run discover:markets -- \
  --series KXBTC15M \
  --offset 500 \
  --limit 250
```

Default output path: `discovery-result.json` (override with `--output`).

## Stdout summary fields

| Field | Description |
|-------|-------------|
| `totalDiscovered` | Markets returned before sampling |
| `afterDateFilter` | Markets remaining after date filters |
| `offset` | Applied offset |
| `limit` | Applied limit (`null` when omitted) |
| `finalMarketCount` | Markets written to discovery output |

When sampling options are used, `metadata.sampling` is also included in `discovery-result.json`.

## Validation

| Condition | Behavior |
|-----------|----------|
| Negative `--limit` or `--offset` | Fail |
| Invalid ISO dates | Fail |
| `--after` > `--before` | Fail |
| `--limit 0` | Write empty market list with summary `finalMarketCount: 0` |
| No sampling flags | Unchanged discovery behavior |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
