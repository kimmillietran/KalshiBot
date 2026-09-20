# M16.0 — Side-invariant exhaustion-reversal family v1

## Status

Prospective family seal + P&L-blind incidence/coverage census.

**Do NOT open economic outcomes** (target/stop/flatten/settlement P&L) until a
later governed milestone.

## Program context

| Lineage | Disposition |
| --- | --- |
| M13 TOB imbalance | stopped |
| M14 continuation | validation-failed / stop-lineage / no HOLDOUT |
| M15 cost-floor | ordinary fee-inclusive hurdle ≈5¢ → economically hostile for 1–2¢ taker effects |
| **M16** | side-invariant exhaustion reversal (new family; not M14 widen) |

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

## Eventual economics (frozen, not evaluated here)

- Entry: 1-contract candidate ask
- Target: bid `≥ 55`
- Stop: bid `< L`
- Flatten: last eligible bid ≤ close
- Settlement: `forwardSettlementJoin` fallback only; else `terminal-unobservable`
- Primary estimand: **mean** fee-adjusted executable P&L
- Kill: mean `≤ 0` at adequate N → stop family (no rescue grid)

## Fee contract

Bound: `computeKalshiScheduleFeeCents` **standard taker** qty=1 ceil.
No in-repo KXBTC15M→reduced-index map; reduced-index not auto-selected.

## Clustering / planning

- Trade unit: first confirmation per marketTicker
- Cluster unit: **capture-session**
- Target independent N: 96 (planning; primary mean 5¢ / SD 25¢)
- Max future capture budget: **60h**
- Feasible iff projected hours ≤ 60

## CLI

```bash
npm run research:m16-side-invariant-reversal -- --definition-only
npm run research:m16-side-invariant-reversal -- --incidence-plan-only
npm run research:m16-side-invariant-reversal -- --blind-incidence \
  --capture <runId>|<dir>|<hash>|m16-blind-incidence
```

## Module

`src/lib/data/research/kalshiKxbtc15mSideInvariantReversal/`
