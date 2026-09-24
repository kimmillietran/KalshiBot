# M17-prep — Multi-close settlement-fidelity study specification (DRAFT)

> **DRAFT — NOT PREREGISTERED — NOT AUTHORIZATION TO COLLECT OR RUN AN EXPERIMENT**
>
> This document specifies a **bounded data-semantics / settlement-fidelity study**.
> It does **not** authorize collection, live capture, trading, P&L analysis,
> probability-model freeze, threshold selection, sample-size targets for economic
> tests, sealed-outcome opens, or reservoir reclassification.
>
> **Merging this document into `main` records a draft proposal only.** It does
> **not** authorize execution. A separate explicit authorization is required
> before any live run. Do not interpret merge as a green light to collect.

**Spec id:** `kalshi-kxbtc15m-multi-close-settlement-fidelity-spec-v1`
**Branch:** `feature/m17-multi-close-settlement-fidelity-spec`
**Versions cited (exact):**

| Artifact | Version / SHA |
| --- | --- |
| PR #116 tip / merge | `e38030ad90233d17fd47e27c615a7e20d41eedb3` / `55c7cbe02e0565cbdeeeec719ce99cf0a03c742d` |
| PR #117 tip / merge | `f0f10e0c3736dd0f2ab90736a9732bad870108f5` / `80c282289842b7a3895d39ffbfbef99e4defba66` |
| PR #118 tip / merge (semantics memo) | `8a423b271d8170ff67f73cb45a8958cf25a6a6e8` / `90cd71c3ac2ed6a1b7e6d2435188ef8ad80f7458` |
| Semantics memo path | `docs/research/m17-prep-brti-settlement-average-discrepancy-semantics.md` |

Unmerged material is provisional and is not authority for this study.

---

## 1. Objective

Determine whether the **dual-field discrepancy** observed in PR #116 repeats
across a small fixed set of closes, and which claims the observed messages
support about **completed** and **intermediate** settlement state.

This is a **data-semantics study**, not a profitability or strategy experiment.

### 1.1 Claims to keep separate

| Claim family | Question | Not the same as |
| --- | --- | --- |
| **A. Official expiration agreement** | Under this study’s frozen diagnostic rounding, does a completed field value match `expiration_value`? | Proof of intermediate banked samples; proof of Kalshi’s rounding rule |
| **B. Field consistency under documented membership** | Do the two fields agree numerically when both report count 60 for the target close, **given** that documented sample memberships differ (§3.1)? | Identical payload `[start,end)` labels ⇒ identical samples |
| **C. Official one-second sample mapping** | Do messages establish that intermediate running counts are the official 60×1s banked samples (or a proven 1:1 transform)? | Completed-value agreement alone |
| **D. Pre-close usability** | Was usable **intermediate** information received locally **before** close? Separately: when was the **first completed** (count-60) value received? | Treating a post-close completed value as pre-close knowledge |

A post-close completed value does **not** invalidate an earlier intermediate
observation’s availability for claim D, but it **cannot** serve as pre-close
knowledge. Neither observation proves claim C.

---

## 2. Background (cited)

### 2.1 PR #116 (diagnostic)

1. One synchronized message carried two different averages with the **same
   declared payload window** `[close−60s, close)`:
   - `last_60s_windowed_average_15min` = `83817.61766667`
   - `avg_60s_data` = `83817.70733333`
   - recorded official `expiration_value` = `83817.71`
2. Offline replay reported **no parser swap**. Do **not** select either field
   as official because of one-expiration numerical agreement.
3. Raw synchronized capture unavailable in later environments (v4); durable
   off-host retention was not established; official HTTP body was never retained.
4. Selection/ordering/leakage corrections are merged; hermetic fixtures are
   synthetic.

### 2.2 PR #118 (documented field semantics)

From the merged semantics memo (not a vendor confirmation of settlement binding):

| Field | Documented window / membership (WS docs) |
| --- | --- |
| `avg_60s_data` | Trailing per tick: `[source_ts−60s, source_ts)`; **`window_size` counts prior ticks only** (excludes the current/closing tick of that update) |
| `last_60s_windowed_average_15min` | Quarter-hour accumulation: `(close−60s, close]`; **start tick excluded; closing tick included**; count `:01→1` … close→`60` |

**Identical payload boundary labels do not establish identical sample
membership.** Claim B must report numeric agreement **and** preserve this
documented membership distinction.

---

## 3. Predeclared comparisons (freeze before any new observation)

### 3.1 Fields (preserve identities)

Track **both**, never collapse, rename, or prefer the one that matches official:

1. `last_60s_windowed_average_15min`
2. `avg_60s_data` when its declared payload window equals the target settlement
   minute schema pair used by #116 selection: `[close−60s, close)` **as labeled
   in the payload**, while still recording that documented membership differs
   from the quarter-hour field (§2.2).

Do **not** search offsets, phases, weights, alternate windows, or other field
names to force agreement with `expiration_value`.

### 3.2 Completed-update selection (frozen)

Reuse merged #116 rules per field:

- Completed requires **count = 60** and declared payload window exactly the
  target settlement-minute label pair above.
- Incomplete updates are **not** presented as completed.
- Among repeated completed updates for that window: **first by monotonic
  receipt**, then wall receipt as tie-break.
- Record later repeats; do not silently overwrite chronology.

### 3.3 Numeric comparison (frozen diagnostic convention)

Official Kalshi rounding for `expiration_value` remains **undocumented** in the
reviewed #118 sources. This study therefore uses an explicit **diagnostic**
convention — **not** Kalshi’s proven rule:

| Rule | Definition |
| --- | --- |
| Parse | Interpret field/`expiration_value` strings as decimal rationals (reject non-finite) |
| Diagnostic round | Round half to even (**IEEE 754 roundTiesToEven**) to **2** decimal places |
| Primary match | Diagnostic-rounded field == diagnostic-rounded official |
| Also report | Unrounded numeric difference (field − official) to full parsed precision; raw **string** equality (`===` on retained strings); numeric equality of parsed values before rounding |

Dual-field consistency reports the same four comparisons between the two
fields. Do not retune the rounding rule after seeing outcomes.

### 3.4 Timestamp interpretation (frozen)

- Local wall receipt and monotonic receipt are primary for availability (D).
- Provider / venue timestamps are retained but **distinct**.
- Ordering for selection and repeats follows receipt order, including ties,
  per merged #116.

### 3.5 Streams

| Stream | Requirement | Rationale |
| --- | --- | --- |
| `cfbenchmarks_value` (1Hz) | **Required** | Carries both average fields under study |
| `cfbenchmarks_value_5hz` | **Optional** | Averages live on 1Hz only (#118); useful for cadence/diagnostics, not required for A–D as defined |
| Order book | **Omitted** | Not needed for A–C; claim D here is about settlement-field availability, not executable quotes |
| Official Kalshi HTTP settlement metadata | **Required** after close | `expiration_value` + market identity |

### 3.6 Intermediate-sample claim discipline

Matching completed averages do **not** prove intermediate running counts are
official banked samples. Claim C needs authoritative documentation or a
predeclared transform validated against official sample identities.

---

## 4. Bounded protocol (proposal only — not authorized)

### 4.1 Immutable eight-slot plan

Before any capture attempt, freeze an **immutable plan** of exactly **eight**
slot records. Resume **must** reload this plan; slot close times **cannot** be
replaced, shifted, or extended because a slot failed or disagreed.

**Deterministic close list:**

1. Operator supplies `planFrozenAtUtc` and `firstEligibleCloseAfterUtc`.
2. Require **lead time:** `firstEligibleCloseAfterUtc ≥ planFrozenAtUtc + 120s`
   so the first slot’s connect offset (§4.2) is reachable.
3. Let `C0` = the earliest KXBTC15M quarter-hour close
   (`:00/:15/:30/:45` UTC) with `close > firstEligibleCloseAfterUtc`.
4. Slots `i = 0..7` have `closeUtc = C0 + i × 15 minutes` (contiguous quarter
   hours). No skipping for overlap with other campaigns; this campaign owns
   these eight wall-clock closes once frozen.
5. Persist `{slotIndex, closeUtc, marketTicker: null, eventTicker: null,
   indexSymbol: "BRTI", status skeleton}` to the campaign plan file.
6. **Missed / failed slots consume their place** and are never replaced by a
   later close.

**Deterministic market binding (before observation for that slot):**

- Series: `KXBTC15M`. Index: `BRTI`.
- At or before connect time for slot `i`, discover the unique open market whose
  `close_time` equals `closeUtc` (second precision as returned by the API).
- Bind `marketTicker`, `eventTicker`, `close_time`, and strike identity into the
  plan **before** recording any WS observation for that slot.
- If discovery cannot bind uniquely within the slot’s HTTP budget and deadline
  (§4.3), mark capture status `bind-failed` and do not open WS for that slot.

### 4.2 Per-slot timing (within 90 s connected allowance)

All offsets relative to bound `closeUtc` (= `T`). Connected time for the slot
must not exceed **90 s**.

| Phase | Offset | Action |
| --- | --- | --- |
| Connect earliest | `T − 75s` | Open WS (1Hz required; 5Hz optional if enabled in config) |
| Capture start | `T − 70s` | Begin counting messages/bytes toward caps; retain raw frames |
| Close instant | `T` | Boundary for pre-close vs post-close receipt classification |
| Capture stop | `min(T + 15s, connectStart + 90s)` | Stop WS receive for this slot |
| Hard disconnect | `connectStart + 90s` | Force close if still open |

If the process starts a slot late such that `now > T − 75s`, still attempt
connect immediately, but **do not** shift `T`. If `now ≥ T`, mark
`capture.status = missed-slot` (no WS) — the slot is consumed.

Reconnects: at most **2** connection attempts per slot; reconnect time counts
toward the 90 s connected allowance and toward campaign WS duration.

### 4.3 HTTP budgets (retries included, not additive)

| Scope | Ceiling | Contents |
| --- | --- | --- |
| Campaign HTTP | **96** total | **Every** attempt counts, including retries and failures |
| Per-slot HTTP | **12** total | Discovery + post-close metadata + **all** retries for that slot |
| Campaign HTTP retry attempts | **16** of the 96 | Sub-cap: at most 16 attempts may be classified `retry`; still increments the 96 and the per-slot 12 |

**Discovery schedule (per slot, before connect):**

- Attempts at connect-planning time: up to 3 GETs (initial + ≤2 retries) for
  market list / ticker resolution.
- Deadline: connect earliest (`T − 75s`). After deadline → `bind-failed`.

**Post-close official metadata schedule (per slot):**

- Polls at `T + 5s`, `T + 20s`, `T + 45s` (each poll is one HTTP attempt;
  failed transport retries for a poll count extra within the slot’s 12).
- Stop early on definitive body with `expiration_value` for the bound ticker.
- Deadline: `T + 60s` or per-slot HTTP exhaustion, whichever first.
- Exhaustion without label → `official.status = unavailable` (capture may still
  be `ok`).

**WS campaign caps (unchanged ceilings):**

| Resource | Ceiling |
| --- | --- |
| WS connections | **16** (failed attempts count) |
| WS connected duration | **90 s**/slot; **720 s** campaign |
| WS messages | **25,000** campaign |
| WS raw bytes | **32 MiB** campaign |
| Campaign wall clock | **4 hours** from first attempt |

**Global exhaustion:** if campaign HTTP, WS duration/messages/bytes, connection
count, or wall clock is exhausted, every **remaining** scheduled slot is
recorded with `capture.status = campaign-exhausted` (and official/retention
`not-attempted`). Slots are not replaced.

Resumes reload ledgers and **must not** reset counters or rewrite frozen
`closeUtc` values.

Campaign id (new): `kalshi-kxbtc15m-multi-close-settlement-fidelity-v0`.

### 4.4 Per-slot status model (three axes)

Each of the eight slots **always** appears in the report with three independent
statuses (plus optional detail codes):

| Axis | Allowed values |
| --- | --- |
| **capture** | `pending` \| `ok` \| `bind-failed` \| `missed-slot` \| `connect-failed` \| `limit-stop` \| `campaign-exhausted` \| `not-attempted` |
| **official** | `pending` \| `retrieved` \| `unavailable` \| `not-attempted` |
| **retention** | `pending` \| `verified` \| `failed` \| `not-attempted` |

Rules:

- `capture=ok` means the WS window ran to the planned stop (or clean limit-stop
  after close) and raw frames for the slot were locally written.
- `official=unavailable` means budgeted post-close polls finished without a
  usable `expiration_value` — **independent** of `capture=ok`.
- `retention=failed` on any slot **stops the campaign**; later slots stay
  `not-attempted` / `campaign-exhausted` as appropriate. Do not continue.
- Do **not** collapse these into a single overlapping enum.

### 4.5 What this protocol does not do

- No trading, recommendations, or executable evaluation.
- No offset/phase/weight search.
- No sealed M16-P / M14 opens; no SPENT reclassification.
- No extending or replacing slots because fields disagree.
- No sending the #118 Kalshi support draft from this workstream.

---

## 5. Evidence retention (hard gate before any collection)

### 5.1 Preconditions (all required)

1. An **existing permitted private** artifact destination.
2. **Verified archive/retrieve round-trip** with a non-sensitive test artifact;
   SHA-256 equality before archive and after retrieve into a **separate** path.
3. Documented retention/retrieval process and limitations.
4. Retain: raw WS messages, official metadata **HTTP bodies**, run config,
   campaign ledger/plan, provenance (git SHA, campaign id, host without secrets).
5. Secret-safe bundles (no keys, tokens, auth headers, `.env`).
6. Hash verification of every retained raw object after retrieval.

**Gitignored worktree paths plus hashes alone are insufficient** as the sole
durability story.

**Destination class for this local Project Lead workflow (proposed):**

- **Primary:** persistent local directory **outside** disposable git worktrees
  (operator home research archive), plus
- **Independently recoverable copy:** same-host second path or Time Machine /
  existing backup **only if verified** in the retention round-trip record.

If an off-host destination is later required by policy, satisfy it or amend
this section in a reviewed PR — do not silently weaken §5.

### 5.2 Failure handling

| Failure | Action |
| --- | --- |
| Round-trip pretest fails | Refuse to start collection |
| Slot retention fails | `retention=failed`; **stop campaign** |
| Later retrieval hash mismatch | Mark closes non-reproducible; no independent-replay claim |

### 5.3 Readiness

Until §5.1 is verified for the operator environment, **collection is blocked**.

---

## 6. Decision rules (predeclared)

After all eight slots (or earlier stop for retention/`campaign-exhausted`):

| Pattern | Allowed conclusion | Forbidden inference |
| --- | --- | --- |
| Both fields agree with each other and with official under diagnostic rounding | Completed-field agreement for that close | Intermediate counts are official banked samples; Kalshi rounding proven |
| Only settlement-window field agrees with official | Settlement field matched; trailing did not | Trailing always wrong |
| Only trailing (same payload label) agrees with official | Trailing matched; settlement field did not | Select trailing as official |
| Neither agrees | Mapping unresolved for that close | Force-fit windows |
| Intermediate received before close; completed only after | Intermediate availability recorded; completed is post-close diagnostic only | Treat completed as pre-close knowledge |
| Official unavailable | No agreement claim | Impute expiration |
| Mixed across closes | Per-close table; discrepancy can repeat or not | Population rate / economic readiness |

Claim C still needs authoritative documentation beyond completed-value matches.

---

## 7. Governance

- Observations (if separately authorized) are operational/exploratory fidelity
  data, not untouched strategy confirmation.
- No sealed outcomes, pristine claims, P&L, fitting, trading, or reservoir
  changes.
- M17 profitability testing is **not** ready.

---

## 8. Deliverables (when separately authorized)

1. Frozen plan + campaign ledger + config SHA.
2. Per-slot three-axis statuses and chronologies (both fields; receipt times).
3. Retention manifest with hashes and retrieval verification.
4. Fidelity report mapped to claims A–D and §6.
5. Explicit unresolved list (including official rounding and field→expiration
   binding).

---

## 9. Document history

| Version | Date (UTC) | Notes |
| --- | --- | --- |
| spec-v0 | 2026-09-24 | Initial bounded fidelity proposal after #116/#117 |
| spec-v1 | 2026-09-24 | Project Lead corrections: immutable slots/timing; inclusive retry budgets; three-axis statuses; frozen diagnostic rounding; #118 membership semantics; availability split; merge≠authorization |
