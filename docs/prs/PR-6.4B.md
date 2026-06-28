# PR-6.4B — Replay Timeline Core

## Summary

Milestone 6.4B adds a deterministic replay timeline abstraction that orders `HistoricalTradingSnapshot` objects and exposes immutable step-by-step iteration.

No trading engine execution, backtesting metrics, P/L, indicators, strategy optimization, dashboard, persistence, or network changes.

## Ordering

Snapshots are sorted deterministically:

1. `temporal.eventTime`
2. `temporal.collectionTime`
3. `ticker`
4. `serializeHistoricalTradingSnapshot()` (payload tie-break)
5. Original input index (stable duplicate handling)

## API

```typescript
import { ReplayTimeline, orderReplaySnapshots } from "@/lib/data/replay";

const timeline = ReplayTimeline.create({ snapshots });
const state = timeline.getState();

const nextTimeline = timeline.stepNext();
const resetTimeline = timeline.reset();

for (const snapshot of timeline.iterateAll()) {
  // ordered replay sequence
}
```

## Cursor model

| State | `current` | `hasNext` | `isComplete` |
|---|---|---|---|
| Empty timeline | `null` | `false` | `true` |
| First snapshot | snapshot | `true`* | `false` |
| Middle snapshot | snapshot | `true` | `false` |
| Last snapshot | snapshot | `false` | `false` |
| After final step | `null` | `false` | `true` |

\* `hasNext` is `false` when only one snapshot exists.

`stepNext()` returns a **new** `ReplayTimeline` instance; prior timelines remain unchanged.

## Out of scope

- Trading engine / `evaluate()`
- 6.4A replay adapter (not wired unless merged)
- Backtesting metrics and P/L
- Feature engineering / indicators
- Dashboard / execution
- Filesystem / network I/O

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
