# M16.1 — Confirmatory evidence contract + dependence + fee + cohort

## Why M16.0 did not authorize P&L

M16.0 sealed the mechanical family and characterized blind incidence
(`incidence-characterized`). Incidence frequency is **not** a confirmatory
statistical design. Evidence contract, dependence plan, fee authority, and
prospective cohort plan were explicitly unsealed.

## Primary hypothesis

One-contract **mean** fee-adjusted executable P&L under the frozen M16 policy:

- H0: `μ ≤ 0`
- H1: `μ > 0`

Median is not primary. Direction is prospectively positive (one-sided).

## Why one-sided

The pre-existing hypothesis is specifically positive expectancy, not a
two-sided “any nonzero mean” claim.

## Design assumptions (not observed M16 outcomes)

| Parameter | Value |
| --- | --- |
| α | 0.05 one-sided |
| Power | 0.80 |
| MDE | +5¢ |
| Planning SD | 25¢ |
| IID baseline N | **155** = `ceil(((z_α+z_β)·SD/MDE)²)` |

MDE=+5¢ is an economically meaningful detectability threshold after ~5¢
transaction friction. It is **not** a claim that +5¢ edge is expected.

## Dependence

Adjacent KXBTC15M markets share BTC regimes within a UTC day. Sealed method:

**UTC-calendar-day cluster-robust variance estimation** with minimum
**24** distinct UTC-day clusters (M15 independent-day floor precedent).

Collection requires **jointly**:

- `tradeN ≥ 155`
- `utcDayClusters ≥ 24`

Trade N alone or cluster N alone is insufficient. Design-effect sensitivity
(ρ∈{0.1,0.2,0.3}, m̄≈16) is documented but does **not** replace the joint rule.

Rejected alternatives: IID-only SE; capture-session-only CRVE; HAC primary;
block-bootstrap primary (scaffold-only in-repo).

## Fees

Authoritative KXBTC15M schedule from Kalshi Trade API:

- `GET .../series/KXBTC15M` → `fee_type=quadratic`, `fee_multiplier=1`
- Maps to repository **standard** taker (`0.07×C×P×(1-P)`, ceil-to-cent)
- Empty `fee_changes` at seal time
- Schedule-change rule: **fail closed** — stop collection and require governed
  amendment if `fee_type` / `fee_multiplier` diverge from attestation

Not chosen for conservatism or hypothesis friendliness.

## Stopping (outcome-blind)

After each completed **accepted** capture:

1. Update blind trade count + UTC-day cluster coverage
2. If joint thresholds met → `ready-for-outcome-open`
3. Else if accepted hours ≥ **200** → `validation-underpowered`
4. Else → `continue-collection`

Failed/unhealthy segments go to excluded lineage and **do not** consume
accepted-hour budget. No P&L / target-hit peeking.

Segments: standard/max **480 minutes**; prefer distinct UTC days.

Planning hours from blind incidence ~2.06/h: trades ≈75h; UTC-day floor at
one 8h segment/day ≈192h → binding ≈192h (budget 200h).

## Consequences

| Verdict | nextAction |
| --- | --- |
| `validation-supported` | `eligible-for-fresh-holdout` |
| `validation-failed` | `stop-lineage` |
| `validation-underpowered` | stop / amend collection (not “promising”) |
| `validation-invalid` | integrity failure under predeclared rules |

No TRAIN. No threshold retuning. No HOLDOUT in this milestone.
August M16.0 incidence captures are excluded from confirmatory P&L.

## CLI

```bash
npm run research:m16-evidence-contract -- --evidence-contract-only
npm run research:m16-evidence-contract -- --cohort-plan-only
npm run research:m16-evidence-contract -- --outcome-open-status \
  --accepted-hours 0 --eligible-trades 0 --utc-day-clusters 0
```

Status mode inspects structural counts only — never economic outcomes.
