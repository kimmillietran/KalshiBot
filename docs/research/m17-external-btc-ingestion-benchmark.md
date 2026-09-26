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

## Scope

Profile and bound-benchmark the CryptoStruct L2 streaming path introduced for the delayed-repricing pilot (`streamCryptostructTick` + `bookReplay`), then prototype highest-value optimizations behind the benchmark module only.

## Data policy

1. Prefer native samples already in this cloud workspace / repo.
2. Else user-provided native samples (gitignored).
3. Else a small free public CryptoStruct sample (none used — credentials/credits would be required).
4. Else **synthetic** CryptoStruct-native array lines (snapshot then contiguous updates).

Licensed raw samples stay out of git. Work files: `data/research-results/.../external-btc-ingestion-benchmark/work/` (gitignored).

### Supply a native sample (Mac, beside pilot — do not kill the pilot)

```bash
# Place a small representative .txt.zst (valid snapshot + contiguous updates):
#   data/external-samples/cryptostruct/benchmark/native-sample.txt.zst
npm run research:external-btc-ingestion-benchmark -- --native-path /ABS/PATH/to/sample.txt.zst
```

## Measured artifacts

After a cloud run, see:

- `data/research-results/external-kalshi-data-audit/external-btc-ingestion-benchmark/ingestion-benchmark-report.md`
- `.../ingestion-benchmark-report.json`
- `.../summary.json`

## Attestation

- Mac pilot untouched
- No credit spend / no full-day download
- No strategy P&L
- Licensed samples not committed
