# M17 — SPENT hold-to-settlement exploratory evaluation

**Study id:** `kalshi-kxbtc15m-m17-spent-hold-to-settlement-eval-v0`

**Role:** exploratory feature / readiness audit on M16-ER `SPENT_VALIDATION`
data. **Not** confirmatory validation. **Not** pristine holdout. **Not** live
trading authorization.

## Authority

- Settlement-label join: PR #124 (`1bd0d631eea173445a919207772b6141af28a26f`)
- SettlementEstimate semantics: PR #123 (research-only; not wired into gates)
- M17 design draft: `docs/research/m17-settlement-state-research-design-draft.md`
- Cited late high-vol regime bounds:
  `config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json`

## Why P&L is blocked

The frozen M17 family requires a mapping from settlement-state arithmetic
(remaining-average threshold \(T\)) to “YES is overpriced → enter NO”. The M17
draft §C.1–C.2 marks that probability / decision model as **Proposed /
unresolved**. Inventing the mapping from these 34 SPENT days would be tuning.

Additionally, retained CryptoStruct friction samples:

- have **no** pre-entry BRTI / banked settlement-sample paths;
- lack YES midpoint, Coinbase realized-vol, and explicit `timeRemainingMs`
  columns needed to recompute the cited regime filter population without
  regenerating quote streams.

The claimed prior `20,923 / 72 markets` entry artifact remains **unavailable**.

## Commands

```bash
npm run research:m17-spent-hold-to-settlement-eval -- --fixture --out /tmp/m17-spent-eval-fixture
npm run research:m17-spent-hold-to-settlement-eval
```

## Outputs

`data/research-results/external-kalshi-data-audit/m17-prep-spent-hold-to-settlement-eval/`

## Confirmatory boundary

- Exploratory SPENT only.
- Cannot establish OOS performance.
- Cannot justify live trading.
- Pristine purchase is **not** justified until the entry mapping is frozen and
  settlement-state inputs exist for the evaluation calendar.

## Empirical retained run (local; zero network)

| Metric | Value |
| --- | ---: |
| Completion | `blocked-missing-frozen-decisions` |
| Retained executable samples | 47,307 |
| Valid settlement join | 47,263 (99.907%) |
| Complete required features for entry | 0 |
| NO entries simulated | 0 |
| Performance | blocked (no P&L) |
| Pristine purchase justified now | **no** |
