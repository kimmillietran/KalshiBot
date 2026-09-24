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
| `kalshi-kxbtc15m-brti-access-probe-v1` | 10 | **3** | Original 2 (HOUR + official metadata) plus one authorized HOUR refetch |

Budget repair: reservations persist to `http-budget-ledger.json` before dispatch;
retries and failures consume slots; a restart cannot reset the campaign; missing,
corrupt, or mismatched state fails closed; the ledger never stores credentials.

Tests: `campaignBudget.test.ts` + `kalshiBrtiAccessProbe.test.ts` + `followUpReliability.test.ts`.

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
| 2026-09-24T02:51:11Z | `GET /cfbenchmarks/history/values?id=BRTI&timespan=HOUR&timestamp=2026-08-30T18:00:00.000Z` | **200 success** (original body not retained) |
| 2026-09-24T02:58:50Z–03:00:20Z | WS `cfbenchmarks_value` only (no 5Hz) | connected, 1 connection, 1 subscribe, **90 messages** |
| 2026-09-24T03:00:20Z | `GET /markets?event_ticker=KXBTC15M-26SEP232300` | **200 success** |
| 2026-09-24T03:26:51Z | identical authorized HOUR GET (refetch; original body absent) | **200 success**, 18000 ticks after parser fix |

No DAY request, no second date, no pagination, no M16-P collector.

## 5. Access results

| Question | v0 | original v1 snapshot | v1.1 supplement |
| --- | --- | --- | --- |
| Credentials | Yes (`raw-env`) | Yes | Yes |
| Latest REST BRTI | 200 | not re-requested | not re-requested |
| Live BRTI | connected; missed settlement minute | connected; **captured settlement minute** | not re-run |
| Historical BRTI on a SPENT date | MINUTE 400; unproven | HOUR **200**, **0 extracted** (parser miss) | HOUR **200**, **18000 parsed in-hour 5Hz ticks** |
| Official-window reconstruction | not performed | unverified | still **unverified** (300 window ticks / 61 second buckets ≠ official 60 samples) |
| Causal suitability | false | false | false |

The original HOUR body was **not** recovered. The original snapshot’s
0-extracted result is consistent with a parser bug: `data.payload` is an array
of `{time, value}` ticks, and `isRecord` previously treated that array as a
keyed object. The refetch body hash
`c6c6613033990431b917c298242776b0e3546dffd4d3198df0044593c9ef016b` is a new
observation of the same authorized request and is not the original hash
`d85787f052bdb6bb09b14370e4ed008b4f2f8196e53b1b198f149187b8c9a66a`.

Returned ticks are raw 200ms index values for
`2026-08-30T18:00:00Z`–`19:00:00Z` only. They are not venue window averages
and not official settlement samples.

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

1. historical observation time (now obtained for one hour as event timestamps, not provider publication/receipt time)
2. provider `received_at` / window timestamps (live venue average only)
3. local receipt time (first live local receipt 2026-09-24T02:58:50.243Z)

A new live timing sample cannot recover historical latency. These HOUR ticks
support retrospective mechanical inspection of one hour only, not a causally
faithful execution backtest.

Reservoir classifications were not changed.

## 9. Exact next prerequisite

The HOUR 200 / zero-extracted blocker is resolved as a **parser/schema issue**
plus **demonstrated historical observations for this one hour**.

Do **not** download the other 33 SPENT days from this result. Historical ticks
lack contemporaneous availability/receipt timestamps, so they do not establish
a causally faithful execution backtest. 300 ticks in `(close−60s, close]` do
not identify the official 60 samples.

Evidence-based next step: **prospective synchronized collection** of venue
`last_60s_windowed_average_15min` with official expiration. That is the only
observed path that already matched official settlement (one live close). A
separately authorized one-hour mechanical inspection of these raw ticks is
possible but would not recover official sample selection or historical
latency.

## 10. Reliability corrections (do not rewrite original snapshots)

Original v0/v1 JSON files remain original snapshots. A later serializer must
not be treated as the author of those files.

Corrections in code and in
`brti-access-probe-v1-reliability-supplement.json`:

- Historical close/expiration are bound from permitted official metadata for
  `KXBTC15M-26AUG301415-15` (`closeTime=2026-08-30T18:15:00Z` from v0 REST
  `/markets/{ticker}`). The derived hour is checked against the authorized
  `2026-08-30T18:00:00Z`–`19:00:00Z` window. A mismatch is reported; the
  request is not silently retargeted.
- Expiration is comparison-only. Missing expiration is not invented.
- Live official comparison matches the observed close window and event
  ticker. It does not take the first non-empty `expiration_value`.
- Follow-up summary + CLI now share `classification` and persisted
  `httpRequestCount` / `httpBudget.consumed`.
- The empty ledger `if` is replaced by explicit fail-closed dispatch vs
  offline reporting when `--skip-http` / `--fixture` is set.
- Original HOUR response body was **not** present locally (v1 `raw/` had
  only `http-log.hash-only.json`). Restricted local retention now writes
  gitignored `raw/responses/*.json` without authorization headers.
- One authorized HOUR refetch (v1 ledger 2→3/10) returned 18000 millisecond
  `{time,value}` ticks in `data.payload`. The parser now treats that array as
  observations instead of an unkeyed record.

## 11. Merge requirement

Merge PR #115 only after independent LRM approval and successful required
checks on the **final** head. Prior approval of `d9b8b62` does not approve
later commits.
