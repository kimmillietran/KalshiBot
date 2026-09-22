# External Kalshi Historical Data Audit

**Canonical checkout:** `/Users/builder/Developer/kalshi-builder2`  
**HEAD:** `64e0d217981a3aa1898126e722486dac503dc66c`  
**Access date (UTC):** 2026-09-22  
**Scope:** Free/sample third-party KXBTC15M data only. No purchases. No M16 changes. No sealed economic outcomes opened.

## Verdict

CryptoStruct’s free KXBTC15M contract sample is **genuinely event-level** and supports **causal YES/NO executable-book reconstruction** at sub-second receive-time density. That is enough to justify a **small paid pilot** (€1 series-days that overlap KalshiBot’s own captures) before any large archive purchase.

PMXT’s public archive was **unreachable**. DepthFeed’s keyless surface is only a **trimmed live demo**; historical Kalshi series require registration (stopped there; no credentials fabricated).

**Purchase posture:** **B — PURCHASE LIKELY HIGH VALUE AFTER SAMPLE PASSES**, minimum 3–5 overlapping CryptoStruct series-days for fidelity checks — **not** a bulk archive yet.

External ≠ confirmatory. The free sample day is already opened for quality work and must **not** be treated as untouched HOLDOUT.

## Sources Tested

### CryptoStruct

- download: **success** — free sample `KXBTC15M-26SEP161415-15` (2026-09-16), `kalshi-KXBTC15M-26SEP161415-15-2026-09-16.txt.zst`  
  SHA-256 `0525e0ba6e0793ffe513cc5e2c49fb6814999ac18a6d6edfdd0d0538e8317c97` (32,521,007 bytes) via  
  `https://cryptostruct.com/api/download/sample/17340163/2026-09-16?s=kalshi-btc-15m`
- byte-level audit: **1,144,938 lines**; 1 snapshot + 1,096,953 book updates + 47,981 trades; 0 malformed rows; 0 exact duplicate lines; 0 impossible prices/sizes; 0 crossed books in reconstruction
- effective resolution: receive-time inter-event p50 **~0.033 ms**, p90 **~2.4 ms**, max gap **~370 ms**; exchange timestamps present (microsecond-aligned ns). Horizons A–E: **GOOD** for data resolution (not profitability)
- gap detection: **GOOD** via per-topic `prevEventId` chains (0 breaks on book updates and on trades). Event IDs are **not** contiguous monotonic integers — do not use “seq += 1” arithmetic
- executable-book reconstruction: **PASS** — snapshot then deltas; no delta-before-snapshot; YES ladder reconstructed; NO via Kalshi complement (`NO_bid = 1 - YES_ask`, `NO_ask = 1 - YES_bid`); no future-row repair
- overlap agreement: **not available** — no KalshiBot forward-capture on 2026-09-16 / this ticker
- suitable research horizons: **≤1s through 15m lifecycle** on this sample (resolution). Still need overlap validation before trusting absolute fidelity

Provider-claim caveats (not independently verified as facts):

- “byte-identical to paid bundle”
- “nanosecond venue timestamps” (file shows microsecond-aligned exchange ts; receive ts has true ns)
- page trade count **45,156** vs file **47,981**
- archive size/coverage marketing (Feb 2026–, ~208 days, ~72.9 GB)

License (**provider text**): internal use; no raw redistribution — https://cryptostruct.com/license

### PMXT

- download: **failed** — `https://archive.pmxt.dev/Kalshi` unreachable (connect failure / HTTP 500). Homepage still advertises Archive → that host
- byte-level audit: **N/A**
- effective resolution: **N/A**
- gap detection: **N/A**
- executable-book reconstruction: **N/A**
- overlap agreement: **N/A**
- suitable research horizons: **none until archive returns**

Re-audit when the host is back. Do not treat marketing “historical data” as verified.

### DepthFeed

- download: **keyless demo only** — `GET https://api.depthfeed.com/v3/demo` (+ health/overview). `/v3/kalshi/markets` and `/v3/btc/markets` return `AUTH_MISSING`. **Stopped at registration required** (Explorer is $0 but still needs an account/API key; no credentials fabricated)
- byte-level audit: demo is a **single** latest BTC 15m snapshot; Kalshi YES/NO **top 8** levels; no ticker identity; not a day archive
- effective resolution: **unsuitable** as historical research input from free surface
- gap detection: **unknown** without keyed history (Desk ticks claim Kalshi `seq` +1 — provider claim only)
- executable-book reconstruction: **cannot** be assessed over time from one truncated snapshot
- overlap agreement: **not performed**
- suitable research horizons: free surface **UNSUITABLE**; keyed snapshots/ticks remain **unverified**

Docs/pricing (**provider claim**): Explorer 7d / Quant 30d / Research 90d / Desk full archive + raw ticks ($249/mo). Pricing table states Explorer “60s minimum” snapshot interval while docs say omitting `interval` returns full stored resolution on keyed plans — unresolved without a key.

## Cross-Provider Comparison

| Criterion | CryptoStruct sample | PMXT | DepthFeed free |
| --- | --- | --- | --- |
| Obtained | Yes | No | Demo only |
| Event-level L2 | Verified | — | No |
| Trades + aggressor | Verified | — | No |
| Causal BBO | Verified | — | No |
| Gap detection | Verified (prevEventId) | — | Unknown |
| BTC in-file | No | — | Overview has proxies (claim) |
| Overlap vs KalshiBot | No exact date | — | No |
| Buy now? | Small pilot days | No | No |

## KalshiBot Compatibility

Own forward-quote inventory checked under builder2 and Desktop KalshiBot. Captures exist for several Aug/Sep 2026 days, including **2026-09-22** (M16 window; outcomes sealed/unopened) and nearby **2026-09-14 / 18 / 19 / 20**. **None** match CryptoStruct’s free sample day **2026-09-16**.

Therefore: no strict or ASOF BBO agreement metrics. Planned diagnostics (if an overlapping paid day is bought): nearest-**preceding** ASOF at 100 ms / 500 ms / 1 s / 2 s / 5 s; never nearest-future; compare bid/ask/spread/touch depth/lifecycle only — diagnostics, not strategy tuning.

## Research-Family Suitability

M17: CryptoStruct sample **promising for exploratory TRAIN** after joining an external BTC feed; confirm with overlap days before any lag claims. DepthFeed free **no**. PMXT **no**.

M18: CryptoStruct **exploratory TRAIN** if threshold/BTC joined; start/expiry in header. Others insufficient/unavailable.

M19: CryptoStruct **exploratory TRAIN** with external BTC. Others no/unverified.

M20: CryptoStruct **good lifecycle coverage** on the sample contract. Others no/unverified.

M21: CryptoStruct **single-ticker sample insufficient**; paid **series-day** bundle is the right unit. Others no/unverified.

M22: CryptoStruct **strong candidate** (dense L2 + gap chain). DepthFeed only if Desk ticks later prove complete. PMXT no.

## Untouched Validation Potential

What may legitimately be called untouched for **future** hypotheses:

1. **Reserve first.** Date/day identity and role (`VALIDATION_RESERVED` / `HOLDOUT_RESERVED`) recorded in a ledger **before** any strategy outcome computation on that slice.
2. **External ≠ untouched.** A purchased archive is only HOLDOUT if kept unopened for that hypothesis.
3. **This free sample is already opened** for schema/quality audit (`2026-09-16` / `KXBTC15M-26SEP161415-15`) — do **not** rebrand it as untouched HOLDOUT.
4. **No retroactive M16 substitution.** M16 remains the prospective sealed validation track; historical third-party data cannot replace it.
5. Prefer chronological separation and regime diversity when reserving; never pick holdouts by observed edge.

A full reservation ledger/framework should wait until purchase begins; do not build a giant system on one free file.

## Purchase Assessment

- buy anything now: **yes** (pilot only)
- provider: **CryptoStruct**
- minimum purchase: **3–5 €1 series-days overlapping KalshiBot capture dates**
- why: sample passes event-level / causal-book / density gates; absolute fidelity still unproven without overlap
- major remaining uncertainty: BBO/event agreement vs KalshiBot on shared timestamps; marketing trade-count mismatch; unpaid “byte-identical” claim

Do **not** buy DepthFeed or a full CryptoStruct archive yet. Revisit PMXT when `archive.pmxt.dev` returns.

## Scientific Boundaries

Confirm:

- M16 unchanged
- M16 outcomes unopened
- no M16 historical substitution
- no live orders
- no post-hoc strategy optimization
- no purchases executed in this audit
- no fabricated API credentials
- raw vendor blobs kept under `data/external-samples/` (gitignored); compact audit artifacts under `data/research-results/external-kalshi-data-audit/`

## Artifact Index

| File | Role |
| --- | --- |
| `provenance.json` | Download URLs, SHA-256, checkout HEAD |
| `source-audit.json` | Phase 1 provider/provenance (claim vs verified) |
| `cryptostruct-raw-audit.json` | Phase 2–3 file metrics + reconstruction |
| `overlap-audit.json` | Phase 4 overlap result (none) |
| `suitability-audit.json` | Phase 5–7 families + untouched design notes |
| `purchase-assessment.json` | Phase 6 verdict |
| `external-kalshi-data-audit.md` | This report |

STOP.
