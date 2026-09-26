# Repair-v2 corrected five-day results

**Lead answer (primary delay 1000 ms, all five Fridays):** completed-trade total **−4834¢** (mean **−3.96¢**/completed); all-entry terminal-payout envelopes **[−7733¢, −3033¢]** (means **[−6.09, −2.39]**); last-bid MTM scenario total **−73¢** (unresolved only). Status: `incomplete-unresolved-exits`. Timing alignment **unverified**. Friday-only sample — not weekday-representative.

## Process

- Producer exit: **0** (captured)
- Monitor: `SUCCESS` / `empirical_valid=1`
- Code SHA: `9d8e067`
- Contract metadata: `ticker-hhmm-america-new-york-close-v1`
- Attempt-3: Producer exit status unknown/not captured; artifacts validated offline (superseded).

## Per-day funnel (primary 1000 ms)

| Day | Events | Entered | Completed | Unresolved | Completed mean ¢ |
|-----|--------|---------|-----------|------------|------------------|
| 2026-08-14 | 57 | 51 | 48 | 3 | −5.19 |
| 2026-08-21 | 872 | 561 | 540 | 21 | −3.98 |
| 2026-08-28 | 330 | 235 | 226 | 9 | −4.15 |
| 2026-09-04 | 250 | 197 | 191 | 6 | −3.96 |
| 2026-09-11 | 323 | 225 | 217 | 8 | −3.42 |

08-14/08-21 previously showed entered=0 due to null header expiry (pipeline block), not legitimate zero-opportunity days. Quote caches were intact; only contract sidecars were rebuilt.

## All declared delays

| Delay | Entered | Completed | Unresolved | Completed total ¢ | Envelope floor/ceiling total ¢ | Claim |
|-------|---------|-----------|------------|-------------------|--------------------------------|-------|
| 250 | 1270 | 1215 | 55 | −4839 | −7991 / −2491 | diagnostic-only |
| 1000 (primary) | 1269 | 1222 | 47 | −4834 | −7733 / −3033 | scenario-assumption-unverified |
| 3000 | 1244 | 1196 | 48 | −5108 | −8016 / −3216 | scenario-assumption-unverified |

## Three-day cohort envelope check

Prior partial cohort (08-28/09-04/09-11) optimistic combination recomputed exactly: completed −2437 + unresolved ceilings +1047 = **−1390¢** (matches prior −2437+2300−1253 approximation).

## Stop / continue

**Stop** further work on this frozen specification (thresholds/delays/fees/strategy unchanged). All three delays show negative completed means and non-positive all-entry envelope ceilings. Do not promote delays; do not expand weekday coverage from this Friday-only sample; timing alignment remains unverified.
