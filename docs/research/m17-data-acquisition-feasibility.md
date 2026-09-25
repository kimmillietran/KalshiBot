# M17 — Data-acquisition feasibility audit

**Study id:** `kalshi-kxbtc15m-m17-data-acquisition-feasibility-v0`

**Role:** determine whether missing M17 exploratory inputs can be acquired or
generated. **No purchase. No cost-incurring network. No P&L. No strategy freeze.**

**Base:** `origin/main` after PR #126 (`1c17f6851c872b403b100bf342a95451a21ecfca`).

## Commands

```bash
npm run research:m17-data-acquisition-feasibility
```

## Outputs

`data/research-results/external-kalshi-data-audit/m17-data-acquisition-feasibility/`

- `report.json`
- `report.md`
- `summary.json`

## Expected decision

`strategy-remains-blocked`

Coinbase BTC-USD 1m OHLC and raw BRTI observations appear historically obtainable
(public Exchange candles / Kalshi HOUR or licensed CFB history), but:

- a membership-labeled historical banked 60-sample path remains **unverified**
- exact 5Hz→1Hz window identity remains **unverified** even if raw BRTI is bought
- YES-overpriced→enter-NO mapping is **not obtainable** as a data product

Do **not** purchase pristine validation/holdout data. A prospective exploratory
capture is described separately and is **not** historical SPENT coverage.

## Attestation

No purchase, subscription, capture, trade, or order occurred in this study.
