# M17 settlement-join audit — `kalshi-kxbtc15m-m17-settlement-join-audit-v0`

Generated: 2026-09-25T00:38:30.177Z
Analysis version: `m17-settlement-join-audit-v0.1`
Code SHA: `61d1762849a1d86c331a6c27499deb94ed20d2fb`

Settlement-JOIN coverage only on retained SPENT_VALIDATION (M16-ER) executable friction samples. Exact marketTicker join; no outcome imputation. Not confirmatory validation; not alpha; no threshold tuning; BRTI/settlement-state path coverage not measured. Descriptive outcome counts (if present) are SPENT/exploratory only.

## Strategy definition (fixed — not tuned here)

- Name: `hold-to-settlement-terminal-mispricing`
- Side: NO
- Fee: one-standard-taker
- Outcome label: official-expiration_value
- `avg_60s_data` wired into strategy gates: **false**

## Input identities

| Key | Value |
| --- | --- |
| `datasetRole` | `SPENT_VALIDATION (M16-ER)` |
| `eligibleUniverse` | `retained settlement-friction-coverage executable samples (exact marketTicker)` |
| `frictionCoverageMergeCommit` | `b682962e2b34cba5593a5162f781a7b58c86edda` |
| `frictionLabelCoverageManifestSha256` | `08807cf94231fa7e9390a34a03ca6e2d8083d4c2039208b13bf8254585bccda9` |
| `incompleteRecordsSha256` | `1819619b548429b34e5e3fbd5fc5221ffdc589969938b2595f569038c642e0f7` |
| `labelBackfillCommit` | `0b43ffe186e9246da53047e6a4ffcb08604d52aa` |
| `labelsPath` | `/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl` |
| `labelsSha256` | `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` |
| `samplesPath` | `/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl` |
| `samplesSha256` | `3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728` |

Excluded known-incomplete ticker: `KXBTC15M-26AUG140315-15`

## Decision-relevant answers

1. **M17-eligible entries with valid official settlement outcomes:** 47,263
2. **Settlement-join percentage:** 99.9070% (47,263 / 47,307)
3. **Independent markets / dates remaining (valid join):** 3,225 markets / 34 dates (eligible universe: 3,228 markets / 34 dates)
4. **Meets minimum of 5 independent markets:** **yes**
5. **Exploratory usability:** `sufficient-for-exploratory-m17-analysis`
6. **Confirmatory limitation:** These 34 CryptoStruct days are classified SPENT_VALIDATION (M16-ER). They may support discovery and exploratory feasibility only; they are not an untouched pristine confirmatory / holdout partition.
7. **Pristine validation/holdout purchase needs:**

   - UTC days outside the M16-ER SPENT_VALIDATION calendar (not QUALITY_AUDIT_ONLY, not sealed M16-P)
   - CryptoStruct KXBTC15M executable books with the same RAW-BBO-CHANGE adapter identity
   - Official Kalshi settlement labels per marketTicker (result, expiration_value, floor_strike, close_time, settlement_ts) with study-complete field validity
   - Explicit pristine / holdout reservation before any exploratory peek
   - Optional: co-timed BRTI/settlement-sample paths only if the evaluation claims settlement-state causality (not required solely for label-join coverage)

## Separated verdicts

| Axis | Verdict |
| --- | --- |
| Data availability | `sufficient-labels-on-spent-executable-samples` |
| Exploratory usability | `sufficient-for-exploratory-m17-analysis` |
| Confirmatory validity | `not-confirmatory-spent-validation` |

### Claimed prior entry-audit note

Claimed prior entry-filter output (20,923 records / 72 markets) was not found among retained in-repo artifacts. This audit joins the retained friction-study executable samples (prior BTC/executable/friction audit corpus) to PR #114 settlement labels by exact marketTicker.

## Counts

| Metric | Count |
| --- | ---: |
| Total eligible records | 47307 |
| Unambiguous market/ticker identity | 47307 |
| Ambiguous market identity | 0 |
| Valid official settlement label | 47263 |
| Missing labels | 0 |
| Normalization / import-validation failures | 0 |
| Conflicting or duplicate labels | 0 |
| Excluded known-incomplete ticker | 14 |
| Non-numeric expiration_value | 30 |
| Valid executable-book inputs | 47307 |
| Valid BTC settlement-path inputs | 0 (not measured / absent on CS books) |
| Independent markets (eligible) | 3228 |
| Eligible dates | 34 |
| Independent markets with valid join | 3225 |
| Dates with valid join | 34 |

## SPENT/exploratory descriptive outcome counts

_SPENT_VALIDATION exploratory descriptive only — do not tune strategy_

| Result | Count |
| --- | ---: |
| yes | 23585 |
| no | 23678 |
| unlabeled / excluded | 44 |

## Zero network / capture confirmation

| Channel | Count |
| --- | ---: |
| Market-data requests | 0 |
| WebSocket captures | 0 |
| CryptoStruct purchases | 0 |
| Trades | 0 |

## Coverage by date

| UTC day | Eligible | Valid join | Join % | Markets |
| --- | ---: | ---: | ---: | ---: |
| 2026-08-14 | 1404 | 1390 | 99.0028% | 98 |
| 2026-08-15 | 1439 | 1439 | 100.0000% | 98 |
| 2026-08-16 | 1426 | 1426 | 100.0000% | 98 |
| 2026-08-17 | 1412 | 1412 | 100.0000% | 98 |
| 2026-08-18 | 1413 | 1413 | 100.0000% | 98 |
| 2026-08-19 | 1411 | 1411 | 100.0000% | 98 |
| 2026-08-20 | 1192 | 1192 | 100.0000% | 84 |
| 2026-08-21 | 1401 | 1401 | 100.0000% | 98 |
| 2026-08-22 | 1404 | 1404 | 100.0000% | 98 |
| 2026-08-23 | 1417 | 1417 | 100.0000% | 98 |
| 2026-08-24 | 1384 | 1384 | 100.0000% | 98 |
| 2026-08-25 | 1392 | 1392 | 100.0000% | 98 |
| 2026-08-26 | 1412 | 1412 | 100.0000% | 98 |
| 2026-08-27 | 1298 | 1298 | 100.0000% | 90 |
| 2026-08-28 | 1400 | 1385 | 98.9286% | 98 |
| 2026-08-29 | 1430 | 1430 | 100.0000% | 98 |
| 2026-08-30 | 1408 | 1408 | 100.0000% | 98 |
| 2026-08-31 | 1404 | 1404 | 100.0000% | 98 |
| 2026-09-01 | 1391 | 1376 | 98.9216% | 98 |
| 2026-09-02 | 1383 | 1383 | 100.0000% | 98 |
| 2026-09-03 | 1269 | 1269 | 100.0000% | 90 |
| 2026-09-04 | 1416 | 1416 | 100.0000% | 98 |
| 2026-09-05 | 1446 | 1446 | 100.0000% | 98 |
| 2026-09-06 | 1430 | 1430 | 100.0000% | 98 |
| 2026-09-07 | 1422 | 1422 | 100.0000% | 98 |
| 2026-09-10 | 1302 | 1302 | 100.0000% | 90 |
| 2026-09-11 | 1406 | 1406 | 100.0000% | 98 |
| 2026-09-12 | 1450 | 1450 | 100.0000% | 98 |
| 2026-09-13 | 1433 | 1433 | 100.0000% | 98 |
| 2026-09-15 | 1423 | 1423 | 100.0000% | 98 |
| 2026-09-16 | 1420 | 1420 | 100.0000% | 98 |
| 2026-09-17 | 1283 | 1283 | 100.0000% | 90 |
| 2026-09-19 | 1409 | 1409 | 100.0000% | 98 |
| 2026-09-21 | 1377 | 1377 | 100.0000% | 98 |
