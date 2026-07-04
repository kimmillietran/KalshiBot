# PR 8.23 — Harness Cleanup and Promotion Gate

## Purpose

Improve research harness ergonomics by eliminating no-op noise and gating harness execution to promotion-eligible synthesized strategies.

## Harness cleanup (M8.19C)

When no synthesized strategies match harness filters:

- Exit code **0**
- Exactly **one** warning (stderr + summary `warnings`)
- Empty `strategy-harness-summary.json` written
- No schema validation noise from ineligible rows (e.g. rejected strategies with unsupported families)

## Promotion gate

Default harness eligibility:

| `promotionStatus` | Harness execution |
|-------------------|-------------------|
| `experimental` | Included |
| `candidate` | Included |
| `rejected` | Excluded |

Rejected strategies remain in synthesis output and downstream reports. They are not normalized or scheduled unless explicitly opted in.

### CLI

```bash
npm run research:harness -- --input data/research-results/strategy-synthesis-candidates.json
npm run research:harness -- --include-rejected
```

| Flag | Default |
|------|---------|
| `--include-rejected` | off |

## Orchestrator compatibility

The full research orchestrator continues to invoke `research:harness` with `--input strategy-synthesis-candidates.json`. Harness no-ops cleanly when every synthesized strategy is rejected or filtered out, allowing downstream harness-results and promotion steps to proceed.

## Verification

```bash
npm run lint
npm run test
npm run build
```
