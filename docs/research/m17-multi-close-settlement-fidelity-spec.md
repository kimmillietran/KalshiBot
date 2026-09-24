# M17-prep — Multi-close settlement-fidelity study specification (DRAFT)

> **DRAFT — NOT PREREGISTERED — NOT AUTHORIZATION TO COLLECT OR RUN AN EXPERIMENT**
>
> This document specifies a **bounded data-semantics / settlement-fidelity study**.
> It does **not** authorize collection, live capture, trading, P&L analysis,
> probability-model freeze, threshold selection, sample-size targets for economic
> tests, sealed-outcome opens, or reservoir reclassification. Opening or merging
> this documentation PR does **not** start the study.

**Spec id:** `kalshi-kxbtc15m-multi-close-settlement-fidelity-spec-v0`
**Branch:** `feature/m17-multi-close-settlement-fidelity-spec`
**Base:** `origin/main` after PR #117 (`80c282289842b7a3895d39ffbfbef99e4defba66`)
**Depends on:** merged PR #116 tip `e38030a` / merge `55c7cbe`; design draft PR #117

---

## 1. Objective

Determine whether the **same-window dual-field discrepancy** observed in PR #116
repeats across a small fixed set of closes, and which claims the observed
messages support about **completed** and **intermediate** settlement state.

This is a **data-semantics study**, not a profitability experiment.

### 1.1 Claims to keep separate

| Claim family | Question | Not the same as |
| --- | --- | --- |
| **A. Official expiration agreement** | After rounding rules frozen for this study, does a completed field value match `expiration_value`? | Proof of intermediate banked samples |
| **B. Field / window consistency** | For the same declared window, do `last_60s_windowed_average_15min` and `avg_60s_data` agree with each other? | Which field (if either) is official |
| **C. Official one-second sample mapping** | Do messages establish that intermediate running counts are the official 60×1s banked samples (or a proven 1:1 transform)? | Completed-value agreement alone |
| **D. Pre-close usability** | Was a usable completed (or intermediate) value **received locally before close**? | Post-close fidelity diagnostics |

A completed field **first received after close** may be useful for fidelity
diagnostics (A/B) but **cannot** be used for a pre-close trading decision (D).

---

## 2. Background from merged #116 (cited, not re-proven here)

1. One synchronized message carried two different averages for the **same
   declared window**:
   - settlement field `last_60s_windowed_average_15min` = `83817.61766667`
   - trailing field `avg_60s_data` = `83817.70733333`
   - recorded official expiration = `83817.71`
2. Offline replay reported **no parser swap**. The trailing near-match remains
   **exploratory**; do **not** select `avg_60s_data` because it matched one
   expiration.
3. Original synchronized raw capture
   (`SHA-256 938cdde6…`, 6,111,585 bytes / 15,716 lines) is **unavailable in
   the Project Lead environment**; independent replay is not possible there.
   Durable off-VM retention was **not established**. Official HTTP response body
   for that session was **never retained**.
4. Code corrections (count-60 + target window; first-by-mono-receipt; explicit
   growing vs unrelated windows; receipt-ordered quote alignment; computed
   leakage) are merged; hermetic fixtures are synthetic, not original bytes.

---

## 3. Predeclared comparisons (freeze before any new observation)

### 3.1 Fields (preserve identities)

Track **both**, never collapse or rename:

1. `last_60s_windowed_average_15min`
2. `avg_60s_data` **only when** its declared window exactly matches the target
   settlement minute `[close−60s, close)` (same binding as #116
   `selectCompletedWindowAverage`).

Do **not** search offsets, phases, weights, alternate windows, or other field
names to force agreement with `expiration_value`.

### 3.2 Completed-update selection (frozen)

Reuse merged #116 rules:

- Completed requires **count = 60** and declared window exactly the target
  settlement minute.
- Incomplete updates are **not** presented as completed.
- Among repeated completed updates for that window: **first by monotonic
  receipt** (then wall receipt as documented tie-break).
- Record later repeats; do not silently overwrite chronology.

### 3.3 Numeric comparison (freeze before collection)

Predeclare and record in the run config (do not tune on outcomes):

- Decimal comparison of completed field value vs official `expiration_value`
  after an explicit rounding rule (e.g. round half-even to 2 decimals — **must
  be written into the campaign config before the first close**).
- Exact string equality of raw decimal strings as a secondary diagnostic only.
- Dual-field consistency: exact raw equality and rounded equality, reported
  separately.

### 3.4 Timestamp interpretation (freeze before collection)

- Local wall receipt and monotonic receipt are primary for causal/availability
  questions.
- Provider / venue timestamps are retained but **distinct**.
- Quote alignment and leakage checks follow receipt ordering, including
  timestamp ties, per merged #116.

### 3.5 Intermediate-sample claim discipline

A finite collection of matching completed averages does **not** by itself prove
that every intermediate running count represents official banked samples.
Claim C requires either:

- authoritative venue/CFB documentation of the banking rule, or
- a predeclared transform validated against retained official sample identities
  (not invented post hoc).

---

## 4. Bounded protocol (proposal only — not authorized)

### 4.1 Close selection

- **N = 8** KXBTC15M closes (operational bound, **not** a statistical validation
  sample size).
- **Deterministic calendar rule:** the next 8 distinct `:00/:15/:30/:45` UTC
  closes strictly after campaign `startAfterUtc`, skipping any close whose
  planned sync window would overlap an already-recorded attempt for this
  campaign id. No substitution based on market outcomes, volatility, or prior
  agree/disagree results.
- **No extension** because results disagree or fields are missing. Failed or
  missing closes are recorded and count toward the 8 slots (see §4.4).

**Justification of scope (operational, not statistical):** eight closes is
enough to see whether the #116 dual-field pattern **repeats or not** under
fixed rules, while keeping HTTP/WS and operator burden small. It does **not**
authorize inferring population rates, edge, or readiness for M17 economics.

### 4.2 Exact budget ceilings (persistent across resumes)

| Resource | Hard ceiling (whole campaign) | Notes |
| --- | --- | --- |
| HTTP requests | **96** | ≤12 per close slot (discovery + official settlement metadata + bounded retries) |
| HTTP retries | **16** total | Exponential backoff capped; no unbounded retry |
| WS connections | **16** | ≤2 connection attempts per close slot |
| WS duration | **90 s** connected time per close slot; **720 s** campaign total | Connect before window; stop at limit |
| WS messages | **25,000** campaign total | Stop capture when hit |
| WS raw bytes | **32 MiB** campaign total | Stop capture when hit |
| Campaign wall clock | **4 hours** from first attempt | Resume allowed within ceiling |

Use a **new** campaign id (e.g. `kalshi-kxbtc15m-multi-close-settlement-fidelity-v0`)
with a durable ledger under the existing campaign-budget pattern. Resumes must
reload the ledger and **must not** reset counters.

### 4.3 Streams (minimum necessary)

**Required for this fidelity question:**

- CFB / BRTI settlement-average channels that carry
  `last_60s_windowed_average_15min` and `avg_60s_data` (same class as #116).
- Official Kalshi HTTP settlement metadata for the bound market after close
  (`expiration_value`, identity fields).
- Local receipt clocks (wall + mono).

**Order book:** **not required** for claims A–C (expiration agreement, dual-field
consistency, sample-mapping semantics). Include order-book capture **only** if
a separately authorized amendment adds claim D economic observability; default
for this fidelity study is **omit** the book to reduce bytes and complexity.
(#116 included book for readiness diagnostics; repeating that is not automatic.)

### 4.4 Missing / failed close handling

For each of the 8 slots, record exactly one of:

- `captured-complete` — sync window finished within limits; official metadata
  retrieved or explicitly exhausted under retry budget
- `capture-failed` — connect/subscribe/limit/handshake failure
- `official-unavailable` — capture ok; official label missing after budgeted polls
- `skipped-overlap` — deterministic rule skipped (still consumes a slot)

Do **not** add a 9th close to replace failures. Do **not** adaptively pick a
“better” market.

### 4.5 What this protocol does not do

- No trading, recommendations, or executable evaluation.
- No offset/phase/weight search.
- No sealed M16-P / M14 opens.
- No SPENT day reclassification.
- No extending collection because fields disagree.

---

## 5. Evidence retention (hard gate before any collection)

### 5.1 Preconditions (all required)

Before any future capture attempt:

1. An **existing permitted private** artifact destination (no new storage
   service signup / license acceptance in-session solely to unblock).
2. **Verified upload/download round-trip** using a **non-sensitive** test
   artifact; record hashes before upload and after download; require equality.
3. Documented retention and retrieval process (who/where/how long/how to
   re-fetch).
4. Plan to retain: raw WS messages, relevant official metadata HTTP responses
   (bodies), run configuration, campaign ledger, and provenance (git SHA,
   campaign id, host identity without secrets).
5. Secret-safe storage (no private keys, tokens, or `.env` in artifact bundles).
6. Hash verification of every retained raw object after retrieval.

**Gitignored local files plus hashes alone are insufficient.** A same-VM copy
is not durable off-VM retention.

### 5.2 Failure handling

| Failure | Required action |
| --- | --- |
| Round-trip test fails | **Do not start** collection |
| Upload of a close’s raw bundle fails | Mark slot `retention-failed`; **stop campaign**; do not continue to later closes |
| Retrieval verification fails later | Treat affected closes as **non-reproducible**; do not claim independent replay |

### 5.3 Current readiness

As of this draft: durable retention remains **not established** (PR #116 v4).
Therefore **collection is classified as blocked** until §5.1 is satisfied.
Cloud VM disk survival must **not** be assumed.

---

## 6. Decision rules (predeclared conclusions)

After the 8 slots (or earlier stop for retention failure), report only under
these bins — no post hoc field shopping:

| Observation pattern | Allowed conclusion | Forbidden inference |
| --- | --- | --- |
| Both fields agree with each other and with official expiration (under frozen rounding) on a close | Completed-field agreement for that close | Intermediate counts are official banked samples |
| Only `last_60s_windowed_average_15min` agrees with official | Settlement-window field matched; trailing did not | Trailing is wrong for all closes |
| Only `avg_60s_data` (same window) agrees with official | Trailing matched this close; settlement-window did not | Select trailing as official because of match |
| Neither agrees | Documented disagreement; mapping still unresolved | Force-fit alternate windows |
| Missing or changing completed values / repeats after close | Chronology retained; availability claim D fails if first complete is post-close | Treat post-close revision as pre-close knowledge |
| Official labels unavailable | Slot `official-unavailable`; no agreement claim | Impute expiration |
| Mixed behavior across closes | Report per-close table; discrepancy **can repeat or not** | Claim population rate or economic readiness |

**Authoritative follow-up needed for claim C:** venue/CFB documentation of the
one-second banking rule, or a predeclared validation against official sample
identities. Completed-value agreement is **not** sufficient.

---

## 7. Governance

- All observations from this study (if ever authorized separately) are
  **operational / exploratory fidelity data**, not untouched strategy
  confirmation.
- **No** sealed M16-P or M14 outcomes, pristine-data claims, P&L, fitting,
  threshold selection, trading, or reservoir reclassification.
- This specification PR must remain **draft / unmerged relative to execution**
  until a later explicit authorization; **do not run** the study from this task.
- M17 profitability testing is **not** ready.

---

## 8. Deliverables (when a future authorization exists)

1. Campaign ledger + config SHA.
2. Per-close chronology tables (both fields; receipt times; official label).
3. Retention manifest with hashes and retrieval verification records.
4. Short fidelity report mapped to claims A–D and §6 bins.
5. Explicit statement of what remains unresolved.

---

## 9. Document history

| Version | Date (UTC) | Notes |
| --- | --- | --- |
| spec-v0 | 2026-09-24 | Project Lead next-milestone spec after #116/#117 merge; collection blocked on durable retention |
