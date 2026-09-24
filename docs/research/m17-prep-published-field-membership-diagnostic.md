# Offline published-field membership diagnostic (committed artifacts only)

**Role:** read-only diagnostic on PR #116 committed outputs.
**Not** a capture, fidelity-study execution, official-field selection, or collector change.
**Inputs:** `settlement-sample-mapping-summary.json` (`live.analysis.venueAlignments`) + `settlement-average-discrepancy-v3.json`.
**Conventions cited:** merged PR #118 semantics memo (trailing vs quarter-hour membership).
**Machine-readable twin:** `settlement-published-field-membership-diagnostic-v0.json`

Window: `KXBTC15M-26SEP240015-15`, close `2026-09-24T04:15:00Z`.

---

## Method

1. **Settlement growing-window differencing** (valid here): one fixed `windowStartTsMs = close−60s`, counts `1…60`, `windowEnd` advances `+1000ms` each step. For each step with Δcount = 1,

   \[
   x_n = n A_n - (n-1) A_{n-1}
   \]

   with a conservative half-ulp envelope from each published average’s decimal string (diagnostic uncertainty model, not a Kalshi rule).

2. **Trailing series:** every successive update slides start and end by `+1000ms` (no fixed-start growth). Successive trailing averages are **not** inverted as cumulative samples.

3. **Consistency check** against #118: at close, payload labels match `[close−60s, close)` for both fields, but documented membership differs (settlement includes close / excludes start; trailing excludes close / includes start).

---

## Supported (independent of tautologies)

| Finding | Evidence |
| --- | --- |
| Settlement behaves as a fixed-start second-by-second accumulation | 60 updates, counts 1…60, end `+1s` each step |
| Trailing behaves as a one-second sliding window | 118/118 transitions shift both endpoints `+1s` |
| Identical payload labels ≠ identical averages / membership | Same declared window, count 60: settlement `83817.61766667` vs trailing `83817.70733333` |
| Settlement cumulative averages are internally coherent | Reconstructed mean of implied \(x_1…x_{60}\) equals \(A_{60}\) exactly (within string arithmetic) |

These support the #118 documentation split (grow vs slide; label equality ≠ membership equality) **on this published series**.

---

## By construction (not independent evidence)

| Identity | Why it is not an extra constraint |
| --- | --- |
| Implied \(x_n\) from successive \(A_n\) | Definition of a cumulative mean |
| \(x_{60} - T_0^{\mathrm{peel}} = 60(A_s - A_t)\) after peeling \(T_0 = 60 A_t - \sum_{i=1}^{59} x_i\) | Algebra once \(x_1…x_{59}\) and \(A_s,A_t\) are fixed |
| Trailing at `[close−59s, close+1s)` raw-equals settlement at close | **Predicted** if both average the same underlying 1Hz series under #118 membership; observed equality (`83817.61766667`) is consistent with that reading but does **not** prove official expiration binding |

---

## Conditional / model-dependent

Under a pure boundary-swap reading (same 60-tick stream, membership differs only by start vs close tick):

- \(60(A_s - A_t) = -5.37999960\) as the implied close−start tick gap.
- Settlement-implied close tick \(x_{60} \approx 83818.44000041\) (± ~6e-7 under half-ulp model).
- That yields a reconstructed start tick \(\approx 83823.82000001\), which is **not** equal to \(x_1 = 83824.82000000\) (expected: \(x_1\) is the first *included* settlement tick, not the excluded start).

This is a coherent story, not a unique identification of the tick series.

---

## Contradicted

- Claim that **matching payload window labels imply the same sample set / same average** — contradicted by the dual count-60 values on this close.

## Not contradicted

- Documented settlement accumulation cadence and trailing slide.
- Shared-membership explanation of `trail(close+1s) == settlement(close)`.

---

## Still unidentifiable

- Which field (if either) is the official `expiration_value` rule (no selection performed; trailing’s diagnostic 2dp match remains exploratory only).
- The actual 1Hz tick list (not retained); whether implied \(x_n\) equal CFB 1Hz prints vs another second-selection from 5Hz.
- Kalshi’s normative rounding for `expiration_value`.
- Direct observation of the excluded start tick as a published field.

**Descriptive only:** official `83817.71`; diagnostic half-even 2dp matches trailing, not settlement — **not** used to select an official field.

---

## Bottom line

Committed published averages for this one close are **consistent with** #118’s grow-vs-slide membership story and **inconsistent with** treating identical payload labels as identical samples. The striking `trail(+1s) = settlement` equality and the peel/`60Δ` arithmetic are largely **consequences of that story or of cumulative-mean algebra**, not independent proofs. Official binding and the underlying 1Hz series remain **unidentifiable** from these artifacts alone.
