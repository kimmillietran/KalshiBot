# External BTC delayed-repricing pilot — memory repair

## Status checklist

1. Memory architecture fixed? **Yes** — per-day child process + disk sparse JSONL; no `days.push` of five in-memory days.
2. Native parity passed? **Yes on compressed fixtures** (incremental vs full-scan BBO; day-worker vs in-memory runner; resume). Full multi-GB native day throughput is measured after review/run, not claimed from synthetic 3.53×.
3. Native throughput/peak memory? Fixture-only in unit tests; empirical run records `peakRssBytes` / `elapsedMs` per day result.
4. Reviewed and running? Pending PR review, then authorized five-day resume.
5. Completed days/checkpoints? None yet for empirical; caches/day-results under `…/pilot/cache/` (gitignored).

## What changed

- Incremental best-bid/ask in production `bookReplay` (`REPLAY_IMPLEMENTATION_VERSION=incremental-bbo-v1`).
- Streaming ingest writes Coinbase/Kalshi sparse quotes to versioned JSONL caches.
- `--process-one-day` child workers; parent aggregates compact day results.
- Checkpoint identity includes raw hashes, replay version, schema, emission/clock policy, simulation spec hash.
- Monitor script requires producer exit 0 + five days + artifacts (tee alone insufficient).

## Semantics

Frozen thresholds/delays/controls/exit accounting unchanged (`correction-v1`). Memory architecture is an execution repair, not a new strategy.
