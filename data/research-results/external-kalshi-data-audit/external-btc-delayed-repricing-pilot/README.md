# External BTC → delayed Kalshi repricing pilot (preparation)

Offline preparation + fixture-verified pilot runner only. Does not purchase CryptoStruct data, spend credits, place orders, or claim independent confirmation. All M16-ER pilot days remain exploratory SPENT. M12.8 Coinbase→Kalshi lead-lag already classified no-directional-response on KalshiBot live-capture TOB; this pilot tests a different data plane (CryptoStruct tick books + explicit delay scenarios) and does not reopen M14/M16.

## Status

- Spec + manifest + runner prepared.
- Coinbase tick acquisition is **not** authorized in this task.
- Do not interpret fixture/synthetic runs as empirical results.

## Next authorization prompt

Authorize only: (1) CryptoStruct credit purchase of Coinbase BTC-USD
instrument_id=15050 for dates
2026-08-14, 2026-08-21, 2026-08-28, 2026-09-04, 2026-09-11
(€5, approval_required), download to
/Users/builder/Developer/kalshi-builder2/data/external-samples/cryptostruct/coinbase-btc-usd/raw, then (2) run
`npm run research:external-btc-delayed-repricing-pilot` on those days.
