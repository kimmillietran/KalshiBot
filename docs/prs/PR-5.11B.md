# PR-5.11B — Dashboard Snapshot Export UI

## Summary

Milestone 5.11B adds dashboard-side export plumbing to copy the current engine `TradeDecision` as stable JSON. This is presentation/export only — no engine, provider, BFF, or execution changes.

Uses `TradeDecision` directly today. After 5.11A (merged on `main`), the serializer can switch to `summarizeEngineSnapshot()` without duplicating the engine-snapshot module.

Developed in the `kalshi-builder2` worktree on branch `feature/m5.11b-dashboard-snapshot-export`.

## Export payload

`buildTradeDecisionExport()` / `serializeTradeDecision()` include:

| Field | Notes |
|---|---|
| `action` | Engine trade action |
| `engineVersion` | Engine version string |
| `probability` | `null` when guards fail early |
| `expectedValue` | `null` when guards fail early |
| `positionSize` | `null` vs zero object preserved truthfully |
| `reasoning` | Steps + summary |
| `gatesTriggered` | Included only when present on decision |

Excluded: UI state, React internals, functions, fake defaults.

Serialization uses existing `stableStringify()` for deterministic key order.

## UI

- **Copy Decision JSON** button in **Engine Reasoning** panel header (beside model version badge)
- Injectable `copyTextToClipboard()` helper for tests / unavailable clipboard
- Idle → Copied / Copy failed feedback (auto-reset)
- Rendering never blocked when clipboard unavailable

## Out of scope

- `evaluate()` / models / settings resolver changes
- localStorage, backend, network, execution
- Builder #1 engine-snapshot module duplication

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Future (post-5.11A)

5.11A is on `main`. Optional follow-up: swap serializer input to `summarizeEngineSnapshot(decision)` for compact export payload.
