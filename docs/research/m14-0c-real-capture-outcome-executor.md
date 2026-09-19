# M14.0c governed real-capture validation outcome executor

## Why this exists

Merged M14.0c can evaluate the locked TRAIN candidate when supplied
**synthetic** `injectedOutcomes`, but the default production path refused real
forward-quote captures because outcome streaming was not implemented.

This module is the governed bridge:

accepted TOB captures (explicit, content-addressed)
→ bounded-memory locked-candidate episode reconstruction
→ `SyntheticValidationEpisode` records
→ existing `buildMomentumValidationReport` / M14.0c validator

It does **not** change the frozen experiment.

## Frozen candidate

`W-5000|X-2|H-30000|continuation`

Family / evidence / TRAIN / cohort-plan identities remain the sealed M14
authority hashes. Do not retune W/X/H or direction here.

## Inputs must be explicit

Production entrypoints refuse:

- `latest` paths
- mtime / directory ordering discovery
- wildcard “all captures”
- implicit newest registry

Callers must supply:

- sealed cohort authority (`ready-for-outcome-open`, identities, accepted set)
- explicit accepted-capture descriptors (run ID, capture dir, capture hash, …)
- excluded-run lineage (failed Segment 6 style exclusions must not enter outcomes)

## Governance

Real capture streaming sits behind `authorizeMomentumValidationOutcomeAccess`
and `assertRealValidationCaptureStreamAllowed`. There is no convenient bypass
that ignores readiness / ESS / identity checks.

Low-level pure streamers used in tests are separated from
`runGovernedRealCaptureMomentumValidation`.

## Economics

- **Primary:** signed one-contract **gross executable** horizon P&L
  (complement-derived asks; YES/NO bid exits).
- **Diagnostic:** midpoint continuation — labeled diagnostic only.
- Missing executable prices must **not** fall back to midpoint while claiming
  executable observability.
- Fee contract remains **unbound**; no net / after-fee edge claims.

## HOLDOUT

HOLDOUT captures stay quarantined. Validation→HOLDOUT role reuse fails closed.
This path never opens HOLDOUT outcomes.

## CLI

```bash
npm run research:momentum-validation-real -- \
  --cohort-registry <explicit-authority.json> \
  --accepted-captures <explicit-descriptors.json> \
  --verify-capture-identities \
  --holdout-quarantine <holdout-run-dir>
```

Console output is identity / counts / artifact paths only — not per-episode P&L.

## Research safety for this implementation milestone

Do **not** point the CLI or library at accepted M14 validation Segments
1–5/7 (or the real cohort registry) until this code is reviewed and merged.
Development and tests use synthetic / generated fixtures only.
