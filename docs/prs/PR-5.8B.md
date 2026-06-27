# PR-5.8B — Dashboard Reasoning Presentation

## Summary

Milestone 5.8B integrates `summarizeTradeDecision()` (5.8A) into `AIReasoningPanel`. The dashboard now presents engine reasoning with headline, summary, primary/supporting reasons, risk notes, and an expandable technical trace.

**Base:** `main` (includes reasoning presentation module from 5.8A).

## Data flow

```
evaluate() → TradeDecision
  → summarizeTradeDecision()
  → AIReasoningPanel + TechnicalTraceList
```

## Components

| Component | Source |
|-----------|--------|
| `AIReasoningPanel` | `ReasoningPresentation` from `summarizeTradeDecision()` |
| `TechnicalTraceList` | Expandable raw `reasoning.steps` trace |

## Presentation states

- `BUY UP` / `BUY DOWN` — action-specific headline and summary
- `NO TRADE` — policy hold messaging
- Guard failure — unavailable reasoning with risk notes

## Out of scope

- Reasoning generation logic (5.8A module)
- Engine pipeline changes
- LLM narrative

## Quality gates

```
npm run lint   ✓
npm run test   ✓ 405 passed
npm run build  ✓
```

Tag: `m5.8b-dashboard-reasoning` → `fa29113`
