# M17-prep — Bounded next study: friction + settlement-label coverage

**Study id:** `kalshi-kxbtc15m-settlement-friction-coverage-v0`

**Status:** implementation-ready specification + bound runtime configuration
(`settlement-friction-coverage-v0.1`). **Do not** run alpha, fit models, or
select bins by P&L.

**Eligible calendar:** the **34 SPENT_VALIDATION** M16-ER UTC days only
(reservoir + M16-ER day clusters). No new purchases. No QUALITY_AUDIT_ONLY days.
No pristine / sealed economic opens beyond already-authorized M16-ER results.

**Scientific question (non-alpha):** On these spent days, what is the joint
coverage of (a) executable quote sampling under predetermined bins and
(b) official Kalshi settlement **labels**, and what taker friction is observed
at those sample points — **without** reconstructing BRTI settlement state and
**without** claiming an edge.

---

## Explicit eligible input manifest and provenance

| Input | Provenance | Eligibility rule |
| --- | --- | --- |
| UTC day list | `data/research-results/external-kalshi-data-audit/m16-er-day-clusters.json` → `days[].utcDayKey` (34) | Exact match to reservoir `SPENT_VALIDATION` |
| Reservoir authority | `data/research-results/external-kalshi-data-audit/cryptostruct-reservoir-status.json` | Fail closed if day not `SPENT_VALIDATION` |
| CryptoStruct books | Local raw under M16-ER acquisition ledger (gitignored raw store) | Same adapter identity as M16-ER (`RAW-BBO-CHANGE` / adapter `3f37ecb7…`); quality gates from M16-ER admission — **no P&L reopen** |
| Kalshi settlement labels | Historical/public market fields: `result`, `expiration_value`, `settlement_ts`, `floor_strike`, `close_time` | Join by `marketTicker`; missing label → **coverage miss**, not imputed |
| Fee contract | `computeKalshiScheduleFeeCents` STANDARD taker, qty=1, ceil-to-cent | Assert full M16-ER fee identity `2c1059ecc142dd6ca9b82375e03fd84b42f55ce6d6f1435a667111eea2d0548f` via `buildM16ErFeeContract()` |
| Adapter | CryptoStruct RAW-BBO-CHANGE | Assert full identity `3f37ecb76644ee0749c50f33cfdaf8921e8dcb1cf208abdc55719a461e27dc7d` |

**Forbidden inputs:** Coinbase-as-BRTI; sealed M16-P capture economics; AVAILABLE_UNOWNED purchases; QUALITY_AUDIT_ONLY days; M14 validation captures for “rescue.”

---

## Predetermined sampling times / bins and weighting

Fixed **before** any outcome inspection of this study’s outputs:

| Parameter | Value | Rationale |
| --- | --- | --- |
| Cadence | First eligible TOB quote in each **60s** wall-clock bucket per market (file order) | Matches M15 ordinary-quote precedent; **not** P&L-tuned |
| Intraday window | Full trading session of each market on eligible days (open_time → close_time) | No TOD cherry-pick |
| Weighting | Equal weight per retained sample for friction descriptives; separately report **UTC-day** means | Avoid trade-level overcounting |
| Side | YES taker ask (complement books: YES ask = 100 − NO bid when needed) | Single canonical side |

**Do not** choose bins from profitable outcomes, reversal confirmations, or
settlement YES/NO rates.

### v0.1 bound sampling semantics (frozen before empirical run)

| Choice | Binding |
| --- | --- |
| Timestamp basis | CryptoStruct admission time: `ad_ts_ns // 1_000_000` |
| Bucket alignment | `floor(timestampMs / 60_000)` UTC wall-clock |
| Quote ordering | Sort by `timestampMs` ascending, then stable file sequence; do **not** treat arbitrary zip member order across markets as chronology. Within a member, validate causal reconstruction; sort before cadence selection |
| Quote age | `receive − exchange` when both exist; for single-clock CryptoStruct admission streams, `quoteAgeMs = 0` by documented definition (gate still `MAX_EVENT_QUOTE_AGE_MS = 2000`) |
| Stale threshold | Momentum-family / M15 `MAX_EVENT_QUOTE_AGE_MS = 2000` |
| Response match | M15/family rule: first eligible quote in `[t+H, t+H+250ms]`, strictly after t (`RESPONSE_MATCH_TOLERANCE_MS = 250`) |
| Session | `instrument.start` as open; when `expiry` is null, close from ticker HHMM interpreted in `America/New_York` |
| Cross-day | Samples attributed to the eligible zip `utcDayKey`, not inferred solely from timestamp |
| Size | Require displayed size ≥ 1 on YES best bid and YES best ask |
| Crossed/locked | Exclude |
| Round-trip definition | `entryHalfSpread + responseHalfSpread + entryFee + exitFee` — **excludes mid drift**. Not an ask→future-bid return |

Eligible calendar authority is **recomputed at runtime** from
`m16-er-day-clusters.json` and reservoir `SPENT_VALIDATION` (set equality,
duplicates fail closed). Hand-authored `spentEqualsM16ErDays` flags are not
authority.

---

## Executable entry costs vs round-trip costs

Report **separately**:

1. **Entry cost (one-way):** half-spread to YES ask + **one** STANDARD taker fee at entry price.
2. **Round-trip cost:** entry half-spread + exit half-spread at matched response quote + **two** STANDARD taker fees (entry + exit), horizons H ∈ {5s, 15s, 30s} with fixed match tolerance (reuse M15 `RESPONSE_MATCH_TOLERANCE_MS` unless rebound with identity).

Missing response quote → **unobservable** for that horizon (not zero cost).

---

## Exact fee assumptions, quantity, rounding

| Field | Value |
| --- | --- |
| Schedule | `standard` |
| Role | `taker` |
| Quantity | `1` contract |
| Rounding | ceil to next cent (`computeKalshiScheduleFeeCents`) |
| Identity check | Fail closed on fee-contract identity mismatch |

---

## Quote age, depth, missingness, exclusion

| Gate | Rule |
| --- | --- |
| Stale quote | Exclude if quote age exceeds family stale threshold (bind to existing CryptoStruct / capture health constants; fail closed if unbound) |
| Depth | Require positive size on both best bid and best ask (or complement legs); else exclude |
| Crossed/locked book | Exclude |
| Missingness | No carry-forward; no synthetic mid |
| Exclusion logging | Count exclusions by reason; never silence |

---

## Settlement-join coverage

| Metric | Definition |
| --- | --- |
| Finalized result coverage | Fraction of sampled tickers with `result ∈ {yes,no}` |
| Non-empty expiration-value | Non-empty string `expiration_value` |
| Valid numeric expiration-value | Finite positive number parse (**added diagnostic**) |
| Joint finalized + non-empty expiration | **v0 metric** (unchanged) |
| Finite strike | Finite positive `floor_strike` |
| Parseable close-time / settlement-time | `Date.parse` succeeds |
| **BRTI-path coverage** | Report verbatim: “Not measured; historical BRTI paths and causal availability are not established.” |

**Hard distinction:** high settlement-**label** coverage does **not** establish that
settlement **state** (in-window BRTI) can be reconstructed.

---

## UTC-day aggregation and limitations

- Primary aggregation unit: **UTC calendar day** among the 34.
- Report day-level mean entry cost and mean round-trip hurdles; CR2 optional
  descriptive only — **no hypothesis test claiming edge**.
- Limitations: spent books may be left-truncated; label API gaps; no BRTI causality;
  SPENT reuse is descriptive coverage only (not confirmatory validation).

---

## Outputs

1. `settlement-friction-coverage-manifest.json` — day list, identities, input hashes
2. `settlement-friction-coverage-samples.jsonl` — one row per retained sample (no strategy signals)
3. `settlement-friction-coverage-by-day.json` — UTC-day aggregates
4. `settlement-friction-coverage-report.md` — coverage + friction tables + limitations
5. Machine checks: fee identity, day eligibility, no QUALITY_AUDIT_ONLY leakage

---

## Acceptance criteria (GO / NO-GO for *this* study)

| Criterion | Pass |
| --- | --- |
| Only 34 SPENT days | Exact set equality with reservoir |
| No BRTI proxy unlabeled | Fail if Coinbase used as settlement |
| Predetermined bins | Cadence constants frozen in code identity before run |
| Separated costs | Entry vs round-trip columns both present |
| Label vs path | Report states BRTI-path coverage = not measured |
| No P&L selection | No sorting/filtering samples by realized settlement PnL |
| Gates | `npm run lint`, `npm run build`, targeted Vitest green |

**Does not** accept profitability, calibration of remaining-average thresholds, or
promotion to live trading.

---

## Remaining decisions (human / later milestone)

1. Whether to authorize a **read-only** Kalshi CFB history entitlement probe
   (still no bulk restore) to reassess settlement-**state** feasibility.
2. Whether SPENT CryptoStruct books may be used only for coverage or also for a
   separately registered confirmatory protocol (default: **forbidden**).
3. Live pin of per-ticker `strike_type` / “at least” vs strict.
4. Operator `launchctl bootout` of M16-P plist if still loaded after disable.
