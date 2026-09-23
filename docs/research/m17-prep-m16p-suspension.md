# M17-prep — M16-P collection suspension

## Disposition

**SUSPEND M16-P prospective validation collection.**

Basis: M16-ER external historical replication failed to reject H0
(`fail-to-reject-H0`; mean fee-adjusted executable P&L ≈ **−4.427¢**; N=461;
G=34 UTC days). Suspension is **not** based on prospective M16-P P&L (outcomes
remain sealed and were not opened).

## Collection-disable step (established workflow)

```bash
npm run research:m16-validation-collection -- --disable-scheduler
```

Observed effect (this worktree, 2026-09-23T23:20:45.028Z):

- `data/research-results/m16-validation-collection/scheduler/state.json`
  → `enabled: false`
- Note: local state disable only; **operator-driven** `launchctl bootout/unload`
  remains required if the plist is still loaded (`loaded: true` after disable).
- Append-only ops line written to
  `data/research-results/m16-validation-collection/scheduler/ops.log`.

No unrelated capture infrastructure was altered. Registry accepted rows,
quarantine flags, and progress scientific disposition were **not rewritten**.

## Verified claims vs prior reassessment

| Claim | Prior report | Verified against artifacts |
| --- | --- | --- |
| M16-ER mean gross | ≈ −0.427¢ | **Match** (`−0.42733188720173537`) |
| M16-ER mean fee-adjusted | ≈ −4.427¢ | **Match** (`−4.427331887201736`) |
| M16-ER N / G | 461 / 34 UTC days | **Match** |
| M16-P `outcomesOpened` | false | **Match** (progress + accepted quarantine) |
| M16-P accepted segments/trades/days/hours | **0** | **DISCREPANCY** (see below) |

### Discrepancy (preserved, not resolved by opening)

Current authoritative registry/progress (inspected metadata only):

| Field | Value |
| --- | --- |
| `acceptedSegments` / registry `accepted.length` | **1** |
| `eligibleTradeCount` | **9** |
| `acceptedHours` | **4** |
| `distinctEligibleUtcDayClusters` | **1** |
| `disposition` | `continue-collection` |
| `outcomesOpened` | `false` |
| quarantine (`pnlOpened`, stop/target/settlement inspected) | all false |

Sealed material present after the prior “zero accepted” note is **preserved**.
It was not deleted and sealed economics were not opened to reconcile the count
discrepancy.

## Provenance pointers

- M16-ER primary:
  `data/research-results/external-kalshi-data-audit/m16-er-primary-economic-result.json`
- M16-ER narrative:
  `data/research-results/external-kalshi-data-audit/m16-er-economic-result.md`
- M16-P registry:
  `data/research-results/m16-validation-collection/registry.json`
- M16-P progress:
  `data/research-results/m16-validation-collection/progress.json`
- Suspension event artifact:
  `data/research-results/external-kalshi-data-audit/m17-prep-settlement-feasibility/m16p-suspension-event.json`

## Contamination / reservoir

CryptoStruct reservoir SPENT_VALIDATION dates (34) and QUALITY_AUDIT_ONLY (5)
classifications are unchanged. Append-only reservoir governance preserved.
Unknown eligibility continues to fail closed.
