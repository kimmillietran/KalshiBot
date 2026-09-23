# External Kalshi Historical Data Audit

**Canonical checkout:** `/Users/builder/Developer/kalshi-builder2`
**HEAD:** `64e0d217981a3aa1898126e722486dac503dc66c`
**Access date (UTC):** 2026-09-22
**PMXT retry access (UTC):** 2026-09-22T23:30:34Z
**Scope:** Free/sample third-party KXBTC15M data only. No purchases. No M16 changes. No sealed economic outcomes opened.

## Verdict

CryptoStruct’s free KXBTC15M contract sample is **genuinely event-level** and supports **causal YES/NO executable-book reconstruction** at sub-second receive-time density. That is enough to justify a **small paid pilot** (€1 series-days that overlap KalshiBot’s own captures) before any large archive purchase.

**PMXT retry:** object store (`r2kalshi.pmxt.dev`) is reachable; listing UI (`archive.pmxt.dev`) remains down from this host. Hourly Parquet samples confirm structure **B** (many order-book events per hour). KXBTC15M is present and dense, but **all sampled KXBTC snapshots have empty ladders**, so **causal executable BBO reconstruction fails**. Archive newest hour is **2026-06-11T03** (~103 days stale vs advertised hourly/current cadence). **PMXT does not replace CryptoStruct** for exploratory executable-quote TRAIN, historical validation, or HOLDOUT.

DepthFeed’s keyless surface remains only a **trimmed live demo**; historical Kalshi series require registration (stopped; no credentials fabricated).

**Purchase posture:** **B — PURCHASE LIKELY HIGH VALUE AFTER SAMPLE PASSES**, minimum 3–5 overlapping CryptoStruct series-days — **not** a bulk archive yet. Do not buy PMXT; free archive already insufficient for KXBTC BBO work.

External ≠ confirmatory. The CryptoStruct free sample day is already opened for quality work and must **not** be treated as untouched HOLDOUT.

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

### PMXT (retry)

- listing UI: **still down** from this host — `archive.pmxt.dev` TCP refused; WebFetch HTTP 500. Homepage / `/Kalshi` not loadable here.
- object store: **success** — `https://r2kalshi.pmxt.dev/kalshi_orderbook_*.parquet`
- downloads (gitignored raw under `data/external-samples/pmxt/raw/`):
  - `kalshi_orderbook_2026-06-06T09.parquet` — 60,732,334 bytes — SHA-256 `3069ab961b0a437eb08c5804fc2ff04f0aaceb86ff96803dc68f42b70c6c9968`
  - `kalshi_orderbook_2026-06-06T10.parquet` — 55,941,494 bytes — SHA-256 `9e5be152ff27ae343804f1ca687207fb6d4b22de19888238c44be0d5ddbce1ec`
- license: **PROVIDER CLAIM** CC BY 4.0 (`https://creativecommons.org/licenses/by/4.0/`)
- **Actual archive freshness (reconcile):** advertised cadence = hourly/current (**claim**). Verified newest object = `…2026-06-11T03.parquet` (HTTP 200); `…T04` and later probes **404**. Oldest observed = `…2026-05-14T23.parquet`. **~103 days stale** at retry — **do not assume currentness**.
- hourly meaning: **B** — many events per hourly file (T10 ≈ 10.1M rows: ~9.96M `orderbook_delta` + ~189k `orderbook_snapshot`), **not** one snapshot per market per hour
- schema: `timestamp_received` (ms), `timestamp` (us), `market_ticker`, `market_id`, `event_type`, `yes_bids`, `no_bids`, `price`, `delta`, `side`. **No** trades, **no** sequence/event IDs
- KXBTC15M: **present** — T10 = 372,189 rows / 16 tickers; T09 = 469,696 rows / 28 tickers; simultaneous neighbors observed. Focus dense contract: `KXBTC15M-26JUN060630-30` (ticker HHMM is Eastern)
- KXBTC snapshots: **all empty** `yes_bids`/`no_bids` in both sampled hours (T09: 36/36 empty; T10 likewise). Non-KXBTC markets sometimes have nonempty snaps
- effective resolution (event density): focus ticker mean ~156 events/sec (max ~1004/sec); unique receive-ms often ~500 ms apart with many same-ms duplicates. **Density ≠ usable BBO**
- causal executable BBO: **FAIL / UNSUITABLE** on horizons A–E for KXBTC15M — empty seed snapshots; empty-start delta accumulation ≈ **99.9% crossed** YES books
- overlap vs KalshiBot: **none** — PMXT ends 2026-06-11; own captures are Aug/Sep 2026 (no May–June inventory)

PMXT can illustrate packing/schema/event-rate mechanics only. It is **not** sufficient for exploratory executable-quote TRAIN or exact-event validation.

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

| Criterion | CryptoStruct sample | PMXT (retry) | DepthFeed free |
| --- | --- | --- | --- |
| Obtained | Yes | Yes (R2 objects; listing UI down) | Demo only |
| Cost | Free sample / €1 day paid | Free archive (CC BY claim) | Demo free; history keyed |
| Archive coverage | Claim Feb 2026–present | Verified ~2026-05-14 → 2026-06-11 only (stale) | Plan-windowed (claim) |
| KXBTC15M | Yes (dense + nonempty book) | Yes rows; **empty snapshots** | No ticker in demo |
| Event density | Sub-ms receive | High deltas; ~500ms unique receive buckets | Single snapshot |
| Depth | Full ladder verified | Schema yes; KXBTC empty | Top-8 demo |
| Trades | Yes + aggressor | None | No (demo) |
| Timestamps | Venue + receive (ns receive) | Receive ms + venue us | Capture ms |
| Sequence / gap detect | prevEventId chain | None | Unknown |
| Causal BBO | PASS | **FAIL** for KXBTC | Cannot assess |
| Overlap vs KalshiBot | No (sample day) | No (date range) | No |
| Buy now? | Small pilot days | No | No |

**Can PMXT replace paid CryptoStruct?** Conservatively: **no** for exploratory TRAIN (executable quotes), design that needs BBO, historical validation, or untouched HOLDOUT. CryptoStruct remains materially better because PMXT KXBTC books are not reconstructible and the free archive is stale / non-overlapping.

## KalshiBot Compatibility

Own forward-quote inventory checked under builder2 and Desktop KalshiBot. Captures exist for several Aug/Sep 2026 days, including **2026-09-22** (M16 window; outcomes sealed/unopened) and nearby **2026-09-14 / 18 / 19 / 20**. **None** match CryptoStruct’s free sample day **2026-09-16**. **None** fall inside PMXT’s verified archive window ending **2026-06-11**.

Therefore: no strict or ASOF BBO agreement metrics for either vendor sample. Planned diagnostics (if an overlapping paid CryptoStruct day is bought): nearest-**preceding** ASOF at 100 ms / 500 ms / 1 s / 2 s / 5 s; never nearest-future; compare bid/ask/spread/touch depth/lifecycle only — diagnostics, not strategy tuning.

## Research-Family Suitability

M17: CryptoStruct sample **promising for exploratory TRAIN** after joining an external BTC feed; confirm with overlap days before any lag claims. DepthFeed free **no**. PMXT **unsuitable** (no causal BBO).

M18–M22: CryptoStruct as previously audited. PMXT **unsuitable** for executable-quote families; at most non-quote mechanics notes.

## Untouched Validation Potential

What may legitimately be called untouched for **future** hypotheses:

1. **Reserve first.** Date/day identity and role (`VALIDATION_RESERVED` / `HOLDOUT_RESERVED`) recorded in a ledger **before** any strategy outcome computation on that slice.
2. **External ≠ untouched.** A purchased archive is only HOLDOUT if kept unopened for that hypothesis.
3. **CryptoStruct free sample is already opened** for schema/quality audit (`2026-09-16` / `KXBTC15M-26SEP161415-15`) — do **not** rebrand it as untouched HOLDOUT.
4. **PMXT June 2026 hours opened for quality audit** — do not rebrand as HOLDOUT.
5. **No retroactive M16 substitution.** M16 remains the prospective sealed validation track; historical third-party data cannot replace it.
6. Prefer chronological separation and regime diversity when reserving; never pick holdouts by observed edge.

A full reservation ledger/framework should wait until purchase begins; do not build a giant system on free files.

## Purchase Assessment

**Updated after overlap fidelity audit (see `cryptostruct-fidelity-audit.md`).**

- fidelity overall: **PASS**
- larger archive justified: **yes (A)** — do **not** purchase in this step
- recommended next scope: 30–90 post-2026-08-14 series-days with reservation ledger
- five overlap days status: **QUALITY_AUDIT_ONLY** (not untouched HOLDOUT)

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
| `cryptostruct-raw-audit.json` | CryptoStruct file metrics + reconstruction |
| `pmxt-raw-audit.json` | PMXT retry file metrics + causal BBO fail |
| `overlap-audit.json` | Overlap result (none for either vendor sample) |
| `suitability-audit.json` | Families + untouched design notes |
| `purchase-assessment.json` | Purchase verdict |
| `external-kalshi-data-audit.md` | This report |

STOP.
