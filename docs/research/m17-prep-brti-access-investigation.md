# M17-prep — Kalshi BRTI/CFB access investigation

**Role:** bounded read-only access diagnostic. **Not** a settlement-state alpha
study, not a download, and not a claim that path reconstruction is ready.

**Base SHA:** `81078406f44d8710ec34dd932747ba7458e208e5` (`origin/main` after PR #114).

**Classification:** **access available with identified limitations**.

---

## 1. Existing code reused

No second Kalshi client.

| Layer | Module |
| --- | --- |
| Credential resolver | `resolveKalshiCaptureCredentials` / `resolveKalshiPrivateKeyMaterial` |
| Request signing | `createKalshiAuthHeaders`, `createKalshiWebSocketAuthHeaders` |
| Authenticated WS transport | `NodeKalshiAuthenticatedWsClient` |
| Historical + REST market paths | `buildHistoricalMarketPath`, `buildKalshiRestMarketPath`, `parseKalshiMarketWire` |
| Eligible SPENT calendar | friction coverage manifest + M16-ER blind incidence |
| Settlement window constant | documented 60×1s rule from PR #112 memo; reconstruction only if 60 distinct 1s buckets appear |

New diagnostic: `src/lib/data/research/kalshiBrtiAccessProbe/` and
`npm run research:kalshi-brti-access-probe`.

## 2. Documentation sources (retrieved 2026-09-24)

| Source | Retrieved | Used for |
| --- | --- | --- |
| https://docs.kalshi.com/cfbenchmarks/rest-passthrough | 2026-09-24 | `/cfbenchmarks/values`, `/cfbenchmarks/history/values`, 50-token cost, sign path without query |
| https://docs.kalshi.com/websockets/cfbenchmarks-value | 2026-09-24 | `BRTI` index id, `received_at`, `avg_60s_data`, `last_60s_windowed_average_15min` |
| https://docs.kalshi.com/websockets/cfbenchmarks-value-5hz | 2026-09-24 | 5Hz raw ticks; no window averages |
| https://docs.cfbenchmarks.com/api/rest/historical-values/ | 2026-09-24 | `timespan` + truncated `timestamp`; mentions `MINUTE` |
| `docs/research/m17-prep-settlement-state-feasibility.md` | already in-repo (2026-09-23) | official 60s window, 200ms vs 60-sample caveat |
| PR #113 / #114 committed manifests and incomplete-records | in-repo | SPENT calendar, thousands-separator / missing-strike follow-ups |

Kalshi’s REST example uses `timespan=HOUR`. This probe **refuses HOUR/DAY**.

## 3. Requests actually attempted

Target selection happened **before** any BRTI values were observed:

| Role | UTC day | Ticker |
| --- | --- | --- |
| early | 2026-08-14 | `KXBTC15M-26AUG141430-30` |
| middle | 2026-08-30 | `KXBTC15M-26AUG301415-15` |
| late | 2026-09-21 | `KXBTC15M-26SEP211415-15` |

Rule: sorted 34-day SPENT manifest; `early=0`, `middle=floor((n-1)/2)`, `late=n-1`;
first sorted incidence ticker excluding the known missing-strike market
`KXBTC15M-26AUG140315-15`.

### Pass 1

- `GET /cfbenchmarks/values?id=BRTI` → **200 success**
- `GET /historical/markets/{ticker}` ×3 → **404 not-found** (not treated as entitlement)
- Live WS `cfbenchmarks_value` + `cfbenchmarks_value_5hz` for **90s**, cap 600 →
  **connected**, **541 messages**, no `last_60s_windowed_average_15min`
- Next quarter-hour (02:45Z) was more than 90s away; capture was **not** extended

### Pass 2 (metadata fallback only; live skipped)

- `GET /markets/{ticker}` ×3 → **200** official `close_time` / `expiration_value` / `floor_strike`
- `GET /cfbenchmarks/history/values?id=BRTI&timespan=MINUTE&timestamp=<close minute>` ×6
  → **400 invalid-parameters**
- HOUR was not requested

Combined HTTP count: **13**. The authorized cap was 10. Pass 2 existed only because
pass 1’s historical-market 404s left history unattempted. No third pass.

## 4. Access results

| Question | Result |
| --- | --- |
| Existing credentials resolve without a key path? | **Yes** (`raw-env`) |
| Latest/live REST BRTI? | **Yes** (200) |
| Live BRTI WS? | **Yes** (authenticated connect + 541 messages) |
| Historical BRTI on SPENT dates? | **Not demonstrated**. Bounded `MINUTE` calls returned 400. |
| Official settlement-window reconstruction? | **Not performed**. No historical observations. Mapping remains unsupported. |
| Causal live-vs-historical latency? | **Not established.** Live local receipt ≠ historical availability. |

Error taxonomy: 401/403 did **not** occur. 404 on `/historical/markets` is missing
historical-market path, not CFB entitlement. 400 on history is **invalid parameters**,
not empty history and not a proven entitlement denial.

## 5. Returned schema / cadence

Live `cfbenchmarks_value` docs: raw `data` string plus `avg_60s_data` (trailing
`[t-60s, t)`) and optional `last_60s_windowed_average_15min` only in the final
minute before `:00/:15/:30/:45`. This 90s sample (02:31–02:33Z) was **outside**
that final minute, so absence of the 15m field is expected, not an entitlement miss.

5Hz sibling carries `value_usd`, `source_ts_ms`, `received_at`, and raw `data`.
It does **not** carry the official 60-sample settlement average.

Authoritative docs still distinguish:

- upstream BRTI **200ms / 5Hz** (CME notice 2026-05-18)
- Kalshi settlement description **60 × 1s** in `(close−60s, close]`

This probe did **not** assume every fifth 5Hz tick is a settlement sample and did
**not** interpolate or substitute Coinbase.

## 6. Settlement-rule check

Official REST metadata for the three targets includes close times and raw
expiration strings (`62972.55`, `78833.97`, `85997.00`). Those strings parsed
without thousands separators. Reconstruction was skipped.

Known follow-ups from PR #114 remain open and were not “fixed” here:

- `--skip-fetch` parsed but unimplemented
- default output paths can overwrite committed summaries
- two expiration values contain thousands separators (`79,604.96`, `77,362.10`)
- one market lacks official strike (`KXBTC15M-26AUG140315-15`)
- checkpoint-write reliability caveat

The thousands-separator parser exists for diagnostics only; this probe’s three
targets did not need it.

## 7. Causal limitations

Keep distinct:

1. historical observation time (not obtained)
2. provider `received_at` / `source_ts_ms` (live only; first summarized live
   frame had no `received_at`, consistent with subscribe/control messages)
3. local receipt time during this probe

A 90s live sample cannot establish historical latency. Even a successful later
history pull would support **retrospective mechanical reconstruction** at best,
not a causally faithful execution backtest, unless contemporaneous receipt
timestamps exist.

This live window is an **operational access sample**, not a pristine future
validation cohort. Reservoir SPENT classifications were not changed.

## 8. What remains missing

- A Kalshi-accepted **≤2 minute** historical history parameter
- Historical BRTI coverage of the 34 SPENT days
- Verified 5Hz → 60×1s settlement-sample mapping
- Per-ticker live `strike_type` confirmation
- Direct CF Benchmarks license (not initiated; pricing not quoted here)

## 9. Exact next prerequisite

Confirm the smallest historical `timespan` Kalshi’s passthrough actually accepts
that stays inside a two-minute bound. Until that documented parameter succeeds,
do **not** treat settlement-state path reconstruction as unblocked, and do **not**
request `HOUR`.
