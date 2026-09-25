# M17 data-acquisition feasibility — `kalshi-kxbtc15m-m17-data-acquisition-feasibility-v0`

Generated: 2026-09-25T02:20:45.563Z
Analysis version: `m17-data-acquisition-feasibility-v0.1`
Code SHA: `029aa1098102568aeec7f7258d4ec899b6296bde`
Base main SHA: `1c17f6851c872b403b100bf342a95451a21ecfca`
Decision status: **strategy-remains-blocked**

Acquisition-feasibility audit only. No purchase, subscription, capture, trade, or order occurred during this study. Public documentation was inspected; no vendor was contacted and no cost-incurring network requests were made. Does not freeze the M17 settlement-state→entry mapping. Does not compute strategy P&L. Does not recommend purchasing pristine validation/holdout data. A prospective capture is not historical coverage of the 34 SPENT days.

## Non-execution attestation

- Purchase made: **false**
- Subscription started: **false**
- Capture started: **false**
- Trade or order placed: **false**
- Network requests incurring cost: **0**
- Strategy P&L computed: **false**
- Strategy rule invented/tuned: **false**
- Pristine holdout purchase recommended: **false**

## Retained dataset (already available)

| Fact | Value |
| --- | --- |
| Valid settlement joins | 47263 |
| SPENT UTC days | 34 |
| YES BBO from CryptoStruct | true |
| Executable NO ask = 100 − YES bid | true |
| Entry / expiration timing | true |
| Source / exchange timestamps | true |

## Per-input classification

| Input | Class | Summary |
| --- | --- | --- |
| `coinbase-pre-entry-1m-ohlc-spent-calendar` | `purchasable-historical` | No retained Coinbase completed 1m OHLC covers the 34 M16-ER SPENT UTC days (local live-capture candles file is empty / off-calendar). CryptoStruct KXBTC15M day ZIPs do not contain Coinbase OHLC. Public Coinbase Exchange REST `GET /products/BTC-USD/candles?granularity=60` documents historical buckets with `security: []` (no API key in the OpenAPI). Classification uses `purchasable-historical` for historical acquisition feasibility; public docs indicate a no-cost authenticating-free path, but bulk research ToS / rate limits / completeness for all 34 days remain unverified without fetching (fetch not performed). |
| `historical-brti-raw-observations` | `purchasable-historical` | Raw BRTI observations are not in CryptoStruct book ZIPs. Kalshi CFB REST passthrough historically accepted `timespan=HOUR` for one authorized SPENT hour (18,000 in-hour 200ms ticks) and rejected `MINUTE`; CF Benchmarks `GET /api/v1/history/values` publicly requires index authorization plus `STREAM_HISTORICAL_VALUES` (license contact; pricing unverified). Returned ticks are raw index values with event timestamps—not venue banked averages and not contemporaneous receipt times. Final `expiration_value` labels cannot substitute for a pre-entry path. |
| `historical-brti-banked-60-sample-path` | `unverified` | No inspected public product sells a membership-labeled historical “60 official settlement samples” series with bank membership and receipt timestamps. Live Kalshi WS exposes `last_60s_windowed_average_15min` (venue-computed average) prospectively; historical HOUR bodies yield raw 5Hz ticks only. Offline fixed-window reconstructions of the retained HOUR body disagreed with official `expiration_value`. Do not synthesize a banked path from settlement labels. |
| `exact-5hz-to-1hz-window-identity` | `unverified` | Public Kalshi Help states 60 RTI prices at one-second intervals in the final minute averaged for `expiration_value`. Upstream BRTI publishes ~200ms. Authoritative rules for which 5Hz field/phase becomes each 1Hz sample, exact 60-sample membership (open/closed boundaries), timestamp domain, and rounding stage remain unresolved after local offline disagreement vs official. Purchasing raw BRTI does not by itself resolve this identity. |
| `frozen-yes-overpriced-enter-no-mapping` | `not-obtainable` | The rule mapping settlement-state arithmetic to “YES overpriced → enter NO” is a frozen-strategy decision, not a purchasable data product. This audit does not invent or tune that mapping. Acquisition of Coinbase/BRTI alone cannot supply it. |

### Classification counts

| Class | Count |
| --- | ---: |
| `available-existing` | 0 |
| `derivable-existing` | 0 |
| `purchasable-historical` | 2 |
| `prospective-only` | 0 |
| `unverified` | 2 |
| `not-obtainable` | 1 |

## Coinbase volatility contract (frozen research identity)

| Field | Value |
| --- | --- |
| Instrument | `BTC-USD` |
| Timezone | UTC bucket timestamps (Exchange candle time); wall-clock entry times compared in ms |
| Candle convention | Exchange docs: `time` is bucket start. Frozen research contract uses exchange-completed-1m-ohlc with requiredCloseCount=11 / lookbackBars=10. Whether research close-time equals start+60s is an alignment assumption — mark unverified until pinned against the live BFF candle identity. |
| lookbackBars | 10 |
| requiredCloseCount | 11 |
| returnIntervalMs | 60000 |
| Exclude in-progress minute | true |

Local spent-calendar candles present=false; local candle file bytes=0. CryptoStruct contains Coinbase OHLC=false.

## BRTI / banked-path distinctions

- **Raw BRTI observations:** Purchasable/accessible historically via Kalshi HOUR passthrough (demonstrated) or CFB STREAM_HISTORICAL_VALUES (licensed). Not present in CryptoStruct ZIPs. localHourDemo=true; minuteRejected=true.
- **Vendor 1Hz/5Hz series:** Live Kalshi WS ~1Hz and 5Hz channels are prospective. Historical HOUR body is raw 5Hz ticks—not a vendor-labeled 1Hz settlement series.
- **60-sample banked average:** Live venue field last_60s_windowed_average_15min is prospective. Historical membership-labeled banked path product unverified. offlineReconstructionMatchedOfficial=false.
- **Final official settlement:** Available in retained settlement labels for joined markets; post-entry only; cannot substitute for a historical pre-entry path.

## Candidate providers / products

| Provider | Product / feed | Historical vs prospective | Cost (public) | 5Hz→1Hz docs? | Leakage-safe exploratory? |
| --- | --- | --- | --- | --- | --- |
| Coinbase Exchange | REST GET /products/{product_id}/candles (BTC-USD, granularity=60) | historical | Public OpenAPI lists security: [] for this endpoint (no auth). Monetary price USD 0 per docs; rate-limit / ToS for bulk research unverified | no | Yes for pre-entry vol if only completed minutes strictly before entry are used; does not enable settlement-state path evaluation alone |
| Coinbase Advanced Trade (public) | GET /api/v3/brokerage/market/products/{product_id}/candles | historical | Public candles endpoint documented; cost unverified beyond public access | no | Same as Exchange candles if instrument/timezone match |
| Kalshi (CF Benchmarks REST passthrough) | GET /trade-api/v2/cfbenchmarks/history/values?id=BRTI | historical | Uses existing Kalshi API credentials; no separate CFB key. HTTP budget / rate limits apply; not a CryptoStruct credit purchase. Direct CFB license pricing N/A for this path | no — ticks only; window identity not encoded | Mechanical retrospective inspection possible on event time; not causal execution backtest; banked path still unverified |
| CF Benchmarks | REST GET /api/v1/history/values (STREAM_HISTORICAL_VALUES) | historical | Commercial license required; contact licensing@cfbenchmarks.com — dollar price unverified | no | Potentially for exploratory mechanical studies if license permits research use — unverified |
| Kalshi WebSocket | cfbenchmarks_value / cfbenchmarks_value_5hz + last_60s_windowed_average_15min | prospective | Kalshi API credentials; no CryptoStruct credits | Documents live window average fields; does not freeze historical 5Hz→1Hz reconstruction rule | Supports a new prospective exploratory study with contemporaneous receipt times; not historical SPENT coverage |
| CryptoStruct | KXBTC15M RAW-BBO-CHANGE day ZIPs (M16-ER retained) | historical | Already purchased for M16-ER (34 credits); no new purchase authorized | no | Supports book-side features only; insufficient for vol/BRTI/window/mapping |
| Kalshi market settlement labels | markets.expiration_value / settlement result (retained label backfill) | historical | Already retained via prior authorized pulls | no | Post-entry evaluation labels only; synthesizing BRTI from labels is forbidden |

### Product detail (fields / timestamps / blockers)

#### Coinbase Exchange — REST GET /products/{product_id}/candles (BTC-USD, granularity=60)

- Date range: Public docs: historical rates in grouped buckets; max 300 candles/request; completeness for Aug–Sep 2026 SPENT days unverified without fetch
- Resolution: 1-minute OHLC buckets
- Raw fields: Documented response items: time (bucket start), low, high, open, close, volume
- Source timestamps: bucket start time (Exchange docs); close-time derived unverified
- Receipt timestamps: HTTP response time only; not a historical receipt clock
- BRTI/CFB values: no
- Same book adapter as M16-ER: no — different venue/product from CryptoStruct books
- Licensing: Coinbase API terms — redistribution unverified in this audit
- Blockers after acquire:
  - `open-vs-close-timestamp-alignment`
  - `34-day completeness unverified`
  - `BRTI/window/mapping still missing`
- Evidence: `https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles`
- Notes: App live path already uses api.exchange.coinbase.com candles; no SPENT-calendar archive retained.

#### Coinbase Advanced Trade (public) — GET /api/v3/brokerage/market/products/{product_id}/candles

- Date range: Documented historical interval via start/end UNIX; coverage unverified
- Resolution: granularity parameter (1m among options — verify at use time)
- Raw fields: start, low, high, open, close, volume (documented)
- Source timestamps: start = UNIX start of time interval (documented)
- Receipt timestamps: unverified
- BRTI/CFB values: no
- Same book adapter as M16-ER: no
- Licensing: Coinbase API terms — unverified here
- Blockers after acquire:
  - `confirm product_id BTC-USD parity with Exchange feed used in vol contract`
  - `BRTI/window/mapping still missing`
- Evidence: `https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles`
- Notes: Alternate public path; Exchange endpoint is the contract-aligned primary candidate.

#### Kalshi (CF Benchmarks REST passthrough) — GET /trade-api/v2/cfbenchmarks/history/values?id=BRTI

- Date range: Demonstrated locally for one HOUR on 2026-08-30; full 34-day calendar not acquired; MINUTE timespan rejected in prior probe
- Resolution: Raw ~5Hz (200ms) ticks in successful HOUR body
- Raw fields: CFB payload ticks {time, value} under Kalshi data envelope (retained schema)
- Source timestamps: tick event time present; not publication/receipt time
- Receipt timestamps: absent on historical HOUR body (causal limitation)
- BRTI/CFB values: yes — raw BRTI index values
- Same book adapter as M16-ER: no — index feed, not CryptoStruct book adapter
- Licensing: Kalshi API + upstream CFB terms; redistribution unverified
- Blockers after acquire:
  - `5hz-to-1hz identity`
  - `receipt timestamps`
  - `strategy mapping`
  - `calendar coverage acquisition not authorized in this audit`
- Evidence: `https://docs.kalshi.com/cfbenchmarks/rest-passthrough`, `docs/research/m17-prep-brti-access-investigation.md`
- Notes: Do not treat one-hour access proof as 34-day coverage.

#### CF Benchmarks — REST GET /api/v1/history/values (STREAM_HISTORICAL_VALUES)

- Date range: Docs: timespan+timestamp windows; delay up to ~15 minutes for most recent; SPENT-calendar entitlement unverified
- Resolution: Index historical values; BRTI cadence ~200ms (product page) — field set unverified without entitled response
- Raw fields: unverified beyond docs describing historical values payload envelope
- Source timestamps: sorted by time ascending (docs); receipt timestamps unverified
- Receipt timestamps: unverified
- BRTI/CFB values: yes when authorized for BRTI
- Same book adapter as M16-ER: no
- Licensing: Commercial license; STREAM_HISTORICAL_VALUES entitlement required; redistribution restricted (typical) — exact terms unverified
- Blockers after acquire:
  - `license/entitlement not obtained in this audit`
  - `5hz-to-1hz still unresolved`
  - `strategy mapping unfrozen`
- Evidence: `https://docs.cfbenchmarks.com/api/rest/historical-values/`, `https://docs.cfbenchmarks.com/api/`, `https://www.cfbenchmarks.com/data/indices/BRTI`
- Notes: No vendor contact or purchase in this audit.

#### Kalshi WebSocket — cfbenchmarks_value / cfbenchmarks_value_5hz + last_60s_windowed_average_15min

- Date range: Live only — cannot backfill SPENT calendar
- Resolution: ~1Hz value channel; sibling 5Hz channel for supported coins
- Raw fields: index value, trailing averages, received_at (unix ms), window average fields on live channel
- Source timestamps: provider/index time fields as documented on WS schema
- Receipt timestamps: received_at on live frames (documented)
- BRTI/CFB values: yes
- Same book adapter as M16-ER: no
- Licensing: Kalshi API terms — unverified
- Blockers after acquire:
  - `prospective-only — not 34 SPENT days`
  - `strategy mapping still required for P&L`
- Evidence: `https://docs.kalshi.com/websockets/cfbenchmarks-value`
- Notes: Prospective capture described only; not authorized or executed here.

#### CryptoStruct — KXBTC15M RAW-BBO-CHANGE day ZIPs (M16-ER retained)

- Date range: 34 purchased SPENT UTC days (already retained)
- Resolution: Order-book change stream (not 1m OHLC / not BRTI)
- Raw fields: Book levels + admission/exchange timestamps — BRTI/OHLC fields absent
- Source timestamps: exchange timestamps present
- Receipt timestamps: admission timestamps present
- BRTI/CFB values: no
- Same book adapter as M16-ER: yes — this is the M16-ER adapter
- Licensing: Vendor terms for retained raw — follow existing M16 ledger
- Blockers after acquire:
  - `no Coinbase OHLC in product`
  - `no BRTI in product`
- Evidence: `data/research-results/external-kalshi-data-audit/m16-er-purchase-manifest.json`, `data/research-results/external-kalshi-data-audit/m16-er-acquisition-manifest.json`
- Notes: In-repo manifests do not list a CryptoStruct BRTI or Coinbase candle add-on for these days.

#### Kalshi market settlement labels — markets.expiration_value / settlement result (retained label backfill)

- Date range: Joined to retained friction universe (47,263 valid joins)
- Resolution: Final scalar settlement label per market — not a path
- Raw fields: expiration_value / result — not raw BRTI observations
- Source timestamps: market close / settlement metadata as retained
- Receipt timestamps: n/a for path reconstruction
- BRTI/CFB values: final label only — not observations
- Same book adapter as M16-ER: n/a
- Licensing: Kalshi data terms
- Blockers after acquire:
  - `cannot substitute for pre-entry banked path`
- Evidence: `docs/research/m17-settlement-join-audit.md`, `https://help.kalshi.com/en/articles/13823838-crypto-markets`
- Notes: Available-existing for outcomes; not-obtainable as a historical path via this field.

## Estimated minimum acquisition needed

- Historical Coinbase BTC-USD 1m completed OHLC covering all 34 SPENT UTC days (public Exchange candles candidate; no-cost per public OpenAPI — still an acquisition action, not performed here)
- Historical raw BRTI observations covering pre-entry windows for the exploratory universe (Kalshi HOUR passthrough and/or licensed CFB history) — still insufficient alone
- Authoritative 5Hz→1Hz / 60-sample membership specification (documentation/vendor clarification — not a SKU purchase)
- Separately frozen YES-overpriced→enter-NO mapping (strategy decision — not data)

## Enablement after acquisition options

| Capability | Enabled? | Note |
| --- | --- | --- |
| Exploratory eval on 34 SPENT days | false | Even after historical Coinbase candles + raw BRTI HOUR coverage, the unfrozen YES-overpriced→enter-NO mapping and unresolved 5Hz→1Hz bank membership block leakage-safe settlement-state exploratory P&L on the 34 SPENT days. Do not treat prospective capture as SPENT coverage. |
| New exploratory prospective study | true | A small prospective synchronized capture (Kalshi BRTI WS + books + Coinbase 1m) could support a new exploratory study with receipt timestamps. Not authorized or executed in this audit. Still requires a separately frozen entry mapping before P&L. |
| Confirmatory holdout evaluation | false | Do not purchase pristine validation/holdout data for confirmatory evaluation. Confirmatory holdout remains out of scope for this feasibility audit. |

## Prospective exploratory option (not authorized)

If historical banked-path reconstruction remains blocked, a small prospective exploratory capture could co-record Kalshi BRTI (1Hz/5Hz + window average), CryptoStruct-or-Kalshi books, and Coinbase 1m candles with local receipt times. That would enable a new exploratory prospective study only. It would not provide historical coverage of the 34 SPENT days and must not be auto-authorized.

- Described: **true**
- Authorized: **false**
- Executed: **false**

## Remaining blockers

- `coinbase-1m-ohlc-absent-locally-on-spent-calendar`
- `historical-brti-calendar-coverage-not-acquired`
- `banked-60-sample-path-product-unverified`
- `exact-5hz-to-1hz-window-identity-unverified`
- `frozen-yes-overpriced-enter-no-mapping-absent`
- `no-strategy-pnl-until-mapping-and-window-identity-resolved`

## Local evidence SHA-256

| Artifact | SHA-256 |
| --- | --- |
| `m16-er-acquisition-manifest.json` | `fd8bcb2a6f47c8e27045de3459501b9152e3fd5678040e11a27473e50457b231` |
| `m16-er-purchase-manifest.json` | `61cace4632e7060b496ef94a69ee072fe20ef44483cceb4af05336246de4fac4` |
| `m17-prep-brti-access-investigation.md` | `2cc6fbfc020ae2c3faa98cdb516f10095e4dc8bff052d7515ab1175751736b4e` |
| `m17-prep-brti-settlement-average-discrepancy-semantics.md` | `f457fa0b625fe30fe0a001f78390998b2078eb46d0c999d58a616a71d9a8bc97` |
| `m17-prep-settlement-sample-mapping.md` | `3cfdde812a21aae83258f81c52f0e71f7d0e9fd69cb08f37573d99ecd2097cb5` |
| `m17-prep-settlement-state-feasibility.md` | `d4f41d59f1a888d4e2d662b8fdcee8bad38f81d8c76e77398b344b30d7f1e070` |
| `m17-retained-input-recovery-audit.md` | `380af31a7a70c4d225916e0f224648eb54aaaa9fd83c4c0f9d2ef00178dfe840` |
| `m17-spent-hold-to-settlement-eval.md` | `c54e5b76e45df2c8c37b2f63640334e7d84419bb4c670f5a4bd4374f3cfc8882` |
| `retained-input-recovery-report.json` | `18f16b7a5796d13a3559899218a1271ef96ce9c31f6bf2cf35895e3ad64df768` |

## Public evidence URLs

- https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles
- https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/public/get-public-product-candles
- https://www.cfbenchmarks.com/data/indices/BRTI
- https://docs.cfbenchmarks.com/api/rest/historical-values/
- https://docs.cfbenchmarks.com/api/
- https://docs.kalshi.com/cfbenchmarks/rest-passthrough
- https://docs.kalshi.com/websockets/cfbenchmarks-value
- https://help.kalshi.com/en/articles/13823838-crypto-markets
- https://assets.kalshi.com/contract_terms/BTC.pdf

## Decision

**`strategy-remains-blocked`** — Coinbase 1m OHLC and raw BRTI observations look historically obtainable (public candles / Kalshi HOUR or licensed CFB), but the banked 60-sample path product and exact 5Hz→1Hz identity remain unverified, and the YES-overpriced→enter-NO mapping is not a data purchase. No pristine holdout purchase is recommended. No purchase, subscription, capture, trade, or order occurred.
