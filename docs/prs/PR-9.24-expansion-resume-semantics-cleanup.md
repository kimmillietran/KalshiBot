# PR-9.24 — Expansion import resume semantics cleanup

## Summary

Fixes expansion import resume so checkpoint state only skips truly completed imports. Previously, `--resume` could skip 100 markets with zero imports because planned/selected tickers were treated as complete.

## Resume semantics

| Prior outcome | Resume behavior |
| --- | --- |
| Successful import | Skip (`resumeSkippedSuccessful`) |
| Unsupported skip | Skip unless `--retry-unsupported` |
| Transient / 429 failure | Retry (`resumeRetriedTransient`) |
| Parser/compatibility failure | Skip unless `--retry-failed` |
| Selected but not imported | Execute (not in success checkpoint) |
| Config without import-result | Re-execute after heal / with `--verify-resume-artifacts` |

## New CLI flags

```bash
npm run research:execute-expansion-import -- --execute --resume \
  --retry-failed \
  --retry-unsupported \
  --verify-resume-artifacts
```

## Summary fields

`resumeDiagnostics` on `historical-expansion-import-summary.json`:

- `resumeSkippedSuccessful`
- `resumeSkippedUnsupported`
- `resumeRetriedFailed`
- `resumeRetriedTransient`
- `resumeAmbiguousStateCount`

## Implementation notes

- Checkpoint heal on resume strips `completedMarkets` entries without a verified import-result artifact
- `planned` outcomes are no longer written to `completedMarkets`
- Unsupported skips tracked in `unsupportedSkippedMarkets`
- Removed ticker-order resume skip (`lastCompletedMarketTicker` localeCompare)

## Test plan

- [x] Resume skips successful only
- [x] Resume retries transient failure
- [x] Resume does not skip selected-only checkpoint entries
- [x] Resume verifies import-result success
- [x] Resume handles unsupported terminal skips
- [x] `npm run lint`, `npm run test`, `npm run build`
