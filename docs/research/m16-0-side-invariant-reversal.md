# M16.0 — Side-invariant exhaustion-reversal family v1

## Status

**M16.0** = prospective family seal + P&L-blind incidence/coverage characterization
**only**.

**M16.1** (separate milestone, required before any economic outcome-open) =
confirmatory statistical evidence contract + dependence/inference plan +
authoritative KXBTC15M fee binding + prospective outcome cohort.

**Do NOT open economic outcomes** (target/stop/flatten/settlement P&L) from this
milestone. Outcome-open is hard-blocked while evidence/dependence/fee remain
unsealed.

## Program context

| Lineage | Disposition |
| --- | --- |
| M13 TOB imbalance | stopped |
| M14 continuation | validation-failed / stop-lineage / no HOLDOUT |
| M15 cost-floor | ordinary fee-inclusive hurdle ≈5¢ → economically hostile for 1–2¢ taker effects |
| **M16.0** | side-invariant exhaustion reversal family seal + blind incidence |
| **M16.1** | evidence contract / dependence / fee (not this PR) |

## Family ID

`kalshi-kxbtc15m-side-invariant-exhaustion-reversal-v1`

## Historical prior vs researcher invention

**Prior (user):** side-invariant; depressed ~30–40 setup region ≠ entry; continuing
lows bad; failure to extend + rebound structure mattered; willing to miss bottom;
~55 enough to monetize; impatience motivated automation.

**Invention (researcher):** complement-mid **proxy**; exact `>40→≤40` cross;
`L<30` abort; 1¢ off-low / pullback; `mid > H` confirm; 60s gate; target bid ≥55;
structural stop bid `< L`; terminal flatten; mean fee-adjusted P&L primary.

## Fidelity limitation

Canonical capture has **no** first-class UI last-price series. M16 tests a
**complement-midpoint reverse proxy**, not the exact discretionary UI strategy.
No synthetic last-price is fabricated. No BTC / size-imbalance predictors.

## State machine (causal, PR #94 file order)

1. Observe mid `>40`, then `≤40` (down-cross) → candidate side
2. `L =` running min (strict decreases only)
3. If `L < 30` before confirm → abort
4. Off-low: mid `≥ L+1`
5. `H =` max since latest new low after off-low
6. Pullback: mid `≤ H−1` and mid `≥ L`
7. Confirm: first mid `> H` (equality ≠ confirm; may be `>40`)
8. Gate: remaining time `≥ 60s`

One first confirmation per `marketTicker`. YES/NO are complement-deduped.

## Eventual economics (conceptual; not evaluated in M16.0)

- Entry: 1-contract candidate ask
- Target: bid `≥ 55`
- Stop: bid `< L`
- Flatten: last eligible bid ≤ close
- Settlement: `forwardSettlementJoin` fallback only; else `terminal-unobservable`
- Primary estimand: **mean** fee-adjusted executable P&L
- Scientific null / non-edge: mean `≤ 0`
- Confirmatory decision procedure: **UNSEALED — M16.1 required** (no “adequate N”)

## Fee contract (M16.0)

Status: `fee-contract-unresolved-for-outcome-open`.

Absence of an in-repo KXBTC15M→reduced-index map does **not** prove standard
taker applies. Provisional standard-taker helpers exist for synthetic utility
tests only and are **not** scientific fee authority. M16.1 must bind the schedule
that actually applies to KXBTC15M.

## Dependence / sample size (M16.0)

- Confirmatory evidence contract: `unsealed-for-outcome-open`
- Dependence inference plan: `unsealed-for-outcome-open`
- No sealed confirmatory N (including no N=96 authority)
- Descriptive coverage may report capture-session count and UTC-day count;
  these are **not** sealed inferential cluster units

## Blind incidence disposition

`incidence-characterized` when a positive time-gate-eligible rate is observed.
This does **not** imply confirmatory adequacy or profitability-testing feasibility.

Counter units:

- `*SideEventCount` — YES/NO machine events (both sides stepped)
- `reversalConfirmedEntryCount` — structural confirmations (includes time-gate rejects)
- `timeGateEligibleCount` / `usableFutureAnalysisEntryCount` — eligible incidence

## CLI

```bash
npm run research:m16-side-invariant-reversal -- --definition-only
npm run research:m16-side-invariant-reversal -- --incidence-plan-only
npm run research:m16-side-invariant-reversal -- --blind-incidence \
  --capture <runId>|<dir>|<hash>|m16-blind-incidence
```

## Module

`src/lib/data/research/kalshiKxbtc15mSideInvariantReversal/`
