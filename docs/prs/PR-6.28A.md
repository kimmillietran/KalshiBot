# PR-6.28A — Strategy Decision Trace

## Summary

Milestone 6.28A adds a deterministic per-candle strategy decision trace so research runs explain **why** each plugin held or traded, not just the resulting fills and PnL.

Each strategy sweep market now writes:

```
data/research-results/<strategy>/<series>/<market>/
  research-output.json
  decision-trace.json
```

## Architecture

```
Replay step (unchanged)
        ↓
Strategy plugin decide() → decisionTrace { action, reason, metadata }
        ↓
BacktestStrategyRunner collects StrategyDecisionTraceEntry[]
        ↓
HistoricalResearchRunner → serializedDecisionTrace
        ↓
runStrategySweep writes decision-trace.json
```

- Module: `src/lib/data/research/decisionTrace/`
- Plugin contract: `StrategyPluginDecisionResult.decisionTrace`
- Collection hook: `BacktestStrategyRunner` (replay logic untouched)

## Trace entry fields

| Field | Source |
|-------|--------|
| `timestamp` | `step.engineInput.evaluatedAt` |
| `candleIndex` | `step.stepIndex` |
| `strategyId` | active strategy |
| `marketTicker` | `step.sourceTicker` |
| `btcPrice` | BTC spot when available |
| `yesBid` / `yesAsk` / `yesMid` | step pricing |
| `probabilityUp` | plugin `fairProbability` or engine probability |
| `action` / `reason` / `metadata` | plugin-emitted trace |

## Strategy metadata examples

| Strategy | Metadata |
|----------|----------|
| `noop` | `{}` |
| `buy-below-probability` | `{ threshold }` |
| `fair-value-diffusion` | `{ volatility, fairProbability, edge, threshold }` |

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Smoke rerun (from sweep)

```bash
npm run research:sweep -- --all --registry data/research-datasets --output-dir data/research-results --summary sweep-summary.json
```

Verify `decision-trace.json` exists beside each `research-output.json`.
