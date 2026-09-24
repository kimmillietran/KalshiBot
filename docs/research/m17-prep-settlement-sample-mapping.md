# M17-prep — Settlement-sample mapping and synchronized-capture verification

**Role:** data-fidelity and capture-readiness diagnostic. **Not** an alpha
experiment, not a historical download, and not a claim that the official
sampling rule is uniquely identified.

**Base:** `origin/main` after PR #115 (`07c9561e853805f2932b7ab0eaa1ab321faffeef`).

---

## Campaign isolation

| Campaign | Limit | Status |
| --- | --- | --- |
| `kalshi-kxbtc15m-brti-access-probe-v0` | 10 | Sealed at **13/10**. Untouched. |
| `kalshi-kxbtc15m-brti-access-probe-v1` | 10 | Recorded usage intact. Untouched. |
| `kalshi-kxbtc15m-settlement-sample-mapping-v2` | 10 | New persistent ledger. Max 3 post-close settlement metadata attempts. |

Raw captures stay gitignored under
`data/research-results/external-kalshi-data-audit/m17-prep-settlement-sample-mapping/raw/`.

## Reused components

- `extractHistoryObservations` / `inspectHistoryPayload` / `inspectCadence`
- `loadRetainedHttpResponse` + `retainedHistoryMatchesBoundRequest`
- `loadOfficialMetadataForSelectedTarget` (v0 official metadata for `KXBTC15M-26AUG301415-15`)
- `compareOfficialSettlementToObservedWindow`
- `campaignBudget` (v2 campaign id; `live-market-discovery` purpose added)
- `unsignedKalshiGet` / `signedKalshiGet`
- `summarizeLiveMessage` / `formatKxbtc15mEventTicker` / `nextQuarterHourCloseMs`
- `NodeKalshiAuthenticatedWsClient`
- `OrderbookCaptureBook`
- `createKalshiWebSocketAuthHeaders` / `resolveKalshiCaptureCredentials`
- `parseKalshiMarketWire` / `buildKalshiRestMarketPath`

No parallel Kalshi client.

## Offline historical inspection

Authorized retained HOUR body only (no refetch):

- ticker `KXBTC15M-26AUG301415-15`
- hour `2026-08-30T18:00:00Z`–`19:00:00Z`
- expected body SHA-256 `c6c6613033990431b917c298242776b0e3546dffd4d3198df0044593c9ef016b`

Fixed interpretations (not fitted):

| Window | Notation | Justification |
| --- | --- | --- |
| documented live accumulation | `(close−60s, close]` | WS `last_60s_windowed_average_15min` |
| payload window identity | `[close−60s, close)` | `window_start_ts_ms` / `window_end_ts_exclusive` |
| closed both | `[close−60s, close]` | inclusive-endpoint timestamp semantics |
| open both | `(close−60s, close)` | exclusive-endpoint timestamp semantics |

Each window is evaluated as last-tick-per-second and as an all-5Hz mean.
A matching average is exploratory, not the official rule.

The documented live accumulation interval and the payload `[start, end)`
identity are **different 60-second intervals**. They are not treated as the
same concept.

### Offline result for the verified HOUR body

Retained response verified: URL `timespan=HOUR&timestamp=2026-08-30T18:00:00.000Z`,
HTTP 200, body SHA-256 `c6c6613033990431b917c298242776b0e3546dffd4d3198df0044593c9ef016b`.
18,000 in-hour ticks, exact 200 ms cadence, phases `{0,200,400,600,800}` ms,
no duplicates, no missing seconds in the hour.

Official close `2026-08-30T18:15:00Z`, official expiration `78833.97`.

| Window | Aggregation | n | Unique seconds | Rounded mean | vs official |
| --- | --- | --- | --- | --- | --- |
| `(close−60s, close]` | last-tick-per-second | 61 | 61 | 78834.16 | disagree |
| `(close−60s, close]` | all-5Hz mean | 300 | 61 | 78834.05 | disagree |
| `[close−60s, close)` | last-tick-per-second | 60 | 60 | 78834.10 | disagree |
| `[close−60s, close)` | all-5Hz mean | 300 | 60 | 78834.02 | disagree |
| `[close−60s, close]` | last-tick-per-second | 61 | 61 | 78834.16 | disagree |
| `[close−60s, close]` | all-5Hz mean | 301 | 61 | 78834.03 | disagree |
| `(close−60s, close)` | last-tick-per-second | 60 | 60 | 78834.10 | disagree |
| `(close−60s, close)` | all-5Hz mean | 299 | 60 | 78834.03 | disagree |

61 unique seconds on `(close−60s, close]` is a timestamp-semantic consequence
(first tick `18:14:00.200` and close tick `18:15:00.000` floor to different
seconds). It is not treated as the official 60-sample rule.

No fixed interpretation matches official expiration. That mismatch is preserved;
offsets, subsets, rounding, and weights were not fitted.

## Live synchronized capture

One session around the next practical quarter-hour close:

- approximately close−90s through close+30s
- max 120s, 2 connection attempts on the multiplexed stream, 150,000 messages, 250 MiB
- channels: `cfbenchmarks_value`, `cfbenchmarks_value_5hz`, selected `KXBTC15M` book
- delayed start; subscriptions are not held open while waiting
- official metadata bound before capture; no substitute market

`avg_60s_data` is recorded as a trailing average and is never labeled the
quarter-hour settlement average.

### Live session 2026-09-24T04:15Z (one authorized window)

Bound market: `KXBTC15M-26SEP240015-15`, event `KXBTC15M-26SEP240015`,
strike `83903.22`, close `2026-09-24T04:15:00Z`.

| Planned | Actual |
| --- | --- |
| 04:13:30Z–04:15:30Z (120s) | connected 04:13:30.003Z, stopped 04:15:30.001Z |

| Stream | Result |
| --- | --- |
| Connection attempts | 1 multiplexed WS (limit 2) |
| Subscriptions | `cfbenchmarks_value`, `cfbenchmarks_value_5hz`, `orderbook_delta` |
| Messages / raw bytes | 15,716 / 4.12 MiB recorded (file 6.11 MiB, SHA-256 `938cdde6151ad61b7595d86825486f9b8b866fd38ffa21ae47d85b2f09943e33`) |
| Stop | planned-stop; flushed; closed cleanly |
| 1Hz / 5Hz / book events | 119 / 599 / 14,995 |
| Book integrity | 3 snapshots, 14,992 deltas, 0 gaps, 0 reconnects |
| Clock | wall/mono divergence 0.27 ms; no adjustment suspected |
| Future-quote leakage | false |

Completed venue settlement-window average:

- field `last_60s_windowed_average_15min`
- value `83817.61766667`, count `60`
- payload window `[2026-09-24T04:14:00.000Z, 2026-09-24T04:15:00.000Z)`
- 300 raw 5Hz observations in that declared window
- count advanced by 1 each second; implied last sample did not uniquely match a raw 5Hz tick

Official expiration for the bound ticker: `83817.71`.
Rounded comparison: venue `83817.62` vs official `83817.71` → **disagree**.
One earlier live window (PR #115, 03:00Z) had agreed after rounding. This
window does not. That is recorded as operational mapping data, not a fitted rule.

HTTP campaign v2: **2/10** (discovery 200 + one post-close settlement 200).
v0 remains sealed 13/10. v1 remains 3/10.

### v3 offline discrepancy supplement (no new Kalshi requests)

Original JSONL re-verified: SHA-256
`938cdde6151ad61b7595d86825486f9b8b866fd38ffa21ae47d85b2f09943e33`,
6,111,585 bytes, 15,716 lines. Bytes were not modified. Durable off-VM
retention is still **not established**.

Replay of the original payloads around close (same message, fields kept distinct):

| Seq | Line | Local receipt | Provider | Field | Count | Declared window | Raw value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 15281 | 04:14:58.133Z | 04:14:58.091Z | `last_60s_windowed_average_15min` | 58 | `[04:14:00, 04:14:58)` | `83817.52879310` |
| 2 | 15281 | 04:14:58.133Z | 04:14:58.091Z | `avg_60s_data` | 60 | `[04:13:58, 04:14:58)` | `83817.93133333` |
| 3 | 15381 | 04:14:59.088Z | 04:14:59.047Z | `last_60s_windowed_average_15min` | 59 | `[04:14:00, 04:14:59)` | `83817.60372881` |
| 4 | 15381 | 04:14:59.088Z | 04:14:59.047Z | `avg_60s_data` | 60 | `[04:13:59, 04:14:59)` | `83817.79616667` |
| 5 | 15537 | 04:15:00.120Z | 04:15:00.075Z | `last_60s_windowed_average_15min` | 60 | `[04:14:00, 04:15:00)` | `83817.61766667` |
| 6 | 15537 | 04:15:00.120Z | 04:15:00.075Z | `avg_60s_data` | 60 | `[04:14:00, 04:15:00)` | `83817.70733333` |
| 7 | 15544 | 04:15:01.098Z | 04:15:01.056Z | `avg_60s_data` | 60 | `[04:14:01, 04:15:01)` | `83817.61766667` |

The completed settlement field does **not** reappear after that count-60 update.
The next trailing update slides the window forward one second and happens to
equal `83817.61766667`. Official `83817.71` matches the trailing value after
USD rounding. That is an exploratory clue. It is **not** a relabel of
`avg_60s_data` as the official settlement average.

The original analyzer picked the last count-60 settlement update without binding
the window to close. On this session that record was also the first and only
count-60 settlement update and already declared `[04:14:00, 04:15:00)`, so the
reported settlement value does not change after the bind. Selection, quote
ordering, causal tick filtering, and `futureQuoteLeakage` computation are
corrected in code. See `settlement-average-discrepancy-v3.json`.

### v4 raw-capture availability (Project Lead audit)

**Current environment status:** the original synchronized JSONL is
**unavailable** in this environment. Independent hash/size/line re-verification
and byte-level replay are **not possible** here.

| Expected identity | Value |
| --- | --- |
| Path | `.../raw/synchronized-capture.jsonl` |
| SHA-256 | `938cdde6151ad61b7595d86825486f9b8b866fd38ffa21ae47d85b2f09943e33` |
| Bytes / lines | 6,111,585 / 15,716 |

This is **not** a proof of deletion. Searches of builder/review worktrees,
Desktop KalshiBot paths, and size/name matches under the operator home did not
locate the file. Prior agent reports that verified the bytes on a previous VM
are preserved as historical provenance and are **not** independently repeated
now.

Durable off-VM retention remains **not established**. No permitted private
artifact mechanism was available to store or retrieve the original bytes. A
gitignored or same-VM copy would not count as durable retention even if
present.

The original official HTTP response body was **never retained**; that
limitation is unchanged.

Derived committed evidence that remains: original summary,
`settlement-average-discrepancy-v3.json` chronology, and hermetic fixture tests
(synthetic provenance — not original capture bytes). See
`settlement-raw-capture-availability-v4.json`.

## What this can and cannot support

Historical 5Hz ticks can support cadence, missing/duplicate, and candidate
arithmetic under predeclared windows. They cannot establish historical receipt
times or uniquely prove official sample selection.

One live window can test capture integrity and compare one completed venue
average to one official expiration. It cannot establish universal fidelity.
