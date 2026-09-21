# M16.2 — Prospective validation capture automation

## Purpose

Automate **outcome-blind** collection of the M16 prospective validation cohort
under the sealed M16.1a + **M16.1b** contract. This milestone does **not** open
P&L, evaluate CR2, or produce a validation verdict.

## Authority (post M16.1b window amendment)

| Artifact | Identity |
| --- | --- |
| Family | `e98e6180b1edc468d544cbc41a624b8201535b2e9e58121d7669079fcf5cbce0` |
| Evidence v2 | `2a06820dab24aea4a253d886460bfc1267d7bd438d0bce817cbb999fd934beb7` |
| Dependence v2 | `df947284e5ee7678280dafd6ba5c4456281ca894b10b793a5a05f584d7d2630d` |
| Fee | `86f5f152308096fb365bb4ef41dca8beb488a302f038a915c8b228c0b645b44d` |
| Cohort v3 (M16.1b) | `a2b86dd7c7fc3864ce48c860b10cfea053bdde04e09723a4f6ae87adca31dd63` |
| Scientific protocol (M16.1b) | `1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824` |

Superseded before first capture (must not authorize):

| Artifact | Prior identity |
| --- | --- |
| Cohort v2 (14:00–18:00Z) | `294aa283c8b99269e7c5fd36282b826ffc6a601ee9d1b7b88af62b8bfc2e71f8` |
| Scientific protocol (14:00–18:00Z) | `453d5f2469642cdfc0d66989fe6fc40d6d9d59852266aaf2f9473cf4bd93bc59` |

See `docs/research/m16-1b-time-of-day-window-amendment.md`.

`scientificProtocolIdentity` hashes family/evidence/dependence/fee/cohort
identities + fixed window + thresholds + CR2 method label + segment minutes —
**not** every git SHA. `codeAuthoritySha` is recorded per run separately.

Collection readiness (joint):

- eligible trades ≥ **268**
- eligible UTC-day clusters ≥ **24**
- accepted-hour budget **140**

## Fixed daily window

Every collection day:

**18:00:00Z → 22:00:00Z** (exactly **240 minutes**)

- Derived from UTC only (DST/local time cannot shift the window).
- Launch tolerance: invoke from **17:55Z**; must begin by **18:05Z** else
  `missed-window`.
- Capture data interval remains 18:00–22:00Z — never silently shorten/shift.
- Max **one** normal accepted segment per UTC day.
- No cross-midnight accepted segments.
- **No backfill** of missed days. **No** shifting to 19:00–23:00Z.
- Population rationale: California daytime historical context (descriptive local
  ≈ 11:00–15:00 PDT / 10:00–14:00 PST). Not selected from P&L or hourly incidence.

## Lifecycle

```
preflight → reservation (immutable) → capture (canonical 240m)
  → health audit → blind structural scan → registry → stopping
```

CLI:

```bash
npm run research:m16-validation-collection -- --preflight
npm run research:m16-validation-collection -- --run-daily
npm run research:m16-validation-collection -- --recover
npm run research:m16-validation-collection -- --status
npm run research:m16-validation-collection -- --enable-scheduler
npm run research:m16-validation-collection -- --disable-scheduler
```

Live capture requires explicit env:

`M16_VALIDATION_ALLOW_LIVE_CAPTURE=1`

Without it, `--run-daily` may create a reservation / dry-run but will **not**
launch websockets.

**M16.2a** wires the canonical KXBTC15M forward-quote launcher, automatic health
audit + blind admit, crash recovery, and the launchd wrapper
(`scripts/shell/run-m16-validation-daily.sh`) with `caffeinate`. See
`docs/research/m16-2a-wire-validation-capture.md`.

On macOS, the wrapper uses `caffeinate` so idle sleep does not interrupt the
4h window (operational only — not scientific). It does **not** boot a powered-off
machine and does **not** authorize a missed late wake.

## Zero-signal vs failed

| Case | Accepted hours | Trade N | G |
| --- | --- | --- | --- |
| Healthy zero-signal 4h | **+4** | 0 | 0 |
| Failed / unhealthy | **0** | 0 | 0 |
| Missed scheduler day | **0** | 0 | 0 |

Healthy quiet days **must not** be discarded to chase incidence.

## Stopping

After each accepted segment:

1. If trades≥268 **and** G≥24 → `ready-for-outcome-open`
2. Else if accepted hours ≥140 → `validation-underpowered`
3. Else → `continue-collection`

**READY does not open outcomes.** Automation stops and prints:

`M16 COLLECTION COMPLETE — OUTCOMES STILL SEALED`

M16.3 is required for governed outcome-open / CR2.

Expected burden ≈ **33 calendar days** at ~8.25 trades/4h day — not guaranteed.

## Scheduler

`--enable-scheduler` writes a launchd plist template with `TZ=UTC` and
`StartCalendarInterval` Hour=18 Minute=0, invoking
`scripts/shell/run-m16-validation-daily.sh` (env source + caffeinate + live gate).
No machine home paths or secrets are committed.
`--install-scheduler` performs `launchctl bootstrap` with an absolute REPO_ROOT.
Installation remains operator-driven on this machine after merge.

## Safety

- No P&L / target / stop / settlement inspection
- No live orders
- No TRAIN / HOLDOUT contamination
- Process lock prevents overlapping runners
- Crash recovery resumes from immutable attempt artifacts
- Unrelated git SHA drift allowed if scientific protocol identity unchanged;
  semantic protocol changes fail closed

## Artifacts

Default directory: `data/research-results/m16-validation-collection/`

- `registry.json` — append-only cohort
- `attempts.json` — crash-recovery lineage
- `progress.json` — blind progress snapshot
- `scheduler/` — local enable/disable state + plist template
