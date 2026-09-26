# M17 — External BTC → delayed Kalshi KXBTC15M repricing pilot (preparation)

> **PREPARATION ONLY — NO PURCHASES / CREDITS SPEND / EMPIRICAL P&L / LIVE TRADING**
>
> Runner + fixture tests + frozen spec + credit quote. Does not download chargeable
> Coinbase ticks and does not claim independent confirmation.

| Field | Value |
| --- | --- |
| Study id | `kalshi-kxbtc15m-external-btc-delayed-repricing-pilot-v0` |
| External venue | Coinbase `BTC-USD` (`instrument_id=15050`) |
| Kalshi series | `kalshi-btc-15m` (retained M16-ER RAW ZIPs) |
| Pilot UTC days | `2026-08-14`, `2026-08-21`, `2026-08-28`, `2026-09-04`, `2026-09-11` |
| Day rule | Every 7th M16-ER day (chronological index 0,7,14,21,28) — outcome-blind |
| Credit quote | **€5** (5 × €1/day), credits cover, `approval_required` — **not spent** |
| Est. Coinbase download | ~6.75 GB compressed (catalog average) |

---

## 1. Prior research that already answers the broad question

M12.8 `btcKalshiLeadLagAnalysis` on KalshiBot live-capture Coinbase spot → Kalshi TOB:

| Field | Value |
| --- | --- |
| Classification | `no-directional-response` |
| Recommended next action | `deprioritize-btc-lead-lag-family` |
| Implication | A statistical lead does **not** imply a tradable edge |

This pilot is **not** a revival of M14 Kalshi-only momentum or M16 reversal. It is a
**different data plane** check: CryptoStruct tick books + explicit delay scenarios
(250 ms / 1 s / 3 s) with taker fees. It does not reopen #134/#136 band/vol/side
searches. M17 settlement-state remains paused.

---

## 2. Frozen primary parameter set

| Parameter | Value | Rationale |
| --- | --- | --- |
| Event | \|BTC mid return\| crosses **5 bps** over **5 s** lookback | Frozen from M12.8 magnitude boundary cell — not fit on pilot P&L |
| Direction | BTC up → buy YES; down → buy NO | Above-strike KXBTC15M semantics |
| Contract | ATM YES mid closest to 50¢ among live window contracts | Single selection rule |
| Primary delay | **1000 ms** | Defensible vs ~50–250 ms cross-venue clock uncertainty |
| Sensitivity delays | 250 ms, 1 s, 3 s (all reported; no cherry-pick) | Prompt-required scenarios |
| Hold | 15 s then taker exit at bid | Short delayed-repricing window |
| Size | 1 contract | Prompt |
| Fees | STANDARD taker entry **and** exit | Realistic round-trip |
| Min size | displayed ≥ 1 | Else exclude |
| Cooldown | 60 s; no overlapping positions | Dedup |

Controls (diagnostic only): sign-flip; time-sham at `t − 2·hold − delay`.

Primary metric: mean net ¢/contract at 1000 ms; CR2 day-cluster two-sided 95% CI.

---

## 3. Timing quality (before claiming a lead)

- Schema: ns `exchangeTimestamp` + `adapterTimestamp`; event_id chain for gaps.
- Kalshi retained sample: book/trade updates had non-zero exchangeTs; snapshots may be 0.
- Coinbase (LTC free-sample proxy): adapter−exchange p50≈1.2 ms, p99≈21 ms.
- Cross-venue exchange clocks: **conditionally comparable**; uncertainty band **50–250 ms**.
- Joins: **causal as-of only** (last ≤ decision). Nearest-future joins forbidden.
- 250 ms is **diagnostic-only** even with dual exchange clocks; do not claim subsecond
  tradable edge if either leg lacks exchangeTs.

Historical recorder receipt ≠ future bot receipt (extra RTT / queue / ack).

---

## 4. Data manifest (exact)

See committed `data/research-results/external-kalshi-data-audit/external-btc-delayed-repricing-pilot/data-manifest.json`.

| Leg | Local now | Action |
| --- | --- | --- |
| Kalshi series-day ZIPs (5 days) | **Present** under Developer M16-ER raw (~6.2 GB) | Reuse |
| Coinbase BTC-USD ticks (5 days) | **Missing** | Quote €5; download only after explicit authorization |

Premium active; credit balance at quote time **1600¢**; agent spend mode **approve**.

---

## 5. Runner

```bash
# Write frozen spec + manifest (default)
npm run research:external-btc-delayed-repricing-pilot

# Synthetic fixture smoke (not empirical)
npm run research:external-btc-delayed-repricing-pilot -- --fixture-smoke
```

Focused tests:

```bash
npx vitest run src/lib/data/research/externalBtcDelayedRepricingPilot
```

---

## 6. Next authorization prompt (copy/paste)

> Authorize **only**: (1) CryptoStruct credit checkout for Coinbase BTC-USD
> `instrument_id=15050` on UTC days 2026-08-14, 2026-08-21, 2026-08-28, 2026-09-04,
> 2026-09-11 (€5, approval_required — open approval URL; no card needed if credits
> cover), download `.txt.zst` to
> `/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/coinbase-btc-usd/raw/`;
> (2) run the frozen pilot on those days + retained Kalshi ZIPs; report SPENT exploratory
> results for all delays without selecting the best delay afterward. Do not expand
> parameters, unpause settlement-state, or trade live.
