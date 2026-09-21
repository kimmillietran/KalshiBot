# M16.2a — Wire + arm prospective validation capture

## Purpose

Operational wiring only. Makes the sealed M16.1b / M16.2 collection automation
actually execute the canonical live capture, health-audit, blind-admit, recover,
and install/enable the local macOS scheduler.

**No scientific contract changes.**

## Authority

| Artifact | Identity |
| --- | --- |
| main (M16.1b) | `7e1a80966079117451eb7df05009325c5fbcca7a` |
| Family | `e98e6180b1edc468d544cbc41a624b8201535b2e9e58121d7669079fcf5cbce0` |
| Evidence | `2a06820dab24aea4a253d886460bfc1267d7bd438d0bce817cbb999fd934beb7` |
| Dependence | `df947284e5ee7678280dafd6ba5c4456281ca894b10b793a5a05f584d7d2630d` |
| Fee | `86f5f152308096fb365bb4ef41dca8beb488a302f038a915c8b228c0b645b44d` |
| Cohort | `a2b86dd7c7fc3864ce48c860b10cfea053bdde04e09723a4f6ae87adca31dd63` |
| Scientific protocol | `1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824` |

## Final window

`18:00:00Z → 22:00:00Z` (240m). Launch tolerance `17:55Z–18:05Z`.

## Operational wiring

1. Env gate: `M16_VALIDATION_ALLOW_LIVE_CAPTURE=1` required for live websockets.
2. Canonical launcher: `launchM16CanonicalForwardQuoteCapture` →
   `runForwardQuoteCapture` with KXBTC15M canonical profile, 240m, role stamped
   as `m16-prospective-validation` at admit time.
3. Reservation persisted **before** launcher invocation.
4. After capture: research health audit → blind structural incidence → registry
   admit (or permanent exclude on unhealthy).
5. Healthy zero-signal: +4h / +0 trades / +0 G.
6. Failed/unhealthy: +0h; no shifted window; no backfill.
7. `--recover` resumes health/blind/registry idempotently; missed sealed window
   after reservation-only → missed-window lineage.

## Scheduler

- Label: `com.kalshibot.m16-validation-collection`
- Wrapper: `scripts/shell/run-m16-validation-daily.sh`
  - sources `/Users/builder/Desktop/KalshiBot/load-kalshi-env.sh` (or repo
    `load-kalshi-env.sh`)
  - exports `M16_VALIDATION_ALLOW_LIVE_CAPTURE=1`
  - wraps with `/usr/bin/caffeinate -dims`
  - never embeds secrets in the plist
- Plist: `TZ=UTC`, Hour=18, Minute=0
- Install: `npm run research:m16-validation-collection -- --install-scheduler`

## Sleep handling

`caffeinate` prevents idle sleep **once the job is running**. It does not boot a
powered-off machine and does not authorize a late/shifted window.

## Outcome blindness

No P&L / target / stop / settlement / win-rate / ICC in the automation path.

## Real capture status

No real validation capture is performed during PR development. First live day
only after merge + install + successful preflight inside launch tolerance.
