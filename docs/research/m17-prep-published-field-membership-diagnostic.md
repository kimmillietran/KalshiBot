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

## Still unidentifiable / carefully stated empirical candidates

- Exact 1 Hz sample-selection rule and Kalshi’s normative rounding for
  `expiration_value` remain **unproven**.
- The actual 1Hz tick list was **not retained** for the 04:15Z offline window;
  implied \(x_n\) cannot be independently replayed from raw CFB prints.
- Direct observation of the excluded start tick as a published field is absent.

**Empirical candidate (not vendor-confirmed):** across three observed closes
(04:15Z committed; 23:15Z v2 retained; 00:00Z v3 retained with 60 verified 1Hz
samples), official `expiration_value` matched `avg_60s_data` after diagnostic
half-even rounding to two decimals, and did **not** match
`last_60s_windowed_average_15min` under the same diagnostic. On v3, the
reconstructed 1Hz mean matched `avg_60s_data` under exact decimal equality.
That makes `avg_60s_data` a **strong empirical candidate** for the official
settlement average on the observed closes — **not** a confirmed binding, and
**not** proof of the exact 1 Hz selection or official rounding rule. Kalshi
support is non-blocking; these conclusions rely on retained empirical
observations only. Do **not** treat this as field selection for trading or
strategy gates.

**Descriptive numbers (04:15Z):** official `83817.71`; diagnostic half-even 2dp
matches trailing `83817.70733333`, not settlement `83817.61766667`.

See also: `docs/research/m17-empirical-settlement-candidate-three-close-evidence.md`.

---

## Bottom line

Committed published averages for this one close are **consistent with** #118’s grow-vs-slide membership story and **inconsistent with** treating identical payload labels as identical samples. The striking `trail(+1s) = settlement` equality and the peel/`60Δ` arithmetic are largely **consequences of that story or of cumulative-mean algebra**, not independent proofs. Official binding remains **vendor-unconfirmed**; `avg_60s_data` is only a strong empirical candidate from observed diagnostic-rounded agreement with `expiration_value` on the retained closes, not a selected official field and not a proven 1 Hz / rounding rule.
