# PR 8.9 — Settlement trace debug CLI

## Purpose

Forensic, read-only debugger for a **single market ticker** that shows where settlement exists or disappears across the research pipeline.

## Usage

```bash
npm run debug:settlement -- --ticker KXBTC15M-26MAY020515-15
```

Optional flags:

| Flag | Default |
|------|---------|
| `--imports-dir` | `data/imports` |
| `--import-configs-dir` | `data/import-configs` |
| `--fixtures-dir` | `data/fixtures` |
| `--registry-dir` | `data/research-datasets` |
| `--research-results-dir` | `data/research-results` |
| `--output` | `data/audits/settlement-trace-<ticker>.json` |

## Trace stages

1. Import config
2. Import result
3. Fixture
4. Research dataset registry
5. Research output / replay input (`dataset.snapshots[].settlement`)
6. Research output / replay steps (`sourceSnapshot.settlement`)
7. Aggregate summary (settlement not tracked — informational)
8. Calibration report (`markets[].settlementOutcome`)
9. Mispricing atlas (market-level missing-settlement warnings)

## Output

Writes deterministic JSON to `data/audits/settlement-trace-<ticker>.json` with:

- Per-stage status (`found` | `missing` | `unavailable` | `malformed`)
- Settlement field paths and values when present
- Per-strategy research summaries when multiple strategies exist
- `firstMissingStage`, `likelyRootCause`, `recommendedNextAction`

Console prints a human-readable summary plus JSON metadata line.

## Constraints

- Read-only: no API calls, no mutation of pipeline artifacts
- Does not modify replay, strategies, pricing, settlement logic, or research algorithms

## Verification

```bash
npm run lint
npm run test
npm run build
```
