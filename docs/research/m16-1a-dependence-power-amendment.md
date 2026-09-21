# M16.1a — Dependence / power / collection amendment

## Why this amendment occurred

Before any M16 prospective validation capture or P&L open, a statistical audit
found that M16.1 mixed an **IID** power target (N=155) with **UTC-day clustered**
inference without aligning collection size to within-day dependence.

M16.2 collection was cancelled. No M16 validation P&L / target / stop / settlement
outcomes were opened. This amendment is prospective.

## Error in the original design

`IID baseline N = 155` is correct **only under independence**.

The gate `tradeN ≥ 155 ∧ G ≥ 24` does **not** restore ~80% power under
within-day correlation. Also, `24 × 8h ≈ 192h` treated 8h/day as if it were an
inferential requirement; it was only operational packing.

## What changed (statistics / collection only)

| Item | M16.1 (superseded) | M16.1a (authoritative) |
| --- | --- | --- |
| IID baseline | 155 (also used as required N) | **155 baseline only** |
| Required trade N | 155 | **268** = ceil(155 · DE) |
| Planning ICC | none sealed | **ρ = 0.10** prospective |
| Avg trades/day planning | ~16 (8h) | **~8.25** (4h × 2.06/h) |
| Estimator | vague “CRVE” | **CR2 + one-sided t_(G−1)** |
| Min UTC-day clusters G | 24 | **24** (diversity floor, not theorem) |
| Segment | 480m | **240m** fixed UTC window |
| Window | prefer distinct days | **14:00–18:00 UTC** fixed |
| Max accepted segments/day | informal | **1** |
| Accepted-hour budget | 200h | **140h** |

## What did **not** change

- Family identity / frozen strategy parameters
- H0 μ≤0 / H1 μ>0; α=0.05; power=0.80; MDE=+5¢; SD=25¢
- Fee authority (quadratic ×1 → standard taker)
- Mean fee-adjusted executable P&L as primary estimand
- Fresh-only validation role; August incidence excluded

## Why N=268

```
m = 2.0625339816796635 × 4 ≈ 8.250
DE = 1 + (m − 1) × 0.10 ≈ 1.725
requiredTradeN = ceil(155 × DE) = 268
```

ρ=0.10 is a prospective conservative planning assumption — **not** estimated from
M16 P&L. Sensitivity rows for ρ ∈ {0, 0.05, 0.10, 0.20, 0.30} are documentary only.

## Why G≥24

Prospective **small-cluster diversity floor**. It does **not** prove asymptotic
CRVE validity by itself; therefore primary inference is **CR2 with t_(G−1)**, not
CR0 + normal z.

## Why 4h/day and 14:00–18:00 UTC

Temporal diversification with lower within-day packing. Fixed clock chosen for
**operational regularity** (full 4h inside one UTC day), not profitability or
volatility cherry-picking. Segments must not cross UTC midnight. At most one
accepted normal segment per UTC day.

## Why 140h

268 / 2.06 ≈ 130h expected; **140h** is a fixed prospective ceiling with limited
slack. Do not extend after seeing P&L. If 140h expires first → `validation-underpowered`.

Expected burden ≈ **33 calendar days** at ~8.25 trades/day; trade N is expected
to bind before G.

## Inference (primary)

- Design matrix: intercept-only
- Variance: **CR2** cluster-robust (UTC day)
- Test: one-sided t, **df = G − 1**
- SUPPORT requires: collection thresholds met ∧ sample mean > 0 ∧ reject H0 at α=0.05

Implemented in `m16Cr2ClusterMean.ts` (synthetic fixtures only until M16.3).

### CR2 formula (intercept-only mean)

Let observations \(y_i\) in clusters \(g=1..G\), \(N=\sum n_g\), \(\bar y = N^{-1}\sum y_i\).

Cluster score with CR2 leverage correction on the constant span
(\(H_g\) eigenvalue \(n_g/N\)):

\[
\tilde u_g = \sqrt{\frac{N}{N-n_g}}\, n_g\,(\bar y_g - \bar y)
\]

\[
\widehat{\mathrm{Var}}_{\mathrm{CR2}}(\hat\mu) = \frac{1}{N^2}\sum_g \tilde u_g^2,\quad
\mathrm{SE}=\sqrt{\widehat{\mathrm{Var}}},\quad
t=\hat\mu/\mathrm{SE}
\]

One-sided p-value uses Student-\(t\) survival with \(\mathrm{df}=G-1\).
Fail closed if \(G<2\), any \(n_g=N\), zero variance, or nonfinite data.
No silent IID fallback. Do not call ordinary clustered sandwich “CR2.”

## Zero-signal vs failed captures

| Case | Accepted hours | Trade N | G |
| --- | --- | --- | --- |
| Healthy zero-signal day | **yes** (4h) | no | no |
| Failed/unhealthy | **0** | 0 | 0 |

Do not discard healthy zero-signal days to recapture for signals.

## Supersession

For future M16 validation / outcome-open, M16.1a identities **supersede** M16.1.
Old evidence/dependence/cohort identities alone **must not** authorize. N=155 is
not an authorizing threshold.

## CLI

```bash
npm run research:m16-evidence-contract -- --evidence-contract-only
npm run research:m16-evidence-contract -- --cohort-plan-only
npm run research:m16-evidence-contract -- --outcome-open-status
```
