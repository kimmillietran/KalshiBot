# CryptoStruct vs KalshiBot Fidelity Audit

**Operational repo:** `/Users/builder/Developer/kalshi-builder2`
**Branch:** `feature/external-kalshi-data-audit`
**HEAD:** `d7d958dcd770a44439d6858b1d30f25856d6efb5`
**Scope:** Data fidelity only. No M16 outcomes. No strategy optimization. No live orders. No additional purchases.

## Verdict

**PASS**

CryptoStruct purchased KXBTC15M series-day bundles show **high causal BBO agreement** with pre-M16 KalshiBot forward-quote captures on five overlapping UTC days. At predetermined ASOF tolerances (100 ms–5 s), YES/NO bid/ask/spread land at roughly **~94–95% exact** and **~99% within 1 cent** (direction A: KalshiBot → nearest-preceding CryptoStruct). This supports a substantial external historical reservoir for exploratory TRAIN / design / reserved future validation — with caveats below. It does **not** by itself make CryptoStruct confirmatory absolute ground truth.

## Raw Authority

| Day | ZIP | SHA-256 | Match |
| --- | --- | --- | --- |
| 2026-09-08 | `kalshi-btc-15m_2026-09-08.zip` | `91d890acc77db122b4dbaf5dbf1cae4c8151506dfe52ae37639235c88001e27d` | yes |
| 2026-09-09 | `kalshi-btc-15m_2026-09-09.zip` | `f468b653c740a8c55058e8558cfceb61f1d4ffad5be3aff634fddd21d31b1e91` | yes |
| 2026-09-14 | `kalshi-btc-15m_2026-09-14.zip` | `fb65ac61071b2ec0a757701634a411e03fe7040ea939438a97afd62117d09d54` | yes |
| 2026-09-18 | `kalshi-btc-15m_2026-09-18.zip` | `4c713ef0d33dd892ddc9de0eb2a37372fd91990af67380b91cbb53f1ad0742dc` | yes |
| 2026-09-20 | `kalshi-btc-15m_2026-09-20.zip` | `52836856281fbc78e8c9593fbc0a35e5eb166792746924a28becde6c97baf2e4` | yes |

- Raw ZIPs immutable under `data/external-samples/cryptostruct/overlap/raw/` (**gitignored**): **yes**
- Free disk before work: ~182 GiB available
- KalshiBot capture root used: `/Users/builder/Desktop/KalshiBot/data/live-capture/forward-quotes/` (builder2 root checked; only M16 day present there — excluded)

### Exact KalshiBot runs compared

| Day | Run | Usable | Notes |
| --- | --- | --- | --- |
| 2026-09-08 | `2026-09-08T05-12-34-856Z` | yes | duration-complete |
| 2026-09-08 | `2026-09-08T07-46-44-416Z` | yes | duration-complete |
| 2026-09-09 | `2026-09-09T06-39-04-259Z` | yes | duration-complete |
| 2026-09-09 | `2026-09-09T20-37-36-719Z` | yes | duration-complete |
| 2026-09-14 | `2026-09-14T01-09-01-430Z` | **no** | `process-exited-unexpectedly` — excluded |
| 2026-09-14 | `2026-09-14T07-33-30-421Z` | yes | duration-complete |
| 2026-09-18 | `2026-09-18T07-59-28-489Z` | yes | duration-complete |
| 2026-09-18 | `2026-09-18T16-25-35-978Z` | yes | duration-complete |
| 2026-09-20 | `2026-09-20T02-52-53-859Z` | yes | duration-complete |

2026-09-22 M16 prospective capture was **not** used.

Fidelity compute sampled up to **8 shared tickers per run** (64 ticker-samples total) for tractability; full shared-ticker lists are retained in artifacts.

## Exact Overlap

CryptoStruct UTC series-day ZIPs contain ~98–99 KXBTC15M contracts each (~100 zip entries including `MANIFEST.txt`). Bundles **also include prior-ET-evening contracts** whose ticker date ≠ UTC day label (typically ~16–17 such members/day). Match rule: **exact ticker string only**.

Usable KalshiBot runs share tens of tickers with the corresponding CryptoStruct day (e.g. 34 on long 8h runs). Overlap duration equals the intersection of each run window with reconstructed CryptoStruct receive-time coverage for that ticker (typically minutes to the full 15m contract inside an 8h capture).

## Clock / Timestamp Findings

| Source | Clock used for primary ASOF | Notes |
| --- | --- | --- |
| CryptoStruct | adapter receive (ns) | venue/exchange ts also present |
| KalshiBot | `receivedAtLocal` | `exchangeTimestampMs` often null on TOB |

CryptoStruct **receive − venue** latency (sampled contracts): p50 ≈ **5.6 ms**, p90 ≈ **7.1 ms**, p99 ≈ **8.9 ms**.
`prevEventId` book-chain breaks on reconstructed samples: **0**.
No clock “correction” applied; primary comparisons use original timestamps.

## BBO Fidelity

Adapters:

- **CryptoStruct:** causal YES book from snapshot + deltas; fail-closed after unexplained `prevEventId` break until fresh snapshot; NO via Kalshi complement (`NO_bid = 1 − YES_ask`, `NO_ask = 1 − YES_bid`); prices rounded to integer cents.
- **KalshiBot:** native TOB fields `yesBestBidCents` / `yesBestAskCents` / `noBest*` / `yesSpreadCents`.

### Direction A — KalshiBot ts → nearest-**preceding** CryptoStruct (aggregate mean over 64 ticker-samples)

| Tol | YES bid exact | YES bid ≤1¢ | YES bid MAE¢ | YES bid p95¢ | match rate |
| --- | --- | ---: | ---: | ---: | ---: |
| 100 ms | 0.946 | 0.990 | 0.081 | 0.53 | 0.936 |
| 500 ms | 0.947 | 0.990 | 0.081 | 0.53 | 0.940 |
| 1 s | 0.947 | 0.990 | 0.081 | 0.53 | 0.940 |
| 2 s | 0.947 | 0.990 | 0.081 | 0.53 | 0.940 |
| 5 s | 0.947 | 0.990 | 0.081 | 0.53 | 0.940 |

YES ask / NO bid / NO ask / spread are essentially the same band (~0.94–0.95 exact, ~0.99 within 1¢; spread exact ~0.937, within-1¢ ~0.994). Widening tolerance beyond 100 ms barely changes agreement — residual error is mostly simultaneous microstructure / locked-book / rounding, not lag.

## Bidirectional Comparison

**Direction B** (CryptoStruct state-change → nearest-preceding KalshiBot) at 1 s YES bid:

| Day | within-1¢ | exact | match rate |
| --- | ---: | ---: | ---: |
| 2026-09-08 | 0.969 | 0.902 | 0.952 |
| 2026-09-09 | 0.976 | 0.913 | 0.944 |
| 2026-09-14 | 0.978 | 0.899 | 0.948 |
| 2026-09-18 | 0.979 | 0.906 | 0.844 |
| 2026-09-20 | 0.976 | 0.908 | 0.939 |

Direction B is slightly weaker than A (expected: CryptoStruct is denser; KalshiBot cannot mirror every vendor micro-update). Sep 18 evening run shows lower B match rate (~0.84) — density / coverage asymmetry, not wholesale price disagreement.

## Transition Latency

For CryptoStruct YES-bid jumps ≥1¢: mean p50 time until KalshiBot shows the same cent ≈ **13 ms** when observed, but **~65%** of vendor transitions are **never** seen before the next CryptoStruct transition (vendor density ≫ KalshiBot TOB sampling after coalesce). Treat this as a **collection-fidelity** limit of KalshiBot sampling, not as CryptoStruct false prints.

## Lifecycle Coverage

Inside each usable run window, shared tickers show concurrent CS/KB coverage. Day bundles include prior-evening ticker dates — use exact ticker identity. Terminal seconds were not settlement-inspected (forbidden); structural last-observation times are recorded in `cryptostruct-lifecycle-audit.json`.

## Trade Stream Check

CryptoStruct files contain dense trade prints (tens of thousands per sampled contract in-window). KalshiBot forward-quote captures expose **TOB/book**, not an authoritative trade tape → **trade fidelity cannot be independently verified** against KalshiBot. Do not invent trade matches from quote moves. Prior free-sample page-vs-file trade-count mismatch remains a marketing/definition issue; overlap BBO does not resolve it.

## Worst Disagreement Cases

Lowest within-1¢ YES-bid (direction A, 1 s) among samples still ≥ **0.959**:

- `2026-09-08` / `…T07-46-44-416Z` / `KXBTC15M-26SEP080800-00` — within1c 0.959, MAE 0.27¢, max abs 35¢
- `2026-09-09` / `…T06-39-04-259Z` / `KXBTC15M-26SEP090245-45` — within1c 0.965, max 16¢
- `2026-09-08` / `…T07-46-44-416Z` / `KXBTC15M-26SEP080600-00` — within1c 0.969, max 36¢

Large max abs diffs are rare tails (likely transient locked/one-sided / lifecycle edge states), not typical MAE (~0.08¢).

## Per-Day Stability

| Day | A 1s YES-bid within-1¢ mean | min across sampled tickers |
| --- | ---: | ---: |
| 2026-09-08 | 0.988 | 0.959 |
| 2026-09-09 | 0.989 | 0.965 |
| 2026-09-14 | 0.991 | 0.977 |
| 2026-09-18 | 0.993 | 0.977 |
| 2026-09-20 | 0.991 | 0.983 |

No day is materially broken. Sep 8 shows the weakest sample minimum; Sep 18/20 are strongest.

## Research Suitability

| Use | Grade |
| --- | --- |
| TRAIN | **PASS** |
| historical validation | **PASS WITH CAVEATS** |
| future reserved HOLDOUT | **PASS WITH CAVEATS** (future days only) |
| sub-second | **PASS WITH CAVEATS** |
| 1–5s | **PASS** |
| 5–30s | **PASS** |
| minute-scale | **PASS** |
| 15m lifecycle | **PASS WITH CAVEATS** |
| cross-contract | **PASS** |
| liquidity-shock | **PASS WITH CAVEATS** |

## Purchase Recommendation

- larger archive justified: **yes** (decision code **A**)
- recommended scope: **30–90 UTC series-days after 2026-08-14**, regime-balanced; expand later with reservation ledger
- important exclusions: pre-2026-08-14 opening-window incompleteness; Thursday exchange maintenance; **these five audit days = QUALITY_AUDIT_ONLY**
- remaining uncertainty: trades vs KalshiBot unverifiable; high CS→KB transition never-rate; ticker subsample for compute
- **Do not purchase in this step** (agent bought nothing)

## Untouched Data Governance

Confirm statuses for purchased overlap days:

| UTC day | Status |
| --- | --- |
| 2026-09-08 | **QUALITY_AUDIT_ONLY** |
| 2026-09-09 | **QUALITY_AUDIT_ONLY** |
| 2026-09-14 | **QUALITY_AUDIT_ONLY** |
| 2026-09-18 | **QUALITY_AUDIT_ONLY** |
| 2026-09-20 | **QUALITY_AUDIT_ONLY** |

They must **not** later be represented as untouched HOLDOUT. Future days may be `UNOPENED` / `HOLDOUT_RESERVED` only if identity (provider, UTC date, ZIP SHA-256, acquisition time, status) is frozen **before** economic outcome computation on those dates.

Minimal ledger fields: `provider`, `utcDate`, `rawZipSha256`, `acquisitionTimestampUtc`, `status`.

## Scientific Boundaries

Confirm:

- M16 unchanged
- M16 outcomes unopened
- no prospective M16 data used
- no strategy optimization
- no ASOF tolerance tuning
- no live orders
- no additional purchases

## Artifacts

| File | Role |
| --- | --- |
| `cryptostruct-overlap-provenance.json` | HEAD, hashes, run inventory |
| `cryptostruct-overlap-inventory.json` | ZIP members / tickers |
| `cryptostruct-clock-audit.json` | clocks / latency |
| `cryptostruct-bbo-fidelity.json` | bidirectional ASOF |
| `cryptostruct-transition-latency.json` | BBO transition lag |
| `cryptostruct-lifecycle-audit.json` | coverage windows |
| `cryptostruct-fidelity-verdict.json` | grades + purchase posture |
| `cryptostruct-fidelity-audit.md` | this report |
| `scripts/research/cryptostructKalshiBotFidelityAudit.py` | reusable auditor (`--self-test`) |

STOP.
