# M16 CryptoStruct Source-Equivalence Audit

## Verdict

**PASS WITH CAVEATS**

CryptoStruct can be transformed into an observation stream that reproduces a **substantial majority** of KalshiBot M16 pre-entry confirmations on the five QUALITY_AUDIT_ONLY overlap dates (selected adapter recall ≈ **0.72**, precision ≈ **0.60** at 1 s; matched confirmation timing p50 ≈ **6 ms**). This is enough to design a separately labeled historical external replication (M16-ER) with caveats — **not** enough to call CryptoStruct a perfect drop-in mirror, and **not** evidence of M16 edge.

## Authority

- **repo HEAD:** `d7d958dcd770a44439d6858b1d30f25856d6efb5`
- **branch:** `feature/external-kalshi-data-audit`
- **M16 identities unchanged:**
  - family `e98e6180b1edc468d544cbc41a624b8201535b2e9e58121d7669079fcf5cbce0`
  - evidence `2a06820dab24aea4a253d886460bfc1267d7bd438d0bce817cbb999fd934beb7`
  - dependence `df947284e5ee7678280dafd6ba5c4456281ca894b10b793a5a05f584d7d2630d`
  - fee `86f5f152308096fb365bb4ef41dca8beb488a302f038a915c8b228c0b645b44d`
  - prospective cohort `a2b86dd7c7fc3864ce48c860b10cfea053bdde04e09723a4f6ae87adca31dd63`
  - prospective scientific protocol `1aa47e106a069dad466e2e338ba4b50000fd52eeaac482239544e20161f5a824`
- **Dates:** 2026-09-08 / 09 / 14 / 18 / 20 only (`QUALITY_AUDIT_ONLY`)
- Canonical detector: `stepM16MarketMachine` (unchanged). Contamination asserts bypassed only because these overlap runs are explicitly allowed for fidelity (some IDs are M14-forbidden for prospective M16 incidence).

## KalshiBot Observation Contract

| Item | Rule |
| --- | --- |
| Authoritative timestamp | `exchangeTimestampMs ?? receivedAtMs` (TOB exchange often null → receive) |
| Emission | Every `top-of-book.jsonl` line in file order |
| Eligibility | `bookState==="valid"` AND `isEconomicallyValid===true` AND finite YES/NO bids AND `quoteAgeMs` present |
| Midpoint | `yesMid = (yesBid + (100−noBid))/2 = 50 + (yesBid−noBid)/2` |
| Asks | Complement-derived; not independently required beyond NO bid |
| Unchanged BBO | Still steps the machine (usually no-ops) |
| Ordering | File order; no coalescing in canonical streamer |
| Side invariance | YES and NO machines both stepped; first confirmation claims the market |
| One signal / ticker | `marketClaimed` |

See `m16-observation-contract.json`. Textual prompt summary matches code for 40/30/+1/−1/>H confirmation.

## CryptoStruct Adapter(s)

| Variant | Rationale |
| --- | --- |
| **RAW-BBO-CHANGE** | Causal YES book; emit when `(yesBid, noBid, eligible, gap)` changes |
| KALSHIBOT-MIRROR | Same + collapse same receive-ms to last state |

Locked/crossed → not `bookEligible` (mirrors non-economically-valid / non-executable). No smoothing or cadence search. **No economic criterion used.**

## Pre-Signal State Fidelity

Prior overlap fidelity already showed ~99% within-1¢ BBO. Here, mid-driven structure: both sources produce down-crosses and confirmations on shared tickers; CS tends to emit **more** confirmations (extra sub-second paths KalshiBot’s eligible TOB stream misses).

## Eligible Confirmation Equivalence

Selected adapter **RAW-BBO-CHANGE**, tolerance diagnostics at **1 s** (predetermined):

| Day | KB conf | CS conf | matched | unmatched KB | unmatched CS | recall | precision | δ p50 / p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2026-09-08 | 31 | 36 | 21 | 10 | 15 | 0.677 | 0.583 | 6 / 8 |
| 2026-09-09 | 31 | 37 | 19 | 12 | 18 | 0.613 | 0.514 | 6 / 7 |
| 2026-09-14 | 19 | 23 | 15 | 4 | 8 | 0.789 | 0.652 | 6 / 8 |
| 2026-09-18 | 39 | 51 | 29 | 10 | 22 | 0.744 | 0.569 | 6 / 7 |
| 2026-09-20 | 28 | 30 | 22 | 6 | 8 | 0.786 | 0.733 | 6 / 9 |
| **Aggregate** | **148** | **177** | **106** | **42** | **71** | **0.716** | **0.599** | — |

Exact-side agreement among matches: **100%** (matcher requires same side). L agreement tracked in artifacts. No economically broken day; Sep 9 is weakest recall.

KALSHIBOT-MIRROR was worse (recall 0.65 / precision 0.55) → not selected.

## Disagreement Analysis

| Class | Count (both adapters logged) | Interpretation |
| --- | ---: | --- |
| unmatched KalshiBot | high | CS miss or path divergence / eligibility filter |
| unmatched CryptoStruct | higher | CS sees extra transitions KB eligible-TOB stream lacks |

Dominant themes: **CryptoStruct extra sub-second paths**, **KalshiBot sampling / economic-validity filtering**, occasional timing-only near-misses outside 1 s. Matched events show **~6 ms** confirmation deltas — not a clock crisis. Worst days still recall ≥0.61.

## Selected Adapter

- **ID:** `RAW-BBO-CHANGE`
- **Why:** Higher structural recall+precision than mirror; simpler (no same-ms collapse)
- **Adapter identity:** see `m16-cryptostruct-adapter-selected.json` (`adapterIdentity` sha256)
- Economic criterion used: **false**

## Blind Incidence Planning

**Not evidence of edge. No P&L inspected.**

Governed 18:00–22:00Z eligible confirmations on audit days (CS-only, selected adapter, all day tickers):

| Day | Confirmations / 4h |
| --- | ---: |
| 2026-09-08 | 10 |
| 2026-09-09 | 14 |
| 2026-09-14 | 13 |
| 2026-09-18 | 12 |
| 2026-09-20 | 12 |

Mean **12.2** / median **12** / range 10–14.

Planning sketch (rough, shop inventory not re-fetched): ~30 untouched post-2026-08-14 days × 4h ≈ **120h** (<140h), projected ≈ **366** signals > N=268 with G=24 day clusters plausible if rate holds → `LIKELY_FEASIBLE_IF_PURCHASED_BLOCK_MATCHES_RATE`.

## External Replication Feasibility

**YES WITH CAVEATS**

A separately labeled historical M16 external replication (M16-ER) using untouched CryptoStruct dates can be designed, using the frozen state machine + selected adapter. It is **not** the existing prospective M16 campaign. Caveats: imperfect recall/precision, CS-extra signals, QUALITY_AUDIT_ONLY days burned, need reservation ledger before opening economics.

## Scientific Boundaries

Confirm:

- existing M16 unchanged
- prospective scheduler remains armed
- M16 outcomes unopened
- no P&L / target / stop / settlement inspected
- no adapter selected using economics
- no untouched CryptoStruct date opened
- no new purchase
- no live orders

## Artifacts

- `m16-observation-contract.json`
- `m16-cryptostruct-adapter-candidates.json`
- `m16-cryptostruct-adapter-selected.json`
- `m16-source-equivalence-summary.json`
- `m16-source-equivalence-events.json`
- `m16-source-equivalence-disagreements.json`
- `m16-source-equivalence-audit.md` (this file)
- runners: `scripts/research/emitCryptostructM16Observations.py`, `scripts/research/runM16CryptostructSourceEquivalence.ts`

STOP.
