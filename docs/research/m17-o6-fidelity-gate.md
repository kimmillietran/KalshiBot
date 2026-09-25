# M17 — O6 fidelity gate: official settlement sampling identity

> **EVIDENCE AUDIT + PROTOCOL PROPOSAL ONLY — NOT AUTHORIZATION**
>
> Proceeds under PR #128 option **O6 (fidelity-first)**. Does **not** authorize
> purchase, subscription, capture, trade, order, strategy freeze, or P&L.
> Does **not** choose O3. Future capture protocol below is a **proposal** only.

| Field | Value |
| --- | --- |
| Report id | `kalshi-kxbtc15m-m17-o6-fidelity-gate-v0` |
| Base (`origin/main`) | PR #128 merge `e35f5b6f424daeb5f0054cc84d6c07a3b537f7f1` |
| Overall fidelity-gate status | **`blocked-needs-prospective-evidence`** |
| O6 outcome | **Remains blocked** (not passed) |
| Strategy rule frozen | **No** |
| Acquisition / capture / P&L | **None occurred** |

---

## 1. Scope and standing constraints

Inspected for whether **official** Kalshi settlement-state inputs can be identified
from authoritative documentation plus retained captures:

1. Official field used for banked settlement samples
2. 60-sample membership window
3. Upstream 5Hz BRTI → 1Hz sample mapping
4. Timestamp domain, boundary handling, and rounding stage
5. Whether retained captures suffice to verify those rules

PR #127 kept banked 60-sample path and exact 5Hz→1Hz as `unverified`. This gate
**does not change** those acquisition classifications unless evidence below
supports a stronger claim. Three observed closes do **not** establish a general
sampling rule.

**Forbidden inferences (honored):** no inferring the official banked path from
`avg_60s_data` or from final `expiration_value`; no wiring `avg_60s_data` into
gates; no using post-close labels as a pre-entry sampling rule.

---

## 2. Evidence inventory

### 2.1 Authority documents (public, read-only; accessed 2026-09-25)

| ID | Source | URL | Relevant sections |
| --- | --- | --- | --- |
| D1 | Kalshi Help — Crypto Markets | https://help.kalshi.com/en/articles/13823838-crypto-markets | Settlement = average of 60 CFB RTI prices at 1s intervals in the final minute; RTI described as once-per-second aggregate |
| D2 | Kalshi WS — `cfbenchmarks_value` | https://docs.kalshi.com/websockets/cfbenchmarks-value | Averaging semantics for `avg_60s_data` and `last_60s_windowed_average_15min`; ~1Hz ticks; `received_at`; AvgData schema |
| D3 | Kalshi WS — `cfbenchmarks_value_5hz` | https://docs.kalshi.com/websockets/cfbenchmarks-value-5hz | Up to 5 updates/s; lean ticks; **no** 60s averages |
| D4 | CRYPTO15M / BTC contract terms | https://assets.kalshi.com/contract_terms/CRYPTO15M.pdf , `…/BTC.pdf` | Simple average of CF index for 60 seconds prior to expiration; incomplete data → No |
| D5 | CME CF Real Time Indices Methodology | https://docs.cfbenchmarks.com/CME%20CF%20Real%20Time%20Indices%20Methodology.pdf | BRTI dissemination ~every 200 ms (post May 2026 change); dissemination precision 0.01 USD (methodology specs) |
| D6 | BRTI product page | https://www.cfbenchmarks.com/data/indices/BRTI | ~200 ms calculation; Kalshi among settlement users |

Prior memo consolidating D1–D6 (2026-09-24 retrieval):
`docs/research/m17-prep-brti-settlement-average-discrepancy-semantics.md`
(SHA-256 `f457fa0b625fe30fe0a001f78390998b2078eb46d0c999d58a616a71d9a8bc97`).

### 2.2 Retained captures / reports (hashes preserved; not overwritten)

| Close (UTC) | Artifact | Identity |
| --- | --- | --- |
| 2026-09-24T04:15:00Z | PR #116 committed averages (raw WS **unavailable**; official HTTP not retained) | Documented in semantics + three-close evidence memos |
| 2026-09-24T23:15:00Z | one-close **v2** replay report | report SHA-256 `0fa7f9cf991d2a7c391e78a0eace7d728e219110fcb9c62e1b521240780564b0`; raw capture SHA-256 `9fbe05369924b0e496a75ba1ca2f7a2fbd9a25856aaf8dfeb8cce263a95626c4` (local archive; replay hash match) |
| 2026-09-25T00:00:00Z | one-close **v3** report | report SHA-256 `7c61fdae990544e65eb28f99f470946543ec2426abda6fb25a2cfc7de817c293`; raw capture SHA-256 `7a5422cbf582481dd5f7bf4decc9f1d76f838efafaa8e6137958f80ff503c857`; official body SHA-256 `fac75f4e5b56d6ceb3120e3613cf4c5c49705e9845a28de3ba884a435f84dedc` |

v2/v3 local raw JSONL files were confirmed present and hash-matched at audit time.
v1 skip dispositions preserved under `m17-prep-one-close-settlement-fidelity-v1/`.

### 2.3 Prior offline mechanical probe (not a mapping freeze)

Retained HOUR body for `2026-08-30T18:00Z` (PR #115/#116 mapping docs): fixed
window reconstructions (last-tick-per-second / all-5Hz mean under several
open/closed boundaries) **all disagreed** with official `expiration_value`
(`docs/research/m17-prep-settlement-sample-mapping.md`).

---

## 3. Per-rule classifications

Each rule uses **exactly one** of:
`documented-authoritative` | `empirically-supported-only` | `contradicted` | `unresolved`.

### 3.1 Official field for banked settlement samples

| Classification | **`unresolved`** |
| --- | --- |
| What *is* documented | Official **expiration** is the average of 60 CFB RTI one-second readings in the final minute (D1, D4). WS exposes two average fields with different documented memberships (D2). |
| What is *not* documented | No primary source names `avg_60s_data`, `last_60s_windowed_average_15min`, or any other streamed field as the official **banked intermediate sample series** or as identical to `expiration_value`. |
| Empirical only | On **three** closes, diagnostic half-even 2dp of completed `avg_60s_data` matched `expiration_value`; completed `last_60s_windowed_average_15min` did not (three-close evidence + v2/v3). That supports an **empirical completed-value candidate**, not an official banked-field binding. |
| Limits | n=3; diagnostic rounding ≠ vendor-confirmed rounding; completed agreement ≠ intermediate bank membership (design draft claim C). |
| Must not claim | That `avg_60s_data` is the official banked path or a strategy gate input. |

Related completed-value candidate status (not this rule’s classification):
**`empirically-supported-only`** for “`avg_60s_data` @ count 60 often matches official after diagnostic 2dp” — research `SettlementEstimate` only (PR #123).

### 3.2 Sixty-sample membership window (official expiration)

| Classification | **`unresolved`** (for official membership endpoints) |
| --- | --- |
| Documented high-level fact | 60 samples × ~1s in the final minute before expiration (D1, D4) — treat as **documented-authoritative** for *count and cadence intent*, not for exact open/closed endpoints. |
| Documented WS field windows (not proven = official) | `avg_60s_data`: `[source_ts−60s, source_ts)`, prior ticks only; `last_60s_windowed_average_15min`: `(close−60s, close]`, start excluded, close included (D2) — **documented-authoritative for those WS fields**. |
| Gap | Help/contract “60 seconds prior to” vs WS settlement prose `(close−60s, close]` vs trailing `[ts−60s, ts)` are **not** reconciled to a single official membership list. Identical payload `[start,end)` labels on both fields in captured messages do **not** imply identical membership (D2 + retained dual-field gaps). |
| Empirical | Dual-field numeric disagreement at count 60 on retained closes **supports** different membership (empirically), without identifying which set (if either) is official. |
| Contradicted (narrow) | Naive reconstructions from historical 5Hz HOUR ticks under several fixed windows **disagreed** with official on the probed hour — those specific reconstruction hypotheses are **`contradicted`** for that body; they do not prove the true official rule. |

### 3.3 Upstream 5Hz → 1Hz mapping

| Classification | **`unresolved`** |
| --- | --- |
| Documented | BRTI publishes ~200 ms (D5, D6). Kalshi 1Hz channel emits ~1 tick/s and ignores duplicate/out-of-order upstream source timestamps (D2). 5Hz channel is lean ticks without averages (D3). |
| Not documented | Which 5Hz phase/print becomes each official 1Hz settlement sample; whether official samples equal Kalshi 1Hz ticks, CFB “top-of-second,” or another rule. |
| Empirical | v3 membership comparisons used **cfb-1Hz only** (60 verified source-timestamped 1Hz samples in predeclared windows); mixing 5Hz into averages is forbidden by that campaign’s stream-separation rule. That validates stream hygiene, **not** the official 5Hz→1Hz identity. |
| Acquisition note | PR #127: purchasing raw BRTI does not resolve this identity. |

### 3.4 Timestamp domain, boundaries, and rounding

| Aspect | Classification | Evidence / limits |
| --- | --- | --- |
| Kalshi `received_at` (WS) | `documented-authoritative` | D2: when Kalshi received the upstream frame |
| Upstream / source timestamps on ticks | `documented-authoritative` (API fields) | D2/D3 `source_ts_ms` / nested `data.time`; domains kept distinct from local receipt in v2/v3 |
| WS AvgData window bounds schema | `documented-authoritative` | `window_start_ts_ms`, `window_end_ts_exclusive` (D2) |
| Official expiration inclusive/exclusive endpoints | `unresolved` | D1/D4 vs D2 settlement prose not equated |
| Kalshi `expiration_value` rounding stage | `unresolved` | BRTI dissemination 0.01 USD (D5); WS averages 8 dp strings (D2); Help does not state production rounding for expiration. Diagnostic half-even 2dp is research-only (PR #123) |
| Local receipt clocks in v2/v3 | `empirically-supported-only` | Captures recorded local + mono receipt; sufficient for those sessions’ chronology, not a general official rule |

### 3.5 Adequacy of existing captures to verify the rules

| Classification | **`unresolved`** (captures insufficient to verify official banked identity) |
| --- | --- |
| What captures *do* support | Dual-field discrepancy at count 60; empirical completed-value candidate behavior on three closes; v2/v3 replayable raw + official HTTP with verified hashes; stream separation (1Hz vs 5Hz). |
| What they *do not* support | A vendor-confirmed official intermediate banked field; a unique 60-sample membership proof; a unique 5Hz→1Hz rule; production rounding. |
| Why not “contradicted” overall | Evidence does not prove official sampling is unknowable — only that current docs + n≤3 closes leave it open. |
| Why not “passed” | Mapping gate in the design draft remains unmet. |

---

## 4. Overall fidelity-gate status

**`blocked-needs-prospective-evidence`**

| Alternative | Why not |
| --- | --- |
| `passed` | Official field, exact membership, 5Hz→1Hz, and expiration rounding remain unresolved. |
| `failed-closed-unresolvable` | No proof that a discriminating prospective protocol cannot resolve remaining hypotheses; docs already specify distinct WS windows that future captures can test against official. |

**O6 remains blocked.** Official-banked settlement-state arithmetic for M17 entry
families that require verified banked samples stays blocked. PR #127
`unverified` statuses for banked path and 5Hz→1Hz are **retained**.

---

## 5. Proposed minimum prospective capture protocol (not authorized)

Proposal only. Requires **separate** human authorization. Do **not** execute
from this PR. Do **not** treat as historical SPENT coverage.

### 5.1 Goal

Discriminate remaining hypotheses about official completed expiration vs the
two WS averages, and (secondarily) whether intermediate running counts can be
shown to be 1:1 with any reconstructible 1Hz series — **without** fitting
offsets to force matches.

### 5.2 Minimum design

| Element | Proposal |
| --- | --- |
| Closes | **≥ 5** additional quarter-hour closes (fixed list frozen before first connect), plus keep v2/v3 as prior evidence (not re-tuned) |
| Duration per close | Connect ≥90s before close; capture through ≥15s after close (same class as v2/v3) |
| Channels | `cfbenchmarks_value` + `cfbenchmarks_value_5hz` for `BRTI`; optional orderbook only if needed for separate book claims (not required for field-vs-official) |
| Fields logged | Full 1Hz messages including `avg_60s_data`, `last_60s_windowed_average_15min`, nested `data`, `received_at`; all 5Hz ticks with `source_ts_ms`; local wall + mono receipt |
| Official metadata | Post-close HTTP `expiration_value` / market status (budgeted); retain **raw HTTP body** |
| Retention | Durable private archive with hash round-trip **before** collection (design draft G.1); gitignored local-only is insufficient for new collection |
| Predeclared comparisons (freeze before observe) | (1) diagnostic 2dp and exact-decimal equality of each completed field vs official; (2) dual-field disagreement rate at count 60; (3) 1Hz-only membership recompute for each documented window — never mix 5Hz into that recompute; (4) optional exploratory: whether any **single** predeclared 5Hz→1Hz rule (e.g. last print in second, first print, top-of-second) reproduces official — **list rules before** looking at agreement rates; stop if none match without searching |
| Hard stops | No P&L; no threshold sweeps; no selecting a field as official because it matches; no vendor outreach from the agent; budgeted HTTP/WS campaign id |
| Success criteria for unlocking official-banked arithmetic | Either (a) authoritative vendor/docs binding naming the field/membership/rounding, or (b) sufficiently discriminating multi-close evidence that a **predeclared** candidate survives all closes **and** is explicitly accepted by a later human freeze as research-binding — still not automatic strategy freeze |

If the protocol yields persistent disagreement across all predeclared candidates,
deliverable is **documented mapping failure** → consider upgrading overall gate
toward `failed-closed-unresolvable` in a later review (not declared here).

---

## 6. Still required before O3 (not decided here)

Per PR #128 memo §8 — still open after this O6 audit:

1. **Official-bank vs research-state estimand** — O3 on verified banked samples
   remains blocked; a separate research-state estimand would be a different
   claim (and still needs an explicit human choice).
2. **Model class** for remaining samples / path average (parameter-free until
   an exploratory calibration partition exists; **not** SPENT-tuned).
3. **Exact overpriced inequality** + executable NO fill definition + fee rule
   (YES ask vs mid-for-signal-only, fee buffer, taker schedule identity).

Do **not** freeze those in this task.

---

## 7. Attestation

- No acquisition, subscription, capture, trade, order, or P&L occurred.
- O6 fidelity gate: **`blocked-needs-prospective-evidence`** (remains blocked).
- Prospective capture protocol: **proposed only**, not authorized, not executed.
- No strategy rule, threshold, or trading gate was frozen.
- Historical reports from PR #127 / #128 were not overwritten.
