# M17 — Settlement-state research design (DRAFT)

> **DRAFT — NOT PREREGISTERED — NOT AUTHORIZATION TO COLLECT OR RUN AN EXPERIMENT**
>
> This document is a research-design draft only. It does **not** freeze a
> specification, authorize data acquisition, authorize live capture, open sealed
> outcomes, change reservoir classifications, or approve trading. No numerical
> thresholds, sample-size targets, or model parameters herein are selected from
> observed economic outcomes.

**Draft id:** `kalshi-kxbtc15m-settlement-state-research-design-draft-v1`
**Authoring worktree:** `kalshi-builder3`
**Branch:** `feature/m17-settlement-state-research-design-draft`
**Base SHA (`origin/main` at draft start):** `07c9561e853805f2932b7ab0eaa1ab321faffeef` (PR #115 merged)

**PR #116 merged head (final reviewed tip):**
`e38030ad90233d17fd47e27c615a7e20d41eedb3` on `cursor/settlement-sample-mapping-878b`
**Merge commit on `main`:** `55c7cbe02e0565cbdeeeec719ce99cf0a03c742d`

---

## 0. Authority cited (published summaries only)

| Source | Role | Status |
| --- | --- | --- |
| PR #112 — `docs/research/m17-prep-settlement-state-feasibility.md`, M16-P suspension | Feasibility + suspension; mapping still unresolved | Merged |
| PR #113 — friction + settlement-label coverage study | Descriptive friction on 34 SPENT days | Merged |
| PR #114 — settlement-label backfill | Official labels for friction sample | Merged |
| PR #115 — BRTI access investigation | **BRTI access / probe limits** (not mapping authority) | Merged |
| PR #116 — settlement-sample mapping | Feasibility/mapping diagnostic + synchronized-session chronology | **Merged** (`55c7cbe`; tip `e38030a`) |

**Authority split (correction):** PR **#115** primarily establishes BRTI access.
PRs **#112** and **#116** supply feasibility and mapping findings. Do not cite
#115 as the mapping freeze.

**Cited findings vs proposed design:** sections marked *Cited* record published
results. Sections marked *Proposed* are design choices for later freezing.
Conflicts are called out rather than silently resolved.

### 0.1 Non-negotiable context (cited)

1. **M14 / M16:** no established tradable edge; M16-ER failed to reject H0
   (fee-adjusted mean ≈ −4.427¢; N=461; G=34).
2. **M16-P:** collection **suspended**; sealed outcomes remain **unopened**.
3. **34 CryptoStruct SPENT_VALIDATION days:** cannot serve as untouched
   confirmation; discovery reuse ≠ confirmatory reuse.
4. **Historical BRTI:** HOUR access demonstrated for **one** authorized hour on
   one SPENT target — **not** the full calendar; event timestamps ≠
   contemporaneous availability.
5. **Official settlement sample mapping:** **unresolved** (PR #112 feasibility;
   PR #116 diagnostic). A finite collection of matching completed averages does
   **not** by itself prove that every intermediate running count represents
   official banked samples.
6. **Same-window dual-field discrepancy (PR #116 v3, preserved):** one message
   carried two different averages for the same declared window —
   `last_60s_windowed_average_15min` = `83817.61766667` vs `avg_60s_data` =
   `83817.70733333`, with recorded official expiration `83817.71`. Offline
   replay reported no parser swap. The trailing field’s near-match remains
   **exploratory**; do **not** select `avg_60s_data` as the official banked
   field because it matched one expiration. Official sample semantics remain
   unresolved.
7. **Raw synchronized capture availability (PR #116 v4):** original raw capture
   identity SHA-256 `938cdde6151ad61b7595d86825486f9b8b866fd38ffa21ae47d85b2f09943e33`
   (6,111,585 bytes / 15,716 lines) is **unavailable in the current environment**;
   independent replay is **not possible**. This is not a proof of deletion.
   Prior-agent hash verification is historical provenance only. Durable off-VM
   retention is **not established**. The original official HTTP response body
   was never retained.

### 0.2 Terminology conflicts to preserve

| Topic | PR #112 / Help-center framing | PR #116 provisional finding |
| --- | --- | --- |
| Settlement window notation | Documented live accumulation `(close−60s, close]` | Payload identity `[window_start, window_end_exclusive)` is a **different** 60s interval; `sameConcept: false` |
| Mapping status | 5Hz→60×1s mapping “unverified” | Offline fixed windows on retained HOUR: **all disagree** with official expiration; live completed `last_60s_windowed_average_15min` can agree or disagree after rounding |
| Arithmetic readiness | Remaining-average threshold code exists for N=60 | Arithmetic is conditional on **valid sample semantics**; venue running fields ≠ proven official banked sum |

Until a successor fidelity study freezes field/window semantics, this draft
treats mapping as a **hard dependency**, not a detail.

---

## A. Hypothesis and mathematical target

### A.1 Proposed mechanism (*Proposed*)

**Mechanism family:** *settlement-state / path-to-settlement.*

During the official settlement minute of a KXBTC15M contract, the venue may
expose (or a researcher may reconstruct) a progressive set of banked index
samples. Conditional on those banked samples and the locked strike, there exists
an arithmetic requirement on the **remaining** samples for the full-window mean
to settle YES vs NO. If that requirement, under a **defensible probability
model**, implies a settlement probability that differs materially from the
**executable** contract price (after fees), the discrepancy is the scientific
object of study.

This is **not**:

- side-invariant reversal (M16),
- calibration-fade on historical labels alone,
- or a claim that large remaining-average distance makes an outcome impossible.

### A.2 Four distinct quantities (*Proposed*)

Keep these separate in every future report:

| Quantity | Meaning |
| --- | --- |
| **Verified arithmetic** | Given verified banked samples \(S=\sum_{i=1}^{n} x_i\), strike \(K\), and official \(N\), the remaining-mean threshold \(T\) (below). |
| **Uncertainty about remaining samples** | Epistemic/statistical uncertainty on the unfinished path; depends on dependence structure and distributional assumptions. |
| **Model-derived probability** | \(P(\text{YES}\mid\text{information at }t)\) from an explicit model — not implied by \(T\) alone. |
| **Executable economic value** | Value of a decision under executable bid/ask, fees, size, latency, and observability constraints. |

### A.3 Remaining-average threshold (*Cited code + Proposed binding*)

Repo implementation:
`src/lib/data/research/settlementStateFeasibility/remainingAverageThreshold.ts`
(`SETTLEMENT_WINDOW_SAMPLE_COUNT = 60`).

For total official samples \(N\), banked count \(n\), banked sum \(S\), strike \(K\):

- If \(0 \le n < N\):
  \[
  T = \frac{N \cdot K - S}{N - n}.
  \]
  Interpretation: the mean of the remaining \(N-n\) samples that makes the
  full-window mean equal \(K\).

- If \(n = N\): \(T\) is **undefined**. Compare the completed mean
  \(\bar{x}=S/N\) to \(K\) under verified comparison/rounding rules instead.

**Strict / non-strict / rounding (*Proposed binding rule*):**

- Comparison operator (inclusive ≥ “at least” vs strict “above”) and rounding
  (e.g. nearest 2 decimals) must be bound to **verified per-market contract
  rules** (`strike_type`, help text, contract terms) before economic evaluation.
- Until live-pinned, fail closed: do not assume an operator to claim YES/NO
  reachability.
- Incomplete official data at expiration can force **No** under CRYPTO15M terms;
  research must not invent missing samples.

**Critical conditional (*Proposed*):** \(T\) is meaningful only when
\(\{x_i\}_{i=1}^{n}\) are the **official banked settlement samples** (or a
proven 1:1 transform). Do **not** equate:

- trailing `avg_60s_data`,
- a venue running average field,
- or a researcher’s 5Hz subset mean

with the official banked sum **before** that relationship is established by a
frozen fidelity study. Matching completed-window averages against
`expiration_value` is evidence about **completed** fields only; it does **not**
alone prove intermediate running counts are official banked samples. PR #116’s
unresolved same-window field discrepancy is exactly this dependency.

### A.4 Why “reachability” is probabilistic (*Proposed*)

\(T\) is a **conditional mean target**, not a hard bound on path space unless
defensible hard constraints exist (e.g. physically impossible index moves under
verified tick rules). Absent such bounds:

- a large \(|T - \text{current level}|\) increases **modelled** improbability only
  under stated dynamics;
- it does **not** by itself make an outcome impossible;
- do not convert distance-to-\(T\) into a trading signal without a probability
  model and economic evaluation contract.

---

## B. Input contract and causal timing

### B.1 Required fields (*Proposed*)

| Domain | Required fields | Provenance / validity |
| --- | --- | --- |
| Market identity | `marketTicker`, `eventTicker`, series, `floor_strike` / strike, `strike_type` (or verified rule text), `open_time`, `close_time` | Official Kalshi market wire; reject missing strike or ambiguous comparison |
| Settlement labels | `result`, `expiration_value`, `settlement_ts` | Official only; no imputation (PR #114 coverage gaps preserved) |
| Settlement-sample stream | Field identity, sample count, window start/end semantics, precision | **Blocked** until mapping fidelity freezes which field/window is official |
| Raw index (if used) | BRTI (or proven official source) ticks with provider time | Historical HOUR ticks ≠ receipt time (PR #115 access) |
| Local clocks | Wall-clock receipt, monotonic receipt | Required for causal decisions; record skew diagnostics |
| Provider timestamps | Upstream `time` / venue `received_at` / window stamps | Kept **distinct** from local receipt |
| Executable book | Bid/ask, displayed size, integrity (snapshot/delta gaps), quote age | Displayed book ≠ proven fill |
| Fees | Schedule identity, side, quantity, rounding | Reuse frozen fee contracts when evaluating economics (do not retune) |

### B.2 Causal decision rule (*Proposed*)

A decision at local time \(t\) may use only messages with
**local receipt time ≤ \(t\)** (and any explicitly allowed provider stamps that
were already received). Forbidden:

- using later revisions to rewrite earlier decisions;
- treating historical event timestamps as if they were live receipt times;
- silent interpolation across gaps.

**Same-timestamp ordering:** declare a total order (e.g. stream id, sequence,
stable tie-break). **Revisions / repeated completed fields:** record all;
economic evaluation must use the value available at \(t\), not the last
post-close revision. **Missing messages / reconnects:** mark decision intervals
unobservable rather than inventing state. **Empty books:** no executable price →
no trade under the evaluation contract.

### B.3 Observed vs inferred samples (*Proposed*)

Prefer **directly observed** banked samples. Values inferred by differencing
successive averages inherit precision/rounding error; any such inference must:

1. declare the exact transform,
2. propagate rounding uncertainty,
3. remain provisional until validated against official samples.

Do not treat a matching inferred series as proof of the official rule.

### B.4 Historical mechanical vs prospective causal gates (*Proposed*)

These gates are **distinct**:

| Gate | What it allows | What it does **not** allow |
| --- | --- | --- |
| **Historical mechanical analysis** | Event-time joins of retained HOUR ticks / labels for arithmetic diagnostics | Causal “available at decision time” claims for those historical observations |
| **Prospective causal evaluation** | Decisions using only contemporaneously received messages on newly captured periods | Retroactive attribution of causal availability onto old event-time series |

**Correction:** future synchronized capture can support causal evaluation for the
**newly captured period only**. It cannot establish causal availability for old
historical observations that lack contemporaneous receipt timestamps. Historical
event-time data without contemporaneous receipts remains **insufficient** for a
causally faithful historical execution backtest.

---

## C. Probability modeling requirements

### C.1 From threshold to probability (*Proposed*)

\(T\) alone does not yield \(P(\text{YES}\mid\mathcal{F}_t)\). Additional
assumptions are required, for example:

- law of remaining samples (or increments) conditional on \(\mathcal{F}_t\);
- dependence among remaining samples (they are not i.i.d. independent draws);
- recognition that payoff depends on the **path average**, not only a terminal
  spot print.

**Do not** substitute a terminal spot-price probability for the average-based
payoff without an explicit, justified approximation error bound.

### C.2 Smallest defensible baseline (*Proposed*)

**Baseline A (minimal):** after mapping fidelity is frozen, report only
**verified arithmetic** \(T\) and completed-window comparisons — no probability,
no trading claim. This is a diagnostic track, not an edge claim.

**Baseline B (next minimal probabilistic):** a **predeclared**, low-parameter
model of remaining-sample increments calibrated only on **exploratory** data
that is **not** the confirmation set — with dependence acknowledged (e.g.
blocked bootstrap / day clustering). Exact parametric form is an **unresolved
design choice**, not a shopping list to sweep on outcomes.

### C.3 Explicitly deferred (*Proposed*)

- Numerical volatility, drift, or IV imports from other research streams.
- Threshold grids selected by observed P&L.
- Options-style solvers unless separately preregistered with frozen inputs.

---

## D. Economic evaluation

### D.1 Two tracks (*Proposed*)

| Track | Action | Mechanism link |
| --- | --- | --- |
| **1. Hold-to-settlement** | Enter on executable quote; hold to official settlement | Directly tests settlement-probability vs price discrepancy |
| **2. Pre-settlement exit** | Enter then exit on a later executable quote before settlement | Adds timing/liquidity mechanism; confounds pure settlement-state claim |

**Proposed primary track: (1) Hold-to-settlement.**
Reason: the core hypothesis is about **settlement-state information** versus
contract price; requiring an exit mixes in mid-path microstructure and is a
different estimand. Track (2) may be a **secondary** sensitivity once (1) is
specified — not chosen because it “performs better.”

### D.2 Shared economic contract elements (*Proposed*)

For each track, freeze before outcome inspection:

- **Side and price:** executable bid or ask only (no mid fills).
- **Fees:** schedule identity + quantity rounding; do not double-count spread
  already in the executable quote.
- **Size:** ≤ displayed size at decision; reject insufficient size.
- **Latency / stale quotes:** max quote age and decision delay; mark stale as
  unobservable.
- **Missing execution:** if book missing/locked/crossed per exclusion rules →
  no fill; record exclusion (outcome-independent rules).
- **Dependence:** repeated decisions within one contract / day require
  clustering (contract-level or day-level), not i.i.d. trade counts.

**Displayed-book scenarios are not proven fills** (PR #113 caveat remains).
Historical average friction (PR #113) is **context**, not a constant to subtract
indiscriminately from every scenario.

---

## E. Evaluation and contamination controls

### E.1 Data partitions (*Proposed*)

| Partition | Allowed use |
| --- | --- |
| Exploratory / calibration | Mapping diagnostics, model development, arithmetic checks |
| Untouched confirmation | Frozen evaluation only; no retuning |
| SPENT_VALIDATION (34 days) | Not untouched confirmation; limited discovery reuse only |
| Sealed M16-P / M14 validation | **Do not open** for this family |
| Operational probes (PR #115/#116 live windows) | Mapping/access evidence only — **cannot** silently become pristine validation |

### E.2 Units, endpoints, baselines (*Proposed*)

- **Unit of observation (primary):** one market contract decision episode
  (clustered by UTC day / event as needed).
- **Primary economic endpoint (hold-to-settlement track):** fee-adjusted
  executable P&L to settlement under the frozen contract (sign/side fixed by
  the decision rule).
- **Supporting diagnostics:** calibration of \(P(\text{YES})\) vs realized
  frequency; arithmetic \(T\) coverage; exclusion rates.
- **Baselines:** no-trade; and any predeclared null decision rule that does not
  use settlement-state (not selected post hoc).

### E.3 Exclusions and missingness (*Proposed*)

Exclusion rules must be fixed **without** looking at P&L (by analogy with
PR #113 gates: missing prices, insufficient size, locked/crossed books, stale
quotes, outside session, etc.). Treatment:

- unavailable labels → exclude from labeled calibration; do not impute;
- missing settlement-state signal → no trade / unobservable;
- unavailable execution → no fill.

### E.4 Multiple testing, freezes, stopping (*Proposed*)

- Freeze model version + evaluation code SHA before confirmation.
- Limit family-wise claims; predeclare primary endpoint.
- **Prospective stopping framework:** define operational stop criteria
  (budget, calendar, adverse monitoring) **before** confirmation starts.
- **Sample size / power:** do **not** invent a target here. Determining one
  requires: effect size under the frozen model, dependence/cluster design,
  fee-adjusted variance assumptions, and a predeclared Type I error policy.
  Until those are stated, power remains **unresolved**.

### E.5 Reservoir and registries (*Proposed*)

Preserve all existing reservoir classifications and campaign ledgers. Do not
reclassify SPENT days as pristine. Do not rewrite sealed M16-P registries.

---

## F. Decision gates

### F.1 Prerequisite table

| Requirement | Current evidence | Status | Evidence needed to pass | Activity unlocked |
| --- | --- | --- | --- | --- |
| Official sample field + window semantics | PR #112 feasibility; PR #116 dual-field discrepancy unresolved; offline HOUR candidates all disagree | **Blocked** | Frozen multi-close fidelity study; explicit field identities preserved; fail cases retained | Settlement-state arithmetic that claims official banked samples |
| 5Hz → official 60×1s mapping | Unverified (PR #112 feasibility; PR #116 diagnostic) | **Blocked** | Mapping proof or validated transform with uncertainty; not inferred solely from completed-average matches | Banked-sample reconstruction from raw ticks |
| Inclusive vs strict strike comparison | Not live-pinned per ticker (PR #112) | **Partial** | Per-market `strike_type` / rule binding | YES/NO labeling of \(T\) vs \(K\) |
| Historical BRTI calendar coverage | One authorized HOUR (PR #115 **access**) | **Partial** | Budgeted, non-confirmatory acquisition plan if needed | Retrospective **mechanical** studies beyond one hour |
| Causal receipt for **historical** observations | Event times only (PR #115); no contemporaneous receipts for old series | **Blocked** for historical causal execution backtest | Cannot be cured by future capture of *new* periods; historical event-time data without receipts stays insufficient | Causal claims on **old** historical paths |
| Causal evaluation on **newly captured** periods | One live sync session chronology (PR #116); raw bytes currently unavailable here | **Partial / blocked pending durable retention** | Verified durable private retention **before** collection; then multi-close sync with local receipt | Prospective causal evaluation for the **captured** period only |
| Executable books co-timed with BRTI | CryptoStruct SPENT books without BRTI; one live sync session (PR #116) | **Partial** | Multi-session sync integrity + mapping freeze (order-book need is fidelity-question dependent) | Exploratory mechanical join |
| Durable raw retention before any new collection | Gitignored local files + hashes alone insufficient; PR #116 durableRetention not-established | **Blocked** | Existing permitted private destination; verified upload/download round-trip with non-sensitive test artifact; documented retrieval | Any new synchronized capture |
| Fee contract | M16-ER / friction identities frozen | **Satisfied** for descriptive work | Reuse only | Economic evaluation wiring |
| Contamination controls | Reservoir + M16-P suspension docs | **Satisfied** as policy | Continued adherence | Any M17 confirmation design |
| Probability model freeze | None | **Blocked** | Preregistered model + calibration partition | Frozen economic evaluation |
| Untouched confirmation set | Not designated | **Blocked** | Explicit holdout / prospective plan | Prospective confirmation |

### F.2 Activity ladder (separate stages)

1. **Data-fidelity diagnostics** — mapping, clocks, capture integrity (PR #116 class).
2. **Exploratory mechanical analysis** — arithmetic \(T\), coverage, no P&L selection (event-time allowed where labeled).
3. **Prospective causal evaluation** — only on newly captured periods with contemporaneous receipts.
4. **Model calibration** — on exploratory partition only.
5. **Frozen economic evaluation** — hold-to-settlement primary endpoint.
6. **Untouched prospective confirmation** — stopping rules + sealed holdout.

**Do not** declare M17 “ready” because an HTTP endpoint returned 200 or because
one average matched official expiration.

---

## G. Recommended next milestone (*Proposed*)

### G.1 Conditional recommendation

**Next bounded milestone:** **Multi-close settlement-sample fidelity study** —
still **not** an alpha experiment / not authorized by this draft.

**Goal:** determine whether the same-window field discrepancy repeats and which
claims observed messages support about completed vs intermediate settlement
state — without fitting offsets/weights to force matches.

**Would need (proposal only — not authorized here):**

- Predeclared close list / budget (HTTP + WS) under a **new** campaign id.
- **Verified durable private retention before collection** (existing permitted
  destination; non-sensitive round-trip proof; documented retrieval). Gitignored
  local files plus hashes alone are **insufficient**. If no suitable mechanism
  exists, collection is **blocked**.
- Fixed candidate interpretations declared **before** inspecting agreement rates
  for that milestone’s evaluation window; track both
  `last_60s_windowed_average_15min` and same-window `avg_60s_data` without
  selecting the trailing field for one expiration match.
- Explicit handling of agree/disagree / missing cases (preserve disagreements).
- No P&L, no threshold sweeps, no sealed-outcome opens, no SPENT confirmatory reuse.

If the fidelity study concludes that no candidate mapping is consistent, its
deliverable is a **documented mapping failure** and M17 settlement-state
economics remain blocked.

### G.2 Decisions required before this draft can freeze

1. Official field/window/aggregation identity (depends on fidelity follow-up).
2. Per-market comparison operator and rounding.
3. Whether historical research will claim causal receipt or only mechanical event-time analysis (distinct gates — §B.4).
4. Primary probability baseline (or arithmetic-only diagnostic forever).
5. Confirmation partition and stopping rules.
6. Budget/entitlement policy for any further CFB/Kalshi reads.
7. Whether CryptoStruct books are ever joined — and under which non-confirmatory rules.
8. Durable retention mechanism readiness (blocks collection until verified).

---

## H. Explicit non-goals for this draft PR

- No Kalshi / CFB / CryptoStruct data requests.
- No collectors, schedulers, or live subscriptions started by this work.
- No sealed M16-P / M14 outcome opens.
- No new P&L, fitting, parameter sweeps, or trading.
- No code, registry, reservoir, or campaign-ledger changes in this documentation PR.
- No merge authorization of a probability model, trading rule, sample-size target,
  or economic test.

---

## I. Document history

| Version | Date (UTC) | Notes |
| --- | --- | --- |
| draft-v0 | 2026-09-24 | Initial design draft parallel to PR #116 investigation |
| draft-v1 | 2026-09-24 | Project Lead corrections: causal vs mechanical gates; #115 vs #112/#116 authority; #116 e38030a / dual-field / raw-availability; matching≠banked; durable retention before collection |

**Related (not a freeze of this draft):** entry-rule decision options for
human choice are collected in
`docs/research/m17-entry-rule-decision-memo.md` (after PR #127). That memo does
**not** freeze §C probability baseline or any trading gate.
