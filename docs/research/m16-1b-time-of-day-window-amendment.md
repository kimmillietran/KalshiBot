# M16.1b — Prospective time-of-day window amendment

## Why amendment occurred

Before first prospective M16 validation capture. No accepted validation segment
existed. No M16 validation P&L, target/stop, or settlement outcome was opened.
This amendment remains fully prospective.

## Historical prior

The user's historical discretionary prior is California waking / daytime trading,
not 24/7 operation.

## Why old window changed

The prior sealed window **14:00–18:00 UTC** was chosen only for operational
regularity (full 4h inside one UTC date). It corresponds to an unnecessarily early
California morning and is a poor match to the historically relevant daytime
population.

## New window

**18:00:00Z → 22:00:00Z** (exactly **240 minutes**)

- Launch tolerance: **17:55Z–18:05Z**
- Accepted capture interval remains exactly 18:00–22:00Z
- Missed day remains missed; no backfill; no silent shift to 19:00–23:00Z
- At most one normal accepted segment per UTC day

Approximate California local display (descriptive only):

- PDT ≈ 11:00–15:00
- PST ≈ 10:00–14:00

## Claim scope

Target population:

**KXBTC15M markets observed during the sealed 18:00–22:00 UTC daily validation
window, representing California late-morning / afternoon discretionary trading
context.**

Valid eventual language remains narrow, e.g.:

> Under the frozen M16 rule, mean fee-adjusted executable P&L was supported/failed
> during the sealed 18:00–22:00 UTC validation window.

Does **not** claim support for KXBTC15M 24/7, Asia session, Europe session, or
every US hour.

## DST

Scientific population is the **fixed UTC** interval 18:00–22:00Z.
No seasonal UTC shifts. California local clock may move by one hour with DST —
intentional and prospectively documented. Scheduler remains `TZ=UTC`, Hour=18.

## What did not change

- Family / state machine / thresholds / target / stop / complement-mid /
  side invariance / minimum remaining time
- Fee contract
- H0 / H1 / α=.05 / power=.80 / MDE=+5¢ / planning SD=25¢
- IID baseline=155 / planning ρ=.10 / requiredTradeN=268 / G≥24
- CR2 + one-sided t_(G−1)
- 240-minute duration / 140 accepted-hour cap
- One normal accepted segment per UTC day / healthy zero-signal semantics
- Evidence v2 and dependence v2 identities

## Identity supersession

| Artifact | Prior (14:00–18:00Z) | New (18:00–22:00Z) |
| --- | --- | --- |
| Family | `e98e6180…cf5cbce0` (unchanged) | same |
| Evidence v2 | `2a06820d…934beb7` (unchanged) | same |
| Dependence v2 | `df947284…d2630d` (unchanged) | same |
| Fee | `86f5f152…45b44d` (unchanged) | same |
| Cohort | `294aa283c8b99269e7c5fd36282b826ffc6a601ee9d1b7b88af62b8bfc2e71f8` | `a2b86dd7c7fc3864ce48c860b10cfea053bdde04e09723a4f6ae87adca31dd63` |
| Scientific protocol | `453d5f2469642cdfc0d66989fe6fc40d6d9d59852266aaf2f9473cf4bd93bc59` | `1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824` |

Reason for supersession: unused 14:00–18:00Z cohort/window never accepted a
prospective validation capture; resealed to California daytime population before
collection began. Old protocol identity **must not** authorize future collection.

## Local empty registry note

A dry-run empty registry/progress under the old protocol may exist under
`data/research-results/m16-validation-collection/` (gitignored). It has
**0 accepted**, **0 reservations consumed by capture**, `outcomesOpened=false`.
It is **superseded / non-authoritative** under M16.1b — do not admit it into the
amended cohort. Fresh collection must bind the new cohort + protocol identities.

## Outcome status

- Captures accepted: **0**
- Accepted hours: **0**
- P&L opened: **no**
- Target/stop opened: **no**

## Selection hygiene

The new window was **not** chosen from:

- observed M16 profitability
- per-hour signal / P&L optimization
- August blind incidence by hour

It was selected from historical-user California daytime context, fixed prospective
population definition, and operational reliability (still a single fixed 4h UTC
block inside one UTC date).
