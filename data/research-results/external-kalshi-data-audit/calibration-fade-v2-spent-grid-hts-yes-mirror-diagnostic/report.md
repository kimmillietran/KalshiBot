# CF-v2 SPENT grid HTS — YES-side mirror diagnostic

- Study: `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic-v0` / `calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic-v0.1`
- Generated (UTC): 2026-09-26T02:10:04.011Z
- Code authority SHA: `3e89e1a158b81546512830c597386f8c2cf710f0`

## Framing

Outcome-informed paired YES-side accounting/execution diagnostic on the exact PR #134 selected cohort. Simulated P&L at observed quotes only. Not a new independent mechanism, not confirmation, not live fills. Compression toward 50% does not imply a uniform YES trade throughout [1/3, 2/3). Confidence intervals do not remove outcome-informed selection bias.

This is a **paired accounting / execution diagnostic** of the opposite side of PR #134’s selected cohort — not a new independent mechanism test and not confirmation of a YES-fade thesis.

## Prior exposure

- Prior study: `kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0`
- PR #134: N=321, G=24, mean net −8.6417¢, CR2 95% CI [−12.2485, −5.0350]¢, status evidence-against-positive-mean (buy NO grid HTS).
- YES mirror selected after observing NO result: true
- Independent mechanism test: false
- Pre-outcome preregistration: false
- Attempted history: no-grid-hts-exploratory-v0 (PR #134) → yes-mirror-diagnostic-v0 (this study; selected after observing #134)

## Cohort preservation

- Source selected-entries SHA-256: `0597917bcb71a0c6623d133f10e18b435c59debb3a4c89da912f7d806d74db08`
- Source per-market-trades SHA-256: `904e9f5d505ae7ec016dadeff475be368c04f36a7f2f1cd834860bfff9bcb906`
- Hashes verified: **true**
- Original N/G: 321 / 24; reproduced NO mean: -8.641745¢ (matches recorded: **true**)
- Paired evaluable N/G: **321 / 24** (unevaluable 0; differs from 321: false)

## Accounting identity

- Formula: `yesNetPnl + noNetPnl = -(yesAskCents - yesBidCents) - yesFeeCents - noFeeCents`
- Holds for all paired rows: **true** (violations: 0)
- Mean NO net (paired): -8.641745¢
- Mean YES spread: 1.576324¢
- Mean YES fee / NO fee: 2.000000¢ / 2.000000¢
- YES mean from identity: 3.065421¢
- YES mean direct (settlements): 3.065421¢
- Identity-derived vs direct residual: 4.441e-16

## YES economics (simulated P&L at observed quotes)

- N / G: **321 / 24**
- Mean / median net: **3.0654¢** / 36.0000¢
- Total net: 984.00¢
- Mean gross: 5.0654¢
- Mean YES ask (entry): 51.0093¢
- YES settlement rate: 56.07%
- CR2 SE: 1.758969¢; df=23; t=1.7427; tcrit=2.0687
- CR2 two-sided 95% CI: **[-0.5733, 6.7041]¢**
- Note: YES CI is recomputed from YES day clusters — not the negated NO interval.

### Per UTC entry day

| utcDay | n | meanNet¢ | totalNet¢ |
| --- | ---: | ---: | ---: |
| 2026-08-19 | 19 | -5.1053 | -97.00 |
| 2026-08-20 | 21 | -0.7143 | -15.00 |
| 2026-08-21 | 60 | 2.3833 | 143.00 |
| 2026-08-22 | 11 | 11.6364 | 128.00 |
| 2026-08-23 | 6 | 32.5000 | 195.00 |
| 2026-08-24 | 21 | 4.1429 | 87.00 |
| 2026-08-25 | 22 | 0.5455 | 12.00 |
| 2026-08-26 | 6 | 44.1667 | 265.00 |
| 2026-08-27 | 13 | -4.5385 | -59.00 |
| 2026-08-28 | 12 | -2.8333 | -34.00 |
| 2026-08-30 | 5 | -14.4000 | -72.00 |
| 2026-08-31 | 11 | 22.0000 | 242.00 |
| 2026-09-01 | 7 | -0.4286 | -3.00 |
| 2026-09-02 | 4 | -1.7500 | -7.00 |
| 2026-09-03 | 13 | 6.8462 | 89.00 |
| 2026-09-04 | 12 | -8.6667 | -104.00 |
| 2026-09-07 | 1 | 43.0000 | 43.00 |
| 2026-09-10 | 9 | -20.8889 | -188.00 |
| 2026-09-11 | 15 | 5.2000 | 78.00 |
| 2026-09-15 | 14 | -1.0714 | -15.00 |
| 2026-09-16 | 12 | 4.1667 | 50.00 |
| 2026-09-17 | 4 | 21.7500 | 87.00 |
| 2026-09-19 | 1 | -53.0000 | -53.00 |
| 2026-09-21 | 22 | 9.6364 | 212.00 |

### Leave-one-day-out means (descriptive)

- omit 2026-08-19: 3.5795¢
- omit 2026-08-20: 3.3300¢
- omit 2026-08-21: 3.2222¢
- omit 2026-08-22: 2.7613¢
- omit 2026-08-23: 2.5048¢
- omit 2026-08-24: 2.9900¢
- omit 2026-08-25: 3.2508¢
- omit 2026-08-26: 2.2825¢
- omit 2026-08-27: 3.3864¢
- omit 2026-08-28: 3.2945¢
- omit 2026-08-30: 3.3418¢
- omit 2026-08-31: 2.3935¢
- omit 2026-09-01: 3.1433¢
- omit 2026-09-02: 3.1262¢
- omit 2026-09-03: 2.9058¢
- omit 2026-09-04: 3.5210¢
- omit 2026-09-07: 2.9406¢
- omit 2026-09-10: 3.7564¢
- omit 2026-09-11: 2.9608¢
- omit 2026-09-15: 3.2541¢
- omit 2026-09-16: 3.0227¢
- omit 2026-09-17: 2.8297¢
- omit 2026-09-19: 3.2406¢
- omit 2026-09-21: 2.5819¢

## YES ask liquidity (separate from accounting cohort)

YES purchases require YES ASK size. Original 315/321 yesBidSize≥1 check is NOT evidence of YES-ask fillability. Quote-age / exchange-vs-receive latency are not present on the #134 trade artifacts.

- yesAskSize ≥ 1: 315 / 321
- known insufficient (size present, &lt; 1): 6
- size missing/invalid: 0
- Sensitivity (askSize≥1 only): N=315, G=24, mean 2.9016¢, CI [-1.0343, 6.8375]¢

## Interpretation

- Status: **inconclusive-or-below-material-bar**
- Positive mean 3.0654¢ meets the +1¢ screening level but remains uncertain (CR2 CI does not clear zero and/or G/CI conditions fail). Inconclusive — not exploratory promise.
- Merits designing a fresh-period test: **false**

## Execution limitations

- Simulated P&L at observed yesAskCents — not verified live fills
- Quote-age / source-vs-receipt timestamps unavailable on #134 cohort artifacts
- Cohort frozen from #134; no reselection of later timestamps for liquidity
- Outcome-informed selection after observing NO-grid failure
- M17 settlement-state remains paused; avg_60s_data not used

## Attestation

```json
{
  "purchaseOccurred": false,
  "subscriptionOccurred": false,
  "tradeOrOrderOccurred": false,
  "liveCaptureStarted": false,
  "originalNoOutputsModified": false,
  "simulatedPnlAtObservedQuotes": true,
  "thresholdSweepPerformed": false,
  "favorite085ExperimentRun": false,
  "continuousCrossingRun": false
}
```

