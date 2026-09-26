# M17 — Next experiment queue after CF-v2 SPENT grid HTS (PR #134 / #135)

> **RESEARCH PLANNING + PAIRED MIRROR DIAGNOSTIC — NO NEW PURCHASES / CAPTURES / TRADES**
>
> Does not purchase data, start captures, open sealed M16-P outcomes, or trade.
> Does not freeze a strategy. M17 settlement-state remains paused.

| Field | Value |
| --- | --- |
| Memo id | `kalshi-kxbtc15m-m17-next-experiment-queue-v1` |
| Base | `origin/main` after PR #134 merge `87a67a65f58ba9862a488e4b3027be97a65d0edf` |
| Grid study (NO) | `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0` |
| Paired diagnostic (YES) | `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic-v0` |

---

## 1. Final disposition — PR #134 (NO grid)

| Item | Status |
| --- | --- |
| PR | [#134](https://github.com/kimmillietran/KalshiBot/pull/134) |
| State | **MERGED** 2026-09-26T01:57:55Z |
| Exact head | `c3e9e17610088dd62db25aa43b49d7b25b43c5d4` |
| Merge commit | `87a67a65f58ba9862a488e4b3027be97a65d0edf` |

### Economic result (unchanged; exploratory SPENT)

| Metric | Value |
| --- | ---: |
| N | 321 |
| G | 24 |
| Mean net P&L | **−8.6417¢**/contract |
| CR2 two-sided 95% CI | **[−12.2485, −5.034975]¢** (df = G−1 = 23) |
| Interpretation | `evidence-against-positive-mean` |

### Standing decisions

1. **Stop pursuing grid-entry CF-v2 NO fade** under the tested specification.
2. Result is **exploratory SPENT_VALIDATION**, simulated at observed `noAskCents`.
3. **Original continuous-first-crossing CF-v2 remains untested** — untested ≠ automatic next.
4. **M17 settlement-state entry remains paused**.

### Reproducibility (preserve)

```bash
npm run research:calibration-fade-v2-spent-grid-hts-exploratory
```

| Artifact | SHA-256 |
| --- | --- |
| Inputs: preentry-features | `c7bba7a5e2c3ee7b8f5386f770f993752eb3d4053a10ef5f97e6231264b5e0d7` |
| Inputs: settlement-labels | `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` |
| `selected-entries.jsonl` | `0597917bcb71a0c6623d133f10e18b435c59debb3a4c89da912f7d806d74db08` |
| `per-market-trades.jsonl` | `904e9f5d505ae7ec016dadeff475be368c04f36a7f2f1cd834860bfff9bcb906` |

---

## 2. Framing correction — paired YES mirror is not an “underconfidence” mechanism test

Buying YES throughout the frozen `[1/3, 2/3)` mid bucket does **not** test a claim that
the book is “underconfident.” Compression toward 50% does **not** imply the same trade
direction throughout that interval.

What this PR (#136) delivers — correcting the #135 planning framing — is an
**outcome-informed paired accounting / execution diagnostic** of the opposite
side of #134’s exact selected cohort:

- Same 321 market tickers, entry timestamps, source rows, settlements, UTC entry days
- One YES contract at observed `yesAskCents`, hold to the same official settlement
- One STANDARD taker entry fee; no exit fee
- Label: **simulated P&L at observed quotes**
- **Not** a new independent mechanism, **not** confirmation, **not** live fills

Prior exposure must record **both**:

1. PR #134 NO-grid attempt and negative result
2. This YES mirror selected **after** observing that result

A manifest frozen at diagnostic time is **not** a pre-outcome preregistration.

---

## 3. Prior constraints (do not weaken)

| Lineage | Disposition | Constraint |
| --- | --- | --- |
| CF-v2 continuous crossing | Untested | Untested ≠ automatic next |
| CF-v2 **grid** HTS NO fade | **Stop** (PR #134) | Do not retune vol/mid/time to rescue NO |
| YES paired mirror diagnostic | Run once on #134 cohort (this PR) | Do not reselect entries; do not auto-promote 0.85 |
| M16-ER / M16-P | Fail-to-reject / sealed | No sealed opens |
| M14 / lead-lag / TOB | Stop / deferred / TRAIN-stop | No resurrection |
| Settlement-state O3/O6 | Paused | No `avg_60s` gates |

All 34 days remain **SPENT_VALIDATION**.

---

## 4. Ranked candidates after this diagnostic

| Rank | Candidate | Status |
| --- | --- | --- |
| — | YES paired mirror on #134 cohort | **Executed in this PR** (accounting diagnostic) |
| — | Extreme-favorite HTS (`yesMid ≥ 0.85`) | **Not automatically promoted** by a disappointing mirror |
| — | Continuous-first-crossing CF-v2 NO fade | **Do not run now** (timing alone insufficient after #134) |

### Explicitly not queued by this memo

| Idea | Why excluded |
| --- | --- |
| Claim YES buys test “underconfidence” in the mid band | Unsupported mechanism claim; removed |
| Auto-promote `yesMid ≥ 0.85` if mirror is weak | Forbidden automatic promotion |
| Vol ablation / band retune / continuous crossing | Out of scope |
| Treat insufficient N/G as “evidence of negative economics” | Keep those statuses distinct |

---

## 5. Diagnostic specification (executed)

**Study ID:** `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic-v0`

| Element | Specification |
| --- | --- |
| Cohort | Exact #134 `selected-entries` / `per-market-trades` (hash-pinned) |
| Direction | Buy YES at observed `yesAskCents` |
| Exit | Same official binary settlement |
| Fee | One STANDARD taker fee on yes ask |
| Identity | `yesNet + noNet = -(ask−bid) − yesFee − noFee` (assert exact cents) |
| Inference | Recompute CR2 day-clustered two-sided 95% CI on YES nets (not negated NO CI) |
| Liquidity | Separate sensitivity: documented `yesAskSize ≥ 1` (not yesBidSize) |
| Interpretation | Inadequate N/G → insufficient evidence/data limitation; nonpositive → no support; positive but uncertain/below +1¢ bar → inconclusive; mean≥+1¢, G≥15, CI lower>0 → exploratory promise only |

### Result (simulated P&L at observed quotes)

| Metric | Value |
| --- | ---: |
| Paired N / G | **321 / 24** (0 unevaluable; same as #134) |
| NO mean (paired) | −8.6417¢ (reproduced) |
| YES mean / median net | **+3.0654¢** / +36¢ |
| YES CR2 95% CI | **[−0.5733, +6.7041]¢** |
| Accounting identity | **Holds** for all 321 paired rows |
| yesAskSize ≥ 1 | 315 / 321 (6 known-insufficient; 0 missing) |
| Ask-size≥1 sensitivity mean / CI | +2.9016¢ / [−1.0343, +6.8375]¢ |
| Interpretation | `inconclusive-or-below-material-bar` |
| Merits fresh-period test design | **No** |

```bash
npm run research:calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic
```

Artifacts:
`data/research-results/external-kalshi-data-audit/calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic/`

---

## 6. Interpretation rules (preserve)

- Confidence intervals do **not** remove outcome-informed selection bias.
- Insufficient evidence ≠ evidence of negative economics.
- A disappointing mirror does **not** authorize testing `yesMid ≥ 0.85` or other variants in the same PR.
- No threshold changes, no-vol ablation, continuous-crossing run, or additional strategy variant.

---

## 7. Independent next prep (not authorized by #134/#136 economics)

External BTC → delayed Kalshi repricing pilot preparation:
`docs/research/m17-external-btc-delayed-repricing-pilot.md` (**correction-v1** on PR #137).

- Does **not** reopen NO-grid fade, YES-mirror promotion, band/vol/side searches,
  or settlement-state.
- M12.8 already classified live-capture Coinbase→Kalshi **mid** response as
  `no-directional-response`; this pilot only addresses fee-aware delayed-taker
  economics on CryptoStruct ticks (Friday-only, fragile G≤5).
- Coinbase tick acquisition requires a **separate** authorization prompt (€5 quote).
- Delays are scenario assumptions — never auto-verified tradability.

## 8. Attestation

- PR #134 closeout preserved; NO outputs unmodified.
- Offline simulated P&L at observed quotes only for the paired YES diagnostic.
- No purchases, captures, vendor outreach, live trades, or sealed opens.
- Continuous-crossing and settlement-state not authorized.
- Cursor Automation review reused on resulting head; no duplicate LRM; leave PR open.
