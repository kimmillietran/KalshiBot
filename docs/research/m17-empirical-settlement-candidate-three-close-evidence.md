# M17 empirical settlement candidate — three-close evidence (research only)

**Role:** documentation of retained empirical observations across three closes.
**Not** vendor confirmation, live authorization, trading guidance, or a normative
settlement-contract proof.

**Kalshi support:** optional / non-blocking. Conclusions below rely on retained
observations only.

---

## Observed closes

| Close (UTC) | Evidence | Official `expiration_value` | `avg_60s_data` | `last_60s_windowed_average_15min` | Diagnostic 2dp match |
| --- | --- | --- | --- | --- | --- |
| `2026-09-24T04:15:00Z` | PR #116 committed published averages (raw WS **not** retained) | `83817.71` | `83817.70733333` | `83817.61766667` | trailing **yes** / settlement **no** |
| `2026-09-24T23:15:00Z` | one-close campaign **v2** retained raw + official HTTP | `84278.84` | `84278.84333333` | `84278.80883333` | trailing **yes** / settlement **no** |
| `2026-09-25T00:00:00Z` | one-close campaign **v3** retained raw + official HTTP; **60 verified 1Hz** source-ts samples | `84379.39` | `84379.38516667` | `84379.33416667` | trailing **yes** / settlement **no** |

### Field-identification correction (04:15Z)

Official `83817.71` matched **`avg_60s_data = 83817.70733333`** after diagnostic
half-even rounding to two decimals. It did **not** match
`last_60s_windowed_average_15min = 83817.61766667`.

### v3 specifics

- 60 verified CFB **1Hz** samples with source timestamps were available in each
  predeclared membership window after the stream-separation fix (PR #122).
- The reconstructed 1Hz arithmetic mean matched `avg_60s_data` under **exact
  decimal-string** equality (not IEEE-754 `Number ===`).
- Official expiration matched `avg_60s_data` under diagnostic half-even 2dp.
- The settlement-window field differed from official under the same diagnostic.
- Exact timestamp-selection membership and Kalshi’s production rounding rule
  remain **unresolved**.

---

## Standing conclusion

> **`avg_60s_data` is a strong empirical settlement candidate, not a
> vendor-confirmed official field.**

Research `SettlementEstimate` statuses:

- Post-close `expiration_value` → `authoritative` / `vendorConfirmed: true`
- Count-60 `avg_60s_data` with verified 1Hz mean agreement → `empirical-candidate`
  / `vendorConfirmed: false` / rounding `diagnostic-half-even`
- `last_60s_windowed_average_15min` → diagnostic only; **never** selected as the
  empirical settlement candidate

Do **not** connect this candidate to order placement, strategy gates, or P&L.
Do **not** claim the evidence proves the normative settlement contract.
