# M17 retained-input recovery audit — `kalshi-kxbtc15m-m17-retained-input-recovery-audit-v0`

Generated: 2026-09-25T01:31:10.047Z
Analysis version: `m17-retained-input-recovery-audit-v0.1`
Code SHA: `601ad87f4a270f56e09bc5eb888afe417fb7437a`
Final status: **blocked-missing-frozen-strategy-decision**

Offline retained-input recovery audit only. No CryptoStruct purchase, no network requests, no captures, no trades. Does not modify the M17 strategy rule. Does not compute strategy P&L while the settlement-state→entry mapping remains unfrozen or required pre-entry inputs remain absent. Official settlement labels are post-entry evaluation only.

## Executive answers

- Purchase made: **false**
- Network requests: **0**
- Strategy rule modified: **false**
- Strategy P&L computed: **false**
- Exploratory eval executable without purchase: **false**

No purchase was made. No strategy P&L was computed. Book-side features are offline-derivable from retained CryptoStruct raw, but Coinbase vol and BRTI paths for the SPENT calendar are absent, the 5Hz↔1Hz window identity is unsafe to invent, and the frozen M17 settlement-state→entry mapping remains unresolved — exploratory P&L stays blocked.

## Classification counts

| Class | Count |
| --- | ---: |
| `present-direct` | 2 |
| `derivable-offline` | 4 |
| `present-but-insufficient` | 0 |
| `absent` | 2 |
| `unsafe-to-derive` | 1 |

## Required inputs

| Input | Class | Summary |
| --- | --- | --- |
| `yes-bid-ask-or-midpoint-at-entry` | `derivable-offline` | YES BBO (and midpoint) can be reconstructed offline from retained CryptoStruct RAW-BBO-CHANGE zip members using the existing level-apply semantics. Not present as columns on friction samples.jsonl, but proven recoverable (PR #113 derived 47307 executable samples from the same raw store). |
| `executable-no-ask-at-entry` | `derivable-offline` | Executable NO ask for buying NO is the complement cross 100 − YES best bid, derivable from the same reconstructed BBO (existing M16/friction convention). |
| `entry-timestamp-and-market-expiration` | `present-direct` | entryTimestampMs and marketTicker are present on retained friction samples; close/expiration instant is also derivable from ticker HHMM (America/New_York) and/or instrument.start in raw members when expiry is null. |
| `time-remaining-at-entry` | `derivable-offline` | timeRemainingMs = closeTimeMs − entryTimestampMs, using ticker-derived close and retained entry timestamps. |
| `coinbase-pre-entry-realized-volatility` | `absent` | No retained Coinbase completed 1m OHLC covering the 34 M16-ER SPENT days. The only local btc-candles-1m.jsonl under live-capture is empty (0 bytes) and is not on the SPENT calendar. Deriving vol from settlement labels is forbidden. |
| `historical-brti-banked-settlement-sample-path` | `absent` | CryptoStruct books do not include BRTI/CFB settlement-sample paths. Local one-close synchronized captures exist only for a few Sep 24–25 closes (count=2), which do not cover the 34 SPENT days. Synthesizing BRTI from settlement labels is unsafe and forbidden. |
| `source-and-receipt-timestamps` | `derivable-offline` | RAW-BBO messages expose admission timestamp (ad_ts, ns) and exchange timestamp on deltas (field index 5). Friction study used admission ms; both clocks are recoverable offline from raw members. |
| `exact-5hz-to-1hz-window-identity` | `unsafe-to-derive` | Official banked-sample field/window identity remains unresolved (PR #112/#116). Limited one-close captures are insufficient to freeze 5Hz→60×1Hz mapping for the SPENT calendar. Inventing a mapping from labels or completed averages is unsafe. |
| `official-settlement-label-post-entry` | `present-direct` | PR #114 settlement-labels.jsonl provides official labels for post-entry evaluation only (47263 valid joins on retained samples). |

## Remaining blockers

- `settlement-state-to-yes-overpriced-entry-mapping-unfrozen`
- `coinbase-pre-entry-realized-volatility-absent-on-spent-calendar`
- `historical-brti-banked-paths-absent-on-spent-calendar`
- `exact-5hz-to-1hz-window-identity-unfrozen-unsafe-to-derive`

## Available artifacts

| Path | Role | Present | SHA-256 | Notes |
| --- | --- | --- | --- | --- |
| `data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl` | retained-friction-executable-samples | true | `3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728` | 47307 rows |
| `data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl` | official-settlement-labels-pr114 | true | `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` | post-entry evaluation only |
| `data/external-samples/cryptostruct/m16-er/raw` | cryptostruct-m16-er-raw-zips | true | `fd8bcb2a6f47c8e27045de3459501b9152e3fd5678040e11a27473e50457b231` | 34 day zips; per-day SHAs in acquisition manifest |
| `data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json` | acquisition-manifest | true | `fd8bcb2a6f47c8e27045de3459501b9152e3fd5678040e11a27473e50457b231` | hashes for raw day zips |
| `data/live-capture/forward-quotes/2026-09-22T18-00-05-364Z/btc-candles-1m.jsonl` | coinbase-1m-ohlc | false | `null` | bytes=0 |
| `Documents/KalshiResearchArchive/one-close-settlement-fidelity` | one-close-brti-synchronized-captures | true | `null` | 2 off-calendar closes; not SPENT 34-day coverage |

## Offline derivers implemented (minimal)

- `applyCryptostructLevels`
- `deriveBboCentsFromBooks (YES mid + executable NO ask)`
- `parseCloseTimeMsFromTicker`
- `computeTimeRemainingMs`
- `parseCryptostructMessageTimestamps`

## Input identities

| Key | Value |
| --- | --- |
| `acquisitionManifestSha256` | `fd8bcb2a6f47c8e27045de3459501b9152e3fd5678040e11a27473e50457b231` |
| `datasetProvenance` | `SPENT_VALIDATION (M16-ER)` |
| `labelsSha256` | `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` |
| `rawZipDayCount` | `34` |
| `samplesSha256` | `3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728` |
| `settlementJoinMergeSha` | `1bd0d631eea173445a919207772b6141af28a26f` |
