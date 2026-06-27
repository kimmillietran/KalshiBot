# PR-5.10B — Settings UI Wiring

## Summary

Milestone 5.10B wires `resolveTradingSettings()` from 5.10A into the trading dashboard. Users configure session-only trading settings from a new **Trading Settings** panel; resolved values flow into `evaluate()` via `EngineConfig` and position sizing overrides.

No persistence, backend, or React-side validation — `resolveTradingSettings()` remains authoritative.

## Data flow

```
Raw form state (strings)
  ↓ parseSettingsFormInput (type coercion only)
resolveTradingSettings(form)
  ↓
ResolvedTradingSettings
  ↓ buildEngineConfigFromSettings
EngineConfig (+ kellyFraction, maxPositionFraction)
  ↓ evaluate()
TradeDecision
  ↓
Dashboard panels
```

## Engine wiring

| Resolved setting | Engine destination |
|---|---|
| `minEdgePercent` | `EngineConfig.minEdgePercent` |
| `maxSpreadPercent` | `EngineConfig.maxSpreadPercent` |
| `bankrollDollars` | `EngineConfig.bankrollDollars` (omitted when null) |
| `kellyFraction` | `EngineConfig.kellyFraction` → `estimatePositionSize` config |
| `maxPositionFraction` | `EngineConfig.maxPositionFraction` → `maxFraction` cap |

`evaluate()` applies sizing overrides through `resolvePositionSizingConfig()` — no settings validation in the engine entrypoint.

## UI

- **Trading Settings** card below the command bar
- Fields: Bankroll ($), Minimum Edge %, Maximum Spread %, Kelly Fraction, Maximum Position %
- Inline helper text + resolver warnings per field
- Missing bankroll → Kelly dollars show **Bankroll not configured**
- Engine re-evaluates immediately on change

## Out of scope

- localStorage / URL params / backend / account sync
- Trade execution
- Changes to `src/lib/trading/settings/` (5.10A module untouched)

## Quality gates

```bash
npm run lint
npm run test
npm run build
```

## Tests added

- Settings panel render + warning display
- Dashboard integration (evaluate receives resolved config)
- Engine wiring (bankroll, Kelly, max position cap)
- Validation boundary (no duplicated bounds/defaults in React)
- Deterministic rerender behavior
