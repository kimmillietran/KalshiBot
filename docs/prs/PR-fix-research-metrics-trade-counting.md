# Fix research metrics trade counting

## Summary

Leaderboard `totalTrades` stayed at zero while `totalPnlCents` was nonzero because:

1. **`tradeCount` / `totalTrades`** count **closed round-trip trades** (sells that close a position, including synthetic settlement closes). Buy-only hold-to-settlement runs had fills and mark-to-market PnL but no explicit sells.
2. **Fill activity** existed in ledger/`acceptedFills` but was not propagated through aggregation (`parseResearchOutputJson` only read `tradeCount`).

## Definitions

| Field | Meaning |
|-------|---------|
| `tradeCount` / `totalTrades` | Closed positions (round trips), including settlement closes at 100¢/0¢ |
| `fillCount` / `totalFills` | Simulated ledger fills (every buy and sell) |
| `contractsFilled` / `totalContractsFilled` | Sum of fill quantities |

`totalPnlCents` remains end-equity minus start-equity (includes unrealized marks before settlement close).

## Fix

- Settlement close fills synthesized in `deriveBacktestMetricsInput` for open positions when the final replay snapshot includes settlement data.
- Top-level `fillCount` and `contractsFilled` added to backtest metrics and parsed by aggregation.
- Aggregate summaries and leaderboard expose `totalFills` and `totalContractsFilled` alongside `totalTrades`.

## Inspecting `research-output.json`

Runner format (nested JSON strings when serialized to disk):

```
researchRun.backtestResult.metrics.tradeCount
researchRun.backtestResult.metrics.fillCount
researchRun.backtestResult.metrics.contractsFilled
researchRun.backtestResult.strategyRun.steps[].acceptedFills
researchRun.backtestResult.strategyRun.steps[].rejectedIntents
researchRun.backtestResult.ledger.fills
```

PowerShell example:

```powershell
$r = Get-Content "data\research-results\buy-first-ask\KXBTC15M\KXBTC15M-26APR301900-00\research-output.json" -Raw | ConvertFrom-Json
$backtest = $r.researchRun.backtestResult | ConvertFrom-Json
$backtest.metrics.fillCount
$backtest.strategyRun.steps[0].acceptedFills
```
