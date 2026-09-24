# One-close settlement-fidelity campaign (prep)

Campaign id: `kalshi-kxbtc15m-one-close-settlement-fidelity-v0`

Scope: **exactly one** quarter-hour close (not the eight-close #119 campaign).
Prior campaign ledgers are untouched.

## 2026-09-24T22:30:00Z target

Frozen at system clock `2026-09-24T22:24:03Z`. **Not captured.**

Statuses: capture `not-attempted` / `refused-readiness`; official `not-attempted`;
retention `blocked-prerequisite`.

Blocker: independently recoverable archive unavailable (no Time Machine destination,
no external volume). Same-disk secondary directories are disallowed. See
`one-close-22m30z-skip-disposition.json`.

## Runner

```bash
npm run research:kalshi-one-close-settlement-fidelity
# Live (only if retention-ready on distinct device + explicit auth):
# KALSHI_FIDELITY_ARCHIVE_ROOT=/Volumes/External/... \
#   npm run research:kalshi-one-close-settlement-fidelity -- --authorize-live --close-utc 2026-09-24T22:30:00.000Z
```

Default refuses market-data requests without `--authorize-live` and distinct-device
retention readiness.
