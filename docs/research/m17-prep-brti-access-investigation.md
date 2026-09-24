# M17-prep — Kalshi BRTI/CFB access investigation

**Role:** bounded read-only access diagnostic. **Not** a settlement-state alpha
study, not a download, and not a claim that path reconstruction is ready.

**Base SHA:** `81078406f44d8710ec34dd932747ba7458e208e5` (`origin/main` after PR #114).

**Classification:** **access available with identified limitations**.

---

## 0. Follow-up campaign (v1)

New isolated outputs:
`data/research-results/external-kalshi-data-audit/m17-prep-brti-access-probe-v1/`.
Prior v0 artifacts are preserved.

| Campaign | Limit | Consumed | Status |
| --- | --- | --- | --- |
| `kalshi-kxbtc15m-brti-access-probe-v0` | 10 | **13** | Sealed. Overrun preserved. No further v0 requests. |
| `kalshi-kxbtc15m-brti-access-probe-v1` | 10 | **2** | History HOUR 200 + one official-metadata 200 |

Budget repair: reservations persist to `http-budget-ledger.json` before dispatch;
retries and failures consume slots; a restart cannot reset the campaign; missing,
corrupt, or mismatched state fails closed; the ledger never stores credentials.

Tests: `campaignBudget.test.ts` + `kalshiBrtiAccessProbe.test.ts` (20).

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
| Settlement window | documented `(close−60s, close]` 60×1s rule; **bucket count is not treated as official sample mapping** |

New diagnostic: `src/lib/data/research/kalshiBrtiAccessProbe/` and
`npm run research:kalshi-brti-access-probe -- --follow-up`.

## 2. Documentation sources (retrieved 2026-09-24)

| Source | Retrieved | Used for |
| --- | --- | --- |
| https://docs.kalshi.com/cfbenchmarks/rest-passthrough | 2026-09-24 | `/cfbenchmarks/values`, `/cfbenchmarks/history/values`, Kalshi worked example `timespan=HOUR` |
| https://docs.kalshi.com/websockets/cfbenchmarks-value | 2026-09-24 | `BRTI`, `received_at`, `avg_60s_data`, `last_60s_windowed_average_15min` |
| https://docs.kalshi.com/websockets/cfbenchmarks-value-5hz | 2026-09-24 | 5Hz raw ticks; no window averages |
| https://docs.cfbenchmarks.com/api/rest/historical-values/ | 2026-09-24 | range = `timespan` + truncated `timestamp`; tick-level; STREAM_HISTORICAL_VALUES; up to 15-minute recency lag |
| `docs/research/m17-prep-settlement-state-feasibility.md` | in-repo (2026-09-23) | official 60s window, 200ms vs 60-sample caveat |

Documented historical semantics used for v1:

- accepted Kalshi example timespan: **HOUR**
- previously rejected: **MINUTE** (v0, 400 invalid-parameters)
- forbidden: **DAY**
- timestamp must be truncated to the timespan granularity
- timespan is a fixed lookback/duration of tick-level values, not an OHLC bar
- no documented start/end bounds or pagination cursor for one window
- a request can target a historical hour that contains a settlement minute

v0 refused HOUR. v1 was newly authorized to request **one hour** for **one** SPENT target.

## 3. v0 requests (preserved; 13/10 overrun)

Target selection happened **before** any BRTI values were observed:

| Role | UTC day | Ticker |
| --- | --- | --- |
| early | 2026-08-14 | `KXBTC15M-26AUG141430-30` |
| middle | 2026-08-30 | `KXBTC15M-26AUG301415-15` |
| late | 2026-09-21 | `KXBTC15M-26SEP211415-15` |

### Pass 1

- `GET /cfbenchmarks/values?id=BRTI` → **200 success**
- `GET /historical/markets/{ticker}` ×3 → **404 not-found** (not entitlement)
- Live WS 90s / 541 messages; **missed the final settlement minute** (02:31–02:33Z)

### Pass 2

- `GET /markets/{ticker}` ×3 → **200**
- `GET /cfbenchmarks/history/values?...&timespan=MINUTE` ×6 → **400 invalid-parameters**
- HOUR was not requested in v0

Combined HTTP: **13 against an authorized cap of 10**. This is not rewritten as compliant.

## 4. v1 requests (new campaign, 2/10)

Follow-up historical target rule: the existing early/middle/late trio, **role=middle only**,
selected before inspecting historical observations.

- Target: `KXBTC15M-26AUG301415-15` close `2026-08-30T18:15:00Z`
- One HOUR: `timestamp=2026-08-30T18:00:00.000Z`

| When | Request | Result |
| --- | --- | --- |
| 2026-09-24T02:51:11Z | `GET /cfbenchmarks/history/values?id=BRTI&timespan=HOUR&timestamp=2026-08-30T18:00:00.000Z` | **200 success** |
| 2026-09-24T02:58:50Z–03:00:20Z | WS `cfbenchmarks_value` only (no 5Hz) | connected, 1 connection, 1 subscribe, **90 messages** |
| 2026-09-24T03:00:20Z | `GET /markets?event_ticker=KXBTC15M-26SEP232300` | **200 success** |

No DAY request, no second date, no pagination, no M16-P collector.

## 5. Access results

| Question | v0 | v1 |
| --- | --- | --- |
| Credentials | Yes (`raw-env`) | Yes |
| Latest REST BRTI | 200 | not re-requested |
| Live BRTI | connected; missed settlement minute | connected; **captured settlement minute** |
| Historical BRTI on a SPENT date | MINUTE 400; unproven | HOUR **200**, but **0 extracted observations** |
| Official-window reconstruction | not performed | still **unverified** |
| Causal suitability | false | false |

Error taxonomy: v1 history 200 is **not** entitlement denial and **not** a MINUTE-style
parameter error. Zero extracted observations means empty data **or** unrecognized
payload keys. Coverage is only what was actually observed: **none**.

## 6. Live settlement-average and official comparison

Operational sample (not a validation cohort): close **2026-09-24T03:00:00Z**,
start 02:58:50Z, stop 03:00:20Z.

Venue `last_60s_windowed_average_15min` at window_size 60:

- value raw `84349.74383333`
- `window_start_ts_ms` → 2026-09-24T02:59:00Z
- `window_end_ts_exclusive` → 2026-09-24T03:00:00Z

Official expiration raw `84349.74`. Rounded comparison: **agree**.

This is a **venue-provided window average vs official expiration** diagnostic on
one live event. Reconstruction from raw ticks is **unverified**. Do not generalize
to the 34-day SPENT cohort.

Trailing `avg_60s_data` remains a per-tick lookback and is **not** the quarter-hour
settlement average.

## 7. Settlement-rule / mapping limits

Do not assume:

- 60 distinct one-second buckets identify the official 60 samples
- every fifth 5Hz tick is a settlement sample
- a trailing 60-second average equals the final-window average
- historical timestamps establish contemporaneous availability

No interpolation. No Coinbase substitute.

Known PR #114 follow-ups remain open.

## 8. Causal limitations

Keep distinct:

1. historical observation time (not obtained; HOUR 200 returned no extracted ticks)
2. provider `received_at` / window timestamps (live venue average only)
3. local receipt time (first live local receipt 2026-09-24T02:58:50.243Z)

A new live timing sample cannot recover historical latency. Even a later
successful history pull would support retrospective mechanical reconstruction
at best, not a causally faithful execution backtest.

Reservoir classifications were not changed.

## 9. Exact next prerequisite

Resolve the **HOUR 200 with zero extracted observations** blocker (empty hour vs
unrecognized schema) before any broader historical download.

Live `last_60s_windowed_average_15min` can support **prospective synchronized
collection** of venue settlement averages. It does not make historical
settlement-state research ready.
