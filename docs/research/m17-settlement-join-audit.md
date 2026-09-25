# M17 — Settlement-join audit on SPENT CryptoStruct days

**Study id:** `kalshi-kxbtc15m-m17-settlement-join-audit-v0`

**Role:** feasibility / coverage only. **Not** confirmatory validation. **Not**
an alpha or P&L study. Strategy thresholds are **not** tuned from these results.

## Purpose

Join already-retained M17-prep executable entry samples to already-backfilled
official settlement labels (PR #114) by **exact `marketTicker`**, and report
settlement-join coverage for exploratory hold-to-settlement analysis.

## Eligible universe (retained)

No separate frozen “20,923 / 72 markets” entry-filter artifact was found in
retained paths. This audit therefore joins:

| Input | Path | Identity |
| --- | --- | --- |
| Executable samples | `data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl` | SHA-256 `3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728` (47,307 rows; PR #113) |
| Settlement labels | `data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl` | SHA-256 `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` (3,228 tickers; PR #114 / `0b43ffe…`) |
| Incomplete records | `…/m17-prep-settlement-friction-label-coverage/incomplete-records.json` | Known incomplete: `KXBTC15M-26AUG140315-15` |
| Calendar | 34 SPENT_VALIDATION M16-ER UTC days | Day-clusters + reservoir authority from friction study |

Prior friction/label-coverage reports (preserved, not regenerated as authority):

- `data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-coverage/`
- `data/research-results/external-kalshi-data-audit/m17-prep-settlement-friction-label-coverage/`

## Fixed strategy definition (not tuned)

Hold-to-settlement / terminal mispricing:

- late high-volatility BTC market;
- enter **NO** when the frozen settlement-state estimate indicates YES is overpriced;
- hold until settlement;
- charge one taker fee;
- use official `expiration_value` as the outcome label.

`avg_60s_data` remains research-only (PR #123) and is **not** wired into gates.

## Join rules

- Exact `marketTicker` only.
- Reject blank / mismatched identities.
- Reject conflicting or duplicate label tickers.
- Exclude known incomplete ticker explicitly (no imputed outcome).
- Study-complete label requires finalized `result`, non-empty numeric
  `expiration_value`, finite `floorStrike`, parseable close/settlement times.
- BRTI/BTC settlement-path inputs: **not measured** on these CryptoStruct books
  (`validBtcSettlementPathInputs = 0`).

## Commands

```bash
# Hermetic fixtures (CI) — writes under gitignored
# data/research-results/m17-settlement-join-audit-fixture/ (does not clobber retained summaries)
npm run research:m17-settlement-join-audit -- --fixture

# Local retained artifacts (no network) — writes retained summaries under
# data/research-results/external-kalshi-data-audit/m17-prep-settlement-join-audit/
npm run research:m17-settlement-join-audit
```

## Outputs

`data/research-results/external-kalshi-data-audit/m17-prep-settlement-join-audit/`

- `settlement-join-audit-report.json`
- `settlement-join-audit-report.md`
- `settlement-join-audit-counts.json`

## Separated verdict axes

| Axis | Meaning |
| --- | --- |
| Data availability | Do retained samples join to official labels? |
| Exploratory usability | Enough independent markets/dates for discovery on SPENT days? |
| Confirmatory validity | Always **not** confirmatory while the calendar is SPENT_VALIDATION |

A pristine validation/holdout purchase is **justified for confirmatory work**,
not because label join failed on SPENT days.

## Empirical join result (local retained run)

| Metric | Value |
| --- | ---: |
| Eligible executable records | 47,307 |
| Valid official settlement join | 47,263 |
| Settlement-join % | 99.90699% |
| Excluded known-incomplete ticker records | 14 |
| Non-numeric expiration_value records | 30 |
| Independent markets with valid join | 3,225 |
| Eligible dates with valid join | 34 |
| Meets ≥5 independent markets | yes |
| Exploratory usability | sufficient |
| Confirmatory validity | **not** (SPENT_VALIDATION) |

Descriptive YES/NO outcome counts among joined records are SPENT/exploratory only
and must not be used to tune or select the strategy.
