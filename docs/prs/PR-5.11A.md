# PR-5.11A — Engine Snapshot Presentation Core

## Summary

Milestone 5.11A adds a pure engine snapshot presentation module under `src/lib/trading/engine-snapshot/`. `summarizeEngineSnapshot()` converts a `TradeDecision` into a compact, serializable `EngineSnapshotPresentation`.

**Not wired into dashboard, evaluate(), or API** — formatting only.

## API

```typescript
summarizeEngineSnapshot(decision) → EngineSnapshotPresentation
```

## Output sections

| Section | Source | Unavailable when |
|---|---|---|
| `decision.action` | `TradeDecision.action` | never |
| `probability` | `decision.probability` | guard failure (`null`) |
| `expectedValue` | `decision.expectedValue` | guard failure |
| `positionSizing` | `decision.positionSize` | guard failure |
| `reasoning.summary` | `decision.reasoning.summary` | never |
| `technical.steps` | `decision.reasoning.steps` | never (may include fail steps) |
| `metadata.*` | engine + model versions | per-model `null` when absent |

`metadata.policyVersion` is set only when a `decision-policy` reasoning step is present (guard failures omit it).

Unavailable section fields use `null` with `available: false` — not placeholder strings.

`positionSizing.recommendedDollars` is `null` when bankroll was not configured — section remains `available: true`.

## Rules

- Pure formatting — no math, thresholds, Kelly, policy, or generated explanations
- Never invent unavailable values
- Deterministic JSON-serializable output

## Future integration

```typescript
import { summarizeEngineSnapshot } from "@/lib/trading/engine-snapshot";

const presentation = summarizeEngineSnapshot(decision);
// export, QA snapshot, copy/share, diagnostics, future API
```

## Out of scope

- Dashboard wiring
- `evaluate()` changes
- Persistence / settings / execution

## Quality gates

```bash
npm run lint
npm run test
npm run build
```
