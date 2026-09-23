# M17-prep — Settlement-state feasibility

**Milestone role:** documented feasibility decision for a settlement-state
research family. **Not** a trading strategy, alpha backtest, or edge claim.

**Base SHA:** `93dacbf94746f9a5c19efec6a2380f6422505b1c` (`origin/main`, PR #111 merged).

**Verdict:** **blocked on identified inputs** (see matrix). Public rules are
sufficient to *specify* the mechanism; causally reconstructible historical BRTI
paths aligned to the 34 SPENT M16-ER days are **not** established in-repo without
restricted acquisition.

---

## 1. Exact KXBTC15M payoff rules (documented)

Sources (retrieved/inspected 2026-09-23; versions as published URLs — PDF templates
are fill-in contract terms):

| Source | URL / path | Role |
| --- | --- | --- |
| Kalshi Help — Crypto Markets | https://help.kalshi.com/en/articles/13823838-crypto-markets | Settlement averaging methodology |
| Kalshi CRYPTO15M contract terms | https://assets.kalshi.com/contract_terms/CRYPTO15M.pdf | Formal underlying / contingencies |
| Kalshi BTC contract terms | https://assets.kalshi.com/contract_terms/BTC.pdf | BRTI minute-average underlying |
| Kalshi WS `cfbenchmarks_value` | https://docs.kalshi.com/websockets/cfbenchmarks-value | Live window semantics + timestamps |
| Kalshi CFB REST passthrough | https://docs.kalshi.com/cfbenchmarks/rest-passthrough | Historical/live REST access model |
| CME Globex notice (BRTI 200ms) | https://www.cmegroup.com/notices/electronic-trading/2026/05/20260518.html | Upstream publication cadence change 2026-05-18 |
| Repo fixture | `src/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json` | Field shapes (`floor_strike`, `expiration_value`, times) |

### Strike source

- Market metadata exposes **`floor_strike`** (USD) as the locked threshold on the
  market object (repo fixture: `94180.12`).
- Public market-rule prose for KXBTC15M iterations compares the **close-window**
  60s BRTI average to the **open-window** 60s BRTI average (“at least” / ≥), with
  the open reference corresponding to the listed strike level.
- Formal CRYPTO15M terms use comparative language (“at least X” = X or greater;
  “above X” = strict). **Per-market `strike_type` was not live-verified** in this
  milestone (no authenticated market pull).

### Settlement averaging window and sample timestamps

Per Kalshi Help + WS docs for `last_60s_windowed_average_15min`:

- Active window: `(quarter_close_ts_ms − 60000, quarter_close_ts_ms]`
- **Start boundary excluded; close tick included**
- Second-indexed counts: `:01 → 1` … `:59 → 59`, close (`:00/:15/:30/:45`) → **60**
- Help center: 60 RTI prices at one-second intervals in the final minute; official
  value = average of those prices.

### Sample count / cadence

- **Official settlement description:** 60 samples × 1s (Help Center, contract notices).
- **Upstream BRTI publication:** CME notice effective **2026-05-18** moved BRTI to
  **200ms (5Hz)**. Mapping from 5Hz upstream ticks to Kalshi’s “60 one-second”
  settlement set is **documented as Kalshi’s settlement rule**, but the exact
  second-index selection under 5Hz is **unverified** here.
- Live Kalshi channel emits ~1Hz on `cfbenchmarks_value`; sibling `cfbenchmarks_value_5hz`
  exists for supported coins including BTC.

### Strict vs inclusive comparison

- Market-page language commonly uses **“at least”** (inclusive ≥) vs open reference.
- Contract terms distinguish “above” (strict) vs “at least” (inclusive).
- **Unresolved without live `strike_type` / rule text for each ticker.** Fail closed:
  do not assume strict inequality for research joins.

### Rounding, missing samples, exceptional settlement

- Public notices: expiration average **rounded to nearest 2 decimal places**
  (third-party capture of venue notice; treat as **likely** but confirm on live
  market page before alpha work).
- CRYPTO15M: if **no data or incomplete** at expiration → **affected strikes resolve No**.
- Revisions after Expiration **do not** change Expiration Value (BTC/CRYPTO terms).
- Contingencies: Market Outcome Review / Rulebook pathways exist; not modeled here.

### Close time vs expiration vs settlement time

Repo fixture example (`KXBTC15M-25DEC311900-00`):

| Field | Value |
| --- | --- |
| `open_time` | `2025-12-31T18:45:00Z` |
| `close_time` | `2025-12-31T19:00:00Z` |
| `settlement_ts` | `2025-12-31T19:05:00Z` (+5 minutes) |
| `expiration_value` | `"94210.55"` (list wire; may be empty on some historical eras) |
| `result` | `yes` / `no` when finalized |

CRYPTO15M template lists a generic Expiration Time placeholder (e.g. 10:00 AM ET)
for some crypto products — **15m series uses quarter-hour `close_time` as the
scientific close**; do not confuse template boilerplate with KXBTC15M schedule.

---

## 2. Required data and current availability

| Input | Need | Status | Notes |
| --- | --- | --- | --- |
| Market metadata + strikes | `floor_strike`, times, ticker | **Available** (Kalshi public/historical API pattern; fixtures; expansion imports) | Some eras have empty `expiration_value` on historical list |
| Official settlement outcomes/values | `result`, `expiration_value`, `settlement_ts` | **Partially available** | Labels recoverable via Kalshi historical when populated; **not** proof of BRTI-path reconstructability |
| Historical BRTI observations (1Hz / settlement-aligned) | Full settlement-minute paths | **Unavailable in-repo** | No BRTI/CFB artifacts under `data/`. Passthrough history documented but **not queried** (no dataset download this milestone) |
| Live BRTI + delivery timestamps | `received_at` vs upstream `time` | **Documented available** (auth WS) | Requires Kalshi credentials + entitlement; not exercised here |
| Synchronized Kalshi book data | Executable quotes at decision times | **Partially available** | CryptoStruct RAW books for **34 SPENT_VALIDATION** days owned/spent for M16-ER; co-timed BRTI absent |
| Overlap with 34 SPENT M16-ER days | Same UTC days | **Available (dates)** | Reservoir SPENT_VALIDATION list matches M16-ER day clusters; BRTI path overlap **unverified** |

**Coinbase / other spot proxies:** explicitly **out of scope** as exact BRTI.
Any proxy experiment must be labeled approximate and non-settlement-faithful.

---

## 3. Causal reconstruction

| Concept | Definition for this family |
| --- | --- |
| Event / observation time | Upstream BRTI `time` / sample index inside `(close−60s, close]` |
| Receipt / availability time | Kalshi `received_at` (WS) or local ingest clock — **what a live strategy could know** |
| Decision time | Instant when comparing conditional settlement state to executable book |

Rules:

- Historical history endpoints return **index values at timestamps**, not proof of
  contemporaneous live availability or lag.
- Revisions after expiration are ignored for official Expiration Value; live
  research must still model **late/missing ticks** before close.
- Missing samples: official rule can force **No**; research must not invent fills.
- Clock uncertainty: treat exchange/`received_at` skew as first-class; do not
  equate CryptoStruct book timestamps with BRTI receipt time without a join study.

**Conditional arithmetic (not a probability model):**

For total samples \(N=60\), observed sum \(S\), remaining \(R=N-k\):

\[
T = \frac{N \cdot \mathrm{strike} - S}{R}
\]

Implemented as `computeRemainingAverageThreshold` in
`src/lib/data/research/settlementStateFeasibility/`.
Completed window (\(R=0\)): compare observed mean to strike separately; threshold
undefined.

---

## 4. Access and cost

| Channel | Entitlement | Cost notes | This milestone |
| --- | --- | --- | --- |
| Kalshi public market metadata | Public / Trade API | Standard API | Docs + fixtures only |
| Kalshi `cfbenchmarks_value` WS | Authenticated; entitlement | Live stream | **Not connected** |
| Kalshi `/cfbenchmarks/history/values` | Authenticated passthrough; entitlement-gated | 50 read tokens/req (docs) | **Not called** (would constitute dataset pull) |
| Direct CF Benchmarks license | Separate vendor | Unknown; not estimated without quote | **Unresolved** |
| CryptoStruct books (34 days) | Already owned; **SPENT_VALIDATION** | 0 incremental purchase | Metadata/reservoir only; no restore |
| CryptoStruct additional days | Purchasable per reservoir | Quotes on file (e.g. 10d=10 EUR) | **No purchase** |

Missing credentials / unresolved access: live Kalshi CFB entitlement not verified;
no CF Benchmarks direct key in repo.

---

## 5. Research independence

| Prior work | Mechanism | Overlap risk |
| --- | --- | --- |
| Calibration-fade family | Implied vs realized frequency / vol-conditioned fades | Consumes historical Kalshi research outputs + settlement **labels**; **not** BRTI remaining-average state |
| Terminal / forward settlement coverage | Join official settlement onto captures | Label coverage tooling exists (`forwardSettlementCoverage`); does **not** reconstruct BRTI paths |
| M14 continuation / M16 reversal | Orderbook exhaustion / reversal | Distinct signal family; M16-ER **spent** CryptoStruct books on 34 days for reversal estimand |
| Proposed settlement-state | In-window BRTI samples → remaining threshold vs strike → compare to executable prices | Distinct mechanism; **shares calendar** with SPENT days if books reused |

**Distinctness claim (provisional):** settlement-state is a **path-to-settlement**
family on CFB BRTI, not side-invariant reversal. **Unresolved overlap:** any study
that reuses SPENT CryptoStruct quotes on those 34 days for confirmatory inference
must respect reservoir invariants (discovery reuse allowed; confirmatory reuse
forbidden by default). The bounded next study below is framed as **friction /
settlement-label coverage**, not confirmatory alpha.

Reddit / third-party “edge” claims: **hypothesis provenance only**.

---

## Feasibility verdict

**Blocked on identified inputs** for a causally faithful settlement-state *alpha*
or path-reconstruction family:

1. No in-repo historical BRTI settlement-minute paths for the 34 SPENT days.
2. Passthrough/history entitlement and causal receipt timestamps **unverified**
   without a download (forbidden here).
3. Inclusive vs strict strike comparison not live-pinned per ticker.
4. 1s vs 5Hz upstream mapping under post-2026-05-18 BRTI cadence unverified.

**Not a NO-GO on the research idea** — rules are clear enough to specify a
**bounded friction + settlement-label coverage** study that does **not** claim
BRTI-path reconstructability (see companion spec).
