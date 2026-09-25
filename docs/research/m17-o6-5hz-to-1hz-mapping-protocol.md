# M17 O6 — 5Hz→1Hz / official-sample mapping protocol proposal

> **PROTOCOL PROPOSAL + EXPLORATORY DIAGNOSIS ONLY — NOT AUTHORIZATION**
>
> Does **not** authorize capture, market-data requests, purchase, subscription,
> trade, order, strategy freeze, P&L, or O3. Does **not** freeze an official
> mapping. Any future campaign requires **separate** human authorization.

| Field | Value |
| --- | --- |
| Report id | `kalshi-kxbtc15m-m17-o6-5hz-mapping-protocol-v0` |
| Prior gate | PR #129 `docs/research/m17-o6-fidelity-gate.md` |
| Prior campaign | `kalshi-kxbtc15m-o6-five-close-settlement-fidelity-v0` (4 captured + 1 missed) |
| Recommendation | **Do not run a new prospective campaign for 5Hz→official mapping** |
| O6 status | **Remains `blocked-needs-prospective-evidence`** (unchanged; not unblocked) |

---

## 1. Question

After the five-close campaign, does a **new** prospective capture meaningfully test
the unresolved mapping from Kalshi/CFB **5Hz BRTI observations** to the **60
one-second samples** used for official settlement?

Campaign facts (frozen; slot 0 remains missed — not substituted):

- Both published 1Hz averages recomputed from documented source-TS windows on
  all four captures.
- Completed `avg_60s_data` matched official `expiration_value` on diagnostic
  half-even 2dp on 4/4; **exact** raw/decimal equality failed on 4/4.
- No 5Hz→1Hz hypotheses were tested in that campaign (list was empty by design).

---

## 2. Adequacy of existing raw captures

Inspected retained JSONL under the private archive campaign root
`…/kalshi-kxbtc15m-o6-five-close-settlement-fidelity-v0/slot-{1..4}-*/raw/`
(hashes/replay already verified in the campaign final report; **not** rewritten).

| Stream | Source clock | Value fields | Adequacy |
| --- | --- | --- | --- |
| `cfbenchmarks_value_5hz` | `source_ts_ms` (+ nested `data.time`) | `value_usd` (8 dp) + nested `data.value` | Sufficient to group by second and by 200 ms phase `{0,200,400,600,800}` |
| `cfbenchmarks_value` (1Hz) | nested `data.time` (phase 0 on all ticks in these sessions) | nested `data.value` (2 dp string) + AvgData | Sufficient as the published 1Hz sample series |
| Local clocks | wall + monotonic receipt | — | Session chronology only; not used as official membership |

**Verdict:** existing captures have enough source-timestamp detail to evaluate a
**finite, cadence-derived** candidate list offline. Lack of detail is **not** the
blocker.

---

## 3. Exploratory diagnosis on existing captures (not independently validated)

> Everything in this section is **exploratory**: rules were applied to already
> observed sessions. They are **not** a prospective freeze and must not be cited
> as independently validated official policy.

### 3.1 Kalshi channel identity (5Hz phase → published 1Hz)

On all four captured slots (416/416 overlapping ticks):

- Every 1Hz nested `data.time` is phase `000` ms.
- That exact timestamp always exists on the 5Hz stream.
- Nested `data` payloads (`time`, `id`, `value`) are **identical** between the
  1Hz message and the 5Hz message at that timestamp.
- Outer `value_usd` on 5Hz is the same numeric with 8 dp zero-padding.

**Exploratory reading:** Kalshi’s published 1Hz tick is the **top-of-second
(phase 000) 5Hz print**, not last-in-second, not another phase, and not the
intra-second mean.

### 3.2 Finite cadence candidates vs official (predeclared shape; exploratory apply)

Candidate **selections** (from CFB ~200 ms cadence + “one reading per second”
product language — not fitted):

| ID | Selection |
| --- | --- |
| S0 | Phase `000` ms print in each second |
| S8 | Phase `800` ms print |
| SF | First print in second |
| SL | Last print in second |
| SM | Exact mean of all 5Hz prints in second |

Candidate **memberships** (documented WS windows — not proven official):

| ID | Window |
| --- | --- |
| Wavg | `[close−60s, close)` (`avg_60s_data` docs) |
| Wwin | `(close−60s, close]` (`last_60s_windowed_average_15min` / settlement prose) |

Candidate **rounding** axes: exact decimal mean; diagnostic half-even to 2 dp.

Exploratory outcomes on the four captured closes (n=60 each cell):

| Selection × window | Exact = official | Half-even 2dp = official |
| --- | ---: | ---: |
| S0 × Wavg | 0/4 | **4/4** |
| SF × Wavg | 0/4 | **4/4** (same as S0 when phase 0 present) |
| S0 × Wwin | 0/4 | 1/4 |
| S8 × Wavg or Wwin | 0/4 | 0/4 |
| SL × Wavg or Wwin | 0/4 | 0/4 |
| SM × Wavg | 0/4 | 0/4 |
| SM × Wwin | 0/4 | 1/4 |

**Exploratory reading:** among this finite list, only top-of-second / first-in-second
under Wavg reproduces the same empirical half-even pattern already seen for
completed `avg_60s_data`. Other phase/mean selections are **exploratorily
rejected** on these four closes. Exact equality still fails everywhere.

Prior offline HOUR reconstructions (PR #116 mapping memo) already disagreed
with official under several fixed windows — preserved; not re-fitted here.

---

## 4. What a new campaign could / could not establish

| Could establish (if separately authorized) | Could **not** establish without authoritative docs/vendor |
| --- | --- |
| Prospective (non-exploratory) confirmation that S0 nested ≡ Kalshi 1Hz on new closes | That S0/Wavg/half-even **is** Kalshi’s official banked sampling + rounding policy |
| Replication that S8/SL/SM fail the same predeclared comparisons | Exact production rounding stage for `expiration_value` |
| Additional n for the empirical completed-value candidate | Official-bank identity for strategy gates; O3 estimand |

**Discriminating power of more identical captures:** low for the open O6 gaps.
Existing sessions already separate S0/SF from S8/SL/SM under the finite list.
Further closes of the same design are unlikely to identify a *new* mapping;
they would mostly re-count the same half-even empirical pattern. Exact mismatch
and official-field identity remain unresolved for the same reasons as PR #129.

---

## 5. Recommendation

**Do not authorize another multi-close fidelity campaign solely to test
5Hz→official sample mapping.**

Reasons:

1. Captures already support offline evaluation of a finite, cadence-based list.
2. Exploratory results collapse 5Hz→Kalshi-1Hz to S0 identity; official tests then
   reduce to the already-run 1Hz completed-average comparisons.
3. Four rounded matches (plus prior closes) still **do not** establish the
   official field, membership, or rounding rule.
4. O6 should stay blocked until authoritative binding exists **or** a later,
   separately reviewed human freeze accepts a research-binding candidate — not
   automatic from more n of the same protocol.

**Prefer:** leave O6 blocked; keep slot 0 missed; preserve all artifacts/hashes;
pursue documentation / explicit human freeze pathways rather than more WS
closes without a new discriminating question.

---

## 6. Optional confirmatory protocol (not recommended; not authorized)

If a later authorization wants **prospective** (non-exploratory) confirmation of
channel identity only, use this **minimal** design. It still **does not** unblock
O6 official-bank claims.

### 6.1 Freeze before connect

| Element | Spec |
| --- | --- |
| Candidates (fixed list) | **C-ID:** S0 nested `data` ≡ 1Hz nested `data` at same `time`. **C-OFF:** S0×Wavg, S8×Wavg, SL×Wavg, SM×Wavg — each vs official on exact + diagnostic half-even 2dp. No other selections. |
| Clocks | 5Hz `source_ts_ms` / nested `data.time`; 1Hz nested `data.time`; Kalshi `received_at`; local wall+mono receipt (diagnostic only). |
| Channels | `cfbenchmarks_value` + `cfbenchmarks_value_5hz` for `BRTI`; no order book. |
| Closes | **At most 2** predetermined quarter-hour closes (immutable list). Not five. |
| Timing | Connect ≥90s before close; capture ≥15s after; max connected 105s; readiness close−120s. |
| HTTP | ≤12/close; campaign ceiling 24. |
| WS | Freeze max connections/retries before connect (same class as five-close runner: ≤2/close). |
| Retention | **local-persistent-only**, `independentBackup: false`; SHA-256 write/read round-trip **before** any market-data request; same-disk copy ≠ independent backup. |
| Stop rule | After the frozen closes: (1) if C-ID fails any close → record contradiction of channel-identity candidate; stop. (2) if C-OFF exact fails all and half-even only S0×Wavg survives → record “empirical pattern replicated; official mapping still unresolved.” (3) **never** add selections, offsets, or rounding variants after seeing results. |
| Support | C-ID holds on all frozen closes → **prospective support for Kalshi channel identity only**. |
| Contradiction | C-ID fails, or a non-S0 C-OFF half-even matches while S0 fails → revisit assumptions; still no official freeze. |
| Continued uncertainty | Default for official field/membership/rounding even if C-ID and S0 half-even hold. |

### 6.2 Explicit non-goals

- Not an O3 decision; not a strategy gate; not P&L.
- Not authorization by this document.
- Not a substitute for the missed five-close slot 0.
- Not a claim that four or six half-even matches prove official policy.

---

## 7. Required fields checklist (for any future authorized run)

- Full raw WS messages for both channels (retain bytes).
- 5Hz: `source_ts_ms`, `value_usd`, nested `data`, `received_at`.
- 1Hz: nested `data`, `avg_60s_data`, `last_60s_windowed_average_15min`, `received_at`.
- Local wall + monotonic receipt per envelope.
- Post-close raw official HTTP body + `bodyTextHash`.
- Restart-safe HTTP ledger; immutable frozen close list.

---

## 8. Attestation

- No new capture or market-data request in this task.
- No vendor contact; no purchase; no trade/order; no P&L; no O3.
- Existing campaign artifacts and hashes preserved; missed slot retained.
- Exploratory findings labeled exploratory only.
- **O6 remains blocked.** This proposal does **not** authorize a campaign.
