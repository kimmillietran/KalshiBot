# M17 pre-entry feature recovery

Feature-preparation coverage audit on M16-ER SPENT_VALIDATION retained executable samples only. Regenerates pre-entry book/time/volatility features for measurement. Does not compute strategy P&L, simulate entries, rank candidates by settlement outcomes, freeze the M17 entry rule, or resolve O6 settlement-fidelity questions. Feature coverage is not a strategy result.

## Status

- Study: `kalshi-kxbtc15m-m17-preentry-feature-recovery-v0`
- Analysis version: `m17-preentry-feature-recovery-v0.1`
- Generated (UTC): 2026-09-25T04:17:07.479Z
- Code authority SHA: `73931676b6a986dcdca09dff724d0b73be346975`
- Base main SHA: `5b9d0f9855794f8c59e5496f8180445cca729192`

## Attestation

- No purchase, subscription, trade, order, or strategy P&L occurred.
- Feature coverage is **not** a strategy result.
- M17 entry rule was not modified or frozen.
- O6 settlement-fidelity questions were not resolved.
- Settlement outcomes were not used to rank, select, or tune candidates.
- No live capture was started.
- BRTI, banked samples, and 5Hz→1Hz identity were not inferred.

## Inputs

| Input | Path / value | SHA-256 |
| --- | --- | --- |
| Retained friction samples | `data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl` | `3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728` |
| Sample rows | 47307 | |
| CryptoStruct raw ZIP dir | `data/external-samples/cryptostruct/m16-er/raw` | (34 day ZIPs) |
| Adapter | RAW-BBO-CHANGE | `3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d` |
| Regenerated book features | `data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/book-features.jsonl` | `6846e7187fe89eb76c00b60ec0c44f1ae6fbfbafce20d90ab9582c54f5e44eaf` |
| Coinbase candles dir | `data/research-results/external-kalshi-data-audit/m17-preentry-feature-recovery/work/coinbase-candles-1m` | (gitignored) |

## Coinbase public source

- Base: `https://api.exchange.coinbase.com`
- Path: `/products/BTC-USD/candles?granularity=60`
- Docs: https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles
- Auth required: false
- Purchase required: false
- Noted in PR: #127
- Retrieval attempted: true
- Usable without cost: true
- Purchase/subscription encountered: false
- Blocker: none
- Retrieved UTC days: 34
- Total candles: 97920
- Timestamp convention: exchange-bucket-start-open; close=open+59999ms (frozen research)

## Frozen volatility contract

| Field | Value |
| --- | --- |
| Instrument | BTC-USD |
| lookbackBars | 10 |
| requiredCloseCount | 11 |
| Candle close offset | 59999 ms |
| Eligibility | closeTimeMs < entryTimestampMs |
| Annualization | log-return stdev * sqrt(MS_PER_YEAR / barIntervalMs) |
| Cited high-vol ≥ | 0.6 |
| Regime authority | `config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json` |

## Coverage summary

| Metric | Count |
| --- | ---: |
| Rows | 47307 |
| Markets | 3228 |
| UTC days | 34 |
| Book features OK | 47281 |
| Half-spread mismatches vs retained | 308 |
| Time remaining present | 47307 |
| Volatility OK | 47307 |
| Market + time + volatility complete | 47281 |
| Cited high-vol true / false / unknown | 3552 / 43755 / 0 |

## Missingness

- Book status counts: {"ok":47281,"missing-bbo":26}
- Volatility status counts: {"ok":47307}
- Exclusions: Settlement labels / expiration_value never used as features; Post-close book updates excluded by admission-timestamp matching; In-progress and future candles excluded (closeTimeMs < entryTimestampMs); Strategy P&L and entry simulation out of scope

## Candle coverage by UTC day

| UTC day | Candles | Expected minutes | Gaps | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| 2026-08-14 | 2880 | 2880 | 0 | `3c5ff5e2f0c3b0f12efd4a16c0554632e4980f92fe1651c719831bad5ec8dfd6` |
| 2026-08-15 | 2880 | 2880 | 0 | `e4171cf9756ae0cd908d3d87500aa686cdc48527f01c9c6e7930fd46f6f5d2ff` |
| 2026-08-16 | 2880 | 2880 | 0 | `d0f99d53732f5cc52324023d821c7441424137551eef2e1feaaf02b349078d68` |
| 2026-08-17 | 2880 | 2880 | 0 | `56a3bbe687b387ecd758b4b8fb0b7311ddfdd91dce7be839b7ee949c35ba26d6` |
| 2026-08-18 | 2880 | 2880 | 0 | `42fee67eb5db4ac7d39d11819f46b87a28ef43776d53f9b8b62cdc456d85ca83` |
| 2026-08-19 | 2880 | 2880 | 0 | `d34e2285c35198967eab553165fc6aae3f788d5cb8a72acfb33ee6a984282637` |
| 2026-08-20 | 2880 | 2880 | 0 | `3b6c0bc5382f89ee23a933eefb057fcb015a358054cd27f25171a0dc2712cea1` |
| 2026-08-21 | 2880 | 2880 | 0 | `c01254f36fd1e3cd4adbd8fbcd4aaf8a17488010ab0af32471a8cf5d0b28616e` |
| 2026-08-22 | 2880 | 2880 | 0 | `505fa95bde2332e7a3e9b2b9f061880af20a30d2bd7982a1b00f6e3ae9e10db7` |
| 2026-08-23 | 2880 | 2880 | 0 | `60f5e94b6e339ee03df3efd30adf00e63d346c4276e7e8d715729ca7df158d9f` |
| 2026-08-24 | 2880 | 2880 | 0 | `63542b25041bcde55e8531a778e524399d3f0d45abf14948fcd93eeecfa637d8` |
| 2026-08-25 | 2880 | 2880 | 0 | `f411c84c6ecd18bf0203f447b6ecdc11caa58c39c2610d1364dc1301ef552685` |
| 2026-08-26 | 2880 | 2880 | 0 | `6e9bff114fc5e568c9984d4e5c114d3d32ccf9864544053731d1e27a466fc89f` |
| 2026-08-27 | 2880 | 2880 | 0 | `1d09d5e098b723c067e87ce41d6b4e1ba2a819a0c66e309b0c965f8057238690` |
| 2026-08-28 | 2880 | 2880 | 0 | `2ba8a6440b711dd282312e164cf928c2f28b7992aca14e51a7c5e1a25f2df024` |
| 2026-08-29 | 2880 | 2880 | 0 | `66009716760216f1465d1960d3fb89cacf94c6639a6050d085eb48863e033f45` |
| 2026-08-30 | 2880 | 2880 | 0 | `b3107dd0dcda7cb369731b0864b7599120f93fc99cf7a274b58f728c33190aa5` |
| 2026-08-31 | 2880 | 2880 | 0 | `c4e6589d5347a5641def552a05990d1ecf89adfab566415be8eccb795a829c23` |
| 2026-09-01 | 2880 | 2880 | 0 | `c66e246590b153badf1f45e08c77301edf0fbf12723af7473fc39b43a09f672f` |
| 2026-09-02 | 2880 | 2880 | 0 | `8fa38ff572fa1b91c0cc96b1909582132ef4e462273e9db52d69006249e2eca6` |
| 2026-09-03 | 2880 | 2880 | 0 | `4cab15080931e8fa141d7757802a972150dea2ecd9fcce618709be10edf78a89` |
| 2026-09-04 | 2880 | 2880 | 0 | `d4a8c414c39c2627d7d65d5a8ebafd81a6e2bd8772e64ba02393d9efd8c4b568` |
| 2026-09-05 | 2880 | 2880 | 0 | `f43828e7a81fbc699d23f2bd4a8a1904e0be3f4a0cdd572a4d5761c8731b33fe` |
| 2026-09-06 | 2880 | 2880 | 0 | `2c3892c727af4bf49d4cbbdf728d9b6918cd89cb4ff45a87acb60ff9ee01e1af` |
| 2026-09-07 | 2880 | 2880 | 0 | `a5ffd985248799966d3c4fdd12b476dc666a4908535c7de786896e9344a3d157` |
| 2026-09-10 | 2880 | 2880 | 0 | `9cbe1224154fde7f9420236bfe12ab21e4cdaa878936a4915874f62e7ed62d79` |
| 2026-09-11 | 2880 | 2880 | 0 | `aa833326b7e3cad0d978d106ca0ef7f5a504980dfae37543106be99dc54a11eb` |
| 2026-09-12 | 2880 | 2880 | 0 | `b0dcf5041721b8191a180a5394814a2c1d2c07f1402de67620a0076647ea5154` |
| 2026-09-13 | 2880 | 2880 | 0 | `d4ddde907b8769bd4af7194bccaf2788af73640890c62cd8ef5f495e62a96199` |
| 2026-09-15 | 2880 | 2880 | 0 | `001dbaba202266514a5106508a0419e109f52f491fd7d3c5bdd3317db4033e7b` |
| 2026-09-16 | 2880 | 2880 | 0 | `26b3e90a6809b6e8dfbc4d3045ba5a16e0f747ae2e9c31088cdcf0da434aeb77` |
| 2026-09-17 | 2880 | 2880 | 0 | `a7cfaeb505a224a30b0033ecd18fd08ee53077ccef6ddb791e925b9e142c79e6` |
| 2026-09-19 | 2880 | 2880 | 0 | `75e4a94f9214cc8d4c1ef25acf75b33626e5ac76e3adb2cc1874464cf9e4ecb6` |
| 2026-09-21 | 2880 | 2880 | 0 | `53cdb8cc258da0d44ffd3d2e545d905a3bf36d16a7d1a223f1b543fb7e84e3e2` |

## Feature coverage by UTC day

| UTC day | Rows | Book OK | Half-spread mismatch | Vol OK | Market+time+vol complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-08-14 | 1404 | 1403 | 5 | 1404 | 1403 |
| 2026-08-15 | 1439 | 1439 | 6 | 1439 | 1439 |
| 2026-08-16 | 1426 | 1426 | 6 | 1426 | 1426 |
| 2026-08-17 | 1412 | 1409 | 9 | 1412 | 1409 |
| 2026-08-18 | 1413 | 1413 | 7 | 1413 | 1413 |
| 2026-08-19 | 1411 | 1410 | 9 | 1411 | 1410 |
| 2026-08-20 | 1192 | 1191 | 9 | 1192 | 1191 |
| 2026-08-21 | 1401 | 1401 | 10 | 1401 | 1401 |
| 2026-08-22 | 1404 | 1404 | 6 | 1404 | 1404 |
| 2026-08-23 | 1417 | 1417 | 13 | 1417 | 1417 |
| 2026-08-24 | 1384 | 1384 | 12 | 1384 | 1384 |
| 2026-08-25 | 1392 | 1390 | 6 | 1392 | 1390 |
| 2026-08-26 | 1412 | 1411 | 15 | 1412 | 1411 |
| 2026-08-27 | 1298 | 1296 | 8 | 1298 | 1296 |
| 2026-08-28 | 1400 | 1398 | 5 | 1400 | 1398 |
| 2026-08-29 | 1430 | 1428 | 8 | 1430 | 1428 |
| 2026-08-30 | 1408 | 1406 | 7 | 1408 | 1406 |
| 2026-08-31 | 1404 | 1402 | 11 | 1404 | 1402 |
| 2026-09-01 | 1391 | 1390 | 9 | 1391 | 1390 |
| 2026-09-02 | 1383 | 1383 | 5 | 1383 | 1383 |
| 2026-09-03 | 1269 | 1269 | 4 | 1269 | 1269 |
| 2026-09-04 | 1416 | 1416 | 11 | 1416 | 1416 |
| 2026-09-05 | 1446 | 1446 | 12 | 1446 | 1446 |
| 2026-09-06 | 1430 | 1430 | 7 | 1430 | 1430 |
| 2026-09-07 | 1422 | 1421 | 5 | 1422 | 1421 |
| 2026-09-10 | 1302 | 1301 | 13 | 1302 | 1301 |
| 2026-09-11 | 1406 | 1405 | 11 | 1406 | 1405 |
| 2026-09-12 | 1450 | 1450 | 7 | 1450 | 1450 |
| 2026-09-13 | 1433 | 1433 | 7 | 1433 | 1433 |
| 2026-09-15 | 1423 | 1423 | 8 | 1423 | 1423 |
| 2026-09-16 | 1420 | 1419 | 13 | 1420 | 1419 |
| 2026-09-17 | 1283 | 1282 | 15 | 1283 | 1282 |
| 2026-09-19 | 1409 | 1409 | 11 | 1409 | 1409 |
| 2026-09-21 | 1377 | 1376 | 18 | 1377 | 1376 |
