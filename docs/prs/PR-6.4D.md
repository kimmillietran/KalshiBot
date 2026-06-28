# PR-6.4D — Polling Rate Governor

## Summary

Milestone 6.4D adds an adaptive REST polling rate governor under `src/lib/data/polling/` for safe, budget-aware market polling.

No trading engine, strategy, dashboard, persistence, or network wiring changes.

## Features

| Capability | Behavior |
|---|---|
| Min/max interval | Priority maps to interval between configured bounds |
| Per-market priority | `critical` → `high` → `normal` → `low` weighting (`normal` is the mid-tier label — not `medium`) |
| Token budget | **Per-market** sliding-window token consumption throttles excess polls (not a fleet-wide shared pool) |
| 429 backoff | Exponential multiplier capped by `maxBackoffExponent` |
| Jitter | Deterministic ±`jitterFraction` via injected sample |
| Stale quotes | Age check against `staleQuoteThresholdMs` (exact threshold age is not stale) |

## Market selection

`selectNextMarket()` tie-break order among ready markets:

1. Higher priority weight (`critical` > `high` > `normal` > `low`)
2. Earlier `nextPollDueAtMs`
3. Lexicographic `marketId`

## API

```typescript
import { PollingRateGovernor } from "@/lib/data/polling";

const governor = new PollingRateGovernor({
  minIntervalMs: 10_000,
  maxIntervalMs: 20_000,
  tokenBudget: 60,
  tokenBudgetWindowMs: 60_000,
  staleQuoteThresholdMs: 30_000,
});

let state = governor.createMarketState("KXBTC15M-ABC", "critical", Date.now());
if (governor.assessPollReadiness(state, Date.now()).allowed) {
  state = governor.recordPollSuccess(state, Date.now(), observedAtMs, 0.5);
}
```

## Out of scope

- Trading engine / strategy changes
- Dashboard TanStack Query wiring (future integration)
- Real network calls or filesystem persistence
- WebSocket migration

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
