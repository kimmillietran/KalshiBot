# M17 — Retained-input recovery audit (offline)

**Study id:** `kalshi-kxbtc15m-m17-retained-input-recovery-audit-v0`

**Role:** classify whether missing M17 exploratory inputs can be recovered from
already-retained local artifacts. **No purchase. No network. No P&L.**

## Commands

```bash
npm run research:m17-retained-input-recovery-audit
```

## Outputs

`data/research-results/external-kalshi-data-audit/m17-prep-retained-input-recovery-audit/`

## Expected status

`blocked-missing-frozen-strategy-decision` — book-side features are
offline-derivable from CryptoStruct raw, but Coinbase vol + BRTI for the SPENT
calendar are absent, 5Hz↔1Hz identity is unsafe to invent, and the M17
settlement-state→entry mapping remains unfrozen.

## Empirical local run

| Class | Count |
| --- | ---: |
| present-direct | 2 |
| derivable-offline | 4 |
| absent | 2 |
| unsafe-to-derive | 1 |
| Purchase made | no |
| Strategy P&L computed | no |
| Executable without purchase | no |
