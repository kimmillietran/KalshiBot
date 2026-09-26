# External BTC→Kalshi ingestion benchmark (cloud)

> Cloud ingestion-benchmark study only. Does not restart or modify the Mac empirical pilot. Findings from synthetic workloads are labeled synthetic and are not production speedups. Licensed raw samples stay gitignored.

| Field | Value |
| --- | --- |
| Study id | `kalshi-kxbtc15m-external-btc-ingestion-benchmark-v0` |
| Analysis version | `m17-external-btc-ingestion-benchmark-v0.1` |
| Pinned commit (PR #137 merge) | `582ef668f269f87d6e06320a1ea0406ba90df3de` |
| Generated (UTC) | 2026-09-26T04:42:27.183Z |
| Environment | Node v22.14.0, 4 vCPU, 15.6 GiB RAM, 245 GiB free disk |
| Data | synthetic=true; native=false; freePublic=false |

## Sampling limitations

- Mac gitignored Coinbase/Kalshi archives were not available in this cloud workspace.
- No free CryptoStruct BTC-USD sample was downloaded (would require credentials/credits).
- Coinbase LTC free sample is documented only as a schema/timing proxy — not used as benchmark input here.
- All timed workloads are synthetic CryptoStruct-native array lines (snapshot+contiguous updates).
- Supply native sample: Place a small representative native file (valid snapshot then contiguous updates) at `data/external-samples/cryptostruct/benchmark/native-sample.txt.zst` (gitignored). Optionally set `EXTERNAL_BTC_BENCH_NATIVE_PATH`. Re-run `npm run research:external-btc-ingestion-benchmark`. Do not commit licensed bytes.

## Workloads

| Kind | Messages | Decompressed B | Compressed B | Input SHA-256 |
| --- | ---: | ---: | ---: | --- |
| typical-depth | 1200002 | 102418640 | 3135382 | `c066eae3114605cc…` |
| deep-book-high-update | 600002 | 49811920 | 2672448 | `c0910bb7bc3928d6…` |
| away-from-best | 1200002 | 99779360 | 4345028 | `6397e1fed8e97078…` |
| best-price-changes | 900002 | 75078819 | 3117594 | `1f2d04e9c6a704b4…` |
| snapshot-reset-gap | 600002 | 49580064 | 1235152 | `01ad3b0a94e8a843…` |

## Timed runs (selected)

| Impl | Workload | Profiled | Wall (per-rep) | msg/s | MB/s | Quotes | Best scans | Peak RSS |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline-async-readline | typical-depth | false | 20190.4ms (2523.8ms/rep ×8) | 475473 | 38.7 | 342859 | 2400000 | 1814 MiB |
| baseline-async-readline | typical-depth | true | 18738.8ms (3123.1ms/rep ×6) | 384231 | 31.3 | 342859 | 2400000 | 1656 MiB |
| opt-sync-buffered-lines | typical-depth | true | 17633.6ms (2938.9ms/rep ×6) | 408312 | 33.2 | 342859 | 2400000 | 1884 MiB |
| opt-incremental-bbo | typical-depth | true | 14600.3ms (2433.4ms/rep ×6) | 493142 | 40.1 | 342859 | 119999 | 1888 MiB |
| opt-sync-plus-incremental | typical-depth | true | 14520.5ms (2420.1ms/rep ×6) | 495851 | 40.4 | 342859 | 119999 | 1889 MiB |
| opt-hash-during-read | typical-depth | true | 14548.0ms (2424.7ms/rep ×6) | 494916 | 40.3 | 342859 | 119999 | 1888 MiB |
| baseline-async-readline | deep-book-high-update | false | 30262.0ms (3782.7ms/rep ×8) | 158615 | 12.6 | 30000 | 1200000 | 1642 MiB |
| baseline-async-readline | deep-book-high-update | true | 21691.3ms (3615.2ms/rep ×6) | 165965 | 13.1 | 30000 | 1200000 | 1644 MiB |
| opt-sync-buffered-lines | deep-book-high-update | true | 16859.1ms (2809.8ms/rep ×6) | 213536 | 16.9 | 30000 | 1200000 | 2013 MiB |
| opt-incremental-bbo | deep-book-high-update | true | 6039.8ms (1006.6ms/rep ×6) | 596047 | 47.2 | 30000 | 0 | 2356 MiB |
| opt-sync-plus-incremental | deep-book-high-update | true | 6150.1ms (1025.0ms/rep ×6) | 585363 | 46.3 | 30000 | 0 | 2666 MiB |
| opt-hash-during-read | deep-book-high-update | true | 6346.3ms (1057.7ms/rep ×6) | 567266 | 44.9 | 30000 | 0 | 1858 MiB |

## Parity

| Workload | Candidate | Matched | Quotes (base/cand) | First mismatch |
| --- | --- | --- | --- | --- |
| typical-depth | opt-sync-buffered-lines | true | 342859/342859 | — |
| typical-depth | opt-incremental-bbo | true | 342859/342859 | — |
| deep-book-high-update | opt-sync-buffered-lines | true | 30000/30000 | — |
| deep-book-high-update | opt-incremental-bbo | true | 30000/30000 | — |
| away-from-best | opt-sync-buffered-lines | true | 1/1 | — |
| away-from-best | opt-incremental-bbo | true | 1/1 | — |
| best-price-changes | opt-sync-buffered-lines | true | 600000/600000 | — |
| best-price-changes | opt-incremental-bbo | true | 600000/600000 | — |
| snapshot-reset-gap | opt-sync-buffered-lines | true | 3/3 | — |
| snapshot-reset-gap | opt-incremental-bbo | true | 3/3 | — |

## Cache prototype

- Attempted: true
- First ingestion wall: 14520.5ms
- Cache bytes: 85372195
- Cache read wall: 567.3ms
- Subsequent savings ratio: 0.961
- Note: Cache speeds subsequent local reruns only; does not accelerate an already-running Mac pilot.

## Optimization ranking

| Optimization | Bottleneck share | Isolated | Combined | Parity | Effort/risk |
| --- | --- | ---: | ---: | --- | --- |
| Buffered synchronous line processing (remove per-line async iteration) | lineSplit+await overhead vs sync split; baseline wall/rep 3123ms | 1.06× | 1.29× | true | low — local replay helper only; keep production streaming API for ZIP members |
| Incremental best-bid/ask maintenance (avoid full Map scans) | bestScanNs=737672307 / bookMutationNs=213651613 | 1.21× | 1.29× | true | medium — must preserve deletion/rescan edge cases and snapshot resets |
| Hash compressed bytes without a second conceptual pass (hash-during-read prototype) | hashNs=5025882 | n/a | 1.29× | true | low — provenance hashing only |
| Versioned sparse-quote cache for subsequent local reruns | subsequent runs only; 0% of first ingestion | 25.59× | n/a | true | low for local reruns; does not help an in-flight Mac pilot |

## Recommendations

1. **Largest opportunity:** Sync buffered lines + incremental BBO on deep-book (~3.53× synthetic)
2. **Best low-risk change:** Replace per-line `for await` + async `onLine` with buffered synchronous line processing in local file replay helpers; keep streaming ZIP path but avoid awaiting no-op Promises per line.
3. **Dominant factor:** On synthetic cloud runs: deep-book best-scan share 0.643; typical depth share 0.391. JSON parse is large in both; book depth makes full BBO scans dominate deep workloads. Compressed size is not the parser workload.
4. **Native vs synthetic:** All speedups below are SYNTHETIC cloud evidence only — not a production ETA for the Mac pilot.
5. **Variability:** Profiled/unprofiled baseline wall-per-repeat ratio ≈ 1.24; prefer unprofiled walls for speedup claims. Compare wallMsPerRepeat across configs.
6. **Mac portability:** Cloud has 4 vCPU / ~16 GiB and no Mac I/O path. Mac may be decompress+disk bound on multi-GB days; cloud synthetic CPU ratios will not match. Do not extrapolate remaining Mac ETA from these ratios.
7. **Mac reproduction (do not restart pilot):** `npm run research:external-btc-ingestion-benchmark -- --native-path /ABS/PATH/to/sample.txt.zst # run beside the existing pilot; do not kill/restart the in-flight Mac job`
8. **Next implementation change:** Land a production-adjacent helper: sync buffered replay + incremental BBO behind a feature flag / separate function; keep current async ZIP streaming until native parity is rechecked on a Mac sample.

## Attestation

- Mac pilot untouched: true
- No credit spend: true
- No full-day download: true
- No strategy P&L: true
- Licensed samples not committed: true

