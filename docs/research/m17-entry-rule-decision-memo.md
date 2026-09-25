# M17 — Hold-to-settlement entry-rule decision memo

> **DECISION PROPOSAL ONLY — NOT A FROZEN STRATEGY — NOT AUTHORIZATION**
>
> This memo prepares choices for how pre-entry settlement state could support
> “YES is overpriced → enter NO.” It does **not** select a final option, freeze
> thresholds, implement a trading gate, purchase data, capture, trade, or compute
> P&L. No positive or negative strategy result is claimed.

| Field | Value |
| --- | --- |
| Memo id | `kalshi-kxbtc15m-m17-entry-rule-decision-memo-v0` |
| Base (`origin/main`) | PR #127 merge `4cf115f7e6eab82e66f67a780ba47e239c61428c` |
| Design authority | `docs/research/m17-settlement-state-research-design-draft.md` |
| Acquisition status | PR #127 → `strategy-remains-blocked` |
| SettlementEstimate | PR #123 — research-only; **not** a strategy gate |
| SPENT eval | PR #125 — blocked before P&L |

---

## 1. What the entry decision must estimate or compare

Hold-to-settlement “enter NO because YES is overpriced” requires an explicit
comparison at decision time \(t\), using only pre-entry information:

| Quantity | Role | Must not be confused with |
| --- | --- | --- |
| **Verified (or candidate) settlement arithmetic** | Given banked count \(n\), sum \(S\), strike \(K\), official \(N=60\): remaining-mean threshold \(T=(NK-S)/(N-n)\) when \(n<N\) | \(P(\text{YES})\) |
| **Model-derived \(P(\text{YES}\mid\mathcal{F}_t)\)** (if used) | Probability that the **path average** settles YES under a declared law for remaining samples | Distance-to-\(T\), venue trailing averages, or terminal-spot odds |
| **Kalshi market price of YES** | Quoted YES bid/ask or midpoint used for “overpriced” language | Executable NO fill |
| **Executable NO entry price** | Typically \(100-\text{YES bid}\) (cents) for buying NO | Midpoint; post-fee edge is a separate contract |
| **Official settlement outcome** | `result` / `expiration_value` | **Post-entry only** — evaluation label, never a pre-entry feature |

**Hard design rule (preserved):** \(T\) is arithmetic reachability of a mean
target. It is **not** a probability. A large \(|T-\text{current level}|\) does
not by itself make YES unreachable or overpriced.

**Economic claim shape (hold-to-settlement track):** enter NO at the executable
NO ask when a **frozen** rule says YES is overpriced relative to that rule’s
settlement-state estimate; hold to official settlement; charge one taker fee;
score on `expiration_value` / `result` only after entry.

---

## 2. Plausible rule / model families

Families below are supported by the existing design draft (§A–C), remaining-
average arithmetic code, and PR #123 `SettlementEstimate` semantics. None is
selected here.

### Family A — Arithmetic-only diagnostic (no entry claim)

Report verified or candidate \(T\), \(n\), and completed-window comparisons.
**No** \(P(\text{YES})\), **no** overpriced gate, **no** NO entries.

### Family B — Hard-bound impossibility → enter NO

Enter NO only when remaining samples cannot reach \(K\) under **predeclared**,
defensible hard constraints on the index (e.g. tick/physical bounds). Without
such bounds, this family collapses to “never trade” or to smuggling soft
bounds from outcomes.

### Family C — Explicit remaining-sample probability vs YES price

Predeclare a low-parameter law for remaining increments / path average;
compute \(P(\text{YES}\mid\mathcal{F}_t)\); enter NO when
\(P(\text{YES}) + \text{fee buffer} < \text{executable YES ask}\) (or an
equivalent predeclared inequality using YES mid **only if** mid is never used
as fill). Exact parametric form remains an open design choice (draft §C.2
Baseline B).

### Family D — Intermediate venue average as research state (not official bank)

Use live intermediate venue fields (e.g. growing window averages) **only** as
declared research state for a heuristic comparison to YES price — **without**
claiming official banked membership. Must keep PR #123 statuses:
`avg_60s_data` may be `empirical-candidate` post-evidence; 
`last_60s_windowed_average_15min` is diagnostic only; **never** wire
`avg_60s_data` into strategy gates unless a **separate** human freeze explicitly
overrides that standing rule (this memo does not).

### Family E — Suspend the settlement-state entry family

Stop pursuing “YES overpriced → enter NO” from settlement-state. Keep fidelity /
label / book work as infrastructure only.

### Family F — Fidelity-first, defer entry-rule freeze

Refuse to freeze any of A–D until official field / 5Hz→1Hz / window identity
are resolved (or documented as permanently unresolvable). Entry-rule work waits
on that gate.

---

## 3. Per-family requirements

| Family | Required pre-entry fields | Key assumptions | Failure modes | Data needed to evaluate |
| --- | --- | --- | --- | --- |
| **A** | Strike, \(N\), banked or candidate samples with declared field identity; clocks for diagnostics | Samples used for \(S,n\) match the declared identity | Treating \(T\) as edge; using post-close labels in features | Mapping fidelity + (for history) raw/venue path; books optional |
| **B** | Same as A + predeclared hard bounds on remaining prints | Bounds are true of the official index | Invented bounds; silent soft thresholds tuned on SPENT | Same as A + documented tick/bound evidence |
| **C** | Same as A + executable YES/NO book + fees + any model covariates **if** predeclared (e.g. Coinbase vol) | Remaining-sample law; dependence; average payoff ≠ spot | \(T\to P\) without model; calibrating on confirmation/SPENT; mid fills | Banked/candidate path **or** prospective causal capture; books; optional candles; exploratory calibration partition **≠** confirmation |
| **D** | Venue intermediate averages + books + receipt time | Heuristic state ≠ official bank unless later proven | Selecting `avg_60s_data` because it matched expirations; using it as gate without freeze | Prospective WS + books; historical reconstruction remains blocked without identity |
| **E** | None for entry | Settlement-state not the trading mechanism | Scope creep back into P&L without a rule | N/A |
| **F** | Fidelity artifacts only | Entry rule is premature | Freezing C/D while mapping blocked | Multi-close fidelity / vendor clarification — **not** pristine holdout purchase |

**Shared exclusions (all entry families):** no `expiration_value` / `result` in
features; no post-close revisions rewritten into \(t\); no inventing Kalshi
rounding, BRTI field identity, 5Hz→1Hz mapping, or banked-sample window; no
wiring `avg_60s_data` into gates under current standing policy.

---

## 4. Facts vs unresolved assumptions

### Supported by current captures / docs (facts)

- Four quantities must stay distinct: arithmetic \(T\), model \(P(\text{YES})\),
  market YES price, executable NO price; outcome is post-entry
  (design draft §A.2; PR #125).
- \(T\) formula and “not a probability” semantics exist in-repo
  (`remainingAverageThreshold.ts`).
- Official Help: 60 one-second RTI samples in the final minute; average →
  expiration (high-level). Upstream BRTI ~200 ms.
- PR #123: post-close `expiration_value` authoritative; `avg_60s_data` at most
  empirical-candidate; `last_60s_windowed_average_15min` never the empirical
  settlement candidate for research primary.
- Three retained closes: diagnostic-rounded `avg_60s_data` often matched
  official; settlement-window field often did not — **candidate, not binding**.
- M16-ER SPENT: 47,263 valid settlement joins; YES BBO / NO ask / timings
  recoverable from CryptoStruct books; **no** pre-entry BRTI banked path on
  those books (PR #124/#126/#127).
- PR #127: Coinbase 1m OHLC and raw BRTI look historically obtainable; banked
  60-sample product and exact 5Hz→1Hz identity **unverified**; entry mapping
  **not-obtainable** as a data product. Decision: `strategy-remains-blocked`.
- Historical HOUR ticks lack contemporaneous receipt → mechanical event-time
  only, not causal historical execution backtest (design §B.4).

### Unresolved (assumptions — do not invent here)

- Official intermediate banked-sample field and window membership.
- Exact 5Hz→1Hz selection and production rounding stage.
- Inclusive vs strict strike comparison live-pinned per market.
- Any specific \(P(\text{YES}\mid T,\ldots)\) model or numeric thresholds.
- Whether Family D heuristics are scientifically inside the settlement-state
  family or a different estimand.
- Causal availability of any historical SPENT path.

---

## 5. Can the rule be specified before new data?

| Spec layer | Before new data? | Depends on data-source answers first? |
| --- | --- | --- |
| **Logical structure** of Families A–F and the comparison shape in §1 | **Yes** — this memo | No |
| **Freeze** of which family is in force | **Yes, as a human decision** — without tuning on SPENT/outcomes | Prefer knowing whether official banked state is obtainable (PR #127) so the chosen family is not vacuous |
| Numeric thresholds / model parameters | **No** — not from SPENT, labels, or post-close data | Need an exploratory calibration partition **after** family freeze |
| Claiming official banked \(S,n\) historically | **No** | 5Hz→1Hz / window / field identity (unverified) **before** historical banked-path evaluation |
| Causal hold-to-settlement on new periods | Structure yes; execution no until capture authorized | Durable retention + prospective BRTI/books (+ optional candles) |
| Causal hold-to-settlement on 34 SPENT days | **No** under current evidence | Receipt timestamps cannot be retrofitted by future capture |

**Order constraint:** choosing Family C or B **as an official-banked claim**
while mapping is unresolved freezes a rule that cannot yet be evaluated on
either SPENT history or honest official arithmetic. Family F exists for that
reason. Family A or E can be specified and useful without new purchases.

---

## 6. Decision options (choose one path — not chosen here)

| Option | What you decide | Consequences |
| --- | --- | --- |
| **O1 — Diagnostic-only (Family A)** | No overpriced→NO gate; arithmetic/fidelity only | No strategy P&L ever under this option; purchase for entry eval not justified |
| **O2 — Hard-bound only (Family B)** | Enter NO only under predeclared impossible-reach conditions | Likely empty trade set unless bounds are real; still needs verified samples for \(S,n\) |
| **O3 — Probabilistic vs YES price (Family C)** | Freeze model **class** (not SPENT-fit params) + inequality using executable prices | Enables leakage-safe exploratory **design**; evaluation still blocked until banked/candidate state + calibration partition exist |
| **O4 — Venue-intermediate heuristic (Family D)** | Explicitly research-only heuristic; **not** official bank claim; standing ban on `avg_60s_data` gates remains unless you separately override | Different estimand than official settlement-state; prospective capture more relevant than historical BRTI purchase |
| **O5 — Suspend family (Family E)** | Stop settlement-state entry research | Avoids false readiness; other M17 infra docs remain |
| **O6 — Fidelity-first (Family F)** | No entry-family freeze until mapping gate passes or fails closed | Delays O2–O4; aligns with PR #127 blockers; may later unlock official-banked C/B |

You may combine **O6 then O3** (sequence), but that is still two decisions, not
a silent freeze of O3 today.

---

## 7. When would a purchase or capture be useful?

| Action | Useful after which options? | Not useful for |
| --- | --- | --- |
| **Small exploratory** Coinbase 1m download (no-cost public path per PR #127 docs) | O3 if vol is a **predeclared** covariate; regime filters | O1/O5; does not create banked BRTI |
| **Small exploratory** Kalshi HOUR / licensed CFB raw BRTI | Mechanical diagnostics; O3/O2 **only after** mapping identity or as non-causal arithmetic probes | Causal SPENT backtest; pristine confirmation |
| **Small prospective** synchronized capture (BRTI WS + books + candles + local receipt) | O3/O4/O6 follow-on causal exploratory study on **new** periods | Historical SPENT coverage; confirmatory holdout |
| **Pristine confirmatory holdout purchase** | **Not justified** by this memo under any option | Choosing an entry family, tuning thresholds, or “getting a result” on SPENT |

PR #127 already: do **not** recommend pristine validation/holdout purchase.
A small exploratory acquisition/capture is a **separate** authorization and is
not historical coverage of the 34 SPENT days.

---

## 8. Decisions required before a leakage-safe exploratory evaluation can be designed

Answer these explicitly (human). This memo does **not** answer them.

1. **Which option in §6** (O1–O6, or sequenced O6→O3 / O6→O2)?
2. If O3 or O2: is the estimand **official banked samples** or a **declared
   non-official research state** (and if the latter, confirm it is not smuggled
   into “official settlement-state” claims)?
3. If O3: **model class** for remaining samples / path average (still
   parameter-free until an exploratory calibration partition exists — **not**
   SPENT-tuned)?
4. Exact **overpriced inequality**: which YES price (ask vs mid-for-signal-
   only), fee buffer rule, and executable NO fill definition?
5. **Primary track** confirmation: hold-to-settlement only (design default), or
   also pre-settlement exit as secondary?
6. **Data-source sequence:** mapping/fidelity before any historical banked-path
   eval? Prospective causal capture vs mechanical historical only?
7. **Calibration vs confirmation partitions** (SPENT is not untouched
   confirmation)? Stopping rules deferred until after exploratory design?
8. Authorize any **small exploratory** download/capture **separately** — or
   explicitly none — understanding pristine holdout remains unjustified?

Until (1)–(4) are answered, no leakage-safe exploratory **evaluation design**
(and no P&L) should proceed. Until mapping identity is resolved or O1/O4/O5/O6
is chosen accordingly, do not treat historical BRTI purchase as unblocking
official-banked entry evaluation.

---

## Attestation

No purchase, subscription, network request, capture, trade, order, strategy
P&L, threshold freeze, or trading-gate implementation occurred in producing
this memo. Official settlement labels and the 34 SPENT days were not used to
choose thresholds or tune a model.
