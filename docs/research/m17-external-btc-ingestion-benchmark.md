# M17 — External BTC→Kalshi ingestion benchmark (cloud)

> Cloud study only. Does **not** restart or modify the Mac empirical pilot.
> Findings from synthetic workloads are labeled **synthetic** and are **not** production speedups.

| Field | Value |
| --- | --- |
| Study id | `kalshi-kxbtc15m-external-btc-ingestion-benchmark-v0` |
| Analysis version | `m17-external-btc-ingestion-benchmark-v0.1` |
| Pinned ingestion commit | PR #137 merge `582ef668f269f87d6e06320a1ea0406ba90df3de` |
| Harness module | `src/lib/data/research/externalBtcIngestionBenchmark/` (prototypes **separate** from production loaders) |
| Runner | `npm run research:external-btc-ingestion-benchmark` |
| Cloud env (measured) | Node `v22.14.0`, 4 vCPU, ~15.6 GiB RAM, ~245 GiB free disk |

## Measured findings (synthetic — cloud 2026-09-26)

Full tables: `data/research-results/external-kalshi-data-audit/external-btc-ingestion-benchmark/ingestion-benchmark-report.md`.

| Optimization | Bottleneck share (synthetic) | Isolated | Combined | Parity | Effort/risk |
| --- | --- | ---: | ---: | --- | --- |
| Sync buffered line processing | modest vs async readline on typical | ~1.06× typical | ~1.29× typical | yes | low |
| Incremental best-bid/ask | deep-book best-scan share **0.64** of instrumented ns | ~1.21× vs sync-full on typical; **~2.8×** vs sync-full on deep | **~3.53×** vs baseline on deep | yes | medium |
| Hash-during-read | small (`hashNs` ≪ parse) | n/a | ~1.29× (rides with combined) | yes | low |
| Sparse-quote cache (reruns only) | 0% of first ingest | ~25× subsequent readback | n/a | yes | low; **does not** help in-flight Mac pilot |

Answers required by the study brief:

1. **Largest measured opportunity:** incremental BBO maintenance on deep books (~3.53× combined synthetic on cloud).
2. **Best low-risk change:** drop per-line `for await` / async `onLine` in local file replay helpers (keep ZIP streaming path).
3. **Dominant factor:** on deep books, **full Map BBO scans** dominate; on typical depth, **JSON parse + allocation/GC** dominate. Message count drives wall; compressed size alone is not the workload.
4. **Evidence class:** **synthetic only** in this cloud workspace (no Mac archives / no free BTC CryptoStruct sample without credits).
5. **Variability:** profiled/unprofiled wall-per-repeat ratio ≈ 1.24 on typical; prefer unprofiled walls for claims.
6. **Mac portability:** cloud CPU ratios are not a Mac ETA (disk/decompress may dominate multi-GB days). Do not extrapolate remaining pilot time from these speedups.

CPU profile (one deep-book baseline pass): top self-time in `parseTickLine`, `bestAsk`, `bestBid`, then GC — matches the stage counters.

### Recommended next implementation change

Land a **production-adjacent helper** (separate from the current async ZIP streamer): sync buffered replay + incremental BBO, behind a clearly named function / flag. Re-check parity on a small native Mac sample **beside** the running pilot (do not restart it).

## Data policy

1. Prefer native samples already in this cloud workspace / repo.
2. Else user-provided native samples (gitignored).
3. Else a small free public CryptoStruct sample (none used — credentials/credits would be required).
4. Else **synthetic** CryptoStruct-native array lines (snapshot then contiguous updates).

Licensed raw samples stay out of git. Work files: `data/research-results/.../external-btc-ingestion-benchmark/work/` (gitignored).

### Mac reproduction (do not kill the pilot)

```bash
npm run research:external-btc-ingestion-benchmark -- --native-path /ABS/PATH/to/sample.txt.zst
```

## Attestation

- Mac pilot untouched
- No credit spend / no full-day download
- No strategy P&L
- Licensed samples not committed
