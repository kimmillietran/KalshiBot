# M17 — External BTC → delayed Kalshi KXBTC15M repricing pilot (correction-v1)

> **PREPARATION + FIXTURE-VERIFIED RUNNER — NO CREDITS / PURCHASES / EMPIRICAL P&L / LIVE TRADES**
>
> Analysis version `2026-09-26-correction-v1` (preserves prep-v0 study id). Corrections below
> must be read before any authorized empirical run.

| Field | Value |
| --- | --- |
| Study id | `kalshi-kxbtc15m-external-btc-delayed-repricing-pilot-v0` |
| Analysis version | `2026-09-26-correction-v1` (prior: `2026-09-26-prep-v0`) |
| External venue | Coinbase `BTC-USD` (`instrument_id=15050`) |
| Kalshi series | `kalshi-btc-15m` retained M16-ER RAW ZIPs |
| Pilot UTC days | `2026-08-14` … `2026-09-11` (**Friday-only**; not weekday-representative) |
| Credit quote | **€5** — **not spent** |
| Est. Coinbase download | ~6.75 GB compressed |

---

## Corrections from prep-v0

1. Streaming Coinbase `.txt.zst` + Kalshi ZIP member ingestion; `--run-real` path implemented (empirics gated by `--authorize-empirical-run`).
2. Removed invented 50–250 ms cross-venue sync bound; delays never auto-promoted to verified tradability.
3. Separated pre-entry reject vs entered + unresolved exit; frozen exit-failure policy with all-entry bounds.
4. Friday-only label; fragile G≤5 CI; control isolation; time-sham labeled retrospective placebo.
5. Concrete M12.8 reconciliation (fee-aware delayed-taker gap — not vendor novelty alone).

---

## M12.8 reconciliation (concrete)

**M12.8 answered:** Coinbase-spot → KalshiBot live-capture TOB **mid** directional response after magnitude-boundary crosses (observational lags 0–60s; fees not modeled) → `no-directional-response` / `deprioritize-btc-lead-lag-family` (1237 triggers).

**Material gap this pilot addresses:** STANDARD taker entry+exit net ¢, explicit 250ms/1s/3s **action-delay scenarios**, CryptoStruct native L2 ticks, unresolved-exit accounting.

**Not sufficient justification alone:** renaming the study or switching vendors without a different estimand.

**Decision:** Proceed as exploratory fee-aware delayed-taker check on Friday SPENT days — not a refutation of M12.8’s mid finding. Shelve if nonpositive / incomplete / inconclusive under fragile G≤5.

Full JSON: `data/.../m128-reconciliation.json`.

---

## Timing policy (evidence-based)

- Decision clock domain: **adapter** (consistent; alignment **unknown**).
- Preserve both exchange + adapter stamps; reconstruct in stream/event-id order.
- No silent domain mix.
- Historical exchange-time ≠ proof a bot could observe/act then.
- Delay claims: 250ms `diagnostic-only`; 1s/3s `scenario-assumption-unverified` — **never** verified tradability.
- Evidence required for verified tradability listed in `timing-quality.json`.

---

## Exit-failure policy

`retain-entry-unresolved-v1`: once entered, failed exits stay in the cohort as unresolved; cooldown/overlap use intended exit time; completed-trade P&L excludes unresolved; all-entry lower/upper bounds reported; primary status `incomplete-unresolved-exits` if any unresolved. Do not claim profitability from completed trades alone.

---

## Frozen primary parameters (unchanged thresholds)

5 bps / 5 s → YES/NO by BTC direction → ATM contract at event time (same through exit; reject insufficient TTE) → **primary delay 1000 ms** (sensitivities 250/1000/3000, no cherry-pick) → 15 s hold → 1 contract STANDARD taker entry+exit → min size ≥1 → 60 s cooldown.

---

## Runner

```bash
npm run research:external-btc-delayed-repricing-pilot
npm run research:external-btc-delayed-repricing-pilot -- --native-fixture
npx vitest run src/lib/data/research/externalBtcDelayedRepricingPilot
# After acquisition + explicit auth:
npm run research:external-btc-delayed-repricing-pilot -- --run-real --authorize-empirical-run
```

---

## Next authorization prompt

> Authorize **only**: (1) CryptoStruct credit checkout for Coinbase BTC-USD `instrument_id=15050` on Friday UTC days 2026-08-14, 2026-08-21, 2026-08-28, 2026-09-04, 2026-09-11 (€5, approval_required), download `.txt.zst` to `/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/coinbase-btc-usd/raw/`; (2) run `npm run research:external-btc-delayed-repricing-pilot -- --run-real --authorize-empirical-run`; report complete vs incomplete economics and all-entry bounds for **all** delays without selecting the best delay; do not claim verified tradability or expand parameters.
