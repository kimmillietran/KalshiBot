# M17 O6 — Five-close prospective settlement fidelity

**Campaign id:** `kalshi-kxbtc15m-o6-five-close-settlement-fidelity-v0`

**Role:** execute the PR #129 minimum prospective capture protocol for **five**
predetermined quarter-hour closes. Fidelity research only.

## Authorization boundary

- Authorized: budgeted Kalshi discovery, CFB 1Hz+5Hz websocket capture, official
  settlement retrieval for five frozen closes.
- Retention: **local-persistent-only**, `independentBackup: false` (explicitly
  reconciles PR #129 durable-archive wording).
- **Not** authorized: purchases, subscriptions, trades, orders, strategy P&L, O3 freeze.

## Timing (O6 profile)

| Parameter | Value |
| --- | ---: |
| Connect before close | ≥ 90s |
| Capture stop after close | ≥ 15s |
| Max connected window | 105s |
| Readiness cutoff | close − 120s |
| HTTP per close | 12 |
| HTTP campaign ceiling | 60 |
| WS max connections / close | 2 |
| Order book | off |

## Commands

```bash
# Freeze schedule + retention check (no live)
npm run research:m17-o6-five-close-settlement-fidelity -- --freeze-only

# Live campaign (after retention ready)
npm run research:m17-o6-five-close-settlement-fidelity -- --authorize-live
```

## Outputs

`data/research-results/external-kalshi-data-audit/m17-o6-five-close-settlement-fidelity/`

Raw captures under
`~/Documents/KalshiResearchArchive/one-close-settlement-fidelity/kalshi-kxbtc15m-o6-five-close-settlement-fidelity-v0/`.

## Predeclared comparisons (frozen before observe)

- Each completed average vs official: raw-string, exact-decimal, diagnostic half-even 2dp
- Dual-field difference at count 60
- 1Hz source-timestamp membership recompute only (documented windows)
- 5Hz kept separate; no 5Hz→1Hz hypothesis list in this campaign
- No offset search / threshold sweep / cherry-pick / post-hoc rule change
