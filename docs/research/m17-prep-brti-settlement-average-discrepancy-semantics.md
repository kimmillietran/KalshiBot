# M17-prep — BRTI settlement-average discrepancy: official semantics investigation

**Role:** documentation research only. **Not** a capture, fidelity study, alpha
experiment, or vendor contact.

**Retrieval date for primary sources:** 2026-09-24 (this session).

**Base SHA for this memo branch:** `07c9561e853805f2932b7ab0eaa1ab321faffeef`
(`origin/main` at branch creation).

**Scope exclusions (observed):** no authenticated market-data requests, no
WebSocket subscriptions, no new captures, no purchases, no account changes, and
no messages sent to Kalshi or CF Benchmarks.

---

## 1. PR #116 evidence used (read-only)

| Item | Value |
| --- | --- |
| PR | [#116](https://github.com/kimmillietran/KalshiBot/pull/116) — *M17-prep: settlement-sample mapping and synchronized-capture verification* |
| Head inspected for this memo | `e38030ad90233d17fd47e27c615a7e20d41eedb3` |
| Discrepancy supplement | `settlement-average-discrepancy-v3.json` (bytes match content first published under `058b10fb5f6148c49c064e75e56a0db9135cc459`) |
| Live-session recording commit (prior) | `022ebdefc657c30737ffe92037fc7761e33bbb03` (`originalHead` in v3) |
| Availability supplement | `settlement-raw-capture-availability-v4.json` |

### Operational sample (from committed v3 / research memo — prior-agent findings)

| Field | Value |
| --- | --- |
| Market | `KXBTC15M-26SEP240015-15` |
| Close | `2026-09-24T04:15:00Z` |
| Same-message local receipt | `2026-09-24T04:15:00.120Z` |
| Provider `received_at` (Kalshi receipt of upstream) | `2026-09-24T04:15:00.075Z` |
| `last_60s_windowed_average_15min` | `83817.61766667`, count/window_size `60`, declared payload window `[04:14:00, 04:15:00)` |
| `avg_60s_data` (same message) | `83817.70733333`, count/window_size `60`, declared payload window `[04:14:00, 04:15:00)` |
| Recorded official `expiration_value` | `83817.71` |
| Next trailing update | `avg_60s_data` at declared `[04:14:01, 04:15:01)` = `83817.61766667` |

v3 findings used as **prior-agent verification** (not independently re-attested here):
`parserSwap=false`; only one count-60 settlement-field update; official matches
trailing average after USD rounding (**exploratory**); official does **not**
match settlement field after USD rounding; raw official HTTP body not retained;
raw synchronized JSONL unavailable in current environments (v4).

**Independently verified in this task:** GitHub API retrieval of the committed
v3/v4 JSON and research memo at the PR head above; public documentation pages
and PDFs listed in §3. **Not independently verified here:** byte-level replay
of the raw capture; live re-fetch of market metadata.

---

## 2. Primary sources consulted

| # | Title | URL | Retrieved | Version / effective date | Applicability to 2026-09-24 observation |
| --- | --- | --- | --- | --- | --- |
| S1 | CF Benchmarks Value Feed | https://docs.kalshi.com/websockets/cfbenchmarks-value | 2026-09-24 | Live docs page (no page version stamp found) | **Current** WS field semantics. Treat as describing present API behavior; do not assume silent identity with unpublished historical server code on 2026-09-24 without Kalshi confirmation. |
| S2 | CF Benchmarks 5Hz Value Feed | https://docs.kalshi.com/websockets/cfbenchmarks-value-5hz | 2026-09-24 | Live docs page | Current 5Hz channel; averages live on 1Hz channel only. |
| S3 | CF Benchmarks REST Passthrough | https://docs.kalshi.com/cfbenchmarks/rest-passthrough | 2026-09-24 | Live docs page | Access model / history passthrough; not settlement-field semantics. |
| S4 | Crypto Markets (Help Center) | https://help.kalshi.com/en/articles/13823838-crypto-markets | 2026-09-24 | Page shows “Updated over a month ago” | Product settlement description (60×1s RTI average). |
| S5 | CRYPTO15M contract terms PDF | https://assets.kalshi.com/contract_terms/CRYPTO15M.pdf | 2026-09-24 | Template PDF (fill-in terms; no revision stamp in extract) | Formal underlying: simple average of CF index for 60 seconds prior to `<time>`; post-Expiration revisions excluded. |
| S6 | BTC contract terms PDF | https://assets.kalshi.com/contract_terms/BTC.pdf | 2026-09-24 | Template PDF | Explicit BRTI minute average; same revision exclusion. |
| S7 | CME CF Real Time Indices Methodology | https://docs.cfbenchmarks.com/CME%20CF%20Real%20Time%20Indices%20Methodology.pdf | 2026-09-24 | **Version 17.0, 21 September 2026** | BRTI calculation / dissemination. **Note:** this PDF version date precedes the 2026-09-24 observation by three calendar days; an earlier publication/version date alone does not prove the methodology governed that observation. BRTI 200ms cadence changes land earlier (see methodology version history). Label claims carefully. |
| S8 | BRTI product page | https://www.cfbenchmarks.com/data/indices/BRTI | 2026-09-24 | Live page | Marketing/summary: ~200ms calculation; Kalshi among settlement users. |
| S9 | CF Benchmarks historical values API | https://docs.cfbenchmarks.com/api/rest/historical-values/ | 2026-09-24 | Live API docs | History endpoint semantics (timespan+timestamp; up to 15 min lag). |
| S10 | Contact Kalshi Support | https://help.kalshi.com/en/articles/13823855-contact-kalshi-support | 2026-09-24 | Updated May 20, 2026 | Support channels. |
| S11 | Making Your First Request / Discord pointer | https://docs.kalshi.com/getting_started/making_your_first_request | 2026-09-24 | Live docs | `#dev` / `#support` Discord for API help. |
| S12 | API Changelog | https://docs.kalshi.com/changelog/index.md | 2026-09-24 | Live changelog | Notes `cfbenchmarks_value_5hz` addition; states 1Hz channel and rolling averages **unchanged** at that entry — **does not** define which average is official expiration. |
| S13 | Rules Summary (Help) | https://help.kalshi.com/en/articles/13823823-rules-summary | 2026-09-24 | March 10, 2026 | Points to per-market “View full rules”; not field-level WS semantics. |

**Sample payloads** in S1 AsyncAPI examples are labeled **examples**, not normative
settlement proofs.

---

## 3. Field semantics (from reviewed sources)

### `cfbenchmarks_value` (1Hz channel)

- Emits ticks “roughly once per second”; duplicate/out-of-order upstream source
  timestamps ignored (**S1**).
- Carries raw upstream frame string `data`, plus averages (**S1**).

### `avg_60s_data`

Documented (**S1**, Averaging semantics):

- Always present.
- Window is **trailing and per tick**: `[source_ts_ms − 60000, source_ts_ms)`.
- `window_size` **counts prior ticks only**.
- If no prior ticks in the window, average falls back to the current tick value.
- Schema: `value` string to **8 decimal places**; `window_size`;
  `window_start_ts_ms`; `window_end_ts_exclusive` (**S1** AsyncAPI).

**Not found in reviewed sources:** an explicit statement that `avg_60s_data` is
the official market `expiration_value`.

### `last_60s_windowed_average_15min`

Documented (**S1**, Averaging semantics):

- Present only in the final minute before quarter-hour closes
  (`:00` / `:15` / `:30` / `:45`).
- Active accumulation window: `(quarter_close_ts_ms − 60000, quarter_close_ts_ms]`.
- **Start-boundary tick excluded; close tick included.**
- Second-indexed counts: `:01 → 1` … `:59 → 59`, close tick → `60`.
- Omitted outside that final-minute window.
- Same AvgData schema as `avg_60s_data` (8 dp string, window metadata) (**S1**).

**Not found in reviewed sources:** an explicit statement that this field **is**
the official `expiration_value`, or that it is defined as the average of
already-banked official samples used for settlement.

### `cfbenchmarks_value_5hz`

- Up to 5 updates/second for supported indices including `BRTI` (**S2**, **S12**).
- Lean raw ticks (`value_usd`, `source_ts_ms`, `received_at`, `data`).
- **Does not** include 60-second or quarter-hour averages (**S2**).

### What each average averages / input stream

| Question | Documented answer | Source | Gap |
| --- | --- | --- | --- |
| Input stream for WS averages | Tied to the ~1Hz `cfbenchmarks_value` tick stream (“ticks”, “prior ticks”); not described as averaging all 5Hz prints | S1, S2 | Exact second-selection rule from 5Hz upstream into each 1Hz tick **not found** beyond “ticks are emitted roughly once per second” |
| `window_size` / count | Number of ticks counted in the window; for `avg_60s_data`, **prior ticks only** | S1 | How that interacts with identical declared `[start, end)` payload fields when both report 60 is **not explained** |
| Authoritative for settlement? | Help/contract: official expiration = average of **60 one-second RTI readings** in the final minute. WS docs define two **different** windows and **do not** name either field as `expiration_value` | S4, S5, S6, S1 | Mapping from Help “60 RTI prices” → specific WS field **not found** |

### Timing and boundaries

| Concept | Documented meaning | Source |
| --- | --- | --- |
| `received_at` | When **Kalshi received** the upstream frame (unix ms) | S1 |
| `source_ts_ms` (5Hz) | Upstream **publication** timestamp of the tick | S2 |
| `window_start_ts_ms` / `window_end_ts_exclusive` | Window start; window end **exclusive** (schema names) | S1 |
| Settlement accumulation (prose) | `(close−60s, close]` — start exclusive, **close inclusive** | S1 |
| Trailing average (prose) | `[source_ts−60s, source_ts)` | S1 |
| Late / revisions / boundary updates for Kalshi averages | **Not found** in reviewed Kalshi WS docs | — |
| Why identical declared payload windows can differ | **Not found**; prose intervals differ even when schema field names match | S1 |

### Official settlement

| Question | Documented answer | Source | Remaining uncertainty |
| --- | --- | --- | --- |
| What defines expiration | Simple average of CF RTI for the **60 seconds prior to** `<time>` / “sixty seconds of … RTI” / “60 RTI prices … once per second” | S5, S6, S4 | Exact inclusive/exclusive endpoints vs WS prose `(close−60s, close]` vs Help “prior to” wording |
| Precision / rounding | BRTI **dissemination precision 0.01 USD** (methodology specs). WS average `value` formatted to **8** decimals. Market strike increments use `$0.01` language in templates. Help does not state the rounding stage for `expiration_value` in the reviewed article | S7 §7 BRTI, S1, S5 | Exact Kalshi rounding stage for `expiration_value` **not found** as a normative API rule in reviewed sources |
| Magnitude vs this sample | Field-to-field gap ≈ **0.0897** USD; settlement-field vs official ≈ **0.09** before/after 2dp. Half-cent rounding (0.005) **cannot** account for that magnitude | arithmetic on committed numbers | — |
| Missing samples | CRYPTO15M: if no data or incomplete at expiration → affected strikes resolve **No**. BTC template: if no data → market resolves No | S5, S6 | How incomplete is defined for 15m iterations |
| Post-expiration revisions | Revisions to Underlying after Expiration **not** accounted for in Expiration Value | S5, S6 | Whether live WS averages can move after close (v3: settlement field did not reappear after count-60 — prior-agent) |
| Consistency across docs | Help (60×1s), contract (60s simple average), WS (two windows with different endpoint conventions) are **directionally aligned** on “60 one-second samples” but **not** consistent on which streamed field equals expiration | S1,S4,S5 | Primary open question for support |

---

## 4. Evidence matrix (for M17)

| Question | Documented answer | Source | Remaining uncertainty | Implication for M17 |
| --- | --- | --- | --- | --- |
| Do the two WS averages use the same window? | **No** (prose): trailing `[ts−60s, ts)` vs settlement `(close−60s, close]` | S1 | Payload metadata can still show the same `[start, end)` pair (as in the committed sample) | Fidelity specs must not treat identical payload windows as identical sample sets |
| Is `last_60s_windowed_average_15min` official expiration? | **Not stated** | S1 vs S4/S5 | Open | Do not gate M17 on this field matching `expiration_value` without confirmation |
| Is `avg_60s_data` official expiration? | **Not stated** by vendor. Empirically, diagnostic half-even 2dp matched official on the 04:15Z committed window and the retained 23:15Z one-close capture, while `last_60s_windowed_average_15min` did not — a **strong empirical candidate only**, not a confirmed binding or rounding rule | S1; PR116 v3; one-close v2 | Exact 1Hz selection + official rounding open | Do not select a field for gates; keep reporting both |
| Raw evidence durability (04:15Z) | Raw capture unavailable; official HTTP not retained for that close | PR116 v3/v4 | Independent replay of 04:15Z ticks blocked | Later one-close campaigns retain raw WS + official HTTP under local-persistent-only |

---

## 5. Hypotheses (explicitly not conclusions)

Only hypotheses tied to evidence; each needs a distinguishing check.

1. **H1 — Different membership under different documented intervals**
   Even at close, prose says settlement includes the close tick and excludes the
   start tick, while trailing uses `[ts−60s, ts)`. Different 60-tick sets can
   yield different averages.
   *Distinguish:* Kalshi confirms sample membership lists for both fields on the
   same message; or documents how payload `window_*` relates to prose intervals.

2. **H2 — Payload window fields are a shared schema, not full membership proof**
   Both AvgData objects use `window_end_ts_exclusive` naming while settlement
   prose uses an inclusive close.
   *Distinguish:* schema/prose reconciliation from Kalshi.

3. **H3 — Official expiration is closer to the trailing average (exploratory)**
   On this one committed window, `83817.70733333` rounds to official `83817.71`,
   while `83817.61766667` rounds to `83817.62`. v3 marks this **exploratory**.
   *Distinguish:* multi-window confirmation **and** written Kalshi rule naming
   the calculating field — **not** repeated numerical agreement alone.

4. **H4 — Next-second equality implies a one-second offset rule**
   Next `avg_60s_data` equals the prior settlement-field value. That is a
   chronology clue only.
   *Distinguish:* algebraic identity over many closes; vendor confirmation.
   **Do not** treat as proof.

5. **H5 — Implementation bug / undocumented behavior**
   Insufficient evidence from public docs alone.
   *Distinguish:* vendor acknowledgment or contradictory normative spec.

**Rejected as explanations without further evidence:** “rounding only”;
“parser swap” (v3 `parserSwap=false`, prior-agent); selecting a field solely
because it matched one expiration.

---

## 6. What official documentation resolves vs leaves open

### Resolves (with caveats)

- The two average fields are **documented as different constructions** (trailing
  vs quarter-hour accumulation) with **different endpoint conventions** (**S1**).
- Settlement product language is a **60×1s CF RTI simple average** near close
  (**S4**, **S5**, **S6**).
- 5Hz feed is for raw high-frequency values and **does not** carry those averages
  (**S2**).
- BRTI is calculated at up to **every 200 ms**, with standard dissemination
  approximately every second / top-of-second, dissemination precision **0.01 USD**
  (**S7** §7; **S8**). Methodology PDF retrieved here is v17.0 dated
  **21 Sep 2026** — three calendar days before the observation day; an earlier
  version date alone does not prove verified effective applicability to that
  observation. Cadence change history cites May 2026 updates for BRTI effective
  time (**S7** version history).
- Post-expiration underlying revisions are **excluded** from Expiration Value
  (**S5**, **S6**).

### Remains unresolved

- Which streamed calculation (if either) produces market `expiration_value`.
- Exact second-sample selection from 5Hz upstream into 1Hz ticks / 60 settlement
  samples.
- Why two fields can report **identical** payload `[start, end)` and count `60`
  yet different values (docs imply different membership, but do not explain the
  shared payload window pair).
- Whether `last_60s_windowed_average_15min` is intended as a running bank of
  official settlement samples.
- Whether the observed dual-field divergence is expected.

### Documented explanation for the observed discrepancy?

**No.** Reviewed sources explain that the fields **can** differ in principle
(different windows), but do **not** provide a complete, field-authoritative
account that settles which value should match `83817.71` or why the payload
windows matched while values did not.

---

## 7. Unsent support message draft

**Do not send from this agent session.**

**Recommended channels (from primary sources; not contacted):**

1. Kalshi Discord `#dev` / `#support` (API docs “Making Your First Request”;
   Help “Kalshi API” recommends `#dev`) — preferred for API/data semantics.
2. In-app/web support messenger while logged in
   (https://help.kalshi.com/en/articles/13823855-contact-kalshi-support).
3. Fallback email: `support@kalshi.com` (same Help article; use if chat
   unavailable).

### Draft text

Subject: Clarification: `cfbenchmarks_value` averages vs KXBTC15M expiration_value

Hello Kalshi API/data support,

I am researching CF Benchmarks / BRTI settlement semantics for KXBTC15M and need
clarification on documented WebSocket fields. This is a data-semantics question
only.

Observation (single closed market; values from a local research capture summary —
the original raw WebSocket JSONL and the original official HTTP response body
are **not** available to re-attach here):

- Market ticker: `KXBTC15M-26SEP240015-15`
- Close time: `2026-09-24T04:15:00Z`
- One `cfbenchmarks_value` message (local receipt ≈ `2026-09-24T04:15:00.120Z`)
  contained **both**:
  - `last_60s_windowed_average_15min.value` = `83817.61766667` with
    `window_size` = 60 and declared window
    `[2026-09-24T04:14:00Z, 2026-09-24T04:15:00Z)`
  - `avg_60s_data.value` = `83817.70733333` with `window_size` = 60 and the
    **same** declared window
    `[2026-09-24T04:14:00Z, 2026-09-24T04:15:00Z)`
- Published market `expiration_value` recorded afterward: `83817.71`
- The next `avg_60s_data` update (declared window
  `[2026-09-24T04:14:01Z, 2026-09-24T04:15:01Z)`) equaled `83817.61766667`.
  I am **not** asserting that this proves a one-second offset rule; I am asking
  whether that pattern is expected.

Could you please clarify:

1. For `avg_60s_data` and `last_60s_windowed_average_15min`, what sample stream
   and inclusive/exclusive boundary convention each field uses (including how
   `window_size` relates to the current tick)?
2. Which calculation (if either of these fields, or another internal process)
   determines the official market `expiration_value` for KXBTC15M / CRYPTO15M?
3. Is the running `last_60s_windowed_average_15min` intended to represent the
   official banked settlement samples before close?
4. Is a difference between the two fields with identical declared
   `window_start_ts_ms` / `window_end_ts_exclusive` and `window_size=60`
   expected behavior, or a known issue?
5. Where is the authoritative specification for these mappings published?

Pointers already reviewed:
https://docs.kalshi.com/websockets/cfbenchmarks-value
https://help.kalshi.com/en/articles/13823838-crypto-markets
https://assets.kalshi.com/contract_terms/CRYPTO15M.pdf

Thank you.

---

## 8. Notes for the fidelity-study plan (other agent)

Incorporate without treating any hypothesis as settled:

1. Treat **documented** trailing vs settlement windows as **distinct** concepts
   even when payload window metadata coincides.
2. Do **not** promote either WS average to “official settlement” based on one
   window’s rounding match.
3. Require durable private retention of raw multiplexed captures **and** the
   post-close `GET /markets/{ticker}` HTTP body before new collection that will
   be used as evidence.
4. Keep Help/contract “60×1s average” as the product rule; keep WS field
   semantics as a separate, partially unbound layer pending vendor reply.
5. Record second-selection from 5Hz → 1Hz as an explicit unknown.
6. Rounding to $0.01 cannot dismiss ~$0.09 dual-field gaps.
7. The next-second equality is a chronology question for support / multi-window
   tests — not a fitted offset rule.

---

## 9. Session confirmation

- Documentation-only deliverable on
  `feature/docs-brti-settlement-average-discrepancy`.
- No market-data requests, captures, trading, purchases, account changes, or
  vendor messages occurred in this task.
- PR #116 / #117 implementation branches were not modified.
