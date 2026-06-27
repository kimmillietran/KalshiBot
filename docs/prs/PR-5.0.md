# PR-5.0 — Trading Engine Foundation

## Summary

Milestone 5.0 introduces a **pure, deterministic trading engine** under `src/lib/trading/`. The engine accepts an `EvaluationSnapshot` and `EngineConfig`, runs guard rails, and returns a `TradeDecision` with a reasoning trace. Evaluation logic is a safe **NO TRADE** stub — no probability model, Monte Carlo, LLM, or trade execution.

Dashboard UI, BFF wiring, and provider code are **unchanged**. Future milestones will map live BTC/Kalshi feeds into `EvaluationSnapshot` and replace the model stub.

## Architecture

| Layer | Path | Responsibility |
|-------|------|----------------|
| Domain types | `src/types/domain/trading.ts` | `EvaluationSnapshot`, `TradeDecision`, `EngineConfig`, reasoning vocabulary |
| Engine | `src/lib/trading/` | Pure `evaluate()`, config hashing, versioning, snapshot guards |

### Purity constraints

- No network, `Date.now()`, React, or imports from `src/features/*`
- Caller supplies `evaluatedAt` on the snapshot
- `engineVersion` and `configHash` on every decision for audit/replay

## Public API

```typescript
import {
  evaluate,
  ENGINE_VERSION,
  DEFAULT_ENGINE_CONFIG,
  hashConfig,
} from "@/lib/trading";

const decision = evaluate(snapshot, DEFAULT_ENGINE_CONFIG);
// decision.action === "NO TRADE"
// decision.reasoning.steps — guard → model (skip) → execution (skip)
```

## Guard rails (5.0)

| Guard | Outcome when failed |
|-------|---------------------|
| `config.enabled === false` | NO TRADE |
| `snapshot.market === null` | NO TRADE |
| `lifecycle !== ACTIVE` | NO TRADE |
| `strikePrice` null or invalid | NO TRADE |

When all guards pass, the stub still returns **NO TRADE** with model/execution steps marked `skip`.

## Files created

| File | Purpose |
|------|---------|
| `src/types/domain/trading.ts` | Domain types for engine I/O |
| `src/lib/trading/evaluate.ts` | `evaluate(snapshot, config)` |
| `src/lib/trading/config/defaults.ts` | `DEFAULT_ENGINE_CONFIG` |
| `src/lib/trading/config/hashConfig.ts` | Stable `hashConfig()` |
| `src/lib/trading/snapshot/types.ts` | Snapshot guard helpers |
| `src/lib/trading/versioning.ts` | `ENGINE_VERSION` (`5.0.0`) |
| `src/lib/trading/index.ts` | Barrel export |
| `src/lib/trading/**/*.test.ts` | Unit tests |

## Tests

- Same snapshot + config → identical decision
- Missing market → NO TRADE
- Inactive lifecycle → NO TRADE
- Missing strike → NO TRADE
- Config hash stable across key order
- Snapshot not mutated
- Decision includes `engineVersion` and `configHash`

## Deferred (not in 5.0)

- Dashboard / BFF integration
- Probability model and edge calculation
- Monte Carlo simulation
- LLM reasoning
- Trade execution
- Changes to BTC or Kalshi provider code

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Review checklist

- [ ] Engine remains pure (no side effects, no feature imports)
- [ ] Domain types sufficient for future orchestrator mapping
- [ ] Reasoning trace structure supports later model/execution steps
- [ ] `configHash` stable for replay/debug
