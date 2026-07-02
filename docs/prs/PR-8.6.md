# PR 8.6 — Mispricing atlas coverage diagnostics

## Problem

Hypothesis generation reported `No candidate: insufficient atlas observations (0 < 30)` after a successful 500-market pipeline because:

1. The research pipeline never ran `research:mispricing-atlas` before `research:hypotheses`.
2. Stale or empty `mispricing-atlas.json` artifacts could be parsed with zero observations and no actionable diagnostics.

## Changes

- Add `research:mispricing-atlas` to the official pipeline (after regime tagging, before hypotheses).
- Extend `mispricing-atlas.json` with:
  - `coverageDiagnostics` (totals, non-empty buckets, below-threshold counts, top buckets, skip reasons)
  - `coarseBuckets` (probability-only, probability × time, probability × volatility regime when tags exist)
- Hypothesis generator prefers coarse buckets first, surfaces `atlasCoverageDiagnostics` in `hypothesis-candidates.json`, and emits clearer `noCandidateReasons`.
- Parser reports `mispricing-atlas schema mismatch` for invalid atlas documents.

## Verification

```bash
npm run lint
npm run test
npm run build
```
