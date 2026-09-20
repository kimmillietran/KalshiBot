# M15.0 — KXBTC15M short-horizon taker cost-floor study v1

## Status

**Prospective design + implementation + synthetic tests only.**

Do **not** launch fresh capture or consume real M15 evidence until senior/exact-head
review of this definition passes.

## M14 closure (canonical)

```
M14 = CLOSED — VALIDATION FAILED — NO HOLDOUT
```

- `overallStatus = validation-failed`
- `nextAction = stop-lineage`
- No M14 HOLDOUT, subgroup rescue, spread-filter rescue, alternate W/X/H, or reversal.
- M15 must not consume M14 validation events or validation-role captures.

## Scientific question

For ordinary KXBTC15M quote states, what round-trip economic hurdle is imposed by:

1. crossing the top-of-book spread at entry;
2. crossing again at exit after a short horizon H ∈ {5s, 15s, 30s};
3. bound one-contract Kalshi schedule fees (standard taker)?

This is a **market-economics / feasibility** study. It is **not** a momentum,
directional-alpha, or strategy-optimization study.

## Study identity

`kalshi-kxbtc15m-taker-cost-floor-v1`

## Fee contract

Bound to repository authority (not invented):

- module: `src/lib/data/backtesting/costModel/computeKalshiScheduleFeeCents.ts`
- function: `computeKalshiScheduleFeeCents`
- role: `taker`
- schedule: `standard`
- quantity: `1`
- rounding: ceil-to-next-cent
- identity: content-addressed via `bindM15FeeContract().feeContractIdentity`

Momentum-family net-edge remains **unbound**; this bind is M15-study-scoped only.

If fee identity cannot be verified at runtime → fail closed
(`fee-contract identity mismatch`). Never emit a fee-free cost floor.

## Price representation

`legacy-no-leg` complement books:

- YES ask = `100 − NO best bid`
- NO ask = `100 − YES best bid`

Canonical round-trip: **YES taker**. Under complement identity, NO crossing
friction is mathematically redundant (same half-spreads); do not double-count.

## Sampling (ordinary quotes)

- Eligible KXBTC15M TOB quotes under canonical validity / stale-quote gates.
- Deterministic cadence: first eligible quote per market in each **60s** bucket
  (file/append order).
- **Not** conditioned on momentum, spreads, depth, imbalance, volatility, or outcomes.

## Independent unit

`marketTicker × UTC calendar day`

Report both raw sampled quote pairs and independent market-day N.

## Response matching

First eligible quote at `t+H` within `RESPONSE_MATCH_TOLERANCE_MS` (family constant).
Missing → unobservable (not zero cost; no carry-forward; no horizon substitution).

Ordering semantics: **JSONL file/append order (PR #94)**. Event-time regressions
do not abort.

## Primary estimand

For each H: median across independent market-days of the within-day median
**one-contract fee-inclusive YES taker round-trip hurdle** (cents).

Interpretation: minimum favorable midpoint move to break even before requiring
positive expected profit. **Not alpha.**

## Secondary estimands

- spread-only hurdle
- fee contribution
- p25 / p75 fee-inclusive
- share of market-days with median fee-inclusive ≤ 1¢ / ≤ 2¢ / ≤ 3¢
  (bins frozen prospectively)

## Prospective decision framework (H = 30s primary)

Using median fee-inclusive hurdle `m` across market-days:

| Decision | Rule |
| --- | --- |
| `short-horizon-taker-research-economically-plausible` | `m ≤ 1¢` |
| `short-horizon-taker-research-cost-constrained` | `1¢ < m ≤ 2¢` |
| `short-horizon-taker-research-economically-hostile` | `m > 2¢` |
| `insufficient-observability` | primary horizon lacks usable market-day medians |

Historical research effect scale reference: **2¢** (feasibility diagnostic only).

**Asymmetry:** low cost floor ≠ proof of signal; high cost floor is a strong reason
to stop pursuing tiny short-horizon taker signals.

## Proposed fresh capture (after review)

- Duration: **8 hours** (`480` minutes)
- Target: ≥ **24** independent market-day units
- Role: fresh post-definition-seal (or explicitly untouched non-M14-validation)
- No live orders; no BTC participation in estimands

## Contamination exclusions

- M14 validation events / captures (Segments 1–5, 7; failed Segment 6)
- M14 subgroup slices / alternate W/X/H
- HOLDOUT
- signed future returns / momentum conditioning
- mutable `latest` paths

Known M14 validation/excluded run IDs are hard-rejected by
`assertM15CaptureSetClean`.

## CLI

```bash
# Seal / emit prospective study definition only (safe default for M15.0 review)
npm run research:m15-taker-cost-floor -- --definition-only

# After review + fresh capture (explicit descriptors only):
# npm run research:m15-taker-cost-floor -- \
#   --capture <runId>|<captureRunDir>|<captureIdentityHash>
```

## Module

`src/lib/data/research/kalshiKxbtc15mTakerCostFloor/`
