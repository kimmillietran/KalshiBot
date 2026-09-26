# Superseded: attempt-3 partial five-day pilot results

**Status:** Superseded by repair-v2 (expiry recovery + payout-envelope accounting + monitor fix).

## Why superseded

1. **Only three days contributed entries.** 2026-08-28, 2026-09-04, and 2026-09-11 had Kalshi contracts. 2026-08-14 and 2026-08-21 were pipeline-blocked: CryptoStruct headers had `instrument.expiry: null`, and ingest required start+expiry, yielding `contracts=[]` and universal `no-active-contract` rejects. Those zeros are **not** legitimate economic no-opportunity days.

2. **Unresolved-position "upper bound" mislabel.** `allEntryUpperBoundNetCents` for unresolved rows used last-observed same-side bid mark-to-market, incorrectly labeled as an optimistic upper bound. True terminal-payout envelopes are `0 − entryCost` (floor) and `100 − entryCost` (ceiling). Last-bid MTM is a separate scenario.

3. **Producer exit status was not captured.** Monitor hung on bare `wait` (deadlock with `caffeinate -w $$`). Attempt-3 artifacts were validated offline after the monitor was killed. Do **not** claim producer exit was observed as zero. Ignore `producer_exit=0` / `empirical_valid=1` lines in archived `run-monitor-status-*.txt` — those were offline inferences, not an observed monitor success.

## Historical attempt-3 wording (required)

> Producer exit status unknown/not captured; artifacts validated offline.

## Preserved

- Failed-attempt logs (OOM attempt1, abandoned attempt2, monitored attempt3 stdout)
- Raw CryptoStruct inputs (unchanged under external-samples)
- Valid Coinbase and Kalshi quote JSONL caches (expiry bug omitted contract sidecars only; quote reconstruction persisted)
- Empty/wrong 08-14 and 08-21 contract sidecars (copied under `contract-sidecars-pre-repair/`)
- Pre-repair day-result artifacts were retained locally where applicable (not all copied into this superseded tree; empty/wrong contract sidecars for 08-14/08-21 are under `contract-sidecars-pre-repair/`)
