# M17 SPENT hold-to-settlement exploratory eval — `kalshi-kxbtc15m-m17-spent-hold-to-settlement-eval-v0`

Generated: 2026-09-25T01:08:27.320Z
Analysis version: `m17-spent-hold-to-settlement-eval-v0.1`
Code SHA: `1bd0d631eea173445a919207772b6141af28a26f`
Completion: **blocked-missing-frozen-decisions**
Dataset provenance: **SPENT_VALIDATION (M16-ER)**

Exploratory analysis on M16-ER SPENT_VALIDATION data only. Not confirmatory, not pristine, not holdout, not evidence of live profitability. Do not tune thresholds or select markets from these results. avg_60s_data remains research-only and is not wired into strategy gates.

## Frozen strategy definition actually used

- Name: `hold-to-settlement-terminal-mispricing`
- Side: NO
- Fee: one-standard-taker-schedule
- Outcome label: official-expiration_value-post-entry-only
- `avg_60s_data` wired into gates: **false**
- Cited regime filters: YES mid ∈ [0.3333333333333333, 0.6666666666666666), time remaining < 900000 ms, vol ≥ 0.6, direction over

### SettlementEstimate semantics (PR #123)

- expiration_value: authoritative-after-settlement-outcome-label-only
- avg_60s_data: research-only-empirical-candidate-not-a-gate
- last_60s_windowed_average_15min: diagnostic-only

## Frozen decision inventory

| Id | Status | Summary |
| --- | --- | --- |
| `hold-to-settlement-primary-track` | `frozen` | Primary economic track is enter on executable quote and hold to official settlement. |
| `side-no-calibration-fade-direction-over` | `frozen` | Target side is NO under historical calibration direction “over” (fade overconfident YES). |
| `one-standard-taker-fee` | `frozen` | Charge one STANDARD schedule taker fee at entry (qty=1, ceil-to-cent); not a flat 4¢ round-trip. |
| `outcome-label-official-expiration-value` | `frozen` | Official expiration_value / result is the post-entry outcome label only; never a pre-entry input. |
| `avg60s-not-wired-into-gates` | `frozen` | avg_60s_data is research-only empirical candidate; not wired into strategy gates or orders. |
| `cited-late-high-vol-regime-bucket-bounds` | `frozen` | Cited regime bounds: high vol ≥0.6 annualized (Coinbase completed 1m OHLC), YES mid ∈ [1/3, 2/3), time remaining < 15 minutes. |
| `settlement-state-to-yes-overpriced-entry-mapping` | `proposed-unfrozen` | No frozen rule maps remaining-average threshold T (or SettlementEstimate) to “YES is overpriced → enter NO”. T is arithmetic reachability only; P(YES\|F_t) requires a predeclared model that the M17 draft marks unresolved. |
| `official-banked-sample-field-and-window-identity` | `proposed-unfrozen` | Official banked settlement-sample field identity and window semantics remain unresolved (5Hz→60×1s mapping not frozen). |
| `historical-brti-banked-paths-on-spent-cs-days` | `absent-on-retained-data` | Retained CryptoStruct executable books do not carry pre-entry BRTI / banked settlement-sample paths; PR #124 reported validBtcSettlementPathInputs = 0. |
| `retained-sample-regime-feature-columns` | `absent-on-retained-data` | Retained friction samples lack YES bid/ask midpoint, NO ask level, and Coinbase volatility columns required to recompute the cited regime filters without regenerating quote streams. |

### Missing decisions blocking P&L

- `settlement-state-to-yes-overpriced-entry-mapping`
- `official-banked-sample-field-and-window-identity`
- `historical-brti-banked-paths-on-spent-cs-days`
- `retained-sample-regime-feature-columns`

## Candidate population and feature completeness

| Metric | Value |
| --- | ---: |
| Retained executable samples | 47307 |
| Claimed prior 20,923/72 artifact | `unavailable-not-found-in-retained-artifacts` |
| Recomputed under frozen regime filters | null |
| Independent markets (retained executable) | 3228 |
| Dates (retained executable) | 34 |
| Valid settlement-label coverage | 99.9070% |
| Unambiguous market identity | 47307 |
| Valid official settlement join | 47263 |
| Incomplete ticker excluded | 14 |
| Non-numeric expiration excluded | 30 |
| YES midpoint present | 0 |
| High-volatility feature present | 0 |
| Time-remaining feature present | 0 |
| Settlement-state path present | 0 |
| Remaining-average threshold present | 0 |
| Complete required features for entry | 0 |

Cannot recompute [1/3,2/3)×high-vol×<15m candidates from retained friction samples: YES midpoint, Coinbase realized volatility, and explicit timeRemainingMs columns are absent. Regenerating quote/vol streams was not authorized for this blocked evaluation. Claimed 20,923/72 artifact remains unavailable.

## Exploratory performance

| Field | Value |
| --- | --- |
| Status | `blocked` |
| Reason | Stopped before P&L: missing frozen settlement-state→entry mapping and/or required pre-entry features absent on retained SPENT samples. Do not invent thresholds from these 34 days. |
| NO entries simulated | 0 |
| Gross terminal outcome sum (¢) | null |
| One-taker-fee-adjusted return sum (¢) | null |
| Win rate | null |
| Average return (¢) | null |
| Median return (¢) | null |
| Variance (¢²) | null |
| Max drawdown (¢) | null |

## Baselines

- No-trade: mean fee-adjusted return = 0¢ (No-trade baseline is definitionally 0; reported without inspecting outcomes for selection.)
- Market-implied: `not-computed` — YES/NO market-implied baseline requires retained YES mid / NO ask levels on candidate rows; absent on friction samples.
- Fixed settlement-threshold: `not-defined-in-frozen-m17-design` — M17 draft §C.2 Baseline A is arithmetic-only (no trading claim). No frozen fixed settlement-threshold trading baseline exists.

## Leakage controls

- Use only information available at or before entryTimestampMs.
- Do not use expiration_value as a pre-entry input.
- Do not use post-close messages for pre-entry features.
- Do not use completed settlement data to construct a pre-entry estimate.
- Reject ambiguous market identity or timestamp joins.
- Exclude known incomplete ticker and non-numeric expiration outcomes.
- Official settlement is outcome-label / post-entry evaluation only.

## Confirmatory boundary (explicit)

- This is exploratory analysis on M16-ER SPENT data.
- It cannot establish out-of-sample performance: **false**.
- It cannot justify live trading: **false**.
- Later confirmatory test requires:

  - UTC days outside M16-ER SPENT_VALIDATION (not QUALITY_AUDIT_ONLY, not sealed M16-P)
  - Same CryptoStruct RAW-BBO-CHANGE adapter / executable book configuration
  - Study-complete official settlement labels per marketTicker
  - Pre-reserved pristine / holdout partition before any exploratory peek
  - Frozen settlement-state→entry mapping (probability model or explicit rule) registered before evaluation
  - Co-timed BRTI / banked settlement-sample paths if the claim is settlement-state causality

## Pristine validation/holdout purchase recommendation

**Justified now: no**

Do not purchase pristine validation/holdout yet. The M17 entry mapping from settlement-state arithmetic to YES-overpriced is still unfrozen, official banked-sample field identity is unresolved, and retained SPENT CryptoStruct days lack pre-entry BRTI settlement-state paths. Freeze the decision rule and establish settlement-state input availability before buying holdout data.

## Zero network / capture confirmation

| Channel | Count |
| --- | ---: |
| Market-data requests | 0 |
| WebSocket captures | 0 |
| CryptoStruct purchases | 0 |
| Trades | 0 |
| Order placements | 0 |

## Input identities

| Key | Value |
| --- | --- |
| `claimedPriorEntryArtifact` | `unavailable-not-found-in-retained-artifacts` |
| `datasetProvenance` | `SPENT_VALIDATION (M16-ER)` |
| `labelsPath` | `/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/m16-er/work/settlement-friction-label-backfill/settlement-labels.jsonl` |
| `labelsSha256` | `7c869cd12d1e3189437db5ec3c3781cee3d988eb36421ef5f9043caddf2cfec7` |
| `mode` | `retained-local` |
| `samplesPath` | `/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/m16-er/work/settlement-friction-coverage/samples.jsonl` |
| `samplesSha256` | `3f2dad5062e566ad7feacff1fbe1c0b963bbaa4d45aaa20d2a619f31098c8728` |
| `settlementJoinAuditMergeSha` | `1bd0d631eea173445a919207772b6141af28a26f` |
