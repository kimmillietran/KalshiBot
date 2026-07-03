# PR 8.13 — Hypothesis Evidence Report

## Summary

Adds a presentation-only evidence layer so researchers can evaluate hypothesis candidates without reading raw JSON. `npm run research:hypotheses` now writes both `hypothesis-candidates.json` and `data/reports/research-hypotheses.html`.

## Scope

- New module: `src/lib/data/research/hypothesisEvidence/`
- Reads existing `hypothesis-candidates.json` inputs and joins atlas / lead-lag / research-output artifacts
- Does **not** change replay, atlas calculations, or hypothesis scoring

## Report contents

Each hypothesis card includes title, strategy family, rationale, calibration metrics, sample size, confidence, regime/bucket context, warnings, source artifact, confidence summary prose, and up to 10 example markets (newest first).

## CLI

```bash
npm run research:hypotheses
npm run research:hypotheses -- --html-output data/reports/research-hypotheses.html
npm run research:hypotheses -- --research-input-root data/research-results
```

## Test plan

- [x] Atlas candidate reference parsing
- [x] Bucket observation matching
- [x] Confidence summary prose
- [x] Evidence report builds cards with example markets
- [x] HTML serialization smoke tests
- [x] CLI writes JSON + HTML
- [x] `npm run lint`, `npm run test`, `npm run build`
