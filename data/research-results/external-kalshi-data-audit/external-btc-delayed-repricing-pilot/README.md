# External BTC → delayed Kalshi repricing pilot (correction-v1)

Offline fixture-verified pilot runner. Does not purchase CryptoStruct data, spend credits, place orders, or claim independent confirmation. All M16-ER pilot days remain exploratory SPENT and Friday-only. M12.8 already classified live-capture Coinbase→Kalshi TOB mid-response as no-directional-response; this pilot only addresses fee-aware delayed-taker economics on CryptoStruct ticks under declared scenario delays — not verified live tradability. Delay results are never auto-promoted.

## Corrections from prep-v0

- Implemented streaming Coinbase/Kalshi ingestion and --run-real path (gated empirics)
- Removed invented 50–250ms cross-venue sync bound; delays never auto-verified
- Separated pre-entry reject vs entered+unresolved exit; exit-failure policy frozen
- Friday-only label; fragile G≤5 CI; control isolation + retrospective placebo labeling
- Concrete M12.8 reconciliation with material fee-aware delayed-taker gap

## Status

- Spec + manifest + streaming runner + fixture path verified.
- Coinbase tick acquisition is **not** authorized in this task.
- Friday-only exploratory days; fragile G≤5 CI.
- Do not interpret fixture runs as empirical results.

## Runner

```bash
npm run research:external-btc-delayed-repricing-pilot
npm run research:external-btc-delayed-repricing-pilot -- --native-fixture
# Empirical (separate authorization + local Coinbase files):
npm run research:external-btc-delayed-repricing-pilot -- --run-real --authorize-empirical-run
```

## Next authorization prompt

Authorize only: (1) CryptoStruct credit purchase of Coinbase BTC-USD
instrument_id=15050 for Friday dates
2026-08-14, 2026-08-21, 2026-08-28, 2026-09-04, 2026-09-11
(€5, approval_required), download to
/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/coinbase-btc-usd/raw; (2) run
`--run-real --authorize-empirical-run` and report complete vs incomplete economics
for all delays without selecting the best delay. Do not claim verified tradability.
