# M17 — Path recommendation after PR #131 / five-close / O6 mapping

> **RECOMMENDATION ONLY — NOT A STRATEGY FREEZE — NOT AUTHORIZATION**
>
> Does **not** choose or freeze the hold-to-settlement strategy for the user.
> Does **not** compute P&L, tune thresholds on SPENT data, purchase data, start
> a subscription, launch another capture, or wire `avg_60s_data` into gates.

| Field | Value |
| --- | --- |
| Memo id | `kalshi-kxbtc15m-m17-path-recommendation-v0` |
| Base (`origin/main`) | PR #131 merge `fc069fe18cfa9aa50646272e735152925d35b1eb` |
| Prior memo | PR #128 `docs/research/m17-entry-rule-decision-memo.md` |
| Acquisition | PR #127 → `strategy-remains-blocked` |
| O6 gate | PR #129 / #132 → `blocked-needs-prospective-evidence` |
| Five-close campaign | `kalshi-kxbtc15m-o6-five-close-settlement-fidelity-v0` — **4 captured, 1 missed (retained; not substituted)** |
| Pre-entry coverage | PR #131 — market/time/vol coverage only; **no P&L** |

---

## 1. Carried-forward facts (do not weaken)

1. Five-slot campaign: **four captures + one missed slot**. Frozen campaign is
   not extended or back-filled.
2. Kalshi 1Hz nested payloads equaled 5Hz phase-000 nested payloads on
   **416/416** observed comparisons — exploratory channel identity only; **not**
   the official banked field.
3. Completed `avg_60s_data` matched official `expiration_value` only after
   diagnostic half-even rounding to two decimals on **4/4** captured closes;
   **exact** equality failed on 4/4.
4. O6 remains **`blocked-needs-prospective-evidence`**. PR #132 recommends
   **no further identical campaign** for 5Hz→official mapping.
5. PR #131 adds market, timing, and volatility coverage on the 34 SPENT days,
   but **does not** provide historical BRTI / banked-sample paths for those days.
6. **No strategy P&L result exists.**
7. Class B admission-time BBO reconstruction remains **`uncertain`** in this
   environment: retained RAW ZIPs / `book-features.jsonl` were not available for
   targeted replay (see
   `data/research-results/external-kalshi-data-audit/m17-preentry-class-b-book-recovery/`).
   Prior diagnostic split (249 Class A definition / 59 Class B) is cited but
   not re-verified here. Class A stays distinct; executable NO asks on Class A
   were reported stable.

Standing rule preserved: do **not** wire `avg_60s_data` into strategy gates
without a **separate explicit human decision**.

---

## 2. Path comparison

### Path A — Continue O3 on **official banked** settlement state

| | |
| --- | --- |
| **Known** | Official Help language (60 one-second RTI samples); live WS fields exist; five-close + mapping protocol did **not** bind an official field/membership/rounding rule; O6 blocked. |
| **Missing** | Official intermediate banked field; exact membership window; production rounding; historical banked path on the 34 SPENT days (PR #127: entry mapping **not-obtainable** as a data product). |
| **Work / auth required** | Authoritative vendor/docs binding **or** a separately reviewed human freeze of a research-binding candidate; then a **new** prospective design. Not another identical five-close campaign. |
| **Leakage-safe exploratory from 34 SPENT days?** | **No.** SPENT CryptoStruct books lack BRTI/banked paths. Coverage ≠ settlement-state evaluation. |

### Path B — Explicit **research-state** O3/O4 (not official bank)

| | |
| --- | --- |
| **Known** | Books + Coinbase vol recoverable on SPENT (PR #131); `avg_60s_data` is an empirical completed-value **candidate** only; Family D in PR #128 already describes venue-intermediate research state. |
| **Missing** | A human-declared research-state estimand that is **not** smuggled into “official settlement-state”; still no historical venue-average path on SPENT without BRTI/WS retention those days did not have. |
| **Work / auth required** | Separate human choice of research-state definition; **separate** decision before any `avg_60s_data` gate use; prospective synchronized capture on **new** periods if evaluation is required. No paid pristine holdout justified by current evidence. |
| **Leakage-safe exploratory from 34 SPENT days?** | **Not for settlement-state / venue-average entry.** SPENT can support book/vol **feature** diagnostics only. Research-state settlement arithmetic still needs a path that SPENT does not retain. |

### Path C — **Suspend** the settlement-state entry family

| | |
| --- | --- |
| **Known** | O6 blocked; PR #132 advises against more identical mapping captures; no P&L; acquisition remains blocked for official-banked entry eval. |
| **Missing** | Nothing required to suspend. |
| **Work / auth required** | Human confirmation of suspension scope (entry family only vs broader M17 infra pause). |
| **Leakage-safe exploratory from 34 SPENT days?** | N/A for settlement-state entry. Avoids false readiness. |

---

## 3. Concise recommendation

**Goal:** eventually test hold-to-settlement “YES overpriced → enter NO,” while
**avoiding paid data** until there is a positive exploratory result.

**Recommendation (not a freeze):**

1. **Do not continue official-banked O3 now.** O6 is still blocked; SPENT days
   still lack historical BRTI/banked paths; four half-even matches do not mint
   an official field.
2. **Do not buy historical BRTI / pristine holdout data** to force a SPENT
   settlement-state backtest. PR #127 already rejected that as unblocking.
3. **Honest limit:** with retained data alone, **no current path produces a
   leakage-safe exploratory hold-to-settlement result on the 34 SPENT days**
   for either official-banked or research-state settlement averages, because
   those days have books/vol coverage without a retained BRTI/venue-average
   path.
4. **Prefer next human choice between:**
   - **Suspend (Path C)** the settlement-state entry family until a
     discriminating, separately authorized prospective design exists; or
   - **Explicit research-state prospective design (Path B)** on **new**
     periods only, with the estimand labeled non-official, **without** wiring
     `avg_60s_data` unless the human separately overrides that ban, and
     **without** treating SPENT as the evaluation cohort for settlement state.
5. If Class B must be closed: join retained executable NO ask onto mismatch
   rows, run the offline classifier, then targeted RAW replay on the machine
   that already holds the gitignored M16-ER ZIPs (no re-download). That resolves
   book-recovery uncertainty only; it does **not** unlock O3/O6.

**Not recommended:** another identical multi-close 5Hz→official mapping
campaign; silent use of `avg_60s_data` as a gate; extending the frozen
five-close campaign; strategy P&L on SPENT.

---

## 4. Attestation

- PR #131 was merged at exact head `7486dd0` → `main` `fc069fe`.
- No purchase, subscription, market-data request, capture, trade, order, or
  strategy P&L occurred in this recommendation task.
- `avg_60s_data` was not wired into gates.
- Class B RAW replay was **not** executed here (inputs absent); status left
  `uncertain`.
