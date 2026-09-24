# Settlement friction + label coverage — kalshi-kxbtc15m-settlement-friction-coverage-v0

Generated: 2026-09-24T00:28:16.372Z
Configuration identity: `9c0863ba5a96cc0c8451077230510e5c73eee8f817efdbad433f85f3ada9b356`
Manifest SHA-256: `325dac83b8b52721b0aa18339b3d0534ef9c5cb41b4eb53fa6355d47ae188557`
Code SHA: `58f052bf4f7b11d5512c005574e7975ac0bdfb4b`
Completion: **complete**

Descriptive taker friction and settlement-LABEL coverage only. Displayed-book scenarios are not realized fills or latency-adjusted live performance. Low costs are not an edge; high costs alone do not disprove every mechanism. BRTI-path coverage is not measured. No confirmatory reuse of SPENT dates; no alpha fitting; no P&L selection.

## Calendar

| Set | Count |
| --- | ---: |
| Eligible (authoritative 34) | 34 |
| Locally available | 34 |
| Successfully processed | 34 |
| Missing/rejected | 0 |

## Pooled entry friction (equal weight per retained sample)

| Metric | Value |
| --- | ---: |
| Retained samples | 47307 |
| Mean entry friction (¢) | 2.3849 |

## Round-trip friction by horizon (excludes mid drift)

| Horizon | Observable N | Unobservable N | Mean RT friction (¢) |
| --- | ---: | ---: | ---: |
| 5000ms | 12795 | 34512 | 4.3802 |
| 15000ms | 11996 | 35311 | 4.2833 |
| 30000ms | 11861 | 35446 | 4.3125 |

## Equal-day aggregate (mean of day means)

| Metric | Value |
| --- | ---: |
| Days with samples | 34 |
| Mean-of-day-mean entry (¢) | 2.3839 |

## Settlement-label coverage (ticker denominator = sampled markets)

| Metric | Coverage |
| --- | --- |
| Finalized result ∈ {yes,no} | 0.0% (0/3228) |
| Non-empty expiration_value | 0.0% (0/3228) |
| Valid numeric expiration_value | 0.0% (0/3228) |
| Joint finalized + non-empty expiration (v0) | 0.0% (0/3228) |
| Finite floor_strike | 0.0% (0/3228) |
| Parseable close_time | 0.0% (0/3228) |
| Parseable settlement_ts | 0.0% (0/3228) |
| Duplicate label tickers | 0 |
| Conflicting label tickers | 0 |

BRTI-path coverage: Not measured; historical BRTI paths and causal availability are not established.

## Exclusions (quote-gate reason counts)

```
{
  "missing-prices": 6463719,
  "crossed-book": 0,
  "locked-book": 1,
  "insufficient-size": 5656167,
  "stale-quote": 0,
  "missing-quote-age": 0,
  "unresolvable-mid": 0,
  "outside-session": 17,
  "structural-gap": 0
}
```

## Limitations

- Partial day coverage must not be read as all 34 days analyzed.
- Settlement labels do not establish BRTI settlement-state reconstructability.
- CryptoStruct single-clock streams use quoteAgeMs=0 by documented definition.
- Session close often derived from ticker HHMM (America/New_York) when expiry is null.
- No confirmatory SPENT reuse; descriptive coverage only.
- Operator M16-P launchctl bootout remains a separate operational follow-up.
- Official Kalshi settlement-label fields were not present in local CryptoStruct day zips; label coverage is therefore zero until a permitted local label source is admitted.

## Next concrete prerequisite

Admit a **permitted local Kalshi settlement-label store** for the 34 SPENT tickers
(result / expiration_value / floor_strike / close_time / settlement_ts) without
API purchase/download in this study — or authorize a separate governed label
backfill milestone. Settlement-**state** (BRTI path) remains blocked independently.
