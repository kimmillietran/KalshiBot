# PR-6.4E — Replay Session Orchestrator

## Summary

Milestone 6.4E adds a deterministic replay session orchestrator that feeds ordered `HistoricalTradingSnapshot` objects through the existing trading engine via `adaptHistoricalSnapshot()` and `evaluate()`.

No P/L, trade ledger, backtest metrics, dashboard, persistence, network, WebSocket, or polling governor changes.

## Scope

| In scope | Out of scope |
|---|---|
| Replay session orchestration | P/L and trade ledger |
| Single-step and batch stepping | CAGR / Sharpe / drawdown |
| Immutable session cursor | Monte Carlo / optimization |
| Engine output preservation | Dashboard wiring |
| Deterministic serialization | Filesystem persistence |
| | Live market data / WebSocket (6.4C) |
| | Polling governor changes (6.4D) |

## Architecture

```
HistoricalTradingSnapshot[]
        ↓
   ReplayTimeline (deterministic order)
        ↓
 adaptHistoricalSnapshot()
        ↓
   EvaluationSnapshot
        ↓
      evaluate()
        ↓
   ReplayStepResult
```

Each `ReplayStepResult` preserves:

- `stepIndex`
- `sourceTicker`
- `temporal`
- `provenance`
- `engineInput`
- `engineOutput`
- `sourceSnapshot`

## API

```typescript
import { ReplaySession } from "@/lib/data/replay";
import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";

const session = ReplaySession.create(snapshots, DEFAULT_ENGINE_CONFIG);

const { session: next, result } = session.step();
const { session: done, results } = session.stepAll();
const resetSession = done.reset();
```

## Deterministic guarantees

- Snapshot ordering delegated to `ReplayTimeline` (eventTime → collectionTime → ticker → serialization)
- Same snapshots + engine config → identical `serializeReplayStepResults()` output
- `step()` and `reset()` return new immutable session instances
- Step results and session state are deeply frozen
- Source snapshots are never mutated

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
