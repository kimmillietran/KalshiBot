# PR-5.8A — Reasoning Presentation Core

## Summary

Milestone 5.8A adds a pure reasoning presentation module under `src/lib/trading/reasoning-presentation/`. `summarizeTradeDecision()` converts an engine `TradeDecision` into a deterministic `ReasoningPresentation` for UI or API consumers.

**Not wired into dashboard or `evaluate()`** — presentation-only formatting of existing fields.

## API

```typescript
summarizeTradeDecision(decision, config?, extensions?) → ReasoningPresentation
// or
summarizeTradeDecision({ decision, config, extensions }) → ReasoningPresentation
```

`extensions.positionSize` is reserved for post-5.7B wiring and ignored in 5.8A.

## Behavior

| Decision state | Headline | Primary reason source |
|---|---|---|
| BUY UP | Bullish outlook | Policy step / EV fields |
| BUY DOWN | Bearish outlook | Policy step / EV fields |
| NO TRADE (policy) | Policy withheld | `decision-policy` step detail |
| NO TRADE (guard) | Guard blocked | Failed guard step / `gatesTriggered` |

Always includes execution-disabled risk note. Never invents probability, EV, or confidence.

## Out of scope

- LLM / AI narrative
- `evaluate()` wiring
- Dashboard changes
- `positionSize` on `TradeDecision` (5.7B)

## Future UI integration

```typescript
import { summarizeTradeDecision } from "@/lib/trading/reasoning-presentation";

const presentation = summarizeTradeDecision(decision);
// headline, summary, primaryReason, supportingReasons, riskNotes, technicalTrace
```

Replace or augment raw `decision.reasoning` rendering in `AIReasoningPanel` when milestone lands.
