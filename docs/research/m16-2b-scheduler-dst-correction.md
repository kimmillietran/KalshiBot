# M16.2b — Operational scheduler DST correction

## Problem

Before first accepted validation capture, launchd was configured with
`StartCalendarInterval Hour=18` plus child `EnvironmentVariables TZ=UTC`.

**Child TZ does not control launchd calendar triggers.** The Mac local clock
owns `StartCalendarInterval`. The first intended 18:00Z invocation did not fire
(`runs = 0`).

## Fix (operational only)

Dual local calendar triggers for California operators:

| Local Hour | PDT (UTC−7) | PST (UTC−8) |
| --- | --- | --- |
| 10 | 17:00Z → runner `too-early` | **18:00Z → launch window** |
| 11 | **18:00Z → launch window** | 19:00Z → runner `missed-window` |

Scientific interval unchanged:

`18:00:00Z → 22:00:00Z` (tolerance `17:55Z–18:05Z`)

The TypeScript runner remains the sole scientific authority. Nonmatching
invocations must not create, shift, or admit a capture.

Child `TZ=UTC` remains for the runner process clock only.

## Diagnostics

`--status` now includes `schedulerDiagnostics`:

- `loaded` — launchctl print succeeds
- `verifiedFired` — `runs > 0` (distinct from loaded)
- `launchctlRuns`
- `lastExitStatus`
- `wrapperLastInvocationIso`
- `triggerHoursLocal: [10, 11]`
- `scientificWindowUtc: 18:00-22:00Z`

## Unchanged scientific contract

- protocol `1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824`
- cohort `a2b86dd7c7fc3864ce48c860b10cfea053bdde04e09723a4f6ae87adca31dd63`
- N/G/CR2/140h/240m/strategy/fees

## Post-merge

Reinstall/reload launchd. Do **not** manually backfill a missed day. Leave
armed for the next 18:00Z window. Outcomes remain sealed.
